const MIN_FORWARD_PULL = 10;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Give horizontal phone layouts enough travel for fine power control. Pointer
// capture keeps tracking the finger when it leaves the visible pad vertically.
export function aimPullRange(width) {
  return Math.max(120, Math.min(180, width * .42));
}

// Pull away from the enemy, like a slingshot. Horizontal travel selects power;
// vertical travel adjusts the angle without unexpectedly changing that power.
// Screen Y grows downwards, so pulling down launches at a steeper angle.
export function dragAim(dx, dy, team, maxPull) {
  const forward = -dx * (team === 0 ? 1 : -1);
  const distance = Math.hypot(dx, dy);
  if (distance < 12 || forward < MIN_FORWARD_PULL) return null;
  const powerTravel = Math.max(1, maxPull - MIN_FORWARD_PULL);
  const angleTravel = Math.max(60, Math.min(100, maxPull * .55));
  return {
    angle: clamp(45 + dy / angleTravel * 35, 10, 80),
    power: clamp(15 + (forward - MIN_FORWARD_PULL) / powerTravel * 85, 15, 100),
  };
}
