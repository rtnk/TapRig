// Classify the offline harness traces (run.sh) and compare them with expectations.json.
//
// Violation: a connect/sendto/sendmsg to an AF_INET/AF_INET6 address outside 127.0.0.0/8 and
// ::1, any DNS request (port 53, loopback stubs included), or a connection to a host name
// resolver socket (systemd-resolved, D-Bus system bus). Each violation is attributed to the
// command line of the process (or thread) that issued it.
//
// Usage: node check.mjs <work-dir>   — prints the report and writes <work-dir>/report.md.

import fs from 'node:fs';
import path from 'node:path';

const harnessDir = path.dirname(new URL(import.meta.url).pathname);
const LOGS = ['trace', 'teardown'];

const EXEC_LINE = /^execve\("([^"]*)", \[(.*?)\](?:, |\s*<unfinished)/;
const EXEC_RESUMED = /^<\.\.\. execve resumed>/;
const SPAWN_LINE = /(?:^|<\.\.\. )(?:clone3?|v?fork)\b.*= (\d+)$/;
const SOCKET_CALL = /^(connect|sendto|sendmsg)\(/;

function parseArgv(list) {
  return [...list.matchAll(/"((?:[^"\\]|\\.)*)"(\.\.\.)?/g)].map((part) => part[1]);
}

// Every handler returns true when it consumed the line.
function recordExec(state, pid, body) {
  const exec = EXEC_LINE.exec(body);
  if (!exec) return false;
  const argv = parseArgv(exec[2]);
  if (body.includes('<unfinished')) state.pendingExec.set(pid, argv);
  else if (/\) = 0$/.test(body)) state.argvByPid.set(pid, argv);
  return true;
}

function recordExecResumed(state, pid, body) {
  if (!EXEC_RESUMED.test(body)) return false;
  const pending = state.pendingExec.get(pid);
  if (pending && /= 0$/.test(body)) state.argvByPid.set(pid, pending);
  state.pendingExec.delete(pid);
  return true;
}

function recordSpawn(state, pid, body) {
  const spawned = SPAWN_LINE.exec(body);
  if (!spawned) return false;
  state.parentByPid.set(Number(spawned[1]), pid);
  return true;
}

function recordSocket(state, pid, body, raw) {
  const call = SOCKET_CALL.exec(body);
  const event = call ? socketEvent(body) : null;
  if (event) state.events.push({ pid, syscall: call[1], ...event, line: raw });
}

function commandOf(state, pid) {
  for (let current = pid, hops = 0; current !== undefined && hops < 64; hops += 1) {
    const argv = state.argvByPid.get(current);
    if (argv) return argv.join(' ');
    current = state.parentByPid.get(current);
  }
  return '(unknown process)';
}

function parseTrace(text) {
  const state = {
    argvByPid: new Map(),
    parentByPid: new Map(),
    pendingExec: new Map(),
    events: [],
  };
  for (const raw of text.split('\n')) {
    const match = /^(\d+)\s+(.*)$/.exec(raw);
    if (!match) continue;
    const pid = Number(match[1]);
    const body = match[2];
    if (recordExec(state, pid, body) || recordExecResumed(state, pid, body)) continue;
    if (recordSpawn(state, pid, body)) continue;
    recordSocket(state, pid, body, raw);
  }
  return state.events.map((event) => ({ ...event, command: commandOf(state, event.pid) }));
}

function socketEvent(body) {
  const inet = /sa_family=AF_INET, sin_port=htons\((\d+)\), sin_addr=inet_addr\("([^"]+)"\)/.exec(
    body,
  );
  if (inet) return { family: 'AF_INET', port: Number(inet[1]), address: inet[2] };
  const inet6 =
    /sa_family=AF_INET6, sin6_port=htons\((\d+)\).*?inet_pton\(AF_INET6, "([^"]+)"/.exec(body);
  if (inet6) return { family: 'AF_INET6', port: Number(inet6[1]), address: inet6[2] };
  const unix = /sa_family=AF_UNIX, sun_path="([^"]+)"/.exec(body);
  if (unix) return { family: 'AF_UNIX', port: 0, address: unix[1] };
  return null;
}

function isLoopback(address) {
  if (/^127\.\d+\.\d+\.\d+$/.test(address)) return true;
  if (address === '::1' || /^::ffff:127\.\d+\.\d+\.\d+$/i.test(address)) return true;
  // connect() to the unspecified address reaches the local host.
  return address === '0.0.0.0' || address === '::';
}

const RESOLVER_SOCKETS = [
  /^\/run\/systemd\/resolve\//,
  /^\/(?:var\/)?run\/dbus\/system_bus_socket$/,
];

function classify(event) {
  if (event.family === 'AF_UNIX') {
    return RESOLVER_SOCKETS.some((pattern) => pattern.test(event.address))
      ? 'name resolution through a resolver socket'
      : null;
  }
  if (event.port === 53) return 'DNS request';
  return isLoopback(event.address) ? null : 'non-loopback connection';
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function mcpToolsListed(dir) {
  const responses = readText(path.join(dir, 'stdout.txt'))
    .split('\n')
    .filter((line) => line.trim().startsWith('{'))
    .map((line) => JSON.parse(line));
  const tools = responses.find((message) => message.id === 2)?.result?.tools;
  return Array.isArray(tools) && tools.length > 0 ? null : 'tools/list returned no tools';
}

const SCENARIO_CHECKS = {
  version: (dir) =>
    /^\d+\.\d+\.\d+/m.test(readText(path.join(dir, 'stdout.txt'))) ? null : 'no version printed',
  'help-commands': (dir) =>
    readText(path.join(dir, 'stdout.txt')).trim().length > 0 ? null : 'no help output',
  mcp: mcpToolsListed,
};
const MUST_EXIT_ZERO = new Set(['version', 'help-commands', 'mcp']);

function listScenarios(workDir) {
  return fs
    .readdirSync(workDir, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && fs.existsSync(path.join(workDir, entry.name, 'trace.log')),
    )
    .map((entry) => entry.name)
    .sort();
}

function scenarioProblems(scenario, dir, exitCode) {
  const problems = [];
  if (exitCode === 'missing' || exitCode === '124') {
    problems.push(`command did not finish (exit ${exitCode})`);
  }
  if (MUST_EXIT_ZERO.has(scenario) && exitCode !== '0') problems.push(`exit code ${exitCode}`);
  const sanity = SCENARIO_CHECKS[scenario]?.(dir);
  if (sanity) problems.push(sanity);
  return problems;
}

/** Socket events of one scenario: loopback count plus classified violations. */
function scenarioEvents(scenario, dir, expectations) {
  let local = 0;
  const violations = [];
  for (const log of LOGS) {
    for (const event of parseTrace(readText(path.join(dir, `${log}.log`)))) {
      const kind = classify(event);
      if (kind) {
        const expectation = expectations.find(
          (item) =>
            item.scenario === scenario && item.log === log && event.command.includes(item.process),
        );
        violations.push({ scenario, log, kind, event, expectation });
      } else if (event.family !== 'AF_UNIX') {
        local += 1;
      }
    }
  }
  return { local, violations };
}

function expectationFailures(expectations, scenarios, violations) {
  const matched = new Set(violations.map((violation) => violation.expectation).filter(Boolean));
  return expectations.flatMap((expectation) => {
    if (!scenarios.includes(expectation.scenario)) {
      return [`${expectation.id}: scenario "${expectation.scenario}" did not run`];
    }
    if (matched.has(expectation)) return [];
    return [
      `${expectation.id}: the expected violation in "${expectation.scenario}" is gone — ` +
        `update scripts/taprig/offline-harness/expectations.json (${expectation.status})`,
    ];
  });
}

function unexpectedFailures(violations) {
  return violations
    .filter((violation) => !violation.expectation)
    .map(
      ({ scenario, kind, event }) =>
        `${scenario}: unexpected ${kind} to ${event.address}:${event.port} by \`${event.command}\``,
    );
}

function evaluateWork(workDir, expectations) {
  const scenarios = listScenarios(workDir);
  const rows = [];
  const violations = [];
  for (const scenario of scenarios) {
    const dir = path.join(workDir, scenario);
    const exitCode = readText(path.join(dir, 'exit-code')).trim() || 'missing';
    const events = scenarioEvents(scenario, dir, expectations);
    violations.push(...events.violations);
    const problems = scenarioProblems(scenario, dir, exitCode);
    rows.push({
      scenario,
      exitCode,
      local: events.local,
      found: events.violations.length,
      problems,
    });
  }
  const failures = [
    ...rows.flatMap((row) => row.problems.map((problem) => `${row.scenario}: ${problem}`)),
    ...unexpectedFailures(violations),
    ...expectationFailures(expectations, scenarios, violations),
  ];
  return { rows, violations, failures };
}

function formatViolation({ scenario, log, kind, event, expectation }) {
  const label = expectation ? `expected — ${expectation.id} (${expectation.status})` : 'UNEXPECTED';
  return (
    `- ${scenario}/${log}: ${kind} ${event.syscall} ${event.family} ` +
    `${event.address}:${event.port} — pid ${event.pid} \`${event.command}\` — **${label}**`
  );
}

function formatReport({ rows, violations, failures }) {
  const lines = ['# TapRig offline harness report', ''];
  lines.push('| Scenario | Exit | Loopback/local socket events | Violations | Problems |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const row of rows) {
    lines.push(
      `| ${row.scenario} | ${row.exitCode} | ${row.local} | ${row.found} | ${row.problems.join('; ') || '—'} |`,
    );
  }
  lines.push('', '## Violations', '');
  if (violations.length === 0) lines.push('None.');
  lines.push(...violations.map(formatViolation));
  lines.push('', `## Result: ${failures.length === 0 ? 'PASS' : 'FAIL'}`, '');
  lines.push(...failures.map((failure) => `- ${failure}`));
  return `${lines.join('\n')}\n`;
}

function main() {
  const workDir = process.argv[2];
  if (!workDir) {
    process.stderr.write('usage: node check.mjs <work-dir>\n');
    return 2;
  }
  const { expected } = JSON.parse(
    fs.readFileSync(path.join(harnessDir, 'expectations.json'), 'utf8'),
  );
  const result = evaluateWork(workDir, expected);
  const report = formatReport(result);
  fs.writeFileSync(path.join(workDir, 'report.md'), report);
  process.stdout.write(report);
  return result.failures.length === 0 ? 0 : 1;
}

process.exitCode = main();
