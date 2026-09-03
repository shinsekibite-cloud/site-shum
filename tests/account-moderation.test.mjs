/**
 * Moscow weekday working hours for account auto-approve.
 * Run: node --test tests/account-moderation.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
const WORK_START_MIN = 9 * 60;
const WORK_END_MIN = 18 * 60;

function mskParts(d) {
  const shifted = new Date(d.getTime() + MSK_OFFSET_MS);
  return {
    dow: shifted.getUTCDay(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

function isMoscowWorkMinute(d) {
  const { dow, minutes } = mskParts(d);
  if (dow === 0 || dow === 6) return false;
  return minutes >= WORK_START_MIN && minutes < WORK_END_MIN;
}

function addMoscowWorkingHours(from, hours) {
  const need = Math.max(0, hours) * 60;
  if (need === 0) return new Date(from);
  let remaining = need;
  let cursor = from.getTime();
  const maxSteps = 14 * 24 * 60;
  for (let i = 0; i < maxSteps && remaining > 0; i++) {
    cursor += 60_000;
    if (isMoscowWorkMinute(new Date(cursor))) remaining -= 1;
  }
  return new Date(cursor);
}

test('3 working hours on a Tuesday morning stay the same day', () => {
  // Tuesday 2026-08-18 10:00 MSK = 07:00 UTC
  const from = new Date('2026-08-18T07:00:00.000Z');
  const due = addMoscowWorkingHours(from, 3);
  assert.equal(due.toISOString(), '2026-08-18T10:00:00.000Z'); // 13:00 MSK
});

test('working hours skip overnight and weekend', () => {
  // Friday 17:00 MSK = 14:00 UTC → +3 work hours → Monday 11:00 MSK = 08:00 UTC
  const from = new Date('2026-08-21T14:00:00.000Z');
  const due = addMoscowWorkingHours(from, 3);
  assert.equal(due.toISOString(), '2026-08-24T08:00:00.000Z');
});
