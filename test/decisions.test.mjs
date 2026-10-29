// Unit tests for the decision engine (no Forge needed): npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAdr, check, search, describeFindings } from '../src/lib/decisions.js';
import { DEMO_ADRS, DEMO_ISSUES, adrBody } from '../src/lib/demo.js';

const adrs = DEMO_ADRS.map(([n, title, status, date, owner, tags, context, decision, alternatives, consequences]) =>
  parseAdr({ id: String(n), title: `ADR-${String(n).padStart(3, '0')}: ${title}`, labels: ['adr'], body: adrBody({ status, date, owner, context, decision, alternatives, consequences, tags }) }));

test('parses every demo ADR', () => {
  assert.equal(adrs.filter(Boolean).length, 10);
  const a1 = adrs[0];
  assert.equal(a1.key, 'ADR-001');
  assert.equal(a1.status, 'Accepted');
  assert.equal(a1.owner, 'Ana Ruiz (Staff Engineer)');
  assert.deepEqual(a1.alternatives[0].aliases, ['Mongo', 'document database']);
  assert.equal(adrs[7].status, 'Superseded');
  assert.equal(adrs[7].supersededBy, 'ADR-009');
});

const first = (i) => check(`${DEMO_ISSUES[i][0]} ${DEMO_ISSUES[i][1]}`, adrs)[0];

test('flags issues that reopen decisions', () => {
  assert.deepEqual([first(0).kind, first(0).key], ['reopens', 'ADR-001']); // MongoDB
  assert.deepEqual([first(1).kind, first(1).key], ['reopens', 'ADR-002']); // GraphQL
  assert.deepEqual([first(2).kind, first(2).key], ['reopens', 'ADR-003']); // moment.js
  assert.deepEqual([first(3).kind, first(3).key], ['reopens', 'ADR-009']); // Jenkins
});

test('aligned work is only related, unrelated work is clean', () => {
  assert.equal(first(4)?.kind, 'related');
  assert.equal(first(4)?.key, 'ADR-001');
  assert.equal(check(`${DEMO_ISSUES[5][0]} ${DEMO_ISSUES[5][1]}`, adrs).filter((f) => f.kind !== 'related').length, 0);
});

test('search and agent text', () => {
  assert.equal(search('what did we decide about date libraries', adrs)[0].key, 'ADR-003');
  assert.equal(search('can we use mongo?', adrs)[0].key, 'ADR-001');
  assert.match(describeFindings(check('add redux store for payouts', adrs), 'this plan'), /WARNING.*\n- REOPENS ADR-007/);
});

test('keeps hyphenated alternative names', () => {
  assert.deepEqual(adrs[4].alternatives.map((a) => a.name), ['Server-side session cookies', 'Long-lived API keys for users']);
  assert.deepEqual(adrs[4].alternatives[0].aliases, ['session cookie', 'sticky sessions']);
  assert.match(adrs[4].alternatives[0].why, /^need shared session storage/);
});
