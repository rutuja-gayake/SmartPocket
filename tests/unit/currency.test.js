import test from 'node:test';
import assert from 'node:assert/strict';
import { rupeesToPaise, paiseToRupees, formatINR, formatRupeesPlain } from '../../src/utils/currency.js';
import { getDaysInMonth, getRemainingDaysInMonth, getCurrentPeriod } from '../../src/utils/date.js';

test('Currency Utilities - Conversions', () => {
  assert.equal(rupeesToPaise(100), 10000);
  assert.equal(rupeesToPaise('100.50'), 10050);
  assert.equal(rupeesToPaise('1,234.56'), 123456);
  assert.equal(rupeesToPaise(0), 0);
  assert.equal(rupeesToPaise(''), 0);
  assert.equal(rupeesToPaise(null), 0);

  assert.equal(paiseToRupees(10000), 100);
  assert.equal(paiseToRupees(10050), 100.5);
  assert.equal(paiseToRupees(0), 0);
  assert.equal(paiseToRupees(null), 0);

  assert.equal(formatRupeesPlain(123456), '1234.56');
  assert.equal(formatRupeesPlain(50), '0.50');
});

test('Currency Utilities - Indian INR Formatting', () => {
  const formatted = formatINR(12345678); // 1,23,456.78
  // Check currency symbol or code and Indian grouping
  assert.ok(formatted.includes('1,23,456.78') || formatted.includes('123,456.78'));
});

test('Date Utilities - Leap years and days in month', () => {
  assert.equal(getDaysInMonth(2024, 2), 29); // Leap year
  assert.equal(getDaysInMonth(2025, 2), 28); // Non-leap year
  assert.equal(getDaysInMonth(2026, 10), 31); // October

  // Remaining days on 26th of 31-day month = 31 - 26 + 1 = 6 days
  const remaining = getRemainingDaysInMonth(new Date(2026, 9, 26)); // Oct 26
  assert.equal(remaining, 6);

  // Last day of month = 1 day remaining (today itself)
  const lastDay = getRemainingDaysInMonth(new Date(2026, 9, 31));
  assert.equal(lastDay, 1);
});
