import test from 'node:test';
import assert from 'node:assert/strict';
import { Match, RELAY_RULES, RULESETS } from '../game.js';

function moveOnce(game, nodeId) {
  game.phase = 'move';
  game.movedTurn = null;
  return game.moveShooter(nodeId);
}

function pickupCore(game) {
  const result = moveOnce(game, game.objective.nodeId);
  assert.equal(result.ok, true);
  assert.equal(result.pickedCore, true);
  return game.shooter;
}

function deliverCore(game) {
  const carrier = game.shooter;
  const frontNodeId = `${game.map.id}-node-6`;
  assert.equal(moveOnce(game, frontNodeId).ok, true);
  const result = moveOnce(game, game.objective.goalNodeId);
  assert.equal(result.ok, true);
  assert.equal(result.scoredCore, true);
  return carrier;
}

test('classic remains the default ruleset', () => {
  const game = new Match('tower');
  const snapshot = game.snapshot();
  assert.deepEqual(RULESETS, ['classic', 'control']);
  assert.equal(snapshot.ruleset, 'classic');
  assert.equal(snapshot.objective, null);
  assert.equal(snapshot.availableMoves.some(move => move.id === 'tower-drop-center'), false);
});

test('relay exposes a free center core to every active resident', () => {
  const game = new Match('tower', { ruleset: 'control' });
  const snapshot = game.snapshot();
  assert.equal(snapshot.objective.nodeId, 'tower-drop-center');
  assert.equal(snapshot.objective.goalNodeId, 'tower-node-0');
  assert.deepEqual(snapshot.objective.scores, [0, 0]);
  assert.equal(snapshot.objective.target, RELAY_RULES.scoreTarget);
  const roster = game.items.filter(item => item.kind === 'resident' && item.team === 0);
  for (let index = 0; index < roster.length; index++) {
    game.shooterCursor[0] = index;
    game.syncShooter();
    assert.ok(game.getAvailableMoves().some(move => move.id === snapshot.objective.nodeId && move.core), `shooter ${index} cannot rush core`);
  }
});

test('a carrier is locked as shooter and traverses the opponent side', () => {
  const game = new Match('tower', { ruleset: 'control' });
  const carrier = pickupCore(game);
  assert.equal(game.objective.carrierId, carrier.id);
  assert.equal(game.objective.carrierTeam, 0);
  assert.equal(game.shooter.id, carrier.id);
  game.firedShooterId = carrier.id;
  game.nextTurn();
  game.firedShooterId = game.shooter.id;
  game.nextTurn();
  assert.equal(game.team, 0);
  assert.equal(game.shooter.id, carrier.id);
  const enemySideMove = game.getAvailableMoves().find(move => move.id === 'tower-node-6');
  assert.ok(enemySideMove);
  assert.ok(enemySideMove.x > 0, 'team 0 carrier should cross onto team 1 side');
});

test('every map has a playable center-to-enemy-base relay route', () => {
  for (const mapId of ['townhouse', 'tower', 'bridge', 'fortress']) {
    const game = new Match(mapId, { ruleset: 'control' });
    pickupCore(game);
    deliverCore(game);
    assert.deepEqual(game.objective.scores, [1, 0], `${mapId} cannot deliver a core`);
  }
});

test('movement is limited to one action per turn', () => {
  const game = new Match('tower', { ruleset: 'control' });
  assert.equal(game.moveShooter(game.objective.nodeId).ok, true);
  assert.deepEqual(game.getAvailableMoves(), []);
  assert.match(game.moveShooter('tower-node-6').error, /một lần/);
});

test('delivering two cores wins relay; elimination alone never wins it', () => {
  const game = new Match('tower', { ruleset: 'control' });
  pickupCore(game);
  deliverCore(game);
  assert.deepEqual(game.objective.scores, [1, 0]);
  assert.equal(game.winner, null);

  pickupCore(game);
  deliverCore(game);
  assert.deepEqual(game.objective.scores, [2, 0]);
  assert.equal(game.winner, 0);
  assert.equal(game.winReason, 'relay');
  assert.equal(game.phase, 'over');

  const fresh = new Match('tower', { ruleset: 'control' });
  for (const resident of fresh.items.filter(item => item.kind === 'resident' && item.team === 1)) resident.hp = 0;
  assert.equal(fresh.finishIfEliminated(), false);
  assert.equal(fresh.winner, null);
});

test('knocking out the carrier resets the core and the resident respawns later', () => {
  const game = new Match('tower', { ruleset: 'control' });
  const carrier = pickupCore(game);
  carrier.hp = 0;
  game.step();
  assert.equal(game.objective.status, 'center');
  assert.equal(game.objective.carrierId, null);
  assert.equal(carrier.eliminated, true);
  assert.equal(carrier.respawnAtTurn, 1 + RELAY_RULES.respawnDelay);

  game.turn = carrier.respawnAtTurn;
  game.prepareRelayTeam(carrier.team);
  assert.equal(carrier.eliminated, false);
  assert.equal(carrier.hp, carrier.maxHp);
  assert.ok(game.world.bodies.includes(carrier.body));
});

test('time limit picks the higher score and tied games enter sudden-death overtime', () => {
  const game = new Match('tower', { ruleset: 'control' });
  game.turn = game.objective.maxTurns;
  assert.equal(game.finishRelayByTurnLimit(), false);
  assert.equal(game.objective.overtime, true);

  const leader = new Match('tower', { ruleset: 'control' });
  leader.objective.scores = [1, 0];
  leader.turn = leader.objective.maxTurns;
  assert.equal(leader.finishRelayByTurnLimit(), true);
  assert.equal(leader.winner, 0);
  assert.equal(leader.winReason, 'relay-time');
});
