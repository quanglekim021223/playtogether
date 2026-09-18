const MIN_FORWARD_PULL = 10;
export const AIM_ARM_RADIUS = 12;
export const AIM_CANCEL_RADIUS = 26;
export const AIM_CANCEL_READY_RADIUS = 36;
export const POWER_MILESTONES = [25, 50, 75, 100];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Give horizontal phone layouts enough travel for fine power control. Pointer
// capture keeps tracking the finger when it leaves the visible pad vertically.
export function aimPullRange(width) {
  return Math.max(120, Math.min(180, width * .42));
}

// Small movements are damped to hide finger jitter; deliberate movements catch
// up quickly. The caller still keeps the raw point for the final shot.
export function smoothAimPoint(previous, next) {
  if (!previous) return { ...next };
  const delta = Math.hypot(next.x - previous.x, next.y - previous.y);
  const alpha = delta < 8 ? .24 : delta < 32 ? .46 : .72;
  return {
    x: previous.x + (next.x - previous.x) * alpha,
    y: previous.y + (next.y - previous.y) * alpha,
  };
}

export function crossedPowerMilestones(previousPower, power, seen = new Set()) {
  if (!Number.isFinite(power) || power <= previousPower) return [];
  return POWER_MILESTONES.filter(mark => previousPower < mark && power >= mark && !seen.has(mark));
}

export function isAimCanceling(cancelReady, distance) {
  return Boolean(cancelReady && distance < AIM_CANCEL_RADIUS);
}

// Pull away from the enemy, like a slingshot. Horizontal travel selects power;
// vertical travel adjusts the angle without unexpectedly changing that power.
// Screen Y grows downwards, so pulling down launches at a steeper angle.
export function dragAim(dx, dy, team, maxPull) {
  const forward = -dx * (team === 0 ? 1 : -1);
  const distance = Math.hypot(dx, dy);
  if (distance < AIM_ARM_RADIUS || forward < MIN_FORWARD_PULL) return null;
  const powerTravel = Math.max(1, maxPull - MIN_FORWARD_PULL);
  const angleTravel = Math.max(60, Math.min(100, maxPull * .55));
  return {
    angle: clamp(45 + dy / angleTravel * 35, 10, 80),
    power: clamp(15 + (forward - MIN_FORWARD_PULL) / powerTravel * 85, 15, 100),
  };
}
