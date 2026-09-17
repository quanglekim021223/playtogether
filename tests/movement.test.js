import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../game.js';
import { createApp } from '../server.js';
import { io as Client } from 'socket.io-client';

test('movement: initial nodeId, move phase requirement, valid move to neighbor', () => {
  const game = new Match('tower');
  assert.equal(game.phase, 'move');
  const shooter = game.shooter;
  assert.ok(shooter);
  assert.equal(shooter.nodeId, 'tower-node-0');
  assert.equal(shooter.spot, 'Sân trước');

  const moves = game.getAvailableMoves();
  assert.ok(moves.length > 0);
  assert.ok(moves.some(m => m.id === 'tower-node-6'));

  // Move to neighbor tower-node-6 ('Chân tháp trước')
  const res = game.moveShooter('tower-node-6');
  assert.equal(res.ok, true);
  assert.equal(shooter.nodeId, 'tower-node-6');
  assert.equal(shooter.spot, 'Chân tháp trước');
  assert.equal(shooter.body.velocity.x, 0);
  assert.equal(shooter.body.velocity.y, 0);

  // Moving is forbidden after transitioning to aim phase
  assert.equal(game.readyAim(), true);
  assert.equal(game.phase, 'aim');
  assert.equal(game.moveShooter('tower-node-0').ok, false);
});

test('movement: reject non-neighbors and occupied nodes', () => {
  const game = new Match('tower');
  const shooter = game.shooter;
  assert.equal(shooter.nodeId, 'tower-node-0');

  // tower-node-2 ('Sân thượng') is not a neighbor of tower-node-0
  const invalidMove = game.moveShooter('tower-node-2');
  assert.equal(invalidMove.ok, false);

  // Another resident occupies tower-node-1 ('Ban công thấp') initially
  const teammate = game.items.find(i => i.kind === 'resident' && i.team === 0 && i.nodeId === 'tower-node-1');
  assert.ok(teammate);
  assert.ok(teammate.hp > 0);

  const occupiedMove = game.moveShooter('tower-node-1');
  assert.equal(occupiedMove.ok, false);
});

test('movement: node becomes unavailable when support block breaks or falls', () => {
  const game = new Match('tower');
  // tower-node-1 ('Ban công thấp') is supported by 'tower-beam-0'
  const nodeDef = game.map.nodes.find(n => n.id === 'tower-node-1');
  assert.equal(nodeDef.supportId, 'tower-beam-0');
  assert.equal(game.isNodeAvailable('tower-node-1', 0), true);

  // Break the support beam
  const supportBeam = game.items.find(i => i.team === 0 && i.partId === 'tower-beam-0');
  assert.ok(supportBeam);
  supportBeam.hp = 0;
  supportBeam.destroyed = true;

  assert.equal(game.isNodeAvailable('tower-node-1', 0), false);
});

test('movement: supported nodes follow a shifted support body', () => {
  const game = new Match('tower');
  const occupied = game.items.find(i => i.kind === 'resident' && i.team === 0 && i.nodeId === 'tower-node-1');
  occupied.hp = 0;
  const support = game.items.find(i => i.team === 0 && i.partId === 'tower-beam-0');
  const originalX = game.nodePosition(game.map.nodes.find(n => n.id === 'tower-node-1'), 0).x;
  support.body.position.x += .6;
  const moved = game.moveShooter('tower-node-1');
  assert.equal(moved.ok, true);
  assert.ok(Math.abs(game.shooter.body.position.x - (originalX + .6)) < .001);
});

test('movement: server handles move event with turn and player authorization', async () => {
  const server = createApp({ port: 0 });
  await new Promise(resolve => server.http.listen(0, resolve));
  const port = server.http.address().port;
  const connect = () => Client(`http://localhost:${port}`, { multiplex: false });
  const host = connect(), p1 = connect(), p2 = connect();

  try {
    const { code } = await new Promise(res => host.emit('create', { token: 'host-token-123456789012345678' }, res));
    const p1Joined = await new Promise(res => p1.emit('join', { code, token: 'p1-token-12345678901234567890', name: 'Quang' }, res));
    await new Promise(res => p2.emit('join', { code, token: 'p2-token-12345678901234567890', name: 'Linh' }, res));

    // Ensure p2 is on team 1
    await new Promise(res => p2.emit('team', { team: 1 }, res));
    await new Promise(res => host.emit('start', { mode: 'party' }, res));

    // Wait for initial state broadcast
    const initial = await new Promise(res => p1.once('state', res));
    assert.equal(initial.game.phase, 'move');
    assert.equal(initial.activeId, p1Joined.id);

    // p2 cannot move when it's p1's turn
    const p2Move = await new Promise(res => p2.emit('move', { nodeId: 'tower-node-6', turn: initial.game.turn, shooterId: initial.game.shooterId }, res));
    assert.ok(p2Move.error);

    // p1 moves successfully
    const p1Move = await new Promise(res => p1.emit('move', { nodeId: 'tower-node-6', turn: initial.game.turn, shooterId: initial.game.shooterId }, res));
    assert.equal(p1Move.ok, true);
    assert.equal(p1Move.nodeId, 'tower-node-6');

    // p1 enters aim phase
    const ready = await new Promise(res => p1.emit('readyAim', {}, res));
    assert.equal(ready.ok, true);

    // After readyAim, move is rejected
    const lateMove = await new Promise(res => p1.emit('move', { nodeId: 'tower-node-0', turn: initial.game.turn, shooterId: initial.game.shooterId }, res));
    assert.ok(lateMove.error);
  } finally {
    host.close(); p1.close(); p2.close(); server.close();
  }
});
