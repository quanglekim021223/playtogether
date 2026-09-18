import test from 'node:test';
import assert from 'node:assert/strict';
import { aimPullRange, dragAim } from '../public/aim.js';

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
