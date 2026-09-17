import test from 'node:test';
import assert from 'node:assert/strict';
import { Match, launchVelocity } from '../game.js';

test('tower remains stable before a shot; all twelve residents are healthy', () => {
  const game = new Match();
  for (let i = 0; i < 600; i++) game.step();
  const residents = game.snapshot().items.filter(i => i.kind === 'resident');
  assert.equal(residents.length, 12);
  assert.ok(residents.every(i => i.hp === 100));
  assert.ok(game.items.filter(i => i.kind === 'roof').every(i => i.body.position.y > 4.3));
});
test('reject invalid inputs and a duplicate shot while resolving', () => {
  const game = new Match();
  assert.equal(game.fire({ angle: 40, power: 60, weapon: 'pebble' }), false);
  assert.equal(game.readyAim(), true);
  for (const input of [{ angle: NaN, power: 60, weapon: 'pebble' }, { angle: 40, power: 101, weapon: 'pebble' }, { angle: 40, power: 60, weapon: '__proto__' }]) assert.equal(game.fire(input), false);
  assert.equal(game.fire({ angle: 40, power: 60, weapon: 'pebble' }), true);
  assert.equal(game.fire(), false);
});
test('real ballistic shot explodes, damages or displaces the enemy, then switches turn', () => {
  const game = new Match();
  const original = game.items.filter(i => i.team === 1).map(i => ({ position: i.body.position.clone(), hp: i.hp }));
  // A ~20m ballistic shot from the left cannon to the lower right tower.
  game.readyAim();
  game.fire({ angle: 35, power: 20, weapon: 'pebble' });
  for (let i = 0; i < 600 && game.turn === 1; i++) game.step();
  assert.ok(game.events.some(e => e.type === 'blast'));
  assert.equal(game.team, 1); assert.equal(game.turn, 2);
  const enemies = game.items.filter(i => i.team === 1);
  assert.ok(enemies.some((i, n) => i.hp < original[n].hp || i.body.position.distanceTo(original[n].position) > 0.4));
});
test('end state and draw are resolved after explosions', () => {
  for (const draw of [false, true]) {
    const game = new Match();
    for (const item of game.items) if (item.kind === 'resident' && (draw || item.team === 1)) item.hp = 0;
    // Elimination is resolved even when there is no valid shooter left.
    game.step();
    for (let i = 0; i < 170; i++) game.step();
    assert.equal(game.phase, 'over'); assert.equal(game.winner, draw ? -1 : 0);
  }
});
test('timeout auto-fires and both teams use mirrored trajectories', () => {
  const a = launchVelocity(0, 42, 62), b = launchVelocity(1, 42, 62);
  assert.equal(a.x, -b.x); assert.equal(a.y, b.y);
  const game = new Match(); game.deadline = 0; game.step(); assert.equal(game.phase, 'aim');
  game.deadline = 0; game.step(); assert.equal(game.phase, 'flight');
});

test('six-person teams keep playing until the last resident is eliminated', () => {
  const game = new Match(); const enemies = game.items.filter(i => i.kind === 'resident' && i.team === 1);
  for (const item of enemies.slice(0, 5)) item.hp = 0;
  game.readyAim();
  game.fire({ angle: 80, power: 15, weapon: 'pebble' }); game.explode();
  for (let i = 0; i < 170; i++) game.step();
  assert.equal(game.phase, 'move'); assert.equal(game.winner, null);
  enemies[5].hp = 0;
  game.readyAim();
  game.fire({ angle: 80, power: 15, weapon: 'pebble' }); game.explode();
  for (let i = 0; i < 170; i++) game.step();
  assert.equal(game.phase, 'over'); assert.equal(game.winner, 0);
});

test('heavy bomb breaks support blocks and the enemy roof physically collapses', () => {
  const game = new Match(); game.shooterCursor[0] = 1; game.syncShooter();
  game.readyAim();
  assert.equal(game.fire({ angle: 35, power: 60, weapon: 'heavy' }), true);
  for (let i = 0; i < 600 && game.turn === 1; i++) game.step();
  assert.ok(game.items.some(i => i.team === 1 && i.destroyed));
  assert.ok(game.items.find(i => i.kind === 'roof' && i.team === 1).body.position.y < 5);
  assert.ok(game.items.find(i => i.kind === 'roof' && i.team === 0).body.position.y > 7);
});
