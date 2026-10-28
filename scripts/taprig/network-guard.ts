// `pnpm taprig:network-guard` — the TapRig static network-policy guard.
//
// Scans production sources (tracked files under src/, packages/, bin/ without tests or
// fixtures) for network primitives, URL literals, network-capable child-process commands, and
// forbidden service markers. Every finding must match an entry in network-allowlist.json by
// (file, rule, token) with the exact occurrence count. The guard fails on an unlisted finding,
// on a count drift, and on a stale entry, so the allowlist shrinks together with the code.
// Policy and IDs: docs/network-audit.md (§2, §7.1, §8).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const RULE_IDS = [
  'fetch',
  'node-net-module',
  'http-client-module',
  'websocket',
  'transport-request',
  'socket-connect',
  'listen',
  'url-literal',
  'net-tool-command',
  'forbidden-marker',
] as const;
export type RuleId = (typeof RULE_IDS)[number];

export const DECISIONS = [
  'REMOVE',
  'RESTRICT',
  'REPLACE',
  'PRESERVE',
  'DECISION REQUIRED',
  'IGNORE',
] as const;
export type Decision = (typeof DECISIONS)[number];

export type Finding = {
  readonly file: string;
  readonly rule: RuleId;
  readonly token: string;
  readonly line: number;
};

export type AllowlistEntry = {
  readonly file: string;
  readonly rule: RuleId;
  readonly token: string;
  readonly count: number;
  readonly ids: readonly string[];
  readonly decision: Decision;
  readonly reason: string;
};

export type Allowlist = { readonly entries: readonly AllowlistEntry[] };

export type Violation = {
  readonly kind: 'unlisted' | 'count' | 'stale' | 'invalid';
  readonly key: string;
  readonly message: string;
};

/**
 * Markers of the cloud services TapRig removes. An allowlist entry whose token carries one of
 * them must have the REMOVE decision, so every later stage sees what is left to delete.
 */
export const FORBIDDEN_MARKERS = [
  'agent-device.dev',
  'registry.npmjs.org',
  'browserstack.com',
  'lambdatest.com',
  'amazonaws.com',
  'devicefarm',
  'limrun',
] as const;

const SOURCE_EXTENSION = /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/;
const NON_PRODUCTION_DIRECTORY =
  /(?:^|\/)(?:__tests__|__fixtures__|__mocks__|fixtures|test|tests|test-utils|test-support|testing)\//;
const NON_PRODUCTION_FILE =
  /\.(?:test|spec|fixture|fixtures|test-d|bench)\.[cm]?[jt]sx?$|\.d\.[cm]?ts$/;
// The workspace test-kit package only serves tests and fixtures; nothing ships it in dist/.
const NON_PRODUCTION_PACKAGE = /^packages\/test-kit\//;

/** The audit's production-file rule (docs/network-audit.md §1): sources, no tests or fixtures. */
export function isProductionFile(file: string): boolean {
  return (
    /^(?:src|packages|bin)\//.test(file) &&
    SOURCE_EXTENSION.test(file) &&
    !NON_PRODUCTION_PACKAGE.test(file) &&
    !NON_PRODUCTION_DIRECTORY.test(file) &&
    !NON_PRODUCTION_FILE.test(file)
  );
}

export function listProductionFiles(repoRoot: string): string[] {
  const tracked = execFileSync('git', ['ls-files', '-z', '--', 'src', 'packages', 'bin'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return tracked.split('\0').filter(Boolean).filter(isProductionFile).sort();
}

type LineRule = {
  readonly rule: RuleId;
  readonly pattern: RegExp;
  readonly token: (match: RegExpExecArray) => string;
};

const NET_TOOLS = 'npm|npx|pnpm|yarn|curl|wget|aws';
const IMPORT_HEAD = String.raw`(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)`;

const LINE_RULES: readonly LineRule[] = [
  {
    rule: 'fetch',
    pattern: /\bglobalThis\.fetch\b|\bfetchImpl\b|\.fetch\s*\(|(?<![\w$.])fetch\s*\(/g,
    token: (match) => match[0].replaceAll(/\s+/g, ''),
  },
  {
    rule: 'node-net-module',
    pattern: new RegExp(
      `${IMPORT_HEAD}['"](?:node:)?(http|https|http2|net|tls|dgram|dns)(/promises)?['"]`,
      'g',
    ),
    token: (match) => `node:${match[1]}${match[2] ?? ''}`,
  },
  {
    rule: 'http-client-module',
    pattern: new RegExp(`${IMPORT_HEAD}['"](undici|ws|axios|node-fetch|got)(/[^'"]*)?['"]`, 'g'),
    token: (match) => match[1] as string,
  },
  { rule: 'websocket', pattern: /\bWebSocket\b/g, token: () => 'WebSocket' },
  {
    rule: 'transport-request',
    pattern: /\btransport\.request\b/g,
    token: () => 'transport.request',
  },
  {
    rule: 'socket-connect',
    pattern: /\b(?:net|tls)\.(?:createConnection|connect)\s*\(|(?<![\w$.])createConnection\s*\(/g,
    token: (match) => match[0].replaceAll(/\s+/g, ''),
  },
  { rule: 'listen', pattern: /\blisten\s*\(/g, token: () => 'listen(' },
  {
    rule: 'net-tool-command',
    pattern: new RegExp(`(['"\`])(${NET_TOOLS})(?:\\.cmd)?\\1`, 'g'),
    token: (match) => match[2] as string,
  },
];

const URL_START = /\b(https?|wss?):\/\//gi;
const HOST_STOP = new Set([
  '/',
  '?',
  '#',
  "'",
  '"',
  '`',
  ' ',
  '\t',
  ')',
  ']',
  '>',
  '<',
  ',',
  ';',
  '\\',
  '*',
]);

/** `scheme://host` with the port dropped; a `${...}` host stays a template placeholder. */
function urlToken(line: string, start: number, scheme: string): string {
  let index = start;
  let host = '';
  while (index < line.length && !HOST_STOP.has(line[index] as string)) {
    if (line.startsWith('${', index)) {
      const close = line.indexOf('}', index);
      const end = close === -1 ? line.length : close + 1;
      host += line.slice(index, end);
      index = end;
      continue;
    }
    host += line[index];
    index += 1;
  }
  host = host.replace(/:(?:\d+|\$\{[^}]*\})$/, '').replace(/[.:]+$/, '');
  return `${scheme.toLowerCase()}://${host.includes('${') ? host : host.toLowerCase()}`;
}

const STRING_LITERAL = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g;
const DOMAIN_MARKERS = FORBIDDEN_MARKERS.filter((marker) => marker.includes('.'));
const WORD_MARKERS = FORBIDDEN_MARKERS.filter((marker) => !marker.includes('.'));

function forbiddenMarkers(line: string): string[] {
  const lower = line.toLowerCase();
  const found: string[] = [];
  for (const marker of DOMAIN_MARKERS) {
    for (let at = lower.indexOf(marker); at !== -1; at = lower.indexOf(marker, at + 1)) {
      found.push(marker);
    }
  }
  // Bare words are identifiers in code; only a string literal carries them to the outside.
  for (const literal of line.matchAll(STRING_LITERAL)) {
    const text = literal[0].toLowerCase();
    for (const marker of WORD_MARKERS) {
      for (let at = text.indexOf(marker); at !== -1; at = text.indexOf(marker, at + 1)) {
        found.push(marker);
      }
    }
  }
  return found;
}

export function scanSource(file: string, source: string): Finding[] {
  const findings: Finding[] = [];
  const lines = source.split(/\r?\n/);
  lines.forEach((text, index) => {
    const line = index + 1;
    for (const { rule, pattern, token } of LINE_RULES) {
      pattern.lastIndex = 0;
      for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
        findings.push({ file, rule, token: token(match), line });
      }
    }
    URL_START.lastIndex = 0;
    for (let match = URL_START.exec(text); match; match = URL_START.exec(text)) {
      findings.push({
        file,
        rule: 'url-literal',
        token: urlToken(text, match.index + match[0].length, match[1] as string),
        line,
      });
    }
    for (const marker of forbiddenMarkers(text)) {
      findings.push({ file, rule: 'forbidden-marker', token: marker, line });
    }
  });
  return findings;
}

export function entryKey(entry: { file: string; rule: string; token: string }): string {
  return `${entry.file} :: ${entry.rule} :: ${entry.token}`;
}

function carriesForbiddenMarker(entry: AllowlistEntry): boolean {
  const token = entry.token.toLowerCase();
  return FORBIDDEN_MARKERS.some((marker) => token.includes(marker));
}

function validateEntry(entry: AllowlistEntry, seen: Set<string>): Violation[] {
  const key = entryKey(entry);
  const problems: string[] = [];
  if (seen.has(key)) problems.push('duplicate entry');
  seen.add(key);
  if (!RULE_IDS.includes(entry.rule)) problems.push(`unknown rule "${entry.rule}"`);
  if (!DECISIONS.includes(entry.decision)) problems.push(`unknown decision "${entry.decision}"`);
  if (!Number.isInteger(entry.count) || entry.count < 1) problems.push('count must be >= 1');
  if (!Array.isArray(entry.ids) || entry.ids.length === 0) problems.push('ids must not be empty');
  for (const id of entry.ids ?? []) {
    if (!/^NET-\d{2}$/.test(id)) problems.push(`id "${id}" is not a NET-xx id`);
  }
  if (typeof entry.reason !== 'string' || entry.reason.trim().length < 8) {
    problems.push('reason must explain the entry');
  }
  if (carriesForbiddenMarker(entry) && entry.decision !== 'REMOVE') {
    problems.push('a forbidden service marker must carry the REMOVE decision');
  }
  return problems.map((problem) => ({ kind: 'invalid', key, message: `${key}: ${problem}` }));
}

export function evaluate(findings: readonly Finding[], allowlist: Allowlist): Violation[] {
  const violations: Violation[] = [];
  const seen = new Set<string>();
  for (const entry of allowlist.entries) violations.push(...validateEntry(entry, seen));

  const grouped = new Map<string, Finding[]>();
  for (const finding of findings) {
    const key = entryKey(finding);
    grouped.set(key, [...(grouped.get(key) ?? []), finding]);
  }
  const listed = new Map(allowlist.entries.map((entry) => [entryKey(entry), entry]));

  for (const [key, group] of grouped) {
    const entry = listed.get(key);
    const lines = group.map((finding) => finding.line).join(', ');
    if (!entry) {
      violations.push({
        kind: 'unlisted',
        key,
        message: `${key}: ${group.length} occurrence(s) at line(s) ${lines} are not in the allowlist`,
      });
    } else if (entry.count !== group.length) {
      violations.push({
        kind: 'count',
        key,
        message: `${key}: allowlist expects ${entry.count} occurrence(s), found ${group.length} at line(s) ${lines}`,
      });
    }
  }
  for (const [key] of listed) {
    if (!grouped.has(key)) {
      violations.push({
        kind: 'stale',
        key,
        message: `${key}: allowlist entry matches nothing — delete it (the code is gone)`,
      });
    }
  }
  return violations;
}

export const ALLOWLIST_PATH = 'scripts/taprig/network-allowlist.json';

export function readAllowlist(repoRoot: string): Allowlist {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, ALLOWLIST_PATH), 'utf8')) as Allowlist;
}

export function scanRepository(repoRoot: string): Finding[] {
  return listProductionFiles(repoRoot).flatMap((file) =>
    scanSource(file, fs.readFileSync(path.join(repoRoot, file), 'utf8')),
  );
}

/** Allowlist entries for unlisted findings, with placeholders a reviewer must replace. */
export function suggestEntries(
  findings: readonly Finding[],
  allowlist: Allowlist,
): AllowlistEntry[] {
  const listed = new Set(allowlist.entries.map(entryKey));
  const counts = new Map<string, { finding: Finding; count: number }>();
  for (const finding of findings) {
    const key = entryKey(finding);
    if (listed.has(key)) continue;
    const current = counts.get(key);
    counts.set(key, { finding, count: (current?.count ?? 0) + 1 });
  }
  return [...counts.values()].map(({ finding, count }) => ({
    file: finding.file,
    rule: finding.rule,
    token: finding.token,
    count,
    ids: ['NET-??'],
    decision: 'DECISION REQUIRED',
    reason: 'TODO: map to docs/network-audit.md',
  }));
}

function main(argv: readonly string[]): number {
  const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  }).trim();
  const findings = scanRepository(repoRoot);
  const allowlist = readAllowlist(repoRoot);
  if (argv.includes('--suggest')) {
    process.stdout.write(`${JSON.stringify(suggestEntries(findings, allowlist), null, 2)}\n`);
    return 0;
  }
  const violations = evaluate(findings, allowlist);
  if (violations.length === 0) {
    const ids = new Set(allowlist.entries.flatMap((entry) => entry.ids));
    const remove = allowlist.entries.filter((entry) => entry.decision === 'REMOVE').length;
    process.stdout.write(
      `network guard: ok — ${findings.length} finding(s) in ${allowlist.entries.length} ` +
        `allowlist entries (${remove} marked REMOVE) across ${ids.size} audit ids.\n`,
    );
    return 0;
  }
  for (const kind of ['unlisted', 'count', 'stale', 'invalid'] as const) {
    const group = violations.filter((violation) => violation.kind === kind);
    if (group.length === 0) continue;
    process.stderr.write(`\n${kind} (${group.length}):\n`);
    for (const violation of group) process.stderr.write(`  - ${violation.message}\n`);
  }
  process.stderr.write(
    `\nnetwork guard: ${violations.length} violation(s). Map each new network site to an ID in ` +
      `docs/network-audit.md and add or update its entry in ${ALLOWLIST_PATH} ` +
      '(`pnpm taprig:network-guard --suggest` prints skeletons). Delete stale entries.\n',
  );
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(main(process.argv.slice(2)));
}
