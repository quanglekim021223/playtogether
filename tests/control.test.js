import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTROL_GUARD, Match, RULESETS } from '../game.js';

function placeResidentAtObjective(game, team = game.team) {
  const resident = game.items.find(item => item.kind === 'resident' && item.team === team && item.hp > 0);
  const center = game.nodePosition(game.objective.nodeId, 0);
  resident.nodeId = game.objective.nodeId;
  resident.body.position.copy(center);
  resident.body.velocity.set(0, 0, 0);
  return resident;
}

test('classic remains the default ruleset', () => {
  const game = new Match('tower');
  const snapshot = game.snapshot();
  assert.deepEqual(RULESETS, ['classic', 'control']);
  assert.equal(snapshot.ruleset, 'classic');
  assert.equal(snapshot.objective, null);
  assert.equal(snapshot.availableMoves.some(move => move.id === 'tower-drop-center'), false);
});

test('control exposes the center as a rush for every shooter while it is free', () => {
  const game = new Match('tower', { ruleset: 'control' });
  const snapshot = game.snapshot();
  assert.equal(snapshot.objective.nodeId, 'tower-drop-center');
  assert.equal(snapshot.objective.progress, 0);
  assert.equal(snapshot.objective.target, 2);
  const roster = game.items.filter(item => item.kind === 'resident' && item.team === 0);
  for (let index = 0; index < roster.length; index++) {
    game.shooterCursor[0] = index;
    game.syncShooter();
    assert.ok(game.getAvailableMoves().some(move => move.id === snapshot.objective.nodeId), `shooter ${index} cannot rush center`);
  }
});

test('holding the center for two own completed turns wins the match', () => {
  const game = new Match('tower', { ruleset: 'control' });
  placeResidentAtObjective(game, 0);

  game.team = 0;
  assert.equal(game.resolveControlAtTurnEnd(), false);
  assert.deepEqual({ owner: game.objective.owner, progress: game.objective.progress }, { owner: 0, progress: 0 });

  game.team = 1;
  assert.equal(game.resolveControlAtTurnEnd(), false);
  assert.deepEqual({ owner: game.objective.owner, progress: game.objective.progress }, { owner: 0, progress: 0 });

  game.team = 0;
  assert.equal(game.resolveControlAtTurnEnd(), false);
  assert.equal(game.objective.progress, 1);
  game.team = 1;
  assert.equal(game.resolveControlAtTurnEnd(), false);
  assert.equal(game.objective.progress, 1);
  game.team = 0;
  assert.equal(game.resolveControlAtTurnEnd(), true);
  assert.equal(game.objective.progress, 2);
  assert.equal(game.winner, 0);
  assert.equal(game.winReason, 'control');
  assert.equal(game.phase, 'over');
});

test('a resident knocked out of the zone no longer blocks later center moves', () => {
  const game = new Match('tower', { ruleset: 'control' });
  const holder = placeResidentAtObjective(game, 0);
  holder.body.position.x += 2;
  game.shooterCursor[0] = 1;
  game.syncShooter();
  assert.ok(game.getAvailableMoves().some(move => move.id === game.objective.nodeId));
});

test('leaving or blocking the center clears capture progress', () => {
  const game = new Match('fortress', { ruleset: 'control' });
  const resident = placeResidentAtObjective(game, 0);
  game.team = 0;
  game.resolveControlAtTurnEnd();
  resident.body.position.x += 2;
  game.team = 1;
  game.resolveControlAtTurnEnd();
  assert.deepEqual({ owner: game.objective.owner, progress: game.objective.progress }, { owner: null, progress: 0 });

  resident.body.position.copy(game.nodePosition(game.objective.nodeId, 0));
  game.team = 0;
  game.resolveControlAtTurnEnd();
  const rock = game.environmentItems.find(item => item.kind === 'rockFall');
  rock.released = true;
  game.resolveControlAtTurnEnd();
  assert.deepEqual({ owner: game.objective.owner, progress: game.objective.progress }, { owner: null, progress: 0 });
});

test('the active center defender gets combat damage and blast knockback protection', () => {
  const game = new Match('tower', { ruleset: 'control' });
  const defender = placeResidentAtObjective(game, 0);
  game.team = 0;
  game.resolveControlAtTurnEnd();

  const unguarded = game.items.find(item => item.kind === 'resident' && item.team === 1);
  defender.body.wakeUp();
  unguarded.body.wakeUp();
  game.damage(defender, 100, 'blast');
  game.damage(unguarded, 100, 'blast');

  assert.equal(game.objective.guard, 45);
  assert.ok(Math.abs(defender.hp - 100 * CONTROL_GUARD.damageReduction) < .001);
  assert.equal(unguarded.hp, 0);

  defender.hp = 100;
  unguarded.hp = 100;
  const center = game.nodePosition(game.objective.nodeId, 0);
  defender.body.position.copy(center);
  unguarded.body.position.copy(center);
  defender.body.velocity.set(0, 0, 0);
  unguarded.body.velocity.set(0, 0, 0);
  game.applyRadialBlast(center.clone(), { radius: 3, damage: 1, impulse: 40 });
  assert.ok(defender.body.velocity.length() < unguarded.body.velocity.length() * .4);
});
