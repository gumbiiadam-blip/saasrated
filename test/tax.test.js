import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geTax, margin } from '../server/tax.js';

test('2% tax rounded down', () => {
  assert.equal(geTax(1000), 20);
  assert.equal(geTax(1_450_000), 29_000);
  assert.equal(geTax(149), 2);
});
test('items under 50gp pay nothing', () => {
  assert.equal(geTax(49), 0);
  assert.equal(geTax(0), 0);
});
test('tax caps at 5m', () => {
  assert.equal(geTax(1_500_000_000), 5_000_000);
});
test('exempt items pay nothing', () => {
  assert.equal(geTax(14_900_000, 'Old school bond'), 0);
  assert.equal(geTax(200, 'Nature rune'), 0);
});
test('margin subtracts tax on the sell side', () => {
  assert.equal(margin(1_400_000, 1_450_000, 'Abyssal whip'), 50_000 - 29_000);
  assert.equal(margin(0, 100), 0);
});
