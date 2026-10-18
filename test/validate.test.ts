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
test('catalog is the four Nova products, all with a visit link', () => {
  assert.deepEqual(PRODUCTS.map(p => p.slug), ['atlas', 'nova', 'nova-help', 'nova-legal']);
  for (const p of PRODUCTS) assert.match(p.url, /^https:\/\//);
  assert.equal(reviewable('nope'), undefined);
});
