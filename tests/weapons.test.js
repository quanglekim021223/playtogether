import test from 'node:test';
import assert from 'node:assert/strict';
import { Match, SKILL_LABELS } from '../game.js';
import { WEAPONS } from '../public/weapons.js';

function useSkill(game, action, extra = {}) {
  const projectile = game.projectile;
  return game.triggerSkill({ turn: game.turn, shooterId: game.firedShooterId, projectileId: projectile.id, action, ...extra });
}

test('weapons: all 6 weapon keys have valid configurations and skill labels', () => {
  const expected = ['pebble', 'heavy', 'bloom', 'rocket', 'drill', 'pulse'];
  for (const w of expected) {
    assert.ok(WEAPONS[w], `WEAPONS.${w} must exist`);
    assert.ok(WEAPONS[w].damage > 0, `WEAPONS.${w}.damage must be positive`);
    assert.ok(WEAPONS[w].radius > 0, `WEAPONS.${w}.radius must be positive`);
    assert.ok(SKILL_LABELS[w], `SKILL_LABELS.${w} must exist`);
  }
});

test('weapons: multi-projectile map and backward-compatible getter', () => {
  const game = new Match('townhouse');
  game.readyAim();
  assert.equal(game.projectiles.size, 0);
  assert.equal(game.projectile, null);

  game.fire({ angle: 45, power: 30, weapon: 'pebble' });
  assert.equal(game.projectiles.size, 1);
  assert.ok(game.projectile);
  assert.equal(game.projectile.weapon, 'pebble');
  assert.equal(typeof game.projectile.id, 'number');
});

test('weapons: pebble bounces on impact and triggerSkill fires secondShot', () => {
  const game = new Match('townhouse');
  game.readyAim();
  game.fire({ angle: 45, power: 30, weapon: 'pebble' });
  assert.equal(game.projectile.maxBounces, 1);
  assert.equal(game.projectile.bounces, 0);

  // Trigger pebble secondShot skill
  const skillRes = useSkill(game, 'secondShot');
  assert.equal(skillRes.ok, true);
  assert.equal(skillRes.action, 'secondShot');
  assert.equal(game.projectiles.size, 2);

  // Skill cannot be used twice on the same shot
  const duplicate = game.triggerSkill({ turn: game.turn, shooterId: game.firedShooterId, projectileId: 1, action: 'secondShot' });
  assert.equal(duplicate.ok, false);

  const bounceGame = new Match('townhouse'); bounceGame.wind = 0; bounceGame.readyAim();
  // This arc clears the center-field barrel and pad, isolating Pebble's own bounce.
  bounceGame.fire({ angle: 25, power: 25, weapon: 'pebble' });
  for (let i = 0; i < 300 && !bounceGame.events.some(e => e.type === 'bounce'); i++) bounceGame.step();
  assert.ok(bounceGame.events.some(e => e.type === 'bounce'));
  assert.equal(bounceGame.projectile?.bounces, 1);
  assert.equal(bounceGame.phase, 'flight', 'pebble must continue flying after its first bounce');
});

test('weapons: heavy boost skill accelerates projectile in flight', () => {
  const game = new Match('townhouse');
  game.shooter.weapon = 'heavy';
  game.readyAim();
  assert.equal(game.fire({ angle: 45, power: 30, weapon: 'heavy' }), true);
  const speedBefore = game.projectile.body.velocity.length();
  const res = useSkill(game, 'boost');
  assert.equal(res.ok, true);
  assert.equal(res.action, 'boost');
  const speedAfter = game.projectile.body.velocity.length();
  assert.ok(speedAfter > speedBefore * 1.25, 'boost should noticeably increase speed');
});

test('weapons: bloom cluster splits into 3 falling bomblets', () => {
  const game = new Match('townhouse');
  game.shooter.weapon = 'bloom';
  game.readyAim();
  assert.equal(game.fire({ angle: 50, power: 35, weapon: 'bloom' }), true);
  assert.equal(game.projectiles.size, 1);

  const res = useSkill(game, 'cluster');
  assert.equal(res.ok, true);
  assert.equal(res.action, 'cluster');
  assert.equal(game.projectiles.size, 3);
  for (const p of game.projectiles.values()) {
    assert.equal(p.weapon, 'bloom');
    assert.equal(p.skillUsed, true);
    assert.ok(p.body.velocity.y < 0, 'cluster bomblets must fall after splitting');
  }
});

test('weapons: rocket steering deflects projectile trajectory', () => {
  const game = new Match('townhouse');
  game.shooter.weapon = 'rocket';
  game.readyAim();
  assert.equal(game.fire({ angle: 40, power: 30, weapon: 'rocket' }), true);
  const initialAngle = Math.atan2(game.projectile.body.velocity.y, game.projectile.body.velocity.x);

  const steerRes = useSkill(game, 'steer', { value: -1, sequence: 1 });
  assert.equal(steerRes.ok, true);
  const newAngle = Math.atan2(game.projectile.body.velocity.y, game.projectile.body.velocity.x);
  assert.notEqual(initialAngle, newAngle);
  const replayed = useSkill(game, 'steer', { value: 1, sequence: 1 });
  assert.equal(replayed.ok, false, 'duplicate steering sequence must be rejected');
});

test('weapons: drill pierces first structural block before exploding', () => {
  const game = new Match('townhouse');
  game.shooter.weapon = 'drill';
  game.readyAim();
  // Fire drill straight into the front structure
  assert.equal(game.fire({ angle: 25, power: 30, weapon: 'drill' }), true);
  assert.equal(game.projectile.maxPierces, 1);
  assert.equal(game.projectile.pierces, 0);

  // Step physics until collision
  for (let i = 0; i < 150 && game.phase === 'flight'; i++) {
    game.step();
    if (game.events.some(e => e.type === 'pierce')) break;
  }
  const pierceEvent = game.events.find(e => e.type === 'pierce');
  assert.ok(pierceEvent, 'drill should emit pierce event upon piercing first block');
  assert.ok(game.projectile && !game.projectile.collided, 'drill must remain in flight after the first block');
  assert.equal(game.projectile.lastPiercedBody, game.items.find(i => i.id === pierceEvent.itemId).body);
  for (let i = 0; i < 300 && game.phase === 'flight'; i++) game.step();
  const blast = game.events.find(e => e.type === 'blast' && e.weapon === 'drill');
  assert.ok(blast, 'drill must eventually explode');
  assert.ok(Number.isInteger(blast.hitItemId), 'drill must hit a second structural collider');
  assert.notEqual(blast.hitItemId, pierceEvent.itemId, 'drill must not explode against the same block it pierced');
});

test('weapons: pulse airburst detonates on command and delivers heavy impulse', () => {
  const game = new Match('townhouse');
  game.shooter.weapon = 'pulse';
  game.readyAim();
  assert.equal(game.fire({ angle: 45, power: 25, weapon: 'pulse' }), true);
  assert.equal(game.phase, 'flight');

  const shooterSpeed = game.shooter.body.velocity.length();
  const res = useSkill(game, 'airburst');
  assert.equal(res.ok, true);
  assert.equal(res.action, 'airburst');
  assert.equal(game.events.some(e => e.type === 'blast' && e.weapon === 'pulse'), true);
  assert.ok(game.shooter.body.velocity.length() > shooterSpeed, 'pulse blast must physically push nearby bodies');
});

test('weapons: wind affects only bazooka trajectory and bot aim compensates', () => {
  const fireAndStep = (weapon, wind) => {
    const game = new Match('townhouse'); game.shooter.weapon = weapon; game.wind = wind; game.readyAim();
    game.fire({ angle: 65, power: 35, weapon });
    for (let i = 0; i < 30 && game.projectile; i++) game.step();
    return game.projectile?.body.position.x;
  };
  assert.ok(Math.abs(fireAndStep('pebble', 1.5) - fireAndStep('pebble', 0)) < .001, 'wind must not move pebble');
  assert.ok(Math.abs(fireAndStep('heavy', 1.5) - fireAndStep('heavy', 0)) > .02, 'wind must move bazooka');

  const calm = new Match('townhouse'); calm.shooter.weapon = 'heavy'; calm.wind = 0;
  const windy = new Match('townhouse'); windy.shooter.weapon = 'heavy'; windy.wind = 1.5;
  assert.notDeepEqual(windy.botAim(), calm.botAim(), 'bot aim must change when bazooka wind changes');
});

test('weapons: snapshot exposes an actionable skill and rejects stale commands', () => {
  const game = new Match('townhouse'); game.readyAim(); game.fire({ angle: 55, power: 40, weapon: 'pebble' });
  const skill = game.snapshot().activeSkill;
  assert.deepEqual({ available: skill.available, action: skill.action, projectileId: skill.projectileId }, { available: true, action: 'secondShot', projectileId: game.projectile.id });
  assert.equal(game.triggerSkill({ turn: game.turn + 1, shooterId: game.firedShooterId, projectileId: skill.projectileId, action: skill.action }).ok, false);
});
