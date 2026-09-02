import test from 'node:test';
import assert from 'node:assert/strict';

function clamp(n) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function reliabilityFromAttendance(attended, noShow) {
  const a = Math.max(0, Number(attended) || 0);
  const n = Math.max(0, Number(noShow) || 0);
  const total = a + n;
  if (total <= 0) return null;
  return clamp((a / total) * 100);
}

function reliabilityScoreForGates(attended, noShow) {
  return reliabilityFromAttendance(attended, noShow) ?? 100;
}

function reliabilityDetail(attended, noShow) {
  const a = Math.max(0, Number(attended) || 0);
  const n = Math.max(0, Number(noShow) || 0);
  const percent = reliabilityFromAttendance(a, n);
  const total = a + n;
  const label = percent == null ? 'Пока нет посещений' : `${percent}% · ${a} из ${total}`;
  return { percent, label, attended: a, noShow: n, total };
}

test('0 visits → null display, not 100', () => {
  assert.equal(reliabilityFromAttendance(0, 0), null);
  assert.equal(reliabilityDetail(0, 0).label, 'Пока нет посещений');
});

test('gates treat 0 visits as 100 (referral threshold 60 still passes)', () => {
  assert.equal(reliabilityScoreForGates(0, 0), 100);
  assert.ok(reliabilityScoreForGates(0, 0) >= 60);
});

test('attendance percent: 4 of 4 → 100, label includes counts', () => {
  assert.equal(reliabilityFromAttendance(4, 0), 100);
  assert.equal(reliabilityDetail(4, 0).label, '100% · 4 из 4');
});

test('no-show lowers reliability', () => {
  assert.equal(reliabilityFromAttendance(3, 1), 75);
  assert.equal(reliabilityFromAttendance(1, 1), 50);
  assert.ok(reliabilityScoreForGates(1, 3) < 60);
});

test('referral threshold 60 unchanged', () => {
  const REFERRER_MIN_RELIABILITY = 60;
  assert.equal(REFERRER_MIN_RELIABILITY, 60);
  assert.ok(reliabilityScoreForGates(3, 1) >= REFERRER_MIN_RELIABILITY);
  assert.ok(reliabilityScoreForGates(1, 1) < REFERRER_MIN_RELIABILITY);
});
