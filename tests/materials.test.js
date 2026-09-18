import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../game.js';
import { MATERIALS, crackStage } from '../public/materials.js';

test('identical parts have material-specific durability; equal hits break glass first', () => {
  const game = new Match();
  const parts = Object.keys(MATERIALS).map((material, i) => {
    game.add('block', 0, -5 + i * 2, .5, [1, 1, 1], 1, 100, material);
    return game.items.at(-1);
  });
  assert.deepEqual(parts.map(p => p.maxHp), [72, 100, 150, 30]);
  for (const p of parts) game.damage(p, 40);
  assert.equal(parts[3].destroyed, true);
  assert.ok(parts.slice(0, 3).every(p => !p.destroyed));
  assert.equal(game.events.filter(e => e.type === 'break').length, 1);
  assert.equal(game.events.at(-1).material, 'glass');
});
test('cracks persist in snapshots before break; removed collider emits one material event', () => {
  const game = new Match(); const part = game.items.find(i => i.material === 'brick');
  const initial = game.snapshot();
  game.damage(part, part.maxHp * .2);
  assert.equal(initial.events.length, 0, 'later damage must not mutate an earlier snapshot');
  assert.equal(game.snapshot().items.find(i => i.id === part.id).crack, 1);
  game.damage(part, part.maxHp * .4);
  assert.equal(game.snapshot().items.find(i => i.id === part.id).crack, 2);
  game.damage(part, part.maxHp); game.damage(part, 100);
  assert.equal(game.world.bodies.includes(part.body), false);
  assert.equal(game.snapshot().items.some(i => i.id === part.id), false);
  const breaks = game.events.filter(e => e.type === 'break' && e.itemId === part.id);
  assert.equal(breaks.length, 1); assert.equal(breaks[0].material, 'brick'); assert.equal(breaks[0].p.length, 3); assert.equal(breaks[0].q.length, 4);
  assert.equal(crackStage(100, 100), 0); assert.equal(crackStage(0, 100), 0);
});
test('damage events include an authoritative contact point, normal and strength', () => {
  const game = new Match(); const part = game.items.find(i => i.material === 'wood');
  const impact = part.body.position.clone(); impact.x += part.size[0] / 2;
  game.damage(part, 4, 'impact', impact, 13.5);
  const event = game.events.at(-1);
  assert.equal(event.type, 'hit'); assert.deepEqual(event.impact, impact.toArray());
  assert.ok(event.normal[0] > .99); assert.equal(event.impactStrength, 13.5);
});
test('a falling glass block shatters on collision, a resting block remains intact', () => {
  const game = new Match();
  game.add('block', 0, 0, 8, [1, 1, 1], 1, 100, 'glass');
  const falling = game.items.at(-1);
  game.phase = 'flight'; game.shotAt = 0; game.explodedAt = null;
  for (let i = 0; i < 180; i++) game.step();
  assert.equal(falling.destroyed, true);
  assert.ok(game.events.some(e => e.itemId === falling.id && e.type === 'break' && e.cause === 'impact'));
  assert.ok(game.items.filter(i => i.kind === 'resident').every(i => i.hp === 100));
});
test('destroying support wakes sleeping upper floors; material events stay bounded', () => {
  const game = new Match();
  const roof = game.items.find(i => i.team === 1 && i.kind === 'roof'); const originalY = roof.body.position.y;
  for (const i of game.items.filter(i => i.team === 1 && i.kind === 'block' && i.body.position.y < 2)) game.damage(i, 999);
  game.deadline = Infinity;
  for (let i = 0; i < 180; i++) game.step();
  assert.ok(roof.body.position.y < originalY - 1.5);
  for (let i = 0; i < 150; i++) game.event('hit', { material: 'stone' });
  assert.equal(game.events.length, 96);
});
