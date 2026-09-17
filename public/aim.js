// Pull away from the enemy, like a slingshot. Screen Y grows downwards.
export function dragAim(dx, dy, team, maxPull) {
  const forward = -dx * (team === 0 ? 1 : -1);
  const distance = Math.hypot(dx, dy);
  if (distance < 12 || forward < 4 || dy < -8) return null;
  return {
    angle: Math.max(10, Math.min(80, Math.atan2(Math.max(0, dy), forward) * 180 / Math.PI)),
    power: Math.max(15, Math.min(100, 15 + (distance - 12) / Math.max(1, maxPull - 12) * 85)),
  };
}
