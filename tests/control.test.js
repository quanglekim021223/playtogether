import test from 'node:test';
import assert from 'node:assert/strict';
import { HEIST_RULES, Match, RULESETS } from '../game.js';

function moveOnce(game, nodeId) {
  game.phase = 'move';
  game.movedTurn = null;
  return game.moveShooter(nodeId);
}

function openVault(game) {
  for (const nodeId of game.map.heist.sealNodeIds) {
    const result = moveOnce(game, nodeId);
    assert.equal(result.ok, true);
    assert.equal(result.disabledSeal, true);
  }
}

test('classic remains the default ruleset', () => {
  const game = new Match('tower');
  assert.deepEqual(RULESETS, ['classic', 'control']);
  assert.equal(game.snapshot().objective, null);
});

test('objective mode is bound to the asymmetric harbor blockout', () => {
  assert.throws(() => new Match('tower', { ruleset: 'control' }), /harbor/);
  const game = new Match('harbor', { ruleset: 'control' });
  const snapshot = game.snapshot();
  assert.equal(snapshot.objective.type, 'heist');
  assert.equal(snapshot.objective.stage, 'breach');
  assert.equal(snapshot.objective.status, 'locked');
  assert.equal(snapshot.objective.attackerTurnsRemaining, HEIST_RULES.maxAttackerTurns);
  assert.equal(snapshot.items.filter(item => item.team === 0 && item.kind === 'resident').length, 6);
  assert.equal(snapshot.items.filter(item => item.team === 1 && item.kind === 'resident').length, 6);
});

test('attackers must disable both seals before the vault opens', () => {
  const game = new Match('harbor', { ruleset: 'control' });
  const actions = game.getAvailableMoves().filter(move => move.objectiveAction === 'disableSeal');
  assert.equal(actions.length, 2);
  assert.equal(moveOnce(game, actions[0].id).disabledSeal, true);
  assert.equal(game.objective.stage, 'breach');
  assert.equal(game.objective.status, 'locked');
  assert.equal(moveOnce(game, actions[1].id).disabledSeal, true);
  assert.equal(game.objective.stage, 'steal');
  assert.equal(game.objective.status, 'vault');
  assert.ok(game.events.some(event => event.type === 'vaultOpened'));
});

test('attackers steal the core and extract at the dock to win', () => {
  const game = new Match('harbor', { ruleset: 'control' });
  openVault(game);
  const pickup = moveOnce(game, game.map.heist.vaultNodeId);
  assert.equal(pickup.pickedCore, true);
  assert.equal(game.objective.stage, 'escape');
  assert.equal(game.objective.carrierTeam, 0);
  assert.notEqual(game.mover.id, game.shooter.id, 'a teammate should still provide covering fire');
  const extraction = moveOnce(game, game.map.heist.extractionNodeId);
  assert.equal(extraction.extractedCore, true);
  assert.equal(game.winner, 0);
  assert.equal(game.winReason, 'heist-attack');
  assert.equal(game.phase, 'over');
});

test('a dropped core can only be recovered by the attackers', () => {
  const game = new Match('harbor', { ruleset: 'control' });
  openVault(game);
  moveOnce(game, game.map.heist.vaultNodeId);
  const carrier = game.items.find(item => item.id === game.objective.carrierId);
  game.dropCore(carrier);
  assert.equal(game.objective.status, 'dropped');
  game.team = 1; game.phase = 'move'; game.movedTurn = null; game.syncShooter();
  assert.equal(game.getAvailableMoves().some(move => move.core), false);
  game.team = 0; game.phase = 'move'; game.movedTurn = null; game.syncShooter();
  assert.equal(game.getAvailableMoves().find(move => move.core)?.label, 'Thu hồi lõi bị rơi');
});

test('defenders win when all attacker turns expire', () => {
  const game = new Match('harbor', { ruleset: 'control' });
  game.objective.attackerTurnsRemaining = 1;
  game.team = 0;
  assert.equal(game.finishObjectiveByTurnLimit(), true);
  assert.equal(game.winner, 1);
  assert.equal(game.winReason, 'heist-defense');
  assert.equal(game.phase, 'over');
});

test('elimination alone does not end the objective mission', () => {
  const game = new Match('harbor', { ruleset: 'control' });
  for (const resident of game.items.filter(item => item.kind === 'resident' && item.team === 1)) resident.hp = 0;
  assert.equal(game.finishIfEliminated(), false);
  assert.equal(game.winner, null);
});
