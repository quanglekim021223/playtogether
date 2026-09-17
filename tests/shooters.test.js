import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../game.js';
import { WEAPONS, muzzlePosition, launchVelocity } from '../public/weapons.js';
import { MAPS } from '../maps.js';

function finishMiss(game) {
  game.readyAim();
  assert.equal(game.fire({ angle: 80, power: 100, weapon: game.shooter.weapon }), true);
  if (game.projectile) { game.projectile.body.position.set(80, 30, 0); game.explode(); }
  for (let n = 0; n < 170; n++) game.step();
}
test('living residents rotate independently on both teams and dead residents are skipped', () => {
  const game = new Match(), rosters = [0, 1].map(team => game.items.filter(i => i.kind === 'resident' && i.team === team));
  rosters[0][1].hp = 0;
  const seen = [[], []];
  for (let i = 0; i < 12; i++) { seen[game.team].push(game.shooter.id); finishMiss(game); }
  assert.deepEqual(seen[0], [0, 2, 3, 4, 5, 0].map(i => rosters[0][i].id));
  assert.deepEqual(seen[1], rosters[1].map(i => i.id));
});
test('weapon and turn are authoritative; old actor commands cannot fire after an elimination', () => {
  const game = new Match(), first = game.shooter;
  const command = { angle: 45, power: 50, weapon: first.weapon, shooterId: first.id, turn: 1 };
  game.readyAim();
  assert.equal(game.setAim(command), true);
  assert.equal(game.fire({ ...command, weapon: 'heavy' }), false);
  assert.equal(game.fire({ ...command, turn: 3 }), false);
  first.hp = 0; game.step();
  assert.notEqual(game.shooter.id, first.id); assert.equal(game.aim.weapon, game.shooter.weapon);
  assert.equal(game.fire(command), false);
});
test('muzzle and ballistics use the current position and the residents own weapon', () => {
  const game = new Match();
  for (let index = 0; index < 6; index++) {
    game.shooterCursor[0] = index; game.syncShooter();
    const actor = game.shooter; actor.body.position.set(-3, 20 + index, 0);
    const origin = muzzlePosition(actor.body.position.toArray(), 0, 55);
    game.readyAim();
    assert.equal(game.fire({ angle: 55, power: 50, weapon: actor.weapon }), true);
    assert.deepEqual(game.projectile.body.position.toArray(), origin);
    const velocity = launchVelocity(0, 55, 50, actor.weapon);
    assert.equal(game.projectile.body.velocity.x, velocity.x);
    assert.equal(game.projectile.body.velocity.y, velocity.y);
    assert.equal(game.events.at(-1).shooterId, actor.id);
    game.world.removeBody(game.projectile.body); game.projectile = null; game.enterPhase('aim', 18);
  }
  assert.equal(new Set(Object.values(WEAPONS).map(w => `${w.speed}/${w.radius}/${w.damage}/${w.impulse}`)).size, 6);
});
test('a wall in front of the muzzle blocks the shot instead of teleporting through it', () => {
  const game = new Match(); const p = game.shooter.body.position;
  game.add('block', 0, p.x + .55, p.y + .45, [.18, 1.5, 1], 2, 150, 'stone');
  game.readyAim();
  const impact = game.traceAim({ angle: 30, power: 40, weapon: game.shooter.weapon });
  assert.equal(impact.blockedByOwn, true);
  assert.equal(impact.kind, 'block');
  assert.equal(game.fire({ angle: 30, power: 40, weapon: game.shooter.weapon }), true);
  assert.equal(game.projectile, null);
  const blast = game.events.find(e => e.type === 'blast');
  assert.ok(blast.x < p.x + .65);
});
for (const map of Object.keys(MAPS)) test(`${map}: every resident can launch from an open position`, () => {
  for (const team of [0, 1]) for (let index = 0; index < 6; index++) {
    const game = new Match(map); game.team = team; game.shooterCursor[team] = index; game.syncShooter();
    const aim = game.botAim();
    assert.equal(aim.weapon, game.shooter.weapon);
    game.readyAim();
    assert.equal(game.fire(aim), true);
    assert.ok(game.projectile, `${game.shooter.weapon} has a wall directly across the muzzle`);
    // Clear the immediate firing position without hitting a ceiling or another resident.
    for (let n = 0; n < 15; n++) game.step();
    assert.ok(game.projectile, `${game.shooter.weapon} needs an open overhead firing lane`);
    for (let n = 0; n < 600 && game.projectile; n++) game.step();
    const blast = game.events.find(e => e.type === 'blast');
    assert.ok(blast && blast.x * (team === 0 ? 1 : -1) > 0, `${game.shooter.weapon} must have a viable arc to the enemy side`);
  }
});
