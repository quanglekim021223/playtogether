import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../game.js';

test('Airdrop spawns in settle phase, falls, and lands with a static body collider', () => {
  const match = new Match('tower', { weather: 'clear' });
  match.spawnAirdrop('heal');

  assert.ok(match.airdrop);
  assert.equal(match.airdrop.status, 'falling');
  assert.equal(match.airdrop.buff, 'heal');
  assert.equal(match.airdrop.nodeId, 'tower-drop-center');

  // Step forward 2.3 seconds so airdrop lands
  for (let i = 0; i < 23; i++) {
    match.step(0.1);
  }

  assert.equal(match.airdrop.status, 'landed');
  assert.ok(match.airdrop.body, 'Landed crate should have a physics body collider');
  assert.equal(match.airdrop.body.mass, 0, 'Crate collider should be static');
  const lifecycle = match.events.filter(event => event.type.startsWith('airdrop_'));
  assert.ok(lifecycle.every(event => Number.isInteger(event.id)), 'event sequence id must not be overwritten by the airdrop id');
  assert.ok(lifecycle.every(event => event.airdropId === match.airdrop.id));
});

test('Turn scheduler spawns only on settle and retries a blocked drop node later', () => {
  const match = new Match('tower', { weather: 'clear' }); match.turn = 4;
  match.shooter.nodeId = 'tower-drop-center';
  match.enterPhase('settle', 2.6);
  assert.equal(match.airdrop, null, 'occupied drop node must postpone the crate');
  assert.equal(match.nextAirdropTurn, 4, 'postponed crate must remain due');

  match.shooter.nodeId = 'tower-node-0';
  match.enterPhase('settle', 2.6);
  assert.equal(match.airdrop?.status, 'falling');
  assert.equal(match.airdrop?.expiresOnTurn, 8);
});

test('Neutral drop node coordinates are identical regardless of team perspective', () => {
  const match = new Match('tower', { weather: 'clear' });
  const posTeam0 = match.nodePosition('tower-drop-center', 0);
  const posTeam1 = match.nodePosition('tower-drop-center', 1);

  assert.equal(posTeam0.x, posTeam1.x);
  assert.equal(posTeam0.y, posTeam1.y);
  assert.equal(posTeam0.z, posTeam1.z);
});

test('Neutral drop node checks occupancy across both teams', () => {
  const match = new Match('tower', { weather: 'clear' });
  // Move resident 0 (Team 0) to neutral drop node
  const shooter = match.shooter;
  assert.equal(shooter.team, 0);

  // Directly place shooter on neutral drop node
  shooter.nodeId = 'tower-drop-center';
  const pos = match.nodePosition('tower-drop-center', 0);
  shooter.body.position.copy(pos);

  // Put the active Team 1 resident at a real neighbor of the neutral node.
  match.team = 1; match.shooterCursor[1] = 0; match.syncShooter();
  match.shooter.nodeId = 'tower-node-6';
  match.shooter.body.position.copy(match.nodePosition('tower-node-6', 1));
  const movesTeam1 = match.getAvailableMoves();

  // Neither team should have tower-drop-center in available moves because it is occupied by team 0
  assert.equal(movesTeam1.some(m => m.id === 'tower-drop-center'), false, 'Team 1 cannot move to occupied neutral node');

  match.team = 0; match.shooterCursor[0] = 0; match.syncShooter();
  const movesTeam0 = match.getAvailableMoves();
  assert.equal(movesTeam0.some(m => m.id === 'tower-drop-center'), false, 'Shooter cannot move to an occupied neutral node');
});

test('Airdrop waits when every drop node is occupied and lands on the ground clear of arena colliders', () => {
  const match = new Match('tower', { weather: 'clear' });
  match.shooter.nodeId = 'tower-drop-center';
  assert.equal(match.spawnAirdrop('heal'), false);
  assert.equal(match.airdrop, null);

  match.shooter.nodeId = 'tower-node-0';
  assert.equal(match.spawnAirdrop('heal'), true);
  for (let i = 0; i < 23; i++) match.step(0.1);
  assert.equal(match.airdrop.y, 0, 'crate base should rest on the ground');
  assert.equal(match.airdrop.body.position.y, .45, 'crate collider center should match its half-height');
  const pads = match.environmentItems.filter(item => item.kind === 'bouncePad');
  assert.ok(pads.every(pad => Math.abs(pad.body.position.x - match.airdrop.body.position.x) > .45 + pad.size[0] / 2));
});

test('Moving to airdrop node collects heal buff (+35 HP capped at maxHp)', () => {
  const match = new Match('tower', { weather: 'clear' });
  match.spawnAirdrop('heal');
  for (let i = 0; i < 23; i++) match.step(0.1); // land crate

  const shooter = match.shooter;
  shooter.hp = 50; // damaged
  shooter.nodeId = 'tower-node-6'; // neighbor of tower-drop-center

  // Ensure move phase
  match.phase = 'move';
  const moved = match.moveShooter('tower-drop-center');
  assert.ok(moved, 'Shooter should successfully move to airdrop node');

  assert.equal(shooter.hp, 85, 'Shooter should be healed by 35 HP');
  assert.equal(match.airdrop, null, 'Airdrop should be collected and removed');
});

test('Moving to airdrop node collects power buff (x1.5 damage) and consumes charge on shot', () => {
  const match = new Match('tower', { weather: 'clear' });
  match.spawnAirdrop('power');
  for (let i = 0; i < 23; i++) match.step(0.1);

  const shooter = match.shooter;
  shooter.nodeId = 'tower-node-6';
  match.phase = 'move';
  match.moveShooter('tower-drop-center');

  assert.ok(shooter.buff);
  assert.equal(shooter.buff.type, 'power');
  assert.equal(shooter.buff.charges, 1);

  // Ready aim and fire
  match.readyAim();
  const fired = match.fire({ angle: 45, power: 50, weapon: 'pebble' });
  assert.ok(fired);

  // Check projectile damageMod
  assert.ok(match.projectiles.size > 0);
  const proj = Array.from(match.projectiles.values())[0];
  assert.equal(proj.damageMod, 1.5, 'Active projectile inherits x1.5 damageMod from power buff');

  // Buffer charge is consumed
  assert.equal(shooter.buff, null, 'Power buff charge consumed after firing');
});

test('Power buff also multiplies direct pierce damage', () => {
  const match = new Match('tower', { weather: 'clear' });
  const shooter = match.shooter; shooter.weapon = 'drill'; shooter.buff = { type: 'power', damageMod: 1.5, charges: 1 };
  match.readyAim(); match.fire({ angle: 45, power: 50, weapon: 'drill' });
  const projectile = match.projectile;
  const target = match.items.find(item => item.team === 1 && item.kind !== 'resident' && item.hp > 100);
  const hp = target.hp;
  match.handleProjectileCollision({ proj: projectile, hitBody: target.body, normal: target.body.position.vsub(projectile.body.position), velocity: projectile.body.velocity.clone() });
  assert.equal(target.hp, hp - 55 * 1.5);
});

test('Armor buff reduces incoming damage by 50% and is consumed', () => {
  const match = new Match('tower', { weather: 'clear' });
  match.spawnAirdrop('armor');
  for (let i = 0; i < 23; i++) match.step(0.1);

  const shooter = match.shooter;
  shooter.nodeId = 'tower-node-6';
  match.phase = 'move';
  match.moveShooter('tower-drop-center');

  assert.ok(shooter.buff);
  assert.equal(shooter.buff.type, 'armor');
  assert.equal(shooter.buff.charges, 1);

  // Damage shooter with 40 damage
  const initialHp = shooter.hp;
  match.damage(shooter, 40);

  // 50% of 40 is 20 damage taken
  assert.equal(shooter.hp, initialHp - 20, 'Armor buff should reduce damage by 50%');
  assert.equal(shooter.buff, null, 'Armor buff charge consumed after taking hit');
});

test('Airdrop crate can be destroyed by direct damage or radial blast', () => {
  const match = new Match('tower', { weather: 'clear' });
  match.spawnAirdrop('heal');
  for (let i = 0; i < 23; i++) match.step(0.1);

  assert.ok(match.airdrop);
  assert.equal(match.airdrop.hp, 40);

  // Apply 20 radial blast damage
  const cratePos = match.airdrop.body.position.clone();
  match.applyRadialBlast(cratePos, { radius: 3, damage: 20, impulse: 10 }, 'blast');
  assert.ok(match.airdrop.hp < 40, 'Crate HP should be reduced by blast');

  // Apply another blast with heavy damage to destroy it
  match.applyRadialBlast(cratePos, { radius: 3, damage: 100, impulse: 10 }, 'blast');
  assert.equal(match.airdrop, null, 'Crate should be destroyed when hp <= 0');
});

test('Airdrop expires when match turn reaches expiresOnTurn', () => {
  const match = new Match('tower', { weather: 'clear' });
  match.turn = 4;
  match.spawnAirdrop('heal');
  assert.ok(match.airdrop);
  assert.equal(match.airdrop.expiresOnTurn, 8);

  // Simulate turns advancing
  match.turn = 7;
  match.checkAirdropSpawn();
  assert.ok(match.airdrop, 'Should still exist on turn 7');

  match.turn = 8;
  match.checkAirdropSpawn();
  assert.equal(match.airdrop, null, 'Should expire on turn 8');
});
