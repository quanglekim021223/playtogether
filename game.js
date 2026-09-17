import * as C from 'cannon-es';
import { MAPS, DEFAULT_MAP } from './maps.js';
import { MATERIALS, crackStage } from './public/materials.js';

import { WEAPONS, launchVelocity, muzzlePosition } from './public/weapons.js';
export { WEAPONS, launchVelocity };
export const SKILL_LABELS = {
  pebble: '⚡ Đạn kép',
  heavy: '🚀 Tăng tốc',
  bloom: '✹ Nổ chùm',
  rocket: '🎯 Bổ nhào',
  drill: '◆ Khoan sâu',
  pulse: '◎ Sóng chấn',
};
export class Match {
  constructor(mapId = DEFAULT_MAP) {
    if (!Object.hasOwn(MAPS, mapId)) throw new Error('Unknown map');
    this.map = MAPS[mapId];
    this.shooterCursor = [0, 0]; this.aimShooterId = null;
    this.world = new C.World({ gravity: new C.Vec3(0, -9.82, 0) });
    this.world.solver.iterations = 15;
    this.world.allowSleep = true;
    this.world.defaultContactMaterial.friction = 0.65;
    this.world.defaultContactMaterial.restitution = 0.04;
    const ground = new C.Body({ mass: 0, shape: new C.Plane() });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(ground);
    this.items = []; this.environmentItems = []; this.pendingImpacts = new Map(); this.pendingProjectileCollisions = [];
    this.time = 0; this.team = 0; this.turn = 1;
    this.enterPhase('move', 6);
    this.aim = { angle: 42, power: 30, weapon: 'pebble' };
    this.projectiles = new Map(); this.projectileIdSeq = 0; this.wind = this.rollWind();
    this.events = []; this.eventSeq = 0; this.winner = null;
    for (let team = 0; team < 2; team++) {
      const direction = team === 0 ? 1 : -1;
      const center = team === 0 ? -this.map.center : this.map.center;
      for (const p of this.map.parts) {
        this.add(p.kind, team, center + p.x * direction, p.y, p.size, p.mass, p.hp, p.material);
        Object.assign(this.items.at(-1), { partId: p.id, weapon: p.weapon, name: p.name, spot: p.spot, nodeId: p.nodeId, terrace: p.terrace });
      }
    }
    for (const object of this.map.arenaObjects || []) this.addArenaObject(object);
    for (let i = 0; i < 120; i++) this.world.step(1 / 60);
    for (const item of this.items) {
      item.previousY = item.body.position.y;
      item.homeP = item.body.position.clone();
      item.homeQ = item.body.quaternion.clone();
    }
    this.syncShooter();
  }
  rollWind() { return Math.round((Math.random() * 3 - 1.5) * 10) / 10; }
  get projectile() {
    return this.projectiles.values().next().value || null;
  }
  set projectile(val) {
    if (!val) {
      for (const p of this.projectiles.values()) {
        try { this.world.removeBody(p.body); } catch {}
      }
      this.projectiles.clear();
    } else {
      if (!val.id) val.id = ++this.projectileIdSeq;
      this.projectiles.set(val.id, val);
    }
  }
  enterPhase(phase, duration) {
    this.phase = phase;
    this.deadline = this.time + duration;
  }
  readyAim() {
    if (this.phase !== 'move') return false;
    this.enterPhase('aim', 18);
    this.syncShooter();
    return true;
  }
  isNodeAvailable(nodeId, team) {
    if (!this.map.nodes) return true;
    const nodeDef = this.map.nodes.find(n => n.id === nodeId);
    if (!nodeDef) return false;
    if (!nodeDef.supportId) return true;
    const supportItem = this.items.find(i => i.team === team && i.partId === nodeDef.supportId);
    if (!supportItem || supportItem.hp <= 0 || supportItem.destroyed) return false;
    if (supportItem.body.position.distanceTo(supportItem.homeP) > 1.2) return false;
    const q = supportItem.body.quaternion, h = supportItem.homeQ;
    const angle = 2 * Math.acos(Math.min(1, Math.abs(q.x * h.x + q.y * h.y + q.z * h.z + q.w * h.w)));
    if (Math.abs(angle) > 0.45) return false;
    return true;
  }
  nodePosition(nodeDef, team) {
    const direction = team === 0 ? 1 : -1;
    const center = team === 0 ? -this.map.center : this.map.center;
    const authored = new C.Vec3(center + nodeDef.x * direction, nodeDef.y, 0);
    if (!nodeDef.supportId) return authored;
    const support = this.items.find(i => i.team === team && i.partId === nodeDef.supportId);
    if (!support?.homeP || !support?.homeQ) return authored;
    const inverseHome = support.homeQ.conjugate();
    const local = authored.vsub(support.homeP);
    inverseHome.vmult(local, local);
    support.body.quaternion.vmult(local, local);
    return support.body.position.vadd(local);
  }
  getAvailableMoves() {
    if (this.phase !== 'move' || !this.map.nodes) return [];
    const shooter = this.shooter;
    if (!shooter || shooter.hp <= 0) return [];
    const currentNode = this.map.nodes.find(n => n.id === shooter.nodeId);
    if (!currentNode) return [];
    const moves = [];
    for (const neighborId of currentNode.neighbors) {
      const neighborDef = this.map.nodes.find(n => n.id === neighborId);
      if (!neighborDef) continue;
      if (!this.isNodeAvailable(neighborId, this.team)) continue;
      const occupied = this.items.some(i => i.kind === 'resident' && i.team === this.team && i.hp > 0 && i.id !== shooter.id && i.nodeId === neighborId);
      if (occupied) continue;
      const target = this.nodePosition(neighborDef, this.team);
      moves.push({ id: neighborDef.id, label: neighborDef.label, x: target.x, y: target.y });
    }
    return moves;
  }
  moveShooter(targetNodeId) {
    if (this.phase !== 'move') return { ok: false, error: 'Chỉ được di chuyển trong pha move.' };
    const shooter = this.shooter;
    if (!shooter || shooter.hp <= 0) return { ok: false, error: 'Không tìm thấy xạ thủ hợp lệ.' };
    const moves = this.getAvailableMoves();
    const targetMove = moves.find(m => m.id === targetNodeId);
    if (!targetMove) return { ok: false, error: 'Không thể di chuyển tới vị trí này.' };
    const nodeDef = this.map.nodes.find(n => n.id === targetNodeId);
    if (!nodeDef) return { ok: false, error: 'Node không tồn tại.' };

    const target = this.nodePosition(nodeDef, this.team);

    shooter.nodeId = targetNodeId;
    shooter.spot = nodeDef.label;
    shooter.body.position.copy(target);
    shooter.body.velocity.set(0, 0, 0);
    shooter.body.angularVelocity.set(0, 0, 0);
    shooter.body.wakeUp();

    this.events.push({ id: ++this.eventSeq, type: 'move', shooterId: shooter.id, team: this.team, nodeId: targetNodeId, spot: nodeDef.label });
    return { ok: true, nodeId: targetNodeId, spot: nodeDef.label };
  }
  add(kind, team, x, y, size, mass, hp, material = null) {
    if (kind !== 'resident' && !Object.hasOwn(MATERIALS, material)) throw new Error('Unknown material');
    const maxHp = kind === 'resident' ? hp : Math.round(hp * MATERIALS[material].strength);
    const shape = kind === 'resident' ? new C.Sphere(size[0]) : new C.Box(new C.Vec3(size[0] / 2, size[1] / 2, size[2] / 2));
    const body = new C.Body({ mass, shape, position: new C.Vec3(x, y, 0), linearDamping: 0.13, angularDamping: 0.18 });
    body.linearFactor.set(1, 1, 0); body.angularFactor.set(0, 0, 1);
    body.sleepSpeedLimit = 0.15; body.sleepTimeLimit = 0.5;
    this.world.addBody(body);
    const item = { id: this.items.length, kind, team, size, body, hp: maxHp, maxHp, material, lastImpact: -1, previousY: y };
    body.addEventListener('collide', (event) => {
      const destructivePhase = this.phase === 'flight' || this.phase === 'settle';
      if (!destructivePhase || item.hp <= 0 || item.destroyed) return;
      const impact = Math.abs(event.contact.getImpactVelocityAlongNormal());
      const threshold = kind === 'resident' ? 3.5 : MATERIALS[material].impactThreshold;
      if (impact > threshold) this.pendingImpacts.set(item, Math.max(impact, this.pendingImpacts.get(item) || 0));
    });
    this.items.push(item);
  }
  addArenaObject(def) {
    const shape = new C.Box(new C.Vec3(def.size[0] / 2, def.size[1] / 2, def.size[2] / 2));
    const body = new C.Body({ mass: def.mass, shape, position: new C.Vec3(def.x, def.y, 0), linearDamping: .12, angularDamping: .2 });
    body.linearFactor.set(1, 1, 0); body.angularFactor.set(0, 0, def.kind === 'fuelBarrel' ? 1 : 0);
    if (def.angle) body.quaternion.setFromEuler(0, 0, def.angle);
    body.sleepSpeedLimit = .12; body.sleepTimeLimit = .4;
    const item = { id: `env-${def.id}`, environmentId: def.id, kind: def.kind, team: -1, size: def.size, body, hp: def.hp ?? null, maxHp: def.hp ?? null, destroyed: false, previousY: def.y };
    if (def.kind === 'fuelBarrel') body.addEventListener('collide', event => {
      if (!['flight', 'settle'].includes(this.phase) || item.destroyed) return;
      const impact = Math.abs(event.contact.getImpactVelocityAlongNormal());
      if (impact > 5.2) this.pendingImpacts.set(item, Math.max(impact, this.pendingImpacts.get(item) || 0));
    });
    this.world.addBody(body); this.environmentItems.push(item);
  }
  bindProjectile(proj) {
    proj.body.addEventListener('collide', event => this.pendingProjectileCollisions.push({ proj, hitBody: event.body, normal: event.contact.ni.clone(), velocity: proj.body.velocity.clone() }));
  }
  get shooter() {
    const roster = this.items.filter(i => i.kind === 'resident' && i.team === this.team);
    for (let offset = 0; offset < roster.length; offset++) {
      const item = roster[(this.shooterCursor[this.team] + offset) % roster.length];
      if (item.hp > 0) return item;
    }
    return null;
  }
  syncShooter() {
    const shooter = this.shooter;
    if (shooter && this.aimShooterId !== shooter.id) {
      this.aimShooterId = shooter.id; this.aim = { angle: ['Mái cánh phụ', 'Mái phía sau', 'Chòi vườn', 'Cầu nối'].includes(shooter.spot) ? 80 : 55, power: 45, weapon: shooter.weapon };
    }
  }
  validAim(input) {
    const shooter = this.shooter;
    return Boolean(shooter && input && Number.isFinite(input.angle) && input.angle >= 10 && input.angle <= 80
      && Number.isFinite(input.power) && input.power >= 15 && input.power <= 100 && input.weapon === shooter.weapon
      && (input.shooterId === undefined || input.shooterId === shooter.id) && (input.turn === undefined || input.turn === this.turn));
  }
  setAim(input) {
    if (this.phase !== 'aim' || !this.validAim(input)) return false;
    this.aim = { angle: input.angle, power: input.power, weapon: this.shooter.weapon }; return true;
  }
  fire(input = this.aim) {
    if (!this.setAim(input)) return false;
    const { angle, power, weapon } = this.aim, shooter = this.shooter;
    const velocity = launchVelocity(this.team, angle, power, weapon);
    const origin = muzzlePosition(shooter.body.position.toArray(), this.team, angle);
    // Sweep the muzzle path: a nearby wall must block the shot instead of spawning it beyond the wall.
    let obstruction = null, nearest = Infinity;
    this.world.raycastAll(new C.Vec3(shooter.body.position.x, shooter.body.position.y + .18, 0), new C.Vec3(...origin), {}, hit => {
      if (hit.body !== shooter.body && hit.distance < nearest) { nearest = hit.distance; obstruction = hit.hitPointWorld.clone(); }
    });
    const projectileId = ++this.projectileIdSeq;
    const body = new C.Body({ mass: WEAPONS[weapon].mass, shape: new C.Sphere(.22), position: obstruction || new C.Vec3(...origin) });
    body.velocity.set(velocity.x, velocity.y, 0); body.linearDamping = 0;
    const proj = {
      id: projectileId,
      body,
      weapon,
      shooterId: shooter.id,
      team: this.team,
      collided: Boolean(obstruction),
      bounces: 0,
      maxBounces: weapon === 'pebble' ? 1 : 0,
      pierces: 0,
      maxPierces: weapon === 'drill' ? 1 : 0,
      skillUsed: false,
      turn: this.turn,
      lastSteerAt: -Infinity,
      lastSteerSequence: -1,
      createdAt: this.time,
      initialVelocity: { ...velocity },
    };
    this.bindProjectile(proj);
    this.world.addBody(body);
    this.projectiles.set(projectileId, proj);
    this.enterPhase('flight', 7);
    this.shotAt = this.time;
    this.explodedAt = null;
    this.firedShooterId = shooter.id;
    this.event('shot', { team: this.team, shooterId: shooter.id, weapon, p: body.position.toArray(), projectileId });
    if (obstruction) this.explode(projectileId);
    return true;
  }
  handleProjectileCollision({ proj, hitBody, normal, velocity }) {
    if (!this.projectiles.has(proj.id) || this.time < (proj.ignoreCollisionsUntil || 0)) return;
    const { body, weapon } = proj;
    const hitItem = this.items.find(i => i.body === hitBody);
    const hitEnvironment = this.environmentItems.find(i => i.body === hitBody);
    if (hitEnvironment?.kind === 'bouncePad') {
      if (proj.lastPadId === hitEnvironment.id && this.time - (proj.lastPadAt || 0) < .16) return;
      if (velocity.dot(normal) > 0) normal.negate(normal);
      const reflected = velocity.vsub(normal.scale(2 * velocity.dot(normal)));
      const speed = Math.min(36, Math.max(8, reflected.length() * 1.12));
      if (reflected.length() > .001) reflected.normalize();
      body.velocity.copy(reflected.scale(speed));
      body.position.vadd(normal.scale(.32), body.position);
      body.collisionResponse = false; proj.ignoreCollisionsUntil = this.time + .08;
      proj.collided = false; proj.lastPadId = hitEnvironment.id; proj.lastPadAt = this.time;
      this.event('padBounce', { x: body.position.x, y: body.position.y, itemId: hitEnvironment.id, projectileId: proj.id, weapon });
      return;
    }
    if (hitEnvironment?.kind === 'fuelBarrel') {
      proj.hitItemId = hitEnvironment.id; proj.collided = true;
      this.damageEnvironment(hitEnvironment, hitEnvironment.hp, 'projectile');
      return;
    }
    if (proj.pierces < proj.maxPierces && hitItem && hitItem.kind !== 'resident' && hitBody !== proj.lastPiercedBody) {
      proj.pierces++; proj.lastPiercedBody = hitBody;
      this.damage(hitItem, 55, 'pierce');
      body.velocity.copy(velocity.scale(.75));
      const dir = body.velocity.clone(); if (dir.length() > .001) dir.normalize();
      const exitDistance = Math.abs(dir.x) * hitItem.size[0] + Math.abs(dir.y) * hitItem.size[1] + .5;
      body.position.vadd(dir.scale(exitDistance), body.position);
      body.collisionResponse = false; proj.ignoreCollisionsUntil = this.time + .06;
      this.event('pierce', { x: body.position.x, y: body.position.y, weapon, itemId: hitItem.id });
      return;
    }
    if (proj.bounces < proj.maxBounces && (!hitItem || hitItem.kind !== 'resident')) {
      proj.bounces++;
      if (hitItem) this.damage(hitItem, 40, 'bounce');
      if (velocity.dot(normal) > 0) normal.negate(normal);
      body.velocity.copy(velocity.vsub(normal.scale(2 * velocity.dot(normal))).scale(.7));
      body.position.vadd(normal.scale(.28), body.position);
      body.collisionResponse = false; proj.ignoreCollisionsUntil = this.time + .06;
      this.event('bounce', { x: body.position.x, y: body.position.y, weapon });
      return;
    }
    proj.hitItemId = hitItem?.id ?? null; proj.collided = true;
  }
  event(type, data) { this.events.push({ id: ++this.eventSeq, time: this.time, type, ...data }); this.events = this.events.slice(-96); }
  damage(item, amount, cause = 'blast') {
    if (item.destroyed || item.hp <= 0 || !Number.isFinite(amount) || amount <= 0) return;
    item.hp = Math.max(0, item.hp - amount);
    if (item.kind === 'resident') return;
    const data = { itemId: item.id, material: item.material, p: item.body.position.toArray(), q: item.body.quaternion.toArray(), size: item.size, cause };
    if (item.hp <= 0) {
      item.destroyed = true; this.world.removeBody(item.body);
      // Sleeping upper floors must fall when their supporting body disappears.
      for (const body of this.world.bodies) if (body.mass > 0) body.wakeUp();
      this.event('break', data);
    } else this.event('hit', { ...data, damage: amount });
  }
  damageEnvironment(item, amount, cause = 'blast') {
    if (!item || item.kind !== 'fuelBarrel' || item.destroyed || !Number.isFinite(amount) || amount <= 0) return;
    item.hp = Math.max(0, item.hp - amount);
    if (item.hp <= 0) this.detonateBarrel(item, cause);
    else this.event('barrelHit', { itemId: item.id, x: item.body.position.x, y: item.body.position.y, damage: amount, cause });
  }
  applyRadialBlast(position, stats, cause = 'blast') {
    for (const item of [...this.items, ...this.environmentItems]) {
      if (item.destroyed || item.kind === 'bouncePad') continue;
      const diff = item.body.position.vsub(position); const distance = diff.length();
      if (distance > stats.radius) continue;
      const strength = 1 - distance / stats.radius;
      if (item.kind === 'fuelBarrel') this.damageEnvironment(item, stats.damage * (0.45 + strength), cause);
      else this.damage(item, stats.damage * (0.45 + strength), cause);
      if (item.destroyed || item.body.mass <= 0) continue;
      if (diff.length() < .001) diff.set(0, 1, 0); else diff.normalize();
      diff.y = Math.max(.3, diff.y); diff.z = 0;
      item.body.wakeUp(); item.body.applyImpulse(diff.scale(stats.impulse * strength), new C.Vec3(0, .15, 0));
    }
  }
  detonateBarrel(item, cause = 'blast') {
    if (!item || item.destroyed) return;
    item.destroyed = true; item.hp = 0;
    const position = item.body.position.clone();
    try { this.world.removeBody(item.body); } catch {}
    this.event('barrelBlast', { itemId: item.id, x: position.x, y: position.y, radius: 2.5, cause });
    this.applyRadialBlast(position, { radius: 2.5, damage: 82, impulse: 68 }, 'barrel');
  }
  explode(projectileId) {
    const proj = projectileId ? this.projectiles.get(projectileId) : this.projectile;
    if (!proj) return;
    const { body, weapon } = proj;
    const position = body.position.clone(); const stats = WEAPONS[weapon];
    this.applyRadialBlast(position, stats);
    this.event('blast', { x: position.x, y: position.y, radius: stats.radius, weapon, projectileId: proj.id, hitItemId: proj.hitItemId ?? null });
    try { this.world.removeBody(body); } catch {}
    this.projectiles.delete(proj.id);
    if (this.projectiles.size === 0) {
      this.explodedAt = this.time;
      this.enterPhase('settle', 2.6);
    }
  }
  triggerSkill(input = {}) {
    if (this.phase !== 'flight') return { ok: false, error: 'Chỉ kích hoạt kỹ năng khi đạn đang bay.' };
    if (input.turn !== this.turn || input.shooterId !== this.firedShooterId || !Number.isInteger(input.projectileId)) return { ok: false, error: 'Lượt, xạ thủ hoặc đạn không hợp lệ.' };
    const proj = this.projectiles.get(input.projectileId);
    if (!proj) return { ok: false, error: 'Không tìm thấy đạn đang bay.' };
    const { weapon, body, team, shooterId } = proj;
    if (proj.turn !== this.turn || shooterId !== this.firedShooterId || proj.team !== this.team) return { ok: false, error: 'Đạn không thuộc lượt hiện tại.' };
    const actionByWeapon = { pebble: 'secondShot', heavy: 'boost', bloom: 'cluster', rocket: 'steer', drill: 'overdrive', pulse: 'airburst' };
    if (input.action !== actionByWeapon[weapon]) return { ok: false, error: 'Kỹ năng không phù hợp với vũ khí.' };

    if (weapon === 'rocket') {
      if (proj.collided) return { ok: false, error: 'Tên lửa đã va chạm.' };
      if (!Number.isInteger(input.sequence) || input.sequence <= proj.lastSteerSequence || this.time - proj.lastSteerAt < .05) return { ok: false, error: 'Lệnh bẻ lái quá nhanh hoặc đã cũ.' };
      if (!Number.isFinite(input.value)) return { ok: false, error: 'Giá trị bẻ lái không hợp lệ.' };
      const steerVal = Math.max(-1, Math.min(1, input.value));
      const currentSpeed = body.velocity.length();
      let currentAngle = Math.atan2(body.velocity.y, body.velocity.x);
      const forwardDir = team === 0 ? 1 : -1;
      currentAngle += steerVal * 0.16 * forwardDir;
      const forwardAngle = team === 0 ? 0 : Math.PI;
      const relative = Math.atan2(Math.sin(currentAngle - forwardAngle), Math.cos(currentAngle - forwardAngle));
      currentAngle = forwardAngle + Math.max(-1.15, Math.min(1.15, relative));
      body.velocity.set(Math.cos(currentAngle) * currentSpeed, Math.sin(currentAngle) * currentSpeed, 0);
      proj.lastSteerAt = this.time; proj.lastSteerSequence = input.sequence;
      this.event('skill', { weapon, action: 'steer', steer: steerVal, x: body.position.x, y: body.position.y });
      return { ok: true, action: 'steer', steer: steerVal };
    }

    if (proj.skillUsed) return { ok: false, error: 'Kỹ năng của đạn này đã được dùng.' };
    proj.skillUsed = true;

    if (weapon === 'pebble') {
      const pId = ++this.projectileIdSeq;
      const secondBody = new C.Body({ mass: 1.6, shape: new C.Sphere(.18), position: new C.Vec3(body.position.x, body.position.y + 0.25, 0) });
      secondBody.velocity.set(body.velocity.x * 0.85, body.velocity.y * 0.85 + 1.2, 0);
      secondBody.linearDamping = 0;
      const secondProj = {
        id: pId,
        body: secondBody,
        weapon: 'pebble',
        shooterId,
        team,
        collided: false,
        bounces: 1,
        maxBounces: 1,
        pierces: 0,
        maxPierces: 0,
        skillUsed: true,
        turn: this.turn,
        createdAt: this.time,
        initialVelocity: { x: secondBody.velocity.x, y: secondBody.velocity.y },
      };
      this.bindProjectile(secondProj);
      this.world.addBody(secondBody);
      this.projectiles.set(pId, secondProj);
      this.event('skill', { weapon, action: 'secondShot', x: body.position.x, y: body.position.y, projectileId: pId });
      return { ok: true, action: 'secondShot', projectileId: pId };
    }

    if (weapon === 'heavy') {
      body.velocity.scale(1.35, body.velocity);
      this.event('skill', { weapon, action: 'boost', x: body.position.x, y: body.position.y });
      return { ok: true, action: 'boost' };
    }

    if (weapon === 'bloom') {
      const pos = body.position.clone();
      const baseVel = body.velocity.clone();
      try { this.world.removeBody(body); } catch {}
      this.projectiles.delete(proj.id);
      const spreads = [-2.2, 0, 2.2];
      for (const spread of spreads) {
        const cId = ++this.projectileIdSeq;
        const cBody = new C.Body({ mass: 0.9, shape: new C.Sphere(.15), position: new C.Vec3(pos.x + spread * 0.12, pos.y, 0) });
        cBody.velocity.set(baseVel.x * .72 + spread, -Math.max(2.5, Math.abs(baseVel.y) * .28), 0);
        cBody.linearDamping = 0;
        const cProj = {
          id: cId,
          body: cBody,
          weapon: 'bloom',
          shooterId,
          team,
          collided: false,
          bounces: 0,
          maxBounces: 0,
          pierces: 0,
          maxPierces: 0,
          skillUsed: true,
          turn: this.turn,
          createdAt: this.time,
          initialVelocity: { x: cBody.velocity.x, y: cBody.velocity.y },
        };
        this.bindProjectile(cProj);
        this.world.addBody(cBody);
        this.projectiles.set(cId, cProj);
      }
      this.event('skill', { weapon, action: 'cluster', x: pos.x, y: pos.y });
      return { ok: true, action: 'cluster' };
    }

    if (weapon === 'drill') {
      proj.maxPierces += 1;
      body.velocity.scale(1.2, body.velocity);
      this.event('skill', { weapon, action: 'overdrive', x: body.position.x, y: body.position.y });
      return { ok: true, action: 'overdrive' };
    }

    if (weapon === 'pulse') {
      this.explode(proj.id);
      this.event('skill', { weapon, action: 'airburst', x: body.position.x, y: body.position.y });
      return { ok: true, action: 'airburst' };
    }

    return { ok: false, error: 'Vũ khí không hỗ trợ kỹ năng.' };
  }
  nextTurn() {
    if (this.finishIfEliminated()) return;
    const roster = this.items.filter(i => i.kind === 'resident' && i.team === this.team);
    this.shooterCursor[this.team] = (roster.findIndex(i => i.id === this.firedShooterId) + 1) % roster.length;
    this.team = 1 - this.team; this.turn++; this.wind = this.rollWind(); this.enterPhase('move', 6); this.syncShooter();
  }
  step(dt = 1 / 60) {
    this.time += dt;
    // Small fixed steps keep fast projectiles from tunnelling through narrow pillars.
    for (let substep = 0; substep < 3; substep++) {
      if (this.phase === 'flight') for (const p of this.projectiles.values()) {
        if (p.ignoreCollisionsUntil && this.time >= p.ignoreCollisionsUntil) { p.body.collisionResponse = true; p.ignoreCollisionsUntil = 0; }
        if (p.weapon === 'heavy' && this.wind !== 0) p.body.force.x += this.wind * WEAPONS.heavy.windFactor * p.body.mass;
      }
      this.world.step(dt / 3);
    }
    for (const collision of this.pendingProjectileCollisions) this.handleProjectileCollision(collision);
    this.pendingProjectileCollisions.length = 0;
    // Apply after stepping; collision callbacks must not remove bodies mid-solver.
    for (const [item, impact] of this.pendingImpacts) {
      if (this.time - item.lastImpact < 0.18) continue;
      item.lastImpact = this.time;
      if (item.kind === 'fuelBarrel') { this.damageEnvironment(item, (impact - 3) * 10, 'impact'); continue; }
      const stats = MATERIALS[item.material];
      this.damage(item, item.kind === 'resident' ? (impact - 3) * 9 : (impact - stats.impactThreshold) * stats.impactDamage, 'impact');
    }
    this.pendingImpacts.clear();
    for (const item of this.items) {
      if (item.kind === 'resident') {
        if (Math.abs(item.body.position.x) > 23 || item.body.position.y < -1) item.hp = 0;
        if (item.hp <= 0 && !item.eliminated) { this.world.removeBody(item.body); item.eliminated = true; }
      }
    }
    if (this.phase === 'move') {
      if (this.finishIfEliminated()) return;
      this.syncShooter();
      if (this.time >= this.deadline) this.readyAim();
    }
    if (this.phase === 'aim') {
      if (this.finishIfEliminated()) return;
      this.syncShooter();
      if (this.time >= this.deadline) this.fire();
    }
    if (this.phase === 'flight') {
      for (const p of Array.from(this.projectiles.values())) {
        if (p.collided || this.time >= this.deadline || Math.abs(p.body.position.x) > 26 || p.body.position.y < -1) {
          this.explode(p.id);
        }
      }
      if (this.projectiles.size === 0 && this.phase === 'flight') {
        this.enterPhase('settle', 2.6);
      }
    }
    if (this.phase === 'settle') {
      if (this.time >= this.deadline) {
        if (!this.finishIfEliminated()) this.nextTurn();
      }
    }
  }
  finishIfEliminated() {
    const alive = [0, 1].map(team => this.items.some(i => i.kind === 'resident' && i.team === team && i.hp > 0));
    if (alive.every(Boolean)) return false;
    this.winner = alive[0] === alive[1] ? -1 : alive[0] ? 0 : 1; this.phase = 'over'; return true;
  }
  botAim() {
    const shooter = this.shooter;
    if (!shooter) return this.aim;
    const targets = this.items.filter(i => i.kind === 'resident' && i.team !== this.team && i.hp > 0);
    const target = targets.sort((a, b) => Math.abs(a.body.position.x - shooter.body.position.x) - Math.abs(b.body.position.x - shooter.body.position.x))[0];
    if (!target) return this.aim;
    // High arcs help shooters on rear terraces clear their own architecture.
    for (const angle of [65, 72, 78, 80, 55, 45]) {
      const origin = muzzlePosition(shooter.body.position.toArray(), this.team, angle);
      const rawDistance = Math.abs(target.body.position.x - origin[0]);
      const windEffect = shooter.weapon === 'heavy' ? this.wind * WEAPONS.heavy.windFactor * (this.team === 0 ? 1 : -1) * 0.45 : 0;
      const distance = Math.max(1, rawDistance - windEffect);
      const dy = target.body.position.y - origin[1], radians = angle * Math.PI / 180;
      const denominator = 2 * Math.cos(radians) ** 2 * (distance * Math.tan(radians) - dy);
      if (denominator <= 0) continue;
      const speed = Math.sqrt(9.82 * distance ** 2 / denominator), power = (speed / WEAPONS[shooter.weapon].speed - 9) / .21;
      if (power >= 15 && power <= 100) {
        const velocity = launchVelocity(this.team, angle, power, shooter.weapon);
        let clear = true, from = new C.Vec3(...origin);
        for (let t = .08; t <= distance / Math.abs(velocity.x); t += .08) {
          const to = new C.Vec3(origin[0] + velocity.x * t, origin[1] + velocity.y * t - 4.91 * t * t, 0);
          let first = null, nearest = Infinity;
          // Sweep the projectile's radius as well as its center to avoid clipping ledges.
          for (const [dx, dy] of [[0, 0], [.24, 0], [-.24, 0], [0, .24], [0, -.24]]) {
            this.world.raycastAll(new C.Vec3(from.x + dx, from.y + dy, 0), new C.Vec3(to.x + dx, to.y + dy, 0), {}, hit => {
              if (hit.body !== shooter.body && hit.distance < nearest) { first = hit.body; nearest = hit.distance; }
            });
          }
          if (first) { clear = this.items.some(i => i.body === first && i.team !== this.team); break; }
          from = to;
        }
        if (clear) return { angle, power, weapon: shooter.weapon };
      }
    }
    return { angle: 55, power: 70, weapon: shooter.weapon };
  }
  snapshot() {
    const pose = body => ({ p: [body.position.x, body.position.y, body.position.z], q: [body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w] });
    const mainProj = this.projectile;
    return {
      time: this.time, mapId: this.map.id, mapName: this.map.name, shooterId: ['flight', 'settle'].includes(this.phase) ? this.firedShooterId : this.shooter?.id ?? null,
      phase: this.phase, team: this.team, turn: this.turn, remaining: Math.max(0, Math.ceil(this.deadline - this.time)), aim: this.aim, winner: this.winner,
      availableMoves: this.getAvailableMoves(),
      wind: Math.round(this.wind * 10) / 10,
      activeSkill: (this.phase === 'flight' && mainProj && (mainProj.weapon === 'rocket' || !mainProj.skillUsed)) ? {
        weapon: mainProj.weapon,
        label: SKILL_LABELS[mainProj.weapon] || 'Kỹ năng',
        projectileId: mainProj.id,
        action: { pebble: 'secondShot', heavy: 'boost', bloom: 'cluster', rocket: 'steer', drill: 'overdrive', pulse: 'airburst' }[mainProj.weapon],
        available: !mainProj.collided,
      } : null,
      items: this.items.filter(i => !i.destroyed).map(i => ({ id: i.id, kind: i.kind, team: i.team, size: i.size, hp: i.hp, maxHp: i.maxHp, material: i.material, weapon: i.weapon, name: i.name, spot: i.spot, nodeId: i.nodeId, terrace: i.terrace, crack: crackStage(i.hp, i.maxHp), ...pose(i.body) })),
      environment: this.environmentItems.filter(i => !i.destroyed).map(i => ({ id: i.id, environmentId: i.environmentId, kind: i.kind, size: i.size, hp: i.hp, maxHp: i.maxHp, ...pose(i.body) })),
      projectile: mainProj ? { weapon: mainProj.weapon, ...pose(mainProj.body) } : null,
      projectiles: Array.from(this.projectiles.values()).map(p => ({ id: p.id, weapon: p.weapon, ...pose(p.body) })),
      events: this.events.slice(),
    };
  }
}
