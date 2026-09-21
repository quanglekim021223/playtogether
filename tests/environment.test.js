import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../game.js';
import { MAPS } from '../maps.js';

test('every map contains five stable, map-specific interactive objects', () => {
  for (const mapId of Object.keys(MAPS)) {
    const game = new Match(mapId); game.deadline = Infinity;
    const initial = game.snapshot().environment;
    assert.equal(initial.length, 5, `${mapId} special-object budget`);
    assert.ok(initial.some(i => i.kind === 'fuelBarrel'), `${mapId} fuel barrel`);
    assert.ok(initial.some(i => i.kind === 'bouncePad'), `${mapId} bounce pad`);
    const barrels = game.environmentItems.filter(i => i.kind === 'fuelBarrel');
    const initialBarrels = initial.filter(i => i.kind === 'fuelBarrel');
    const pads = game.environmentItems.filter(i => i.kind === 'bouncePad');
    assert.ok(pads.every(i => i.body.mass === 0));
    for (let i = 0; i < 300; i++) game.step();
    assert.ok(barrels.every((item, index) => item.body.position.distanceTo({ x: initialBarrels[index].p[0], y: initialBarrels[index].p[1], z: initialBarrels[index].p[2] }) < .08));
  }
});

test('burning planks spread fire to nearby wood and expire', () => {
  const game = new Match('bridge');
  const plank = game.environmentItems.find(i => i.kind === 'firePlank');
  game.add('block', 0, plank.body.position.x + 1, plank.body.position.y + .5, [1, 1, 1], 2, 100, 'wood');
  const wood = game.items.at(-1), hp = wood.hp;

  game.damageEnvironment(plank, 1, 'projectile');
  for (let i = 0; i < 380; i++) game.step();

  assert.ok(wood.hp < hp, 'fire must damage nearby wood');
  assert.equal(plank.destroyed, true, 'burning plank must eventually burn out');
  assert.ok(game.events.some(e => e.type === 'fireIgnite'));
});

test('falling glass and rocks release, damage residents, and rocks block their movement node', () => {
  const townhouse = new Match('townhouse');
  townhouse.phase = 'settle'; townhouse.deadline = Infinity;
  const glass = townhouse.environmentItems.find(i => i.kind === 'glassTrap');
  const victim = townhouse.items.find(i => i.kind === 'resident');
  townhouse.damageEnvironment(glass, 1, 'projectile');
  townhouse.pendingHazardHits.push({ hazard: glass, resident: victim, impact: 8 });
  const hp = victim.hp; townhouse.step();
  assert.equal(glass.released, true);
  assert.ok(victim.hp < hp && townhouse.events.some(e => e.type === 'hazardHit' && e.kind === 'glassTrap'));
  for (let i = 0; i < 180 && !glass.destroyed; i++) townhouse.step();
  assert.equal(glass.destroyed, true, 'released glass must shatter when it reaches the ground');

  const fortress = new Match('fortress');
  const rock = fortress.environmentItems.find(i => i.kind === 'rockFall');
  assert.equal(fortress.isNodeAvailable('fortress-drop-center', 0), true);
  fortress.damageEnvironment(rock, 1, 'projectile');
  assert.equal(rock.released, true);
  assert.equal(fortress.isNodeAvailable('fortress-drop-center', 0), false);
});

test('magnet bends rockets but does not affect other projectiles', () => {
  const launch = weapon => {
    const game = new Match('tower'); game.wind = 0; game.readyAim(); game.shooter.weapon = weapon;
    game.fire({ angle: 55, power: 45, weapon });
    const magnet = game.environmentItems.find(i => i.kind === 'magnet');
    game.projectile.body.position.set(magnet.body.position.x + 4, magnet.body.position.y, 0);
    game.projectile.body.velocity.set(0, 0, 0); game.step();
    return game.projectile.body.velocity.x;
  };
  assert.ok(launch('rocket') < -.01, 'rocket must curve toward magnet');
  assert.ok(Math.abs(launch('pebble')) < .001, 'ordinary projectile must ignore magnet');
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
