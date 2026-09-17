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
    this.items = []; this.pendingImpacts = new Map();
    this.time = 0; this.team = 0; this.turn = 1;
    this.enterPhase('move', 6);
    this.aim = { angle: 42, power: 30, weapon: 'pebble' };
    this.projectiles = new Map(); this.projectileIdSeq = 0; this.wind = 0;
    this.events = []; this.eventSeq = 0; this.winner = null;
    for (let team = 0; team < 2; team++) {
      const direction = team === 0 ? 1 : -1;
      const center = team === 0 ? -this.map.center : this.map.center;
      for (const p of this.map.parts) {
        this.add(p.kind, team, center + p.x * direction, p.y, p.size, p.mass, p.hp, p.material);
        Object.assign(this.items.at(-1), { partId: p.id, weapon: p.weapon, name: p.name, spot: p.spot, nodeId: p.nodeId, terrace: p.terrace });
      }
    }
    for (let i = 0; i < 120; i++) this.world.step(1 / 60);
    for (const item of this.items) item.previousY = item.body.position.y;
    this.syncShooter();
  }
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
    if (Math.abs(supportItem.body.position.y - supportItem.previousY) > 1.2) return false;
    const angle = 2 * Math.acos(Math.max(-1, Math.min(1, supportItem.body.quaternion.w)));
    if (Math.abs(angle) > 0.45) return false;
    return true;
  }
  getAvailableMoves() {
    if (this.phase !== 'move' || !this.map.nodes) return [];
    const shooter = this.shooter;
    if (!shooter || shooter.hp <= 0) return [];
    const currentNode = this.map.nodes.find(n => n.id === shooter.nodeId);
    if (!currentNode) return [];
    const direction = this.team === 0 ? 1 : -1;
    const center = this.team === 0 ? -this.map.center : this.map.center;
    const moves = [];
    for (const neighborId of currentNode.neighbors) {
      const neighborDef = this.map.nodes.find(n => n.id === neighborId);
      if (!neighborDef) continue;
      if (!this.isNodeAvailable(neighborId, this.team)) continue;
      const occupied = this.items.some(i => i.kind === 'resident' && i.team === this.team && i.hp > 0 && i.id !== shooter.id && i.nodeId === neighborId);
      if (occupied) continue;
      moves.push({
        id: neighborDef.id,
        label: neighborDef.label,
        x: center + neighborDef.x * direction,
        y: neighborDef.y,
      });
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

    const direction = this.team === 0 ? 1 : -1;
    const center = this.team === 0 ? -this.map.center : this.map.center;
    const targetX = center + nodeDef.x * direction;
    const targetY = nodeDef.y;

    shooter.nodeId = targetNodeId;
    shooter.spot = nodeDef.label;
    shooter.body.position.set(targetX, targetY, 0);
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
      createdAt: this.time,
      initialVelocity: { ...velocity },
    };
    body.addEventListener('collide', (event) => {
      if (proj.pierces < proj.maxPierces) {
        const hitBody = event.body;
        const hitItem = this.items.find(i => i.body === hitBody);
        if (hitItem && hitItem.kind !== 'resident') {
          proj.pierces++;
          this.damage(hitItem, 55, 'pierce');
          body.velocity.scale(0.75, body.velocity);
          const dir = body.velocity.clone();
          if (dir.length() > 0.001) dir.normalize();
          body.position.vadd(dir.scale(0.35), body.position);
          this.event('pierce', { x: body.position.x, y: body.position.y, weapon });
          return;
        }
      }
      if (proj.bounces < proj.maxBounces) {
        const hitBody = event.body;
        const hitItem = this.items.find(i => i.body === hitBody);
        if (!hitItem || hitItem.kind !== 'resident') {
          proj.bounces++;
          if (hitItem) this.damage(hitItem, 40, 'bounce');
          body.velocity.y = Math.max(3.2, -body.velocity.y * 0.5);
          body.velocity.x *= 0.65;
          this.event('bounce', { x: body.position.x, y: body.position.y, weapon });
          return;
        }
      }
      proj.collided = true;
    });
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
  explode(projectileId) {
    const proj = projectileId ? this.projectiles.get(projectileId) : this.projectile;
    if (!proj) return;
    const { body, weapon } = proj;
    const position = body.position.clone(); const stats = WEAPONS[weapon];
    for (const item of this.items) {
      if (item.destroyed) continue;
      const diff = item.body.position.vsub(position); const distance = diff.length();
      if (distance > stats.radius) continue;
      const strength = 1 - distance / stats.radius;
      this.damage(item, stats.damage * (0.45 + strength));
      if (item.destroyed) continue;
      diff.normalize(); diff.y = Math.max(0.3, diff.y); diff.z = 0;
      item.body.wakeUp(); item.body.applyImpulse(diff.scale(stats.impulse * strength), new C.Vec3(0, 0.15, 0));
    }
    this.event('blast', { x: position.x, y: position.y, radius: stats.radius, weapon, projectileId: proj.id });
    try { this.world.removeBody(body); } catch {}
    this.projectiles.delete(proj.id);
    if (this.projectiles.size === 0) {
      this.explodedAt = this.time;
      this.enterPhase('settle', 2.6);
    }
  }
  triggerSkill(input = {}) {
    if (this.phase !== 'flight') return { ok: false, error: 'Chỉ kích hoạt kỹ năng khi đạn đang bay.' };
    const proj = input.projectileId ? this.projectiles.get(input.projectileId) : this.projectile;
    if (!proj) return { ok: false, error: 'Không tìm thấy đạn đang bay.' };
    const { weapon, body, team, shooterId } = proj;

    if (weapon === 'rocket' && (typeof input.steer === 'number' || input.action === 'steer' || input.action === 'dive')) {
      if (proj.collided) return { ok: false, error: 'Tên lửa đã va chạm.' };
      const steerVal = typeof input.steer === 'number' ? Math.max(-1, Math.min(1, input.steer)) : (input.action === 'dive' ? -1 : 0.5);
      const currentSpeed = body.velocity.length();
      let currentAngle = Math.atan2(body.velocity.y, body.velocity.x);
      const forwardDir = team === 0 ? 1 : -1;
      currentAngle += steerVal * 0.5 * forwardDir;
      body.velocity.set(Math.cos(currentAngle) * currentSpeed, Math.sin(currentAngle) * currentSpeed, 0);
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
        createdAt: this.time,
        initialVelocity: { x: secondBody.velocity.x, y: secondBody.velocity.y },
      };
      secondBody.addEventListener('collide', () => { secondProj.collided = true; });
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
        cBody.velocity.set(baseVel.x + spread, baseVel.y + 1.2, 0);
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
          createdAt: this.time,
          initialVelocity: { x: cBody.velocity.x, y: cBody.velocity.y },
        };
        cBody.addEventListener('collide', () => { cProj.collided = true; });
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
    this.team = 1 - this.team; this.turn++; this.enterPhase('move', 6); this.syncShooter();
  }
  step(dt = 1 / 60) {
    this.time += dt;
    // Small fixed steps keep fast projectiles from tunnelling through narrow pillars.
    this.world.step(dt / 3); this.world.step(dt / 3); this.world.step(dt / 3);
    // Apply after stepping; collision callbacks must not remove bodies mid-solver.
    for (const [item, impact] of this.pendingImpacts) {
      if (this.time - item.lastImpact < 0.18) continue;
      item.lastImpact = this.time;
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
        if (this.wind !== 0) p.body.force.x += this.wind * p.body.mass;
        if (p.collided || this.time >= this.deadline || Math.abs(p.body.position.x) > 26 || p.body.position.y < -1) {
          this.explode(p.id);
        }
      }
      if (this.projectiles.size === 0 && this.phase === 'flight') {
        this.enterPhase('settle', 2.6);
      }
    }
    if (this.phase === 'settle') {
      if (this.finishIfEliminated()) return;
      if (this.time >= this.deadline) {
        this.nextTurn();
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
      const windEffect = this.wind * (this.team === 0 ? 1 : -1) * 0.45;
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
      activeSkill: (this.phase === 'flight' && mainProj && !mainProj.skillUsed) ? {
        weapon: mainProj.weapon,
        label: SKILL_LABELS[mainProj.weapon] || 'Kỹ năng',
        projectileId: mainProj.id,
      } : null,
      items: this.items.filter(i => !i.destroyed).map(i => ({ id: i.id, kind: i.kind, team: i.team, size: i.size, hp: i.hp, maxHp: i.maxHp, material: i.material, weapon: i.weapon, name: i.name, spot: i.spot, nodeId: i.nodeId, terrace: i.terrace, crack: crackStage(i.hp, i.maxHp), ...pose(i.body) })),
      projectile: mainProj ? { weapon: mainProj.weapon, ...pose(mainProj.body) } : null,
      projectiles: Array.from(this.projectiles.values()).map(p => ({ id: p.id, weapon: p.weapon, ...pose(p.body) })),
      events: this.events.slice(),
    };
  }
}
