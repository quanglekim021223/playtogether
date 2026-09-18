// Shared ballistic and visual contract; each resident owns one weapon for the match.
export const AIM_LIMITS = Object.freeze({ minAngle: -20, maxAngle: 80, minPower: 15, maxPower: 100 });

export const WEAPONS = {
  pebble: { name: 'Ná cao su', hint: 'Nảy một lần · có đạn bồi', icon: 'Y', radius: 2.7, damage: 62, mass: 2, speed: 1, impulse: 28, bouncesMax: 1, canSecondShot: true, color: '#ffc667' },
  heavy: { name: 'Bazooka', hint: 'Nổ mạnh · chịu ảnh hưởng gió', icon: '⬢', radius: 3.1, damage: 100, mass: 5, speed: .88, impulse: 42, windFactor: 1.2, color: '#697e59' },
  bloom: { name: 'Súng cối', hint: 'Tách thành ba bom con', icon: '✹', radius: 4.6, damage: 46, mass: 1.6, speed: .95, impulse: 28, clusterCount: 3, color: '#dc93bd' },
  rocket: { name: 'Tên lửa', hint: 'Vuốt dọc để bẻ lái', icon: '➤', radius: 2.5, damage: 75, mass: 2.5, speed: 1.15, impulse: 34, steerable: true, color: '#f18759' },
  drill: { name: 'Súng phá giáp', hint: 'Xuyên khối · khoan sâu', icon: '◆', radius: 1.65, damage: 115, mass: 3, speed: 1.3, impulse: 22, pierceMax: 1, color: '#8babbc' },
  pulse: { name: 'Súng xung lực', hint: 'Sóng chấn · đẩy cực mạnh', icon: '◎', radius: 5.2, damage: 28, mass: 1.2, speed: 1.05, impulse: 95, color: '#82d4c8' },
};
export function launchVelocity(team, angle, power, weapon = 'pebble') {
  const radians = angle * Math.PI / 180, speed = (9 + power * .21) * WEAPONS[weapon].speed;
  return { x: Math.cos(radians) * speed * (team === 0 ? 1 : -1), y: Math.sin(radians) * speed };
}
export function muzzlePosition(p, team, angle) {
  const a = angle * Math.PI / 180;
  return [p[0] + Math.cos(a) * .95 * (team === 0 ? 1 : -1), p[1] + .18 + Math.sin(a) * .95, 0];
}
