import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'vitest';
import {
  type Allowlist,
  type AllowlistEntry,
  evaluate,
  isProductionFile,
  readAllowlist,
  scanRepository,
  scanSource,
} from './network-guard.ts';

const repoRoot = path.resolve(import.meta.dirname, '../..');

function entry(overrides: Partial<AllowlistEntry>): AllowlistEntry {
  return {
    file: 'src/planted.ts',
    rule: 'fetch',
    token: 'fetch(',
    count: 1,
    ids: ['NET-30'],
    decision: 'PRESERVE',
    reason: 'Planted entry for the guard model.',
    ...overrides,
  };
}

function kinds(source: string, allowlist: Allowlist): string[] {
  return evaluate(scanSource('src/planted.ts', source), allowlist).map(
    (violation) => violation.kind,
  );
}

test('the live tree matches the allowlist exactly', () => {
  const violations = evaluate(scanRepository(repoRoot), readAllowlist(repoRoot));
  assert.deepEqual(
    violations.map((violation) => violation.message),
    [],
  );
});

test('an unlisted network call fails the guard', () => {
  assert.deepEqual(kinds("await fetch('https://example.com');", { entries: [] }), [
    'unlisted',
    'unlisted',
  ]);
});

test('a listed call passes and an extra call in the same file fails on count', () => {
  const allowlist = { entries: [entry({})] };
  assert.deepEqual(kinds('await fetch(url);', allowlist), []);
  assert.deepEqual(kinds('await fetch(a);\nawait fetch(b);', allowlist), ['count']);
});

test('an entry whose code is gone is stale', () => {
  assert.deepEqual(kinds('const ok = true;', { entries: [entry({})] }), ['stale']);
});

test('a forbidden service marker must be scheduled for removal', () => {
  const source = "const url = 'https://registry.npmjs.org/agent-device';";
  const base = [
    entry({ rule: 'forbidden-marker', token: 'registry.npmjs.org', ids: ['NET-01'] }),
    entry({ rule: 'url-literal', token: 'https://registry.npmjs.org', ids: ['NET-01'] }),
  ];
  assert.deepEqual(kinds(source, { entries: base }), ['invalid', 'invalid']);
  const removed = base.map((item) => ({ ...item, decision: 'REMOVE' as const }));
  assert.deepEqual(kinds(source, { entries: removed }), []);
});

test('entries need an audit id and a reason', () => {
  const allowlist = { entries: [entry({ ids: ['NET-1'], reason: '' })] };
  assert.deepEqual(kinds('await fetch(url);', allowlist), ['invalid', 'invalid']);
});

test('every rule recognizes its primitive', () => {
  const source = [
    "import http from 'node:http';",
    "import { request } from 'undici';",
    'const socket = net.createConnection({ port });',
    'server.listen(0);',
    'const ws = new WebSocket(url);',
    'transport.request(options);',
    "runCmd('npx', ['expo', 'start']);",
    'const base = `http://${host}:${port}/status`;',
    "const pkg = '@limrun/api';",
    'const response = await globalThis.fetch(url);',
  ].join('\n');
  const found = scanSource('src/planted.ts', source).map(
    (finding) => `${finding.rule}=${finding.token}`,
  );
  assert.deepEqual(found, [
    'node-net-module=node:http',
    'http-client-module=undici',
    'socket-connect=net.createConnection(',
    'listen=listen(',
    'websocket=WebSocket',
    'transport-request=transport.request',
    'net-tool-command=npx',
    'url-literal=http://${host}',
    'forbidden-marker=limrun',
    'fetch=globalThis.fetch',
  ]);
});

test('identifiers that only name a provider are not markers outside string literals', () => {
  assert.deepEqual(scanSource('src/planted.ts', 'const limrunCandidate = createLimrun();'), []);
});

test('tests, fixtures, declarations and the test kit are not production files', () => {
  assert.equal(isProductionFile('src/cli/update-check.ts'), true);
  assert.equal(isProductionFile('bin/agent-device.mjs'), true);
  assert.equal(isProductionFile('packages/daemon/src/server/http/transport.ts'), true);
  for (const file of [
    'src/cli/__tests__/update-check.test.ts',
    'src/platform-runtime-gateway.fixtures.ts',
    'packages/daemon/test/nightly/torture.ts',
    'packages/maestro/src/fixtures/flow.ts',
    'packages/test-kit/src/loopback.ts',
    'src/types.d.ts',
    'scripts/taprig/network-guard.ts',
    'src/cli/README.md',
  ]) {
    assert.equal(isProductionFile(file), false, file);
  }
});
