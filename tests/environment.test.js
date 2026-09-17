import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../game.js';
import { MAPS } from '../maps.js';

test('every map contains two stable fuel barrels and two static bounce pads', () => {
  for (const mapId of Object.keys(MAPS)) {
    const game = new Match(mapId); game.deadline = Infinity;
    const initial = game.snapshot().environment;
    assert.equal(initial.filter(i => i.kind === 'fuelBarrel').length, 2, `${mapId} fuel barrels`);
    assert.equal(initial.filter(i => i.kind === 'bouncePad').length, 2, `${mapId} bounce pads`);
    const barrels = game.environmentItems.filter(i => i.kind === 'fuelBarrel');
    const pads = game.environmentItems.filter(i => i.kind === 'bouncePad');
    assert.ok(Math.abs(barrels[0].body.position.x + barrels[1].body.position.x) < .001);
    assert.ok(pads.every(i => i.body.mass === 0));
    for (let i = 0; i < 300; i++) game.step();
    assert.ok(barrels.every((item, index) => item.body.position.distanceTo({ x: initial[index].p[0], y: initial[index].p[1], z: initial[index].p[2] }) < .08));
  }
});

test('fuel barrel explosion damages structures, adds impulse and chains to a nearby barrel', () => {
  const game = new Match('tower');
  const [first, second] = game.environmentItems.filter(i => i.kind === 'fuelBarrel');
  second.body.position.set(first.body.position.x + 2, first.body.position.y, 0);
  game.add('block', 0, first.body.position.x + 1.2, first.body.position.y, [1, 1, 1], 2, 100, 'brick');
  const block = game.items.at(-1), beforeVelocity = block.body.velocity.length();

  game.damageEnvironment(first, first.hp, 'test');

  assert.equal(first.destroyed, true);
  assert.equal(second.destroyed, true, 'nearby fuel barrel must chain-explode');
  assert.ok(block.hp < block.maxHp, 'barrel blast must damage nearby structure');
  assert.ok(block.body.velocity.length() > beforeVelocity, 'barrel blast must push nearby dynamic bodies');
  assert.equal(game.events.filter(e => e.type === 'barrelBlast').length, 2);
  assert.ok(!game.world.bodies.includes(first.body) && !game.world.bodies.includes(second.body));
});

test('bounce pad redirects a projectile without consuming Pebble own bounce', () => {
  const game = new Match('tower'); game.wind = 0;
  game.readyAim();
  assert.equal(game.fire({ angle: 55, power: 45, weapon: 'pebble' }), true);
  const projectile = game.projectile;
  const pad = game.environmentItems.find(i => i.kind === 'bouncePad');
  projectile.body.position.set(pad.body.position.x, pad.body.position.y + 1.2, 0);
  projectile.body.velocity.set(2, -10, 0);

  for (let i = 0; i < 30 && !game.events.some(e => e.type === 'padBounce'); i++) game.step();

  const event = game.events.find(e => e.type === 'padBounce');
  assert.ok(event, 'server must emit an authoritative pad bounce event');
  assert.equal(event.itemId, pad.id);
  assert.equal(projectile.bounces, 0, 'environment pad must not spend Pebble bounce');
  assert.ok(projectile.body.velocity.y > 0, 'projectile must leave the upward face of the pad');
  assert.equal(projectile.collided, false);
});

test('a direct projectile hit detonates a fuel barrel and removes it from snapshots', () => {
  const game = new Match('tower');
  game.readyAim(); game.fire({ angle: 55, power: 45, weapon: 'pebble' });
  const projectile = game.projectile;
  const barrel = game.environmentItems.find(i => i.kind === 'fuelBarrel');
  game.handleProjectileCollision({ projectile, proj: projectile, hitBody: barrel.body, normal: barrel.body.position.vsub(projectile.body.position), velocity: projectile.body.velocity.clone() });
  assert.equal(barrel.destroyed, true);
  assert.equal(projectile.collided, true);
  assert.ok(game.events.some(e => e.type === 'barrelBlast' && e.itemId === barrel.id));
  assert.ok(!game.snapshot().environment.some(i => i.id === barrel.id));
});
