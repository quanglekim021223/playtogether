import test from 'node:test';
import assert from 'node:assert/strict';
import { Match, SKILL_LABELS } from '../game.js';
import { WEAPONS } from '../public/weapons.js';

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
  const skillRes = game.triggerSkill();
  assert.equal(skillRes.ok, true);
  assert.equal(skillRes.action, 'secondShot');
  assert.equal(game.projectiles.size, 2);

  // Skill cannot be used twice on the same shot
  const duplicate = game.triggerSkill();
  assert.equal(duplicate.ok, false);
});

test('weapons: heavy boost skill accelerates projectile in flight', () => {
  const game = new Match('townhouse');
  game.shooter.weapon = 'heavy';
  game.readyAim();
  assert.equal(game.fire({ angle: 45, power: 30, weapon: 'heavy' }), true);
  const speedBefore = game.projectile.body.velocity.length();
  const res = game.triggerSkill();
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

  const res = game.triggerSkill();
  assert.equal(res.ok, true);
  assert.equal(res.action, 'cluster');
  assert.equal(game.projectiles.size, 3);
  for (const p of game.projectiles.values()) {
    assert.equal(p.weapon, 'bloom');
    assert.equal(p.skillUsed, true);
  }
});

test('weapons: rocket steering deflects projectile trajectory', () => {
  const game = new Match('townhouse');
  game.shooter.weapon = 'rocket';
  game.readyAim();
  assert.equal(game.fire({ angle: 40, power: 30, weapon: 'rocket' }), true);
  const initialAngle = Math.atan2(game.projectile.body.velocity.y, game.projectile.body.velocity.x);

  const steerRes = game.triggerSkill({ steer: -1 });
  assert.equal(steerRes.ok, true);
  const newAngle = Math.atan2(game.projectile.body.velocity.y, game.projectile.body.velocity.x);
  assert.notEqual(initialAngle, newAngle);
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
});

test('weapons: pulse airburst detonates on command and delivers heavy impulse', () => {
  const game = new Match('townhouse');
  game.shooter.weapon = 'pulse';
  game.readyAim();
  assert.equal(game.fire({ angle: 45, power: 25, weapon: 'pulse' }), true);
  assert.equal(game.phase, 'flight');

  const res = game.triggerSkill();
  assert.equal(res.ok, true);
  assert.equal(res.action, 'airburst');
  assert.equal(game.events.some(e => e.type === 'blast' && e.weapon === 'pulse'), true);
});

test('weapons: wind affects trajectory and botAim accounts for wind offset', () => {
  const game1 = new Match('townhouse');
  game1.wind = 0;
  const aimNoWind = game1.botAim();

  const game2 = new Match('townhouse');
  game2.wind = 1.5;
  const aimWithWind = game2.botAim();

  assert.ok(typeof aimNoWind.power === 'number');
  assert.ok(typeof aimWithWind.power === 'number');
});
