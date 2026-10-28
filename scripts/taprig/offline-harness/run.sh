#!/usr/bin/env bash
# TapRig offline harness (docs/network-audit.md §6, §7.2, §8).
#
# Runs CLI and MCP scenarios inside a fresh network namespace (only lo is up) under
# `strace -f`, then classifies every AF_INET/AF_INET6 connect/sendto/sendmsg to an address
# outside 127.0.0.0/8 and ::1, and every DNS request (port 53), as a violation (check.mjs).
# Known violations live in expectations.json; the run fails on any other violation and when an
# expected violation disappears.
#
# Usage: pnpm taprig:offline-smoke            (Linux; root, or passwordless sudo)
#        TAPRIG_HARNESS_KEEP=1 ...            keep the work directory
#        TAPRIG_HARNESS_WORK=<dir> ...        write traces and report.md to <dir>
# Requires: unshare (util-linux), strace, script (util-linux), setpriv when not root,
# python3, node, and a built dist/ (`pnpm build`).

set -euo pipefail

HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HARNESS_DIR/../../.." && pwd)"

if [[ -z "${TAPRIG_HARNESS_INNER:-}" ]]; then
  if [[ "$(uname -s)" != "Linux" ]]; then
    echo "offline harness: Linux only (network namespaces + strace)." >&2
    exit 2
  fi
  for tool in unshare strace script python3 node; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      echo "offline harness: missing required tool: $tool" >&2
      exit 2
    fi
  done
  if [[ ! -f "$REPO_ROOT/dist/src/internal/bin.js" ]]; then
    echo "offline harness: dist/ is missing; run \`pnpm build\` first." >&2
    exit 2
  fi
  work="${TAPRIG_HARNESS_WORK:-$(mktemp -d "${TMPDIR:-/tmp}/taprig-offline.XXXXXX")}"
  mkdir -p "$work"
  inner_env=(
    TAPRIG_HARNESS_INNER=1
    "TAPRIG_HARNESS_WORK=$work"
    "TAPRIG_HARNESS_UID=$(id -u)"
    "TAPRIG_HARNESS_GID=$(id -g)"
    "PATH=$PATH"
  )
  status=0
  if [[ "$(id -u)" -eq 0 ]]; then
    env "${inner_env[@]}" unshare -n -- bash "$HARNESS_DIR/run.sh" || status=$?
  else
    command -v setpriv >/dev/null 2>&1 || {
      echo "offline harness: missing required tool: setpriv" >&2
      exit 2
    }
    sudo -n env "${inner_env[@]}" unshare -n -- bash "$HARNESS_DIR/run.sh" || status=$?
  fi
  if [[ "$status" -eq 0 || "$status" -eq 1 ]]; then
    node "$HARNESS_DIR/check.mjs" "$work" || status=$?
  fi
  if [[ -n "${TAPRIG_HARNESS_KEEP:-}" || -n "${TAPRIG_HARNESS_WORK:-}" ]]; then
    echo "offline harness: traces and report in $work" >&2
  else
    rm -rf "$work"
  fi
  exit "$status"
fi

# ---- inside the network namespace (root in the namespace) ----

python3 -I "$HARNESS_DIR/lo_up.py" lo

work="$TAPRIG_HARNESS_WORK"
as_user=()
if [[ "$TAPRIG_HARNESS_UID" -ne 0 ]]; then
  as_user=(setpriv "--reuid=$TAPRIG_HARNESS_UID" "--regid=$TAPRIG_HARNESS_GID" --init-groups --)
fi
cli=(node "$REPO_ROOT/bin/agent-device.mjs")
trace_syscalls='execve,connect,sendto,sendmsg,clone,clone3,fork,vfork'
scenario_timeout="${TAPRIG_HARNESS_TIMEOUT:-90}"

# A deterministic environment: no CI marker (it would hide the update check), no proxy
# variables, no user config or plugins (fresh HOME), and a fresh state dir per scenario.
scenario_env() {
  local dir="$1"
  printf '%s\n' \
    "PATH=$PATH" \
    "HOME=$dir/home" \
    "TERM=dumb" \
    "LANG=C.UTF-8" \
    "AGENT_DEVICE_STATE_DIR=$dir/state"
}

# run_scenario <name> <stdin-file|-> <command...>
# The daemon detaches but stays a strace tracee, so strace runs in the background and the
# daemon is stopped (`daemon stop`, same state dir) once the scenario command has exited.
run_scenario() {
  local name="$1" stdin_file="$2"
  shift 2
  local dir="$work/$name"
  mkdir -p "$dir/home" "$dir/state"
  chown -R "$TAPRIG_HARNESS_UID:$TAPRIG_HARNESS_GID" "$dir"
  mapfile -t envs < <(scenario_env "$dir")
  printf '%s\n' "$*" >"$dir/command.txt"
  local input="/dev/null"
  [[ "$stdin_file" != "-" ]] && input="$stdin_file"

  # The wrapper takes its redirections as positional arguments so the scenario environment
  # stays exactly what scenario_env prints.
  "${as_user[@]}" env -i "${envs[@]}" strace -f -qq -s 512 -e "trace=$trace_syscalls" \
    -o "$dir/trace.log" -- bash -c \
    'in=$1 out=$2 err=$3 rc=$4; shift 4; "$@" <"$in" >"$out" 2>"$err"; echo $? >"$rc"' \
    _ "$input" "$dir/stdout.txt" "$dir/stderr.txt" "$dir/exit-code" \
    timeout "$scenario_timeout" "$@" &
  local tracer=$!
  local waited=0
  while [[ ! -s "$dir/exit-code" && "$waited" -lt $((scenario_timeout + 10)) ]]; do
    sleep 1
    waited=$((waited + 1))
  done

  "${as_user[@]}" env -i "${envs[@]}" strace -f -qq -s 512 -e "trace=$trace_syscalls" \
    -o "$dir/teardown.log" -- "${cli[@]}" daemon stop \
    >"$dir/teardown.stdout.txt" 2>"$dir/teardown.stderr.txt" || true

  waited=0
  while kill -0 "$tracer" 2>/dev/null && [[ "$waited" -lt 30 ]]; do
    sleep 1
    waited=$((waited + 1))
  done
  if kill -0 "$tracer" 2>/dev/null; then
    # `daemon stop` did not end every tracee: kill what is left of this scenario only.
    echo "tracees still running 30s after daemon stop; killed" >"$dir/teardown-note.txt"
    local pid
    for pid in $(awk '{print $1}' "$dir/trace.log" | sort -un); do
      if tr '\0' '\n' <"/proc/$pid/environ" 2>/dev/null | grep -qx "AGENT_DEVICE_STATE_DIR=$dir/state"; then
        kill -KILL "$pid" 2>/dev/null || true
      fi
    done
  fi
  wait "$tracer" 2>/dev/null || true
}

mcp_input="$work/mcp-input.jsonl"
cat >"$mcp_input" <<'JSON'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"taprig-offline-harness","version":"0.0.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}
JSON

run_scenario version - "${cli[@]}" --version
run_scenario help-commands - "${cli[@]}" help commands
run_scenario devices-android-tty - script -qec "${cli[*]} devices --platform android" /dev/null
run_scenario devices-android-no-tty - "${cli[@]}" devices --platform android
run_scenario mcp "$mcp_input" "${cli[@]}" mcp

chown -R "$TAPRIG_HARNESS_UID:$TAPRIG_HARNESS_GID" "$work"
