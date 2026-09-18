import test from 'node:test';
import assert from 'node:assert/strict';
import { AIM_ARM_RADIUS, AIM_CANCEL_RADIUS, AIM_CANCEL_READY_RADIUS, aimPullRange, crossedPowerMilestones, dragAim, isAimCanceling, smoothAimPoint } from '../public/aim.js';

test('slingshot mirrors team direction and horizontal travel controls power', () => {
  assert.deepEqual(dragAim(-60, 40, 0, 120), dragAim(60, 40, 1, 120));
  assert.ok(dragAim(-90, 20, 0, 120).power > dragAim(-30, 20, 0, 120).power);
  assert.equal(dragAim(-60, -50, 0, 120).power, dragAim(-60, 50, 0, 120).power);
});
test('vertical travel adjusts the full angle range in both directions', () => {
  assert.equal(dragAim(-60, 0, 0, 120).angle, 45);
  assert.ok(dragAim(-60, -30, 0, 120).angle < 45);
  assert.ok(dragAim(-60, 30, 0, 120).angle > 45);
  assert.equal(dragAim(-60, -200, 0, 120).angle, 10);
  assert.equal(dragAim(-60, 200, 0, 120).angle, 80);
});
test('tap, return to origin, and pull towards enemy do not arm a shot', () => {
  for (const team of [0, 1]) {
    assert.equal(dragAim(0, 0, team, 120), null);
    assert.equal(dragAim(5, 5, team, 120), null);
    assert.equal(dragAim(team === 0 ? 60 : -60, 40, team, 120), null);
  }
});
test('the visible point filters jitter while raw release coordinates remain available', () => {
  const previous = { x: -80, y: 20 };
  const filtered = smoothAimPoint(previous, { x: -78, y: 23 });
  assert.ok(filtered.x < -78 && filtered.x > -80);
  assert.ok(filtered.y > 20 && filtered.y < 23);
  assert.deepEqual(smoothAimPoint(null, { x: -40, y: 10 }), { x: -40, y: 10 });
});
test('cancel radius and power milestones are deterministic', () => {
  assert.equal(dragAim(-AIM_ARM_RADIUS + 1, 0, 0, 120), null);
  assert.ok(dragAim(-AIM_CANCEL_RADIUS + 1, 0, 0, 120), 'a short pull must remain a valid light shot');
  assert.equal(isAimCanceling(false, AIM_CANCEL_RADIUS - 1), false);
  assert.equal(isAimCanceling(true, AIM_CANCEL_RADIUS - 1), true);
  assert.equal(isAimCanceling(true, AIM_CANCEL_READY_RADIUS), false);
  assert.deepEqual(crossedPowerMilestones(20, 52), [25, 50]);
  assert.deepEqual(crossedPowerMilestones(49, 76, new Set([50])), [75]);
  assert.deepEqual(crossedPowerMilestones(76, 100), [100]);
  assert.deepEqual(crossedPowerMilestones(76, 72), []);
});
test('large and steep pulls stay inside the server limits', () => {
  assert.equal(dragAim(-600, 200, 0, 120).power, 100);
  assert.equal(dragAim(-100, 0, 0, 120).angle, 45);
  assert.equal(dragAim(-10, 200, 0, 120).angle, 80);
});
test('wide aim pads provide a longer but bounded precision range', () => {
  assert.equal(aimPullRange(200), 120);
  assert.equal(aimPullRange(360), 151.2);
  assert.equal(aimPullRange(1000), 180);
});
