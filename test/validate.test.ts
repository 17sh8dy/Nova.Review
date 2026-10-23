import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReview, validateSuggestion, LIMITS } from '../src/lib/validate.ts';
import { PRODUCTS, reviewable } from '../src/lib/products.ts';

const good = { rating: 4, title: 'Great', body: 'Works really well for me.', author: 'Sam', showName: true };

test('accepts a good review', () => assert.deepEqual(validateReview(good), { ok: true, value: good }));
test('rejects bad ratings', () => {
  for (const rating of [0, 6, 3.5, '4', null]) assert.equal(validateReview({ ...good, rating }).ok, false);
});
test('blank author becomes Anonymous', () => {
  const r = validateReview({ ...good, author: '   ' });
  assert.ok(r.ok && r.value.author === 'Anonymous');
});
test('showName is on unless explicitly false', () => {
  assert.ok(validateReview({ ...good, showName: undefined }).ok);
  const r = validateReview({ ...good, showName: false });
  assert.ok(r.ok && r.value.showName === false);
});
test('enforces length limits', () => {
  assert.equal(validateReview({ ...good, title: 'x'.repeat(LIMITS.title + 1) }).ok, false);
  assert.equal(validateReview({ ...good, body: 'x'.repeat(LIMITS.body + 1) }).ok, false);
  assert.equal(validateReview({ ...good, body: 'short' }).ok, false);
});
test('rejects non-objects', () => {
  for (const x of [null, 'a', 4, undefined]) {
    assert.equal(validateReview(x).ok, false);
    assert.equal(validateSuggestion(x).ok, false);
  }
});
test('suggestions need no rating', () => assert.ok(validateSuggestion({ title: 'Dark mode', body: 'Please add a dark mode.' }).ok));
test('catalog is the five Nova products, all with a visit link', () => {
  assert.deepEqual(PRODUCTS.map(p => p.slug), ['atlas', 'nova', 'nova-cut', 'nova-help', 'nova-legal', 'replay-gg']);
  for (const p of PRODUCTS) assert.match(p.url, /^https:\/\//);
  assert.equal(reviewable('nope'), undefined);
});

import { validateReport } from '../src/lib/validate.ts';

test('reports need a known type, a positive integer id and one of the five reasons', () => {
  assert.ok(validateReport({ type: 'review', id: 3, reason: 'spam' }).ok);
  assert.ok(validateReport({ type: 'suggestion', id: 1, reason: 'other', note: 'hi' }).ok);
  for (const bad of [{ type: 'user', id: 1, reason: 'spam' }, { type: 'review', id: 0, reason: 'spam' }, { type: 'review', id: 1.5, reason: 'spam' }, { type: 'review', id: 1, reason: 'rude' }, null, 'x'])
    assert.equal(validateReport(bad).ok, false);
  assert.equal(validateReport({ type: 'review', id: 1, reason: 'spam', note: 'x'.repeat(201) }).ok, false);
});

import { cleanReason, REASON_LIMIT } from '../src/lib/validate.ts';

test('a removal reason is optional, trimmed, and capped', () => {
  assert.deepEqual(cleanReason(undefined), { ok: true, value: null });
  assert.deepEqual(cleanReason('   '), { ok: true, value: null });
  assert.deepEqual(cleanReason('  Against   the rules. '), { ok: true, value: 'Against the rules.' });
  assert.equal(cleanReason('x'.repeat(REASON_LIMIT + 1)).ok, false);
});
