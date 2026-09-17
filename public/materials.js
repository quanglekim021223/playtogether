// One vocabulary for server durability, client surfaces, fragments and audio.
// HP multiplies the structural part's nominal strength; mass stays authored per part.
export const MATERIALS = {
  wood: { name: 'Gỗ', strength: 0.72, color: '#b77943', roughness: 0.9, impactThreshold: 5, impactDamage: 5, fragment: 'splinter', fragments: 10, bounce: 0.22 },
  brick: { name: 'Gạch', strength: 1, color: '#cd795c', roughness: 0.95, impactThreshold: 6, impactDamage: 6, fragment: 'brick', fragments: 12, bounce: 0.16 },
  stone: { name: 'Đá', strength: 1.5, color: '#83969c', roughness: 1, impactThreshold: 8, impactDamage: 4, fragment: 'rock', fragments: 8, bounce: 0.12 },
  glass: { name: 'Kính', strength: 0.3, color: '#8ee0e5', roughness: 0.12, impactThreshold: 3.5, impactDamage: 10, fragment: 'shard', fragments: 16, bounce: 0.32 },
};
export function crackStage(hp, maxHp) {
  if (hp <= 0 || hp >= maxHp * 0.85) return 0;
  return hp > maxHp * 0.45 ? 1 : 2;
}
