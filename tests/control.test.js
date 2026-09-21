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
  return game.items.find(item => item.id === game.objective.carrierId);
}

function deliverCore(game) {
  const carrier = game.mover;
  let result;
  for (const nodeId of game.map.relayRoute) {
    result = moveOnce(game, nodeId);
    assert.equal(result.ok, true);
  }
  assert.equal(result?.scoredCore, true);
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
  assert.equal(snapshot.objective.goalNodeId, 'tower-node-1');
  assert.deepEqual(snapshot.objective.scores, [0, 0]);
  assert.equal(snapshot.objective.target, RELAY_RULES.scoreTarget);
  const roster = game.items.filter(item => item.kind === 'resident' && item.team === 0);
  for (let index = 0; index < roster.length; index++) {
    game.shooterCursor[0] = index;
    game.syncShooter();
    assert.ok(game.getAvailableMoves().some(move => move.id === snapshot.objective.nodeId && move.core), `shooter ${index} cannot rush core`);
  }
});

test('the carrier moves on an exposed route while a teammate remains the shooter', () => {
  const game = new Match('tower', { ruleset: 'control' });
  const carrier = pickupCore(game);
  assert.equal(game.objective.carrierId, carrier.id);
  assert.equal(game.objective.carrierTeam, 0);
  assert.equal(game.mover.id, carrier.id);
  assert.notEqual(game.shooter.id, carrier.id);
  const escort = game.shooter;
  assert.equal(game.aim.weapon, escort.weapon);
  game.readyAim();
  assert.equal(game.fire({ ...game.aim, shooterId: escort.id, turn: game.turn }), true);
  game.projectile = null;
  game.phase = 'move';
  game.firedShooterId = escort.id;
  game.nextTurn();
  game.firedShooterId = game.shooter.id;
  game.nextTurn();
  assert.equal(game.team, 0);
  assert.equal(game.mover.id, carrier.id);
  assert.notEqual(game.shooter.id, carrier.id);
  const enemySideMove = game.getAvailableMoves().find(move => move.id === 'tower-relay-approach');
  assert.ok(enemySideMove);
  assert.ok(enemySideMove.x > 0, 'team 0 carrier should cross onto team 1 side');
  assert.equal(enemySideMove.label, 'Tiến lõi · Lối trống trước tháp');
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

test('knocking out the carrier drops a contestable core and the resident respawns later', () => {
  const game = new Match('tower', { ruleset: 'control' });
  const carrier = pickupCore(game);
  moveOnce(game, game.map.relayRoute[0]);
  carrier.hp = 0;
  game.step();
  assert.equal(game.objective.status, 'dropped');
  assert.equal(game.objective.carrierId, null);
  assert.ok(Number.isFinite(game.objective.dropX));
  assert.ok(Number.isFinite(game.objective.dropY));
  assert.equal(game.getObjectiveSnapshot().x, game.objective.dropX);
  assert.equal(game.getObjectiveSnapshot().y, game.objective.dropY);
  assert.equal(carrier.eliminated, true);
  assert.equal(carrier.respawnAtTurn, 1 + RELAY_RULES.respawnDelay);

  game.team = 1;
  game.phase = 'move'; game.movedTurn = null;
  const droppedMove = game.getAvailableMoves().find(move => move.core);
  assert.equal(droppedMove.label, 'Nhặt lõi đang rơi');
  assert.equal(game.moveShooter(droppedMove.id).pickedCore, true);
  assert.equal(game.objective.carrierTeam, 1);
  assert.equal(game.objective.routeIndex, -1);

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
