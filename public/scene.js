import * as T from 'three';
import { GLTFLoader } from '/vendor/three-addons/loaders/GLTFLoader.js';
import { createArt } from './art.js';
import { MATERIALS } from './materials.js';
import { createEnvironment } from './environment.js';
import { WEAPONS, launchVelocity, muzzlePosition } from './weapons.js';
const COLORS = [0xee775f, 0x48aaa5];
export function createScene(container) {
  const art = createArt();
  const kit = new Map();
  const kitFiles = {
    wood: ['bp_woodblock.glb', [1.4, 1.5, 1.4]], brick: ['bp_brickblock.glb', [1.4, 1.5, 1.4]],
    stone: ['bp_stoneblock.glb', [1.4, 1.5, 1.4]], glass: ['bp_glassblock.glb', [1.4, 1.5, .13]],
    fuelBarrel: ['bp_fuelbarrel.glb', [.72, 1.18, .72]], bouncePad: ['bp_bouncepad.glb', [1.45, .34, .95]]
  };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let matchWinner = null, eventBaseline = false;
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  container.append(renderer.domElement);
  const scene = new T.Scene(); const environment = createEnvironment(scene);
  const camera = new T.PerspectiveCamera(36, 1, 0.1, 400);
  const hemisphere = new T.HemisphereLight(0xe7faff, 0x809085, 2.2); scene.add(hemisphere);
  const sun = new T.DirectionalLight(0xffdfad, 3.3); sun.position.set(-15, 28, 18); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 22, bottom: -22, near: 1, far: 80 });
  sun.shadow.normalBias = 0.035; scene.add(sun);
  const materials = new Map();
  function material(color) {
    if (!materials.has(color)) materials.set(color, new T.MeshStandardMaterial({ color, roughness: 0.88 }));
    return materials.get(color);
  }
  const boxGeometry = new T.BoxGeometry(1, 1, 1), sphereGeometry = new T.SphereGeometry(1, 16, 12);
  function mesh(geometry, color, parent = scene) { const m = new T.Mesh(geometry, material(color)); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
  function box(x, y, z, w, h, d, color, parent) { const m = mesh(boxGeometry, color, parent); m.position.set(x, y, z); m.scale.set(w, h, d); return m; }
  function sphere(x, y, z, r, color, parent) { const m = mesh(sphereGeometry, color, parent); m.position.set(x, y, z); m.scale.setScalar(r); return m; }
  // A floating miniature neighborhood, with layered rock and an open central lawn.
  box(0, -1.25, 0, 47, 2.2, 12, 0x9c9078);
  box(0, -0.45, 0, 47.5, 0.7, 12.5, 0xb8ad8b);
  box(0, -0.12, 0, 48, 0.25, 13, 0x94b883);
  box(0, 0.005, 3.8, 46, 0.06, 1.15, 0xe0ccaa);
  for (let x = -22; x <= 22; x += 1.6) box(x, 0.045, 3.8, 1.35, 0.055, 0.8, 0xeadbc0);
  box(0, -2.7, -0.4, 43, 0.8, 10, 0x807b6c);
  for (let i = 0; i < 24; i++) {
    const x = -22.5 + i * 1.9;
    const rock = mesh(new T.DodecahedronGeometry(0.7 + (i % 3) * 0.16, 0), i % 2 ? 0xa1987e : 0x8b8572);
    rock.position.set(x, -1.5 - (i % 3) * 0.18, 5.8); rock.rotation.z = i * 2;
  }
  const treeCrowns = [];
  function tree(x, z, scale = 1) {
    const group = new T.Group(); scene.add(group); group.position.set(x, 0, z); group.scale.setScalar(scale);
    box(0, 1.3, 0, 0.32, 2.6, 0.32, 0x8e7860, group);
    const crown = new T.Group(); group.add(crown); crown.position.y = 2.3; treeCrowns.push(crown);
    sphere(0, .7, 0, 1.4, 0x588873, crown); sphere(-.7, .5, .3, .9, 0x89ab74, crown); sphere(.5, 1.3, 0, .9, 0xa9bf80, crown);
    for (let i = 0; i < 5; i++) sphere(Math.cos(i * 2) * .9, .75 + Math.sin(i * 1.8) * .65, .85, .12, 0xe9ac69, crown);
  }
  [-21, -18, 18, 21].forEach((x, i) => tree(x, -3.8, 0.85 + (i % 2) * 0.3));
  for (let i = 0; i < 18; i++) {
    const x = -22 + i * 2.6;
    for (let j = 0; j < 3; j++) sphere(x + j * 0.13, 0.14 + j * 0.06, 5.3, 0.09, [0xfff3c4, 0xf2a28c, 0xf0d477][i % 3]);
  }
  for (const x of [-7, 7]) {
    box(x, 0.4, -3.5, 2.2, 0.15, 0.6, 0xd1a16d); box(x, 0.9, -3.8, 2.2, 0.6, 0.15, 0xd1a16d);
    for (const dx of [-0.8, 0.8]) box(x + dx, 0.2, -3.5, 0.12, 0.4, 0.5, 0x54706a);
  }
  const pennants = [];
  for (let team = 0; team < 2; team++) {
    const x = team === 0 ? -18 : 18;
    box(x, 3.1, -1, 0.12, 6.2, 0.12, 0xf6e5c6);
    const flag = box(x + 0.7, 5.6, -1, 1.45, 0.85, 0.06, COLORS[team]); pennants.push(flag);
  }
  // Garden details stay outside the collision plane; all structural details follow their body.
  for (const x of [-21.6, 21.6]) {
    box(x, .4, 2.9, .1, .8, .1, 0x6c8584);
    box(x, .95, 2.9, .72, .5, .52, x < 0 ? COLORS[0] : COLORS[1]);
    box(x, .96, 3.17, .45, .055, .025, 0x263e47);
  }
  for (const x of [-4.8, 4.8]) {
    box(x, .22, -3.7, 1.5, .4, .9, 0xbd8462);
    for (let i = 0; i < 5; i++) { sphere(x - .5 + i * .25, .55, -3.7, .3, 0x679474); sphere(x - .5 + i * .25, .78, -3.5, .1, i % 2 ? 0xe4ad7e : 0xf6dab1); }
  }
  // A low picket fence behind the central lawn, leaving the firing lane open.
  for (const side of [-1, 1]) {
    for (let x = 2.5; x < 9; x += .65) box(side * x, .45, -5, .12, .9, .15, 0xeee1be);
    box(side * 5.5, .4, -5, 6.3, .13, .12, 0xd1c5a3);
  }
  const grass = new T.InstancedMesh(new T.ConeGeometry(.09, .42, 3), material(0x628e66), 160);
  const transform = new T.Object3D();
  for (let i = 0; i < 160; i++) {
    transform.position.set(-23 + (i * 1.731 % 46), .16, i % 2 ? 5.7 : -5.4);
    transform.rotation.set(0, i * .8, Math.sin(i) * .2); transform.scale.setScalar(.5 + (i % 5) * .14); transform.updateMatrix(); grass.setMatrixAt(i, transform.matrix);
  }
  scene.add(grass);
  const birds = [];
  for (let i = 0; i < 3; i++) {
    const bird = new T.Group(); bird.position.set(-12 + i * 10, 14 + i, -23 - i * 4); scene.add(bird);
    const left = box(-.16, 0, 0, .36, .035, .1, 0x67828b, bird), right = box(.16, 0, 0, .36, .035, .1, 0x67828b, bird);
    birds.push({ bird, left, right });
  }
  const objects = new Map(); const projectileMeshes = new Map(); let shot = null; let particles = []; let lastEvent = 0; let shake = 0; let trailAt = 0; let mode = 'home';
  let currentMap = null, activeShooter = null, gamePhase = 'aim', overview = false, currentWind = 0, tacticalTarget = new T.Vector3();
  const selection = new T.Mesh(new T.TorusGeometry(.68, .035, 6, 36), new T.MeshBasicMaterial({ color: 0xffd376, depthTest: false }));
  selection.renderOrder = 9; selection.visible = false; scene.add(selection);
  const viewTarget = new T.Vector3(0, 2, 0); let viewDistance = 50;
  function kitKey(item) {
    if (['fuelBarrel', 'bouncePad'].includes(item.kind)) return item.kind;
    return item.kind === 'block' ? item.material : null;
  }
  function applyKit(obj, item) {
    if (item.kind === 'resident' || obj.userData.assetModel) return;
    const key = kitKey(item); if (!key) return;
    const asset = kit.get(key);
    if (!asset) { obj.userData.assetItem = { kind: item.kind, material: item.material, size: [...item.size] }; return; }
    for (const child of obj.children) if (!obj.userData.cracks?.includes(child)) child.visible = false;
    const model = asset.scene.clone(true), [bw, bh, bd] = asset.size, [w, h, d] = item.size;
    const thinGlass = item.material === 'glass';
    model.scale.set(w / bw, h / bh, thinGlass ? 1 : d / bd);
    model.position.set(0, -h / 2, thinGlass ? d / 2 - bd / 2 : 0);
    model.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
    obj.add(model); obj.userData.assetModel = model; obj.userData.assetItem = null;
  }
  const loader = new GLTFLoader();
  Promise.all(Object.entries(kitFiles).map(async ([key, [file, size]]) => {
    const loaded = await loader.loadAsync(`/assets/kit/${file}`); kit.set(key, { scene: loaded.scene, size });
  })).then(() => {
    container.dataset.assetKit = String(kit.size);
    for (const obj of objects.values()) if (obj.userData.assetItem) applyKit(obj, obj.userData.assetItem);
  }).catch(() => { container.dataset.assetKit = 'fallback'; });
  const dots = Array.from({ length: 15 }, () => { const dot = sphere(0, 0, 1.45, 0.065, 0xffffff); dot.visible = false; return dot; });
  container.dataset.trajectorySamples = String(dots.length);
  const impactMaterial = new T.MeshBasicMaterial({ color: 0xffa629, depthTest: false });
  const impactMarker = new T.Mesh(new T.TorusGeometry(.45, .075, 8, 32), impactMaterial);
  impactMarker.renderOrder = 11; impactMarker.visible = false; scene.add(impactMarker);
  // Solid shaft and arrowhead remain legible on the shared screen from a sofa.
  const aimArrow = new T.Group(); scene.add(aimArrow); aimArrow.visible = false;
  const arrowMaterial = new T.MeshBasicMaterial({ color: 0xffcf78, depthTest: false });
  const shaft = new T.Mesh(new T.CylinderGeometry(1, 1, 1, 10), arrowMaterial);
  shaft.rotation.z = -Math.PI / 2; shaft.renderOrder = 10; aimArrow.add(shaft);
  const arrowhead = new T.Mesh(new T.ConeGeometry(0.34, 0.72, 12), arrowMaterial);
  arrowhead.rotation.z = -Math.PI / 2; arrowhead.renderOrder = 10; aimArrow.add(arrowhead);
  function aimPreview(team, aim, wind, visible, impact = null) {
    if (!activeShooter) { aimArrow.visible = false; impactMarker.visible = false; container.dataset.impactMarker = 'false'; dots.forEach(d => { d.visible = false; }); return; }
    const angle = aim.angle * Math.PI / 180, rotation = team === 0 ? angle : Math.PI - angle;
    const velocity = launchVelocity(team, aim.angle, aim.power, activeShooter.weapon);
    const origin = muzzlePosition(activeShooter.p, team, aim.angle);
    const obj = objects.get(activeShooter.id);
    if (obj?.userData.gun) obj.userData.gun.rotation.z = rotation;
    aimArrow.visible = visible;
    aimArrow.position.set(origin[0], origin[1], 1.5); aimArrow.rotation.z = rotation;
    const length = 1.8 + aim.power / 100 * 3.5;
    shaft.scale.set(0.105, length - 0.72, 0.105); shaft.position.x = (length - 0.72) / 2;
    arrowhead.position.x = length - 0.36;
    arrowMaterial.color.set(team === 0 ? 0xe45b3a : 0x167b79);
    dots.forEach((dot, i) => {
      const t = (i + 1) * .095; const y = origin[1] + velocity.y * t - 4.91 * t * t;
      const windX = activeShooter.weapon === 'heavy' ? .5 * wind * (WEAPONS.heavy.windFactor || 1) * t * t : 0;
      const x = origin[0] + velocity.x * t + windX;
      const passedImpact = impact?.p && (team === 0 ? x > impact.p[0] + .15 : x < impact.p[0] - .15);
      dot.visible = visible && y > 0 && !passedImpact; dot.position.set(x, y, 1.45);
      dot.scale.setScalar(0.065 * Math.max(.35, 1 - i / 38));
    });
    impactMarker.visible = visible && Boolean(impact?.p) && Boolean(impact?.blockedByOwn);
    if (impactMarker.visible) impactMarker.position.set(impact.p[0], Math.max(.15, impact.p[1]), 1.55);
    container.dataset.impactMarker = String(impactMarker.visible);
    container.dataset.aimBlocked = String(Boolean(impact?.blockedByOwn));
    container.dataset.aimImpact = impact?.kind || 'none';
  }
  function updateAim(data) {
    currentWind = data.wind ?? currentWind;
    aimPreview(data.team, data.aim, currentWind, gamePhase === 'aim' && mode === 'game', data.impact);
  }
  function update(data) {
    if (!data) return;
    container.dataset.map = data.mapId;
    container.setAttribute('aria-label', `Đấu trường 3D · ${data.mapName}`);
    if (currentMap !== data.mapId) { reset(); currentMap = data.mapId; }
    activeShooter = data.items.find(i => i.id === data.shooterId) || null; gamePhase = data.phase; currentWind = data.wind || 0;
    const enemies = data.items.filter(i => i.kind === 'resident' && i.team !== data.team && i.hp > 0);
    const enemyX = enemies.length ? enemies.reduce((sum, item) => sum + item.p[0], 0) / enemies.length : 0;
    const enemyY = enemies.length ? enemies.reduce((sum, item) => sum + item.p[1], 0) / enemies.length : 2;
    tacticalTarget.set(activeShooter ? (activeShooter.p[0] + enemyX) / 2 : 0, activeShooter ? Math.max(2.5, (activeShooter.p[1] + enemyY) / 2 + 1.1) : 2, 0);
    container.dataset.shooter = String(data.shooterId); container.dataset.weapon = activeShooter?.weapon || '';
    container.dataset.wind = currentWind.toFixed(1);
    const environmentItems = Array.isArray(data.environment) ? data.environment : [];
    container.dataset.fuelBarrels = environmentItems.filter(i => i.kind === 'fuelBarrel').length;
    container.dataset.bouncePads = environmentItems.filter(i => i.kind === 'bouncePad').length;
    const allItems = [...data.items, ...environmentItems];
    const ids = new Set(allItems.map(i => i.id));
    for (const [id, obj] of objects) if (!ids.has(id)) { scene.remove(obj); objects.delete(id); }
    for (const item of allItems) {
      let obj = objects.get(item.id);
      if (!obj) {
        obj = item.kind === 'resident' ? art.resident(item.team, item.id, item.weapon)
          : ['fuelBarrel', 'bouncePad'].includes(item.kind) ? art.interactive(item) : art.block(item);
        applyKit(obj, item);
        scene.add(obj); objects.set(item.id, obj); obj.position.set(item.p[0], item.p[1], item.kind === 'resident' ? 1.3 : item.p[2]); obj.quaternion.fromArray(item.q);
      }
      obj.userData.targetP = new T.Vector3(item.p[0], item.p[1], item.kind === 'resident' ? 1.3 : item.p[2]); obj.userData.targetQ = item.kind === 'resident' ? new T.Quaternion() : new T.Quaternion(...item.q);
      if (obj.userData.cracks) obj.userData.cracks.forEach((c, i) => { c.visible = item.crack === i + 1; });
      if (obj.userData.hp !== undefined && item.hp < obj.userData.hp) obj.userData.hurtUntil = performance.now() / 1000 + .65;
      obj.userData.hp = item.hp; obj.userData.team = item.team;
      obj.visible = item.kind !== 'resident' || item.hp > 0;
    }
    const hasProjectileList = Array.isArray(data.projectiles) && data.projectiles.length > 0;
    const currentProjList = hasProjectileList
      ? data.projectiles
      : (data.projectile ? [data.projectile] : []);
    const activeProjIds = new Set(currentProjList.map(p => p.id));
    for (const [pId, mesh] of projectileMeshes) {
      if (!activeProjIds.has(pId)) {
        scene.remove(mesh);
        projectileMeshes.delete(pId);
      }
    }
    for (const p of currentProjList) {
      let mesh = projectileMeshes.get(p.id);
      if (!mesh) {
        mesh = sphere(0, 0, 0, 0.28, WEAPONS[p.weapon]?.color || '#ffc667');
        mesh.userData.weapon = p.weapon;
        scene.add(mesh);
        projectileMeshes.set(p.id, mesh);
        mesh.position.set(p.p[0], p.p[1], 1.45);
      }
      const serverP = new T.Vector3(p.p[0], p.p[1], 1.45);
      if (mesh.position.distanceTo(serverP) > 5) mesh.position.copy(serverP);
      mesh.userData.serverP = serverP;
      mesh.userData.velocity = new T.Vector3(...(p.v || [0, 0, 0]));
      mesh.userData.snapshotAt = performance.now();
    }
    if (!hasProjectileList && data.projectile) {
      if (!shot) shot = sphere(0, 0, 0, 0.29, WEAPONS[data.projectile.weapon].color);
      shot.position.set(data.projectile.p[0], data.projectile.p[1], 1.45);
    } else if (shot) { scene.remove(shot); shot = null; }
    matchWinner = data.winner;
    aimPreview(data.team, data.aim, data.wind || 0, data.phase === 'aim' && mode === 'game', data.aimImpact);
    container.dataset.projectileInterpolation = 'prediction';
    container.dataset.cracked = [...objects.values()].filter(obj => obj.userData.cracks?.some(crack => crack.visible)).length;
    if (!eventBaseline) { lastEvent = data.events.at(-1)?.id || 0; eventBaseline = true; }
    for (const event of data.events) {
      if (event.id <= lastEvent) continue;
      lastEvent = event.id;
      if (data.time - event.time > 1) continue; // Skip old effects after reconnect or a sleeping tab.
      if (event.type === 'bounce') {
        for (let i = 0; i < 8; i++) addParticle(sphere(event.x, event.y, .7, .07, 0xffd477), (Math.random() - .5) * 5, 1 + Math.random() * 4, 0, .35);
        window.dispatchEvent(new CustomEvent('weapon-sound', { detail: { type: 'bounce' } }));
      }
      if (event.type === 'padBounce') {
        for (let i = 0; i < 12; i++) addParticle(sphere(event.x, event.y, .72, .065, i % 2 ? 0xbaffef : 0x67d7c8), (Math.random() - .5) * 8, 2 + Math.random() * 5, (Math.random() - .5) * 2, .45);
        const ring = new T.Mesh(ringGeometry, padRingMaterial); ring.position.set(event.x, event.y, .85); ring.scale.setScalar(.22); addParticle(ring, 0, 0, 0, .3, false, true);
        window.dispatchEvent(new CustomEvent('weapon-sound', { detail: { type: 'pad' } }));
      }
      if (event.type === 'pierce') {
        for (let i = 0; i < 7; i++) { const chip = art.fragment('stone', i); chip.position.set(event.x, event.y, .6); addParticle(chip, (Math.random() - .5) * 7, 1 + Math.random() * 4, 0, .7, true); }
        window.dispatchEvent(new CustomEvent('weapon-sound', { detail: { type: 'drill' } }));
      }
      if (event.type === 'skill') {
        const sound = event.action === 'cluster' ? 'cluster' : event.action === 'steer' ? 'rocket' : event.action === 'airburst' ? 'pulse' : event.action === 'boost' ? 'boost' : 'shot';
        if (event.action === 'cluster') for (let i = 0; i < 12; i++) addParticle(sphere(event.x, event.y, .6, .08, 0xdc93bd), (Math.random() - .5) * 7, (Math.random() - .5) * 7, 0, .45);
        window.dispatchEvent(new CustomEvent('weapon-sound', { detail: { type: sound } }));
      }
      if (event.type === 'break' || event.type === 'hit') {
        const count = event.type === 'break' ? MATERIALS[event.material].fragments : 3;
        for (let i = 0; i < (reducedMotion.matches ? Math.min(count, 4) : count); i++) {
          const m = art.fragment(event.material, i);
          const local = new T.Vector3((Math.random() - .5) * event.size[0], (Math.random() - .5) * event.size[1], (Math.random() - .5) * event.size[2]);
          local.applyQuaternion(new T.Quaternion(...event.q)); m.position.fromArray(event.p).add(local);
          m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
          addParticle(m, (Math.random() - .5) * 6, 2 + Math.random() * 5, (Math.random() - .5) * 4, 2.5 + Math.random(), true);
        }
        container.dataset.lastMaterial = event.material;
        window.dispatchEvent(new CustomEvent('material-sound', { detail: { material: event.material, strength: event.type === 'break' ? 1 : .4 } }));
      }
      if (event.type === 'shot') {
        const actor = objects.get(event.shooterId); if (actor) actor.userData.recoil = .18;
        window.dispatchEvent(new CustomEvent('game-shot'));
      }
      if (event.type === 'blast') {
        shake = reducedMotion.matches ? 0 : .24;
        for (let i = 0; i < (reducedMotion.matches ? 8 : 24); i++) {
          const m = sphere(event.x, Math.max(.3, event.y), 0, .16 + Math.random() * .22, [0xffd888, 0xf29a68, 0xc7b8a0][i % 3]);
          addParticle(m, (Math.random() - .5) * 10, Math.random() * 7, (Math.random() - .5) * 4, .5 + Math.random());
        }
        if (!reducedMotion.matches) {
          const ring = new T.Mesh(ringGeometry, event.weapon === 'pulse' ? pulseRingMaterial : ringMaterial); ring.position.set(event.x, Math.max(.3, event.y), 1); ring.scale.setScalar(event.weapon === 'pulse' ? .55 : .3);
          addParticle(ring, 0, 0, 0, .38, false, true);
        }
        window.dispatchEvent(new CustomEvent('game-blast'));
      }
      if (event.type === 'barrelBlast') {
        shake = reducedMotion.matches ? 0 : .38;
        for (let i = 0; i < (reducedMotion.matches ? 10 : 34); i++) {
          const m = sphere(event.x, Math.max(.35, event.y), 0, .14 + Math.random() * .28, [0xffee91, 0xff8b38, 0xd84b32, 0x3d4240][i % 4]);
          addParticle(m, (Math.random() - .5) * 13, 2 + Math.random() * 10, (Math.random() - .5) * 6, .65 + Math.random() * .45);
        }
        const ring = new T.Mesh(ringGeometry, barrelRingMaterial); ring.position.set(event.x, Math.max(.35, event.y), 1); ring.scale.setScalar(.4); addParticle(ring, 0, 0, 0, .48, false, true);
        container.dataset.lastEnvironmentEvent = 'barrelBlast';
        window.dispatchEvent(new CustomEvent('weapon-sound', { detail: { type: 'barrel' } }));
      }
    }
  }
  const ringGeometry = new T.TorusGeometry(1, .04, 6, 40), ringMaterial = new T.MeshBasicMaterial({ color: 0xffe4aa }), pulseRingMaterial = new T.MeshBasicMaterial({ color: 0x82d4c8 });
  const padRingMaterial = new T.MeshBasicMaterial({ color: 0x86f3dc }), barrelRingMaterial = new T.MeshBasicMaterial({ color: 0xff7b38 });
  function addParticle(m, vx, vy, vz, life, debris = false, ring = false) {
    if (particles.length >= 180) scene.remove(particles.shift().mesh);
    scene.add(m); particles.push({ mesh: m, vx, vy, vz, life, debris, ring, spin: (Math.random() - .5) * 7 });
  }
  function reset() {
    aimArrow.visible = false; impactMarker.visible = false; dots.forEach(dot => { dot.visible = false; }); lastEvent = 0; eventBaseline = false; matchWinner = null; activeShooter = null; selection.visible = false;
    for (const obj of objects.values()) scene.remove(obj); objects.clear();
    if (shot) scene.remove(shot); shot = null; for (const m of projectileMeshes.values()) scene.remove(m); projectileMeshes.clear(); for (const p of particles) scene.remove(p.mesh); particles = [];
    container.dataset.cracked = '0'; container.dataset.fragments = '0'; container.dataset.fuelBarrels = '0'; container.dataset.bouncePads = '0'; delete container.dataset.lastMaterial; delete container.dataset.lastEnvironmentEvent;
  }
  let width, height;
  function resize() {
    width = container.clientWidth; height = container.clientHeight; renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();
  let lastTime = performance.now();
  function render(now) {
    requestAnimationFrame(render); const dt = Math.min(0.05, (now - lastTime) / 1000); lastTime = now;
    const portrait = width / height < 1.15;
    const distance = Math.max(43, 79.5 / (width / height));
    const closeMove = mode === 'game' && gamePhase === 'move' && activeShooter && !overview && !reducedMotion.matches;
    const tacticalAim = mode === 'game' && gamePhase === 'aim' && activeShooter && !overview && !reducedMotion.matches;
    const target = closeMove ? new T.Vector3(activeShooter.p[0] + (activeShooter.team === 0 ? 3 : -3), activeShooter.p[1] + 1.2, 0)
      : tacticalAim ? tacticalTarget
      : new T.Vector3(mode === 'lobby' && !portrait ? -4.6 : 0, mode === 'home' ? 10 : 2, 0);
    const desiredDistance = closeMove ? Math.max(22, 34 / (width / height)) : tacticalAim ? Math.max(41, 72 / (width / height)) : mode === 'home' ? Math.max(distance, 57) : distance;
    const blend = reducedMotion.matches ? 1 : 1 - Math.exp(-dt * 5);
    viewTarget.lerp(target, blend); viewDistance += (desiredDistance - viewDistance) * blend;
    camera.position.set(viewTarget.x + (mode === 'lobby' && !portrait ? 6.6 : 0), viewTarget.y + Math.max(10, viewDistance * .32), viewDistance);
    scene.fog.near = Math.max(80, viewDistance + 30); scene.fog.far = Math.max(190, viewDistance + 140);
    camera.lookAt(viewTarget);
    container.dataset.cameraMode = closeMove ? 'shooter' : tacticalAim ? 'tactical' : 'overview'; container.dataset.cameraX = viewTarget.x.toFixed(2);
    selection.visible = mode === 'game' && ['move', 'aim'].includes(gamePhase) && Boolean(activeShooter);
    if (selection.visible) selection.position.set(activeShooter.p[0], activeShooter.p[1] + .12, 1.55);
    if (shake > 0 && !reducedMotion.matches) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; shake *= 0.88; }
    for (const obj of objects.values()) {
      obj.position.lerp(obj.userData.targetP, Math.min(1, dt * 22)); obj.quaternion.slerp(obj.userData.targetQ, Math.min(1, dt * 22));
      art.animateResident(obj, now, reducedMotion.matches, matchWinner);
      if (obj.userData.gun) {
        const recoil = obj.userData.recoil || 0; obj.userData.gun.position.x = (obj.userData.team === 0 ? -1 : 1) * recoil;
        obj.userData.recoil = Math.max(0, recoil - dt * .7);
      }
    }
    for (const mesh of projectileMeshes.values()) {
      if (!mesh.userData.serverP) continue;
      const age = Math.min(.12, Math.max(0, (now - mesh.userData.snapshotAt) / 1000));
      const predicted = mesh.userData.serverP.clone().addScaledVector(mesh.userData.velocity, age);
      predicted.y -= 4.91 * age * age;
      if (mesh.userData.weapon === 'heavy') predicted.x += .5 * currentWind * (WEAPONS.heavy.windFactor || 1) * age * age;
      mesh.position.lerp(predicted, reducedMotion.matches ? 1 : 1 - Math.exp(-dt * 28));
    }
    if (now - trailAt > 45 && !reducedMotion.matches) {
      const trails = [...projectileMeshes.values()].filter(m => m.userData.weapon === 'rocket');
      if (shot) trails.push(shot);
      if (trails.length) {
        trailAt = now;
        for (const projectile of trails) addParticle(sphere(projectile.position.x, projectile.position.y, 0, .13, 0xf6d8a3), 0, .3, 0, .45);
      }
    }
    particles = particles.filter(p => {
      p.life -= dt; if (p.life <= 0) { scene.remove(p.mesh); return false; }
      if (p.ring) { p.mesh.scale.addScalar(dt * 9); return true; }
      p.vy -= (p.debris ? 12 : 3) * dt;
      p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt;
      if (p.debris) {
        if (p.mesh.position.y < .12) { p.mesh.position.y = .12; p.vy = Math.abs(p.vy) * p.mesh.userData.bounce; p.vx *= .7; p.vz *= .7; p.spin *= .65; }
        p.mesh.rotation.x += p.spin * dt; p.mesh.rotation.z += p.spin * dt * .6;
        if (p.life < .5) p.mesh.scale.multiplyScalar(Math.max(0, 1 - dt * 5));
      } else p.mesh.scale.multiplyScalar(1 - dt * 1.8);
      return true;
    });
    container.dataset.fragments = particles.filter(p => p.debris).length;

    if (!reducedMotion.matches) {
      pennants.forEach((f, i) => { f.rotation.y = currentWind * .11 + Math.sin(now / 650 + i) * (.04 + Math.abs(currentWind) * .035); });
      treeCrowns.forEach((c, i) => { c.rotation.z = Math.sin(now / 1900 + i) * .025; });
      environment.animate(now);
      birds.forEach(({ bird, left, right }, i) => {
        bird.position.set(Math.sin(now / 14000 + i * 2) * 32, 14 + i * 1.1 + Math.sin(now / 2500 + i) * .5, -23 - i * 4);
        left.rotation.z = Math.sin(now / 190 + i) * .35; right.rotation.z = -left.rotation.z;
      });
    }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(render);
  return { update, updateAim, reset, aimPreview, setOverview: value => { overview = value; }, setMode: value => { mode = value; } };
}
