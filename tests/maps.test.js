import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../game.js';
import { muzzlePosition, WEAPONS } from '../public/weapons.js';
import { MAPS } from '../maps.js';

for (const mapId of Object.keys(MAPS)) {
  test(`${mapId}: movement graph has valid supports and bidirectional neighbors`, () => {
    const map = MAPS[mapId], partIds = new Set(map.parts.map(p => p.id)), nodeIds = new Set(map.nodes.map(n => n.id));
    assert.equal(map.nodes.length, 11);
    for (const node of map.nodes) {
      if (node.supportId) assert.ok(partIds.has(node.supportId), `${node.id} support is missing`);
      for (const neighborId of node.neighbors) {
        assert.ok(nodeIds.has(neighborId), `${neighborId} is missing`);
        assert.ok(map.nodes.find(n => n.id === neighborId).neighbors.includes(node.id), `${node.id} -> ${neighborId} must be bidirectional`);
      }
    }
  });
  test(`${mapId}: stable for 20 seconds, mirrored teams, varied firing positions`, () => {
    const blocks = MAPS[mapId].parts.filter(p => p.kind !== 'resident');
    for (let a = 0; a < blocks.length; a++) for (let b = a + 1; b < blocks.length; b++) {
      const one = blocks[a], two = blocks[b];
      const overlapX = (one.size[0] + two.size[0]) / 2 - Math.abs(one.x - two.x);
      const overlapY = (one.size[1] + two.size[1]) / 2 - Math.abs(one.y - two.y);
      assert.ok(overlapX < .001 || overlapY < .001, `authored structural colliders ${a}/${b} must not intersect`);
    }
    const game = new Match(mapId); game.deadline = Infinity;
    const initial = game.snapshot();
    for (let i = 0; i < 1200; i++) game.step();
    const state = game.snapshot(); assert.equal(state.mapId, mapId);
    assert.equal(state.items.filter(i => i.kind === 'resident').length, 12);
    for (const [index, item] of game.items.entries()) {
      const designed = MAPS[mapId].parts[index % MAPS[mapId].parts.length];
      assert.ok(Math.abs(item.body.position.y - designed.y) < 0.35, `part ${index} fell during settling`);
      assert.ok(item.body.position.distanceTo({ x: initial.items[index].p[0], y: initial.items[index].p[1], z: initial.items[index].p[2] }) < 0.12, `part ${index} moved while idle`);
      if (item.kind === 'resident') assert.equal(item.hp, 100);
    }
    const left = state.items.filter(i => i.team === 0), right = state.items.filter(i => i.team === 1);
    left.forEach((item, i) => { assert.ok(Math.abs(item.p[0] + right[i].p[0]) < 0.12); assert.ok(Math.abs(item.p[1] - right[i].p[1]) < 0.12); });
    for (const team of [0, 1]) {
      assert.equal(state.items.filter(i => i.kind === 'resident' && i.team === team).length, 6);
      const roster = state.items.filter(i => i.kind === 'resident' && i.team === team);
      assert.equal(new Set(roster.map(i => i.weapon)).size, 6);
      assert.ok(roster.every(i => WEAPONS[i.weapon] && !Object.hasOwn(i, 'name') && i.spot));
      assert.ok(new Set(roster.map(i => Math.round(i.p[1]))).size >= 4);
      for (const actor of roster) for (const block of state.items.filter(i => i.kind !== 'resident')) {
        const dx = Math.max(0, Math.abs(actor.p[0] - block.p[0]) - block.size[0] / 2);
        const dy = Math.max(0, Math.abs(actor.p[1] - block.p[1]) - block.size[1] / 2);
        assert.ok(Math.hypot(dx, dy) > .42, `${actor.weapon} must not start inside a wall`);
      }
    }
    for (const item of state.items) assert.ok(Math.abs(item.p[0]) + item.size[0] / 2 < 23, 'expanded homes must stay on the playable island');
  });
  test(`${mapId}: real shots from either team destroy structure and harm residents`, () => {
    // Bridge needs a little more power to clear the new center-field interactives.
    const [angle, power] = mapId === 'bridge' ? [25, 30] : [25, 20];
    for (const team of [0, 1]) {
      const game = new Match(mapId); game.team = team; game.shooterCursor[team] = 1; game.wind = 0; game.syncShooter();
      const origin = muzzlePosition(game.shooter.body.position.toArray(), team, angle);
      game.readyAim();
      assert.equal(game.fire({ angle, power, weapon: game.shooter.weapon }), true);
      assert.deepEqual(game.projectile.body.position.toArray(), origin);
      for (let i = 0; i < 650 && game.turn === 1 && game.phase !== 'over'; i++) game.step();
      assert.ok(game.items.some(i => i.team !== team && i.destroyed), 'opponent structure should break');
      assert.ok(game.items.some(i => i.team !== team && i.kind === 'resident' && i.hp < 100), 'opponent residents should take damage');
      assert.ok(game.events.some(e => e.type === 'shot' && e.shooterId !== undefined));
    }
    assert.ok(new Match(mapId).items.filter(i => i.kind === 'resident').every(i => i.hp === 100), 'replay must start fresh');
  });
}
test('unknown maps cannot silently fall back to an unintended layout', () => {
  for (const id of ['random', '__proto__', 'missing']) assert.throws(() => new Match(id), /Unknown map/);
});
