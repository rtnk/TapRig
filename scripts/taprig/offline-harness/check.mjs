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

export function parseTrace(text) {
  const argvByPid = new Map();
  const parentByPid = new Map();
  const pendingExec = new Map();
  const events = [];
  for (const raw of text.split('\n')) {
    const match = /^(\d+)\s+(.*)$/.exec(raw);
    if (!match) continue;
    const pid = Number(match[1]);
    const body = match[2];

    const exec = /^execve\("([^"]*)", \[(.*?)\](?:, |\s*<unfinished)/.exec(body);
    if (exec) {
      const argv = [...exec[2].matchAll(/"((?:[^"\\]|\\.)*)"(\.\.\.)?/g)].map((part) => part[1]);
      if (body.includes('<unfinished')) pendingExec.set(pid, argv);
      else if (/\) = 0$/.test(body)) argvByPid.set(pid, argv);
      continue;
    }
    if (/^<\.\.\. execve resumed>/.test(body)) {
      if (/= 0$/.test(body) && pendingExec.has(pid)) argvByPid.set(pid, pendingExec.get(pid));
      pendingExec.delete(pid);
      continue;
    }
    const spawned = /(?:^|<\.\.\. )(?:clone3?|v?fork)\b.*= (\d+)$/.exec(body);
    if (spawned) {
      parentByPid.set(Number(spawned[1]), pid);
      continue;
    }
    const call = /^(connect|sendto|sendmsg)\(/.exec(body);
    if (!call) continue;
    const event = socketEvent(body);
    if (event) events.push({ pid, syscall: call[1], ...event, line: raw });
  }
  const commandOf = (pid) => {
    for (let current = pid, hops = 0; current !== undefined && hops < 64; hops += 1) {
      const argv = argvByPid.get(current);
      if (argv) return argv.join(' ');
      current = parentByPid.get(current);
    }
    return '(unknown process)';
  };
  return events.map((event) => ({ ...event, command: commandOf(event.pid) }));
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

export function classify(event) {
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

const SCENARIO_CHECKS = {
  version: (dir) =>
    /^\d+\.\d+\.\d+/m.test(readText(path.join(dir, 'stdout.txt'))) ? null : 'no version printed',
  'help-commands': (dir) =>
    readText(path.join(dir, 'stdout.txt')).trim().length > 0 ? null : 'no help output',
  mcp: (dir) => {
    const responses = readText(path.join(dir, 'stdout.txt'))
      .split('\n')
      .filter((line) => line.trim().startsWith('{'))
      .map((line) => JSON.parse(line));
    const tools = responses.find((message) => message.id === 2)?.result?.tools;
    return Array.isArray(tools) && tools.length > 0 ? null : 'tools/list returned no tools';
  },
};
const MUST_EXIT_ZERO = new Set(['version', 'help-commands', 'mcp']);

export function evaluateWork(workDir, expectations) {
  const scenarios = fs
    .readdirSync(workDir, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && fs.existsSync(path.join(workDir, entry.name, 'trace.log')),
    )
    .map((entry) => entry.name)
    .sort();
  const failures = [];
  const rows = [];
  const violations = [];
  const matched = new Set();
  for (const scenario of scenarios) {
    const dir = path.join(workDir, scenario);
    const exitCode = readText(path.join(dir, 'exit-code')).trim() || 'missing';
    let local = 0;
    let found = 0;
    for (const log of ['trace', 'teardown']) {
      for (const event of parseTrace(readText(path.join(dir, `${log}.log`)))) {
        const kind = classify(event);
        if (!kind) {
          if (event.family !== 'AF_UNIX') local += 1;
          continue;
        }
        found += 1;
        const expectation = expectations.find(
          (item) =>
            item.scenario === scenario && item.log === log && event.command.includes(item.process),
        );
        if (expectation) matched.add(expectation);
        violations.push({ scenario, log, kind, event, expectation });
      }
    }
    const problems = [];
    if (exitCode === 'missing' || exitCode === '124')
      problems.push(`command did not finish (exit ${exitCode})`);
    if (MUST_EXIT_ZERO.has(scenario) && exitCode !== '0') problems.push(`exit code ${exitCode}`);
    const sanity = SCENARIO_CHECKS[scenario]?.(dir);
    if (sanity) problems.push(sanity);
    for (const problem of problems) failures.push(`${scenario}: ${problem}`);
    rows.push({ scenario, exitCode, local, found, problems });
  }
  for (const violation of violations) {
    if (!violation.expectation) {
      failures.push(
        `${violation.scenario}: unexpected ${violation.kind} to ${violation.event.address}:${violation.event.port} by \`${violation.event.command}\``,
      );
    }
  }
  for (const expectation of expectations) {
    if (!scenarios.includes(expectation.scenario)) {
      failures.push(`${expectation.id}: scenario "${expectation.scenario}" did not run`);
    } else if (!matched.has(expectation)) {
      failures.push(
        `${expectation.id}: the expected violation in "${expectation.scenario}" is gone — ` +
          `update scripts/taprig/offline-harness/expectations.json (${expectation.status})`,
      );
    }
  }
  return { rows, violations, failures };
}

export function formatReport({ rows, violations, failures }) {
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
  for (const violation of violations) {
    const { event } = violation;
    const label = violation.expectation
      ? `expected — ${violation.expectation.id} (${violation.expectation.status})`
      : 'UNEXPECTED';
    lines.push(
      `- ${violation.scenario}/${violation.log}: ${violation.kind} ${event.syscall} ${event.family} ` +
        `${event.address}:${event.port} — pid ${event.pid} \`${event.command}\` — **${label}**`,
    );
  }
  lines.push('', `## Result: ${failures.length === 0 ? 'PASS' : 'FAIL'}`, '');
  for (const failure of failures) lines.push(`- ${failure}`);
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

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(harnessDir, 'check.mjs')) {
  process.exitCode = main();
}
