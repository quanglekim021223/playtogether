// Shared ballistic and visual contract; each resident owns one weapon for the match.
export const WEAPONS = {
  pebble: { name: 'Ná cao su', hint: 'Đạn nhẹ · cân bằng', icon: 'Y', radius: 2.7, damage: 62, mass: 2, speed: 1, impulse: 28, color: '#ffc667' },
  heavy: { name: 'Bazooka', hint: 'Sát thương mạnh · bay ngắn', icon: '⬢', radius: 3.1, damage: 90, mass: 5, speed: .88, impulse: 42, color: '#697e59' },
  bloom: { name: 'Súng cối', hint: 'Vùng nổ rộng · bắn cầu vồng', icon: '✹', radius: 4.6, damage: 46, mass: 1.6, speed: .95, impulse: 28, color: '#dc93bd' },
  rocket: { name: 'Tên lửa', hint: 'Bay nhanh · nổ tập trung', icon: '➤', radius: 2.5, damage: 75, mass: 2.5, speed: 1.15, impulse: 34, color: '#f18759' },
  drill: { name: 'Súng phá giáp', hint: 'Đạn nhanh · phá một điểm', icon: '◆', radius: 1.65, damage: 115, mass: 3, speed: 1.3, impulse: 22, color: '#8babbc' },
  pulse: { name: 'Súng xung lực', hint: 'Nổ nhẹ · đẩy khối mạnh', icon: '◎', radius: 3.8, damage: 34, mass: 1.2, speed: 1.05, impulse: 65, color: '#82d4c8' },
};
export function launchVelocity(team, angle, power, weapon = 'pebble') {
  const radians = angle * Math.PI / 180, speed = (9 + power * .21) * WEAPONS[weapon].speed;
  return { x: Math.cos(radians) * speed * (team === 0 ? 1 : -1), y: Math.sin(radians) * speed };
}
export function muzzlePosition(p, team, angle) {
  const a = angle * Math.PI / 180;
  return [p[0] + Math.cos(a) * .95 * (team === 0 ? 1 : -1), p[1] + .18 + Math.sin(a) * .95, 0];
}
