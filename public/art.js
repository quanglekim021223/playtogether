import * as T from 'three';
import { MATERIALS } from './materials.js';
import { WEAPONS } from './weapons.js';

export function createArt() {
  const cube = new T.BoxGeometry(1, 1, 1), ball = new T.SphereGeometry(1, 16, 12), cylinder = new T.CylinderGeometry(.5, .5, 1, 18);
  const rock = new T.DodecahedronGeometry(1, 0), shard = new T.TetrahedronGeometry(1, 0);
  const roofProfile = new T.Shape(); roofProfile.moveTo(-.5, 0); roofProfile.lineTo(.5, 0); roofProfile.lineTo(0, .65); roofProfile.closePath();
  const roofGeometry = new T.ExtrudeGeometry(roofProfile, { depth: 1, bevelEnabled: false }); roofGeometry.translate(0, 0, -.5);
  const palette = [0xee775f, 0x48aaa5], plain = new Map();
  const flat = color => { if (!plain.has(color)) plain.set(color, new T.MeshStandardMaterial({ color, roughness: 0.78 })); return plain.get(color); };
  function mesh(geometry, mat, parent) { const m = new T.Mesh(geometry, mat); m.castShadow = true; m.receiveShadow = true; parent?.add(m); return m; }
  function box(parent, x, y, z, w, h, d, color) { const m = mesh(cube, flat(color), parent); m.position.set(x, y, z); m.scale.set(w, h, d); return m; }
  function orb(parent, x, y, z, r, color) { const m = mesh(ball, flat(color), parent); m.position.set(x, y, z); m.scale.setScalar(r); return m; }
  // Small deterministic canvas textures stay local and need no downloaded assets.
  function surfaceTexture(type) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = MATERIALS[type].color; ctx.fillRect(0, 0, 256, 256);
    let seed = 91;
    const rand = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 1900; i++) { ctx.fillStyle = `rgba(${rand() > 0.5 ? '255,240,211' : '35,36,31'},${rand() * 0.12})`; ctx.fillRect(rand() * 256, rand() * 256, 1 + rand() * 3, 1 + rand() * 3); }
    if (type === 'wood') {
      ctx.strokeStyle = '#69432665'; ctx.lineWidth = 1.3;
      for (let y = 4; y < 256; y += 9) { ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(70, y - 8, 150, y + 9, 256, y - 2); ctx.stroke(); }
      ctx.strokeStyle = '#68432590'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(50 + i * 72, 40 + i * 71, 19, 4, 0, 0, Math.PI * 2); ctx.stroke(); }
    } else if (type === 'brick') {
      ctx.strokeStyle = '#ebcbb0'; ctx.lineWidth = 4;
      for (let row = 0; row < 8; row++) {
        ctx.beginPath(); ctx.moveTo(0, row * 32); ctx.lineTo(256, row * 32); ctx.stroke();
        for (let x = (row % 2) * 32; x < 256; x += 64) { ctx.beginPath(); ctx.moveTo(x, row * 32); ctx.lineTo(x, row * 32 + 32); ctx.stroke(); }
      }
    } else {
      ctx.strokeStyle = '#56666c65'; ctx.lineWidth = 2;
      for (let row = 0; row < 4; row++) { ctx.beginPath(); ctx.moveTo(0, row * 64); ctx.lineTo(256, row * 64); ctx.stroke(); for (let x = (row % 2) * 64; x < 256; x += 128) { ctx.beginPath(); ctx.moveTo(x, row * 64); ctx.lineTo(x + 2, row * 64 + 64); ctx.stroke(); } }
    }
    const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 4; return texture;
  }
  const surfaces = Object.fromEntries(Object.entries(MATERIALS).map(([id, props]) => [id, id === 'glass'
    ? new T.MeshPhysicalMaterial({ color: props.color, roughness: 0.1, metalness: 0.12, clearcoat: 1, transparent: true, opacity: 0.5, depthWrite: false })
    : new T.MeshStandardMaterial({ map: surfaceTexture(id), roughness: props.roughness })]));
  const crackMaterials = { dark: new T.MeshBasicMaterial({ color: 0x392f2b }), light: new T.MeshBasicMaterial({ color: 0xedffff }) };
  // Mesh strips instead of WebGL lines so cracks remain visible at TV distance.
  const paths = [ [[-.1,.48],[.08,.23],[-.08,.05],[.13,-.16],[.03,-.48]], [[.08,.23],[.38,.32]], [[-.08,.05],[-.4,-.14]], [[.13,-.16],[.41,-.38]] ];
  function crackOverlay(w, h, d, glass, stage) {
    const group = new T.Group(); group.visible = false;
    for (const [index, path] of paths.entries()) {
      if (stage === 1 && index > 1) continue;
      for (let i = 1; i < path.length; i++) {
        const [ax, ay] = path[i - 1], [bx, by] = path[i]; const dx = (bx - ax) * w, dy = (by - ay) * h;
        const strip = mesh(cube, glass ? crackMaterials.light : crackMaterials.dark, group);
        strip.position.set((ax + bx) * w / 2, (ay + by) * h / 2, d / 2 + 0.035);
        strip.scale.set(Math.max(stage === 1 ? 0.045 : 0.07, Math.min(w, h) * (stage === 1 ? 0.025 : 0.045)), Math.hypot(dx, dy), 0.015);
        strip.rotation.z = -Math.atan2(dx, dy); strip.castShadow = false;
      }
    }
    return group;
  }
  function block(item) {
    const group = new T.Group(), [w, h, d] = item.size;
    const body = mesh(cube, surfaces[item.material], group); body.scale.set(w, h, d);
    group.userData.material = item.material;
    if (item.material === 'glass') {
      for (const x of [-w / 2, w / 2]) box(group, x, 0, d / 2 + .01, .045, h, .04, 0xd3f5eb);
      for (const y of [-h / 2, h / 2]) box(group, 0, y, d / 2 + .01, w, .045, .04, 0xd3f5eb);
      const glint = box(group, -w * .15, 0, d / 2 + .024, .045, h * .68, .01, 0xedffff); glint.rotation.z = -.2;
    }
    if (item.material === 'wood') {
      const long = w > h;
      for (const sign of [-1, 1]) {
        const x = long ? sign * (w / 2 - .12) : 0, y = long ? 0 : sign * (h / 2 - .15);
        orb(group, x, y, d / 2 + .025, .048, 0x4b5050);
      }
    }
    if (item.kind === 'block' && item.material !== 'glass' && h > 1) {
      box(group, 0, h / 2 - .08, 0, w + .08, .16, d + .06, item.material === 'stone' ? 0xb7c1bc : 0xe7bf94);
      box(group, 0, .08, d / 2 + .04, Math.min(.2, w * .32), Math.min(.62, h * .4), .045, palette[item.team]);
      orb(group, 0, .12, d / 2 + .074, .055, 0xffe5a5);
    }
    if (item.kind === 'roof' && !item.terrace) {
      // Each tile follows the roof body when it falls; no stationary decoration remains.
      const tiles = Math.max(2, Math.ceil(w / .6));
      for (let row = 0; row < 3; row++) for (let i = 0; i < tiles; i++) {
        box(group, -w / 2 + (i + .5) * w / tiles, h / 2 + .055 + row * .025, -d / 2 + (row + .5) * d / 3, w / tiles - .04, .11, d / 3 - .025, palette[item.team]);
      }
      box(group, 0, -h / 2 + .06, d / 2 + .025, w + .08, .12, .12, 0xf7dba9);
      const gable = mesh(roofGeometry, flat(palette[item.team]), group);
      gable.position.y = h / 2 + .15; gable.scale.set(w + .18, Math.min(1.4, w * .25), d + .15);
      box(group, 0, h / 2 + .16, d / 2 + .1, w + .3, .12, .12, 0xffdcab);
      const chimney = box(group, -w * .25, h / 2 + .65, -d * .18, .3, .95, .4, 0xe8c59e);
      box(group, chimney.position.x, h / 2 + 1.15, chimney.position.z, .43, .12, .49, 0x6b7e7b);
    }
    if (item.terrace) {
      for (const x of [-w / 2 + .12, w / 2 - .12]) box(group, x, h / 2 + .35, -d / 2, .08, .7, .08, 0xe5c79c);
      box(group, 0, h / 2 + .7, -d / 2, w, .08, .08, 0xe5c79c);
      box(group, 0, h / 2 + .03, 0, w, .06, d, 0xc5b58d);
    }
    if (item.kind === 'beam') {
      box(group, 0, -.08, d / 2 + .06, w + .08, .14, .16, 0xf0d8af);
      for (const x of [-w * .35, w * .35]) box(group, x, -.32, d / 2 - .08, .15, .22, .3, 0xb28f69);
      // Small balcony planters are attached to the slab, so they fall with it.
      if (w > 3) {
        box(group, w * .27, .36, d / 2 + .05, .66, .2, .3, 0xbc7c57);
        for (let i = 0; i < 3; i++) orb(group, w * .27 - .22 + i * .22, .53, d / 2 + .06, .14, i === 1 ? 0xe7ad7e : 0x60896b);
      }
    }
    if (item.kind === 'bridge') {
      for (const x of [-w / 2 + .1, w / 2 - .1]) box(group, x, .45, -d / 2, .09, .75, .09, 0x68482e);
      box(group, 0, .8, -d / 2, w, .08, .08, 0x68482e);
    }
    const cracks = [crackOverlay(w, h, d, item.material === 'glass', 1), crackOverlay(w, h, d, item.material === 'glass', 2)];
    cracks.forEach(c => group.add(c)); group.userData.cracks = cracks;
    return group;
  }
  function interactive(item) {
    const group = new T.Group(), [w, h, d] = item.size;
    group.userData.environmentKind = item.kind;
    if (item.kind === 'fuelBarrel') {
      const body = mesh(cylinder, flat(0xd94b3f), group); body.scale.set(w, h, d);
      for (const y of [-h * .36, h * .36]) {
        const ring = mesh(new T.TorusGeometry(w * .5, .045, 6, 20), flat(0x5c3531), group);
        ring.position.y = y; ring.rotation.x = Math.PI / 2;
      }
      const top = mesh(new T.CylinderGeometry(w * .38, w * .42, .09, 16), flat(0x633f38), group); top.position.y = h / 2 + .025;
      const cap = mesh(new T.CylinderGeometry(.1, .12, .1, 10), flat(0xf0c55e), group); cap.position.set(.18, h / 2 + .09, 0);
      const warning = box(group, 0, .02, d / 2 + .012, .42, .42, .025, 0xffd36e); warning.rotation.z = Math.PI / 4;
      const flame = orb(group, 0, .02, d / 2 + .035, .095, 0x5a3933); flame.scale.set(.65, 1.35, .24);
    } else {
      box(group, 0, 0, 0, w, h, d, 0x314b55);
      box(group, 0, h / 2 + .035, 0, w * .9, .07, d * .82, 0x71d9c9);
      for (const x of [-.55, 0, .55]) {
        const left = box(group, x - .1, h / 2 + .085, .02, .42, .055, .18, 0xe8fff2); left.rotation.y = -.55;
        const right = box(group, x + .1, h / 2 + .085, .02, .42, .055, .18, 0xe8fff2); right.rotation.y = .55;
      }
      for (const x of [-w * .42, w * .42]) box(group, x, -h * .18, 0, .1, h * .75, d * .92, 0xf0aa55);
    }
    return group;
  }
  function resident(team, variant = 0, weapon = 'pebble') {
    const root = new T.Group(), rig = new T.Group(); root.add(rig);
    const body = orb(rig, 0, -.04, 0, .44, palette[team]); body.scale.y *= .9;
    box(rig, 0, -.12, .35, .38, .18, .12, 0xf3d9a3);
    orb(rig, 0, .36, .1, .32, 0xffdfb0);
    const cap = orb(rig, 0, .6, .07, .32, variant % 2 ? 0xd9b779 : palette[team]); cap.scale.y *= .42;
    box(rig, .04, .55, .35, .43, .045, .2, variant % 2 ? 0xb39361 : palette[team]);
    const eyes = new T.Group(); rig.add(eyes);
    for (const x of [-.11, .11]) { orb(eyes, x, .4, .37, .064, 0x253b48); orb(eyes, x, .42, .415, .018, 0xffffff); }
    const mouth = box(rig, 0, .23, .405, .11, .035, .018, 0x8e543d);
    const arms = [];
    for (const side of [-1, 1]) {
      const arm = new T.Group(); arm.position.set(side * .36, .05, 0); rig.add(arm);
      const sleeve = orb(arm, side * .04, -.1, 0, .14, palette[team]); sleeve.scale.y *= 1.5;
      orb(arm, side * .065, -.26, .04, .11, 0xffdfb0); arms.push(arm);
      orb(rig, side * .2, -.37, .12, .13, 0x344d54);
    }
    const gun = new T.Group(); gun.position.set(0, .18, .48); root.add(gun);
    const tint = WEAPONS[weapon].color;
    if (weapon === 'pebble') {
      box(gun, .48, 0, 0, .55, .13, .14, 0x90653d);
      for (const sign of [-1, 1]) { box(gun, .75, sign * .19, 0, .13, .45, .14, 0xba8852); const band = box(gun, .75, 0, sign * .13, .07, .48, .035, 0xf7d795); band.rotation.x = .4; }
    } else {
      box(gun, .35, 0, 0, .65, .27, .3, tint); box(gun, .2, -.24, 0, .15, .34, .18, 0x354b55);
      if (weapon === 'heavy') { box(gun, .5, .04, 0, 1.05, .38, .38, tint); box(gun, 1.03, .04, 0, .08, .3, .3, 0x253b48); }
      if (weapon === 'bloom') { const drum = orb(gun, .43, .04, 0, .3, tint); drum.scale.x *= 1.4; box(gun, .9, .08, 0, .35, .32, .32, 0x536675); }
      if (weapon === 'rocket') { box(gun, .65, .03, 0, .9, .19, .2, tint); for (const sign of [-1, 1]) box(gun, .35, sign * .18, 0, .23, .12, .27, 0xf2d2a0); }
      if (weapon === 'drill') { box(gun, .65, .07, 0, .95, .12, .16, 0x314c5b); box(gun, .42, .28, 0, .35, .09, .09, tint); box(gun, 1.1, .07, 0, .13, .24, .24, tint); }
      if (weapon === 'pulse') { for (let i = 0; i < 3; i++) box(gun, .6 + i * .18, .02, 0, .07, .37 - i * .04, .37 - i * .04, tint); orb(gun, .86, .02, 0, .13, 0xd6fff0); }
    }
    gun.rotation.z = team === 0 ? .45 : Math.PI - .45;
    root.userData.gun = gun; root.userData.weapon = weapon;
    root.userData.rig = rig; root.userData.eyes = eyes; root.userData.arms = arms; root.userData.mouth = mouth;
    root.userData.phase = variant * 1.7; root.userData.hurtUntil = 0;
    return root;
  }
  function animateResident(obj, now, reduced, winner) {
    const u = obj.userData, t = now / 1000, hurt = t < u.hurtUntil;
    if (!u.rig) return;
    const won = winner === u.team;
    u.rig.position.y = reduced ? 0 : won ? Math.abs(Math.sin(t * 7 + u.phase)) * .2 : Math.sin(t * 2.4 + u.phase) * .025;
    u.rig.rotation.z = reduced ? 0 : hurt ? Math.sin(t * 38) * .13 : Math.sin(t * 1.5 + u.phase) * .025;
    u.eyes.scale.y = !reduced && ((t + u.phase) % 4.3 > 4.12) ? .1 : 1;
    u.arms.forEach((arm, i) => { arm.rotation.z = (i ? 1 : -1) * (won || hurt ? 2 : .12 + (reduced ? 0 : Math.sin(t * 2.4 + u.phase) * .08)); });
    u.mouth.scale.y = hurt ? 2.5 : 1;
  }
  function fragment(type, index) {
    const props = MATERIALS[type];
    const geometry = type === 'stone' ? rock : type === 'glass' ? shard : cube;
    const m = mesh(geometry, surfaces[type]);
    const s = .14 + (index % 4) * .045;
    if (type === 'wood') m.scale.set(.055 + index % 2 * .035, .42 + index % 4 * .15, .045);
    else if (type === 'glass') m.scale.set(s * 1.8, s * 2.2, .018);
    else if (type === 'brick') m.scale.set(s * 1.6, s, s);
    else m.scale.setScalar(s * 1.2);
    m.userData.bounce = props.bounce; m.userData.fragment = props.fragment; m.userData.material = type;
    return m;
  }
  return { block, interactive, resident, animateResident, fragment };
}
