# TapRig offline harness

Dynamic check of the TapRig network policy (`docs/network-audit.md` §6, §7.2, §8; decision
D-12 in `docs/taprig-decisions.md`).

## Run

```sh
pnpm build
pnpm taprig:offline-smoke                       # Linux; root or passwordless sudo
TAPRIG_HARNESS_WORK=/tmp/taprig-offline pnpm taprig:offline-smoke   # keep traces and report.md
```

Requirements: Linux, `unshare` and `script` (util-linux), `strace`, `python3`, `node`, and
`setpriv` when you are not root. CI installs `strace` with `apt-get` (build-time traffic).

## What it does

1. `run.sh` re-executes itself in a new network namespace (`unshare -n`, through `sudo` when
   you are not root). The namespace has only `lo`; `lo_up.py` brings it up through
   `SIOCSIFFLAGS`.
2. Each scenario runs as the invoking user (`setpriv`) with a clean environment: fresh `HOME`,
   fresh `AGENT_DEVICE_STATE_DIR`, no `CI`, no proxy variables. The command runs under
   `strace -f -e trace=execve,connect,sendto,sendmsg,clone,clone3,fork,vfork`. The clone calls
   only attribute threads and child processes to a command line.
3. The daemon detaches but stays a tracee. After the scenario command exits, the harness runs
   `agent-device daemon stop` with the same state dir (traced as `teardown.log`). Tracees that
   are still alive 30 s later are killed.
4. `check.mjs` classifies the traces and writes `report.md`.

| Scenario | Command |
| --- | --- |
| `version` | `agent-device --version` |
| `help-commands` | `agent-device help commands` |
| `devices-android-tty` | `script -qec "agent-device devices --platform android"` (stderr is a TTY) |
| `devices-android-no-tty` | `agent-device devices --platform android` |
| `mcp` | `agent-device mcp` with `initialize`, `notifications/initialized`, `tools/list` on stdin |
| `connect-no-provider` | `agent-device connect` with `AGENT_DEVICE_DAEMON_AUTH_TOKEN=<dummy>` in the environment |
| `devices-android-limrun-env` | `agent-device devices --platform android` with `LIMRUN_API_KEY=<dummy>` in the environment |

Without `adb`, the `devices` scenarios end with `TOOL_MISSING`. They still run the CLI, the
daemon start, and the platform dispatch.

Before E3, `connect-no-provider` resolved `cloud.agent-device.dev` (DNS requests, NET-03). Since
E3, it ends with `INVALID_ARGS` (`connect requires a provider`) and opens no socket.

Before E4a, a Limrun API key in the environment activated the built-in Limrun provider in the
daemon (NET-07; `daemon status` listed `limrun` as `active`). The provider opened connections only
when a lease was allocated, so `devices-android-limrun-env` had no violations before E4a either.
Since E4a, the daemon registers no Limrun provider. The scenario checks that a daemon started
with Limrun credentials stays offline; `src/__tests__/provider-device-runtimes.test.ts` checks that
no provider registers.

## Violations

A violation is one of these:

- `connect`/`sendto`/`sendmsg` to an `AF_INET`/`AF_INET6` address outside `127.0.0.0/8` and `::1`;
- any request to port 53 (DNS), also to a loopback stub resolver;
- a connection to a resolver socket (`/run/systemd/resolve/*`, the D-Bus system bus).

`expectations.json` lists the known violations. The harness fails on any other violation, and
when an expected violation does not occur. Stage E1 expected exactly one mechanism: NET-01, the
update-check worker in `devices-android-tty`. E2 removed the update check and that entry. Since
E2, the list is empty: every scenario must run without violations.

## Limits

- Linux only. macOS checks are manual (`docs/network-audit.md` §7.2 p.3, stage E10).
- No devices: traffic of `adb`, emulators, Xcode, and browsers is not covered.
- The harness observes the scenarios above only. Add scenarios when a stage changes a command
  with network behavior (E8: `doctor`, `replay` with `runScript`).
