import * as T from 'three';
import { GLTFLoader } from '/vendor/three-addons/loaders/GLTFLoader.js';
import { KTX2Loader } from '/vendor/three-addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from '/vendor/three-addons/libs/meshopt_decoder.module.js';
import { EffectComposer } from '/vendor/three-addons/postprocessing/EffectComposer.js';
import { RenderPass } from '/vendor/three-addons/postprocessing/RenderPass.js';
import { SSAOPass } from '/vendor/three-addons/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from '/vendor/three-addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '/vendor/three-addons/postprocessing/OutputPass.js';
import { ShaderPass } from '/vendor/three-addons/postprocessing/ShaderPass.js';
import { VignetteShader } from '/vendor/three-addons/shaders/VignetteShader.js';
import { createArt } from './art.js';
import { MATERIALS } from './materials.js';
import { createEnvironment } from './environment.js';
import { WEAPONS, launchVelocity, muzzlePosition } from './weapons.js';
const COLORS = [0xee775f, 0x48aaa5];
const CoastalGradeShader = {
  uniforms: { tDiffuse: { value: null }, saturation: { value: 1.07 }, contrast: { value: 1.035 }, warmth: { value: .022 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float saturation, contrast, warmth; varying vec2 vUv;
    void main() {
      vec4 source = texture2D(tDiffuse, vUv); float luma = dot(source.rgb, vec3(.2126, .7152, .0722));
      vec3 color = mix(vec3(luma), source.rgb, saturation);
      color = (color - .5) * contrast + .5 + vec3(warmth, warmth * .42, -warmth * .35);
      gl_FragColor = vec4(max(color, 0.0), source.a);
    }
  `
};
const WEAPON_VFX = {
  pebble: { core: 0xffd36f, accent: 0xfff1b0, smoke: 0x8f826d, shake: .11 },
  heavy: { core: 0xff9a42, accent: 0xffdc73, smoke: 0x4e554f, shake: .32 },
  bloom: { core: 0xe989c4, accent: 0xffc4df, smoke: 0x766273, shake: .2 },
  rocket: { core: 0xff6b32, accent: 0xffd06b, smoke: 0x555b5a, shake: .28 },
  drill: { core: 0x8dd7ed, accent: 0xe1f8ff, smoke: 0x65777b, shake: .17 },
  pulse: { core: 0x75f3db, accent: 0xd8fff4, smoke: 0x587b78, shake: .24 }
};
const DEBRIS_VFX = {
  wood: { lateral: 8, lift: 7, gravity: 8, drag: .35, spin: 11, life: 3.1 },
  brick: { lateral: 5, lift: 5, gravity: 15, drag: .7, spin: 6, life: 2.7 },
  stone: { lateral: 3.5, lift: 3.5, gravity: 18, drag: 1.1, spin: 3, life: 2.9 },
  glass: { lateral: 10, lift: 8, gravity: 7, drag: .18, spin: 14, life: 3.4 }
};
export function createScene(container) {
  const art = createArt();
  const kit = new Map();
  const kitFiles = {
    wood: ['bp_woodblock.glb', [1.4, 1.5, 1.4]], brick: ['bp_brickblock.glb', [1.4, 1.5, 1.4]],
    stone: ['bp_stoneblock.glb', [1.4, 1.5, 1.4]], glass: ['bp_glassblock.glb', [1.4, 1.5, .13]],
    fuelBarrel: ['bp_fuelbarrel.glb', [.72, 1.18, .72]], bouncePad: ['bp_bouncepad.glb', [1.45, .34, .95]],
    resident0: ['bp_residentcoral_v2.glb', [1, 1.65, .75]], resident1: ['bp_residentteal.glb', [1, 1.65, .75]],
    'weapon:pebble': ['bp_weaponpebble.glb', [1, .75, .3]], 'weapon:heavy': ['bp_weaponheavy.glb', [1.25, .65, .5]],
    'weapon:bloom': ['bp_weaponbloom.glb', [1.2, .72, .68]], 'weapon:rocket': ['bp_weaponrocket.glb', [1.35, .62, .55]],
    'weapon:drill': ['bp_weapondrill.glb', [1.4, .72, .55]], 'weapon:pulse': ['bp_weaponpulse.glb', [1.28, .72, .58]],
    'decor:window': ['bp_decorwindow.glb', [1.22, 1.3, .4]], 'decor:door': ['bp_decordoor.glb', [1.12, 1.66, .48]],
    'decor:railing': ['bp_decorrailing.glb', [2, .82, .12]], 'decor:chimney': ['bp_decorchimney.glb', [.72, 1.21, .72]],
    'decor:streetlamp': ['bp_decorstreetlamp.glb', [.66, 2.48, .46]], 'decor:crate': ['bp_decorcrate.glb', [.82, .76, .82]],
    'decor:planter': ['bp_decorplanter.glb', [1.05, 1.25, .52]], 'decor:sign': ['bp_decorsign.glb', [1.55, 1.07, .18]]
  };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let matchWinner = null, eventBaseline = false;
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.35));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = .9;
  container.append(renderer.domElement);
  const scene = new T.Scene(); const environment = createEnvironment(scene, renderer);
  container.dataset.environmentLighting = 'loading';
  container.dataset.environmentBackdrop = 'loading';
  container.dataset.waterShader = environment.waterMode; container.dataset.waterQuality = environment.waterQuality;
  container.dataset.waterReflection = environment.waterReflection; container.dataset.shorelineFoam = environment.shorelineFoam;
  container.dataset.headlandQuality = environment.headlandQuality; container.dataset.headlandScatter = String(environment.headlandScatter);
  container.dataset.architectureQuality = environment.architectureQuality; container.dataset.architectureBuildings = String(environment.architectureBuildings);
  container.dataset.environmentMotion = environment.motionLayers;
  container.dataset.arenaScale = 'expanded';
  environment.lightingReady.then(source => { container.dataset.environmentLighting = source; });
  environment.backgroundReady.then(source => { container.dataset.environmentBackdrop = source; });
  const camera = new T.PerspectiveCamera(36, 1, 0.1, 400);
  const hemisphere = new T.HemisphereLight(0xe7faff, 0x809085, .85); scene.add(hemisphere);
  const sun = new T.DirectionalLight(0xffdfad, 3.35); sun.position.set(-15, 28, 18); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 22, bottom: -22, near: 1, far: 80 });
  sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.025; scene.add(sun);
  const blastLight = new T.PointLight(0xff9b45, 0, 22, 2); blastLight.position.z = 4; blastLight.userData.decayRate = 95; scene.add(blastLight);
  const weatherLight = new T.PointLight(0xc9e3ff, 0, 70, 1.6); weatherLight.position.set(0, 18, 8); scene.add(weatherLight);
  const lightingThemes = {
    townhouse: { sky: 0xe7faff, ground: 0x809085, sun: 0xffdfad, exposure: .88 },
    tower: { sky: 0xdff6ff, ground: 0x718b87, sun: 0xffd39a, exposure: .91 },
    bridge: { sky: 0xd7f2ff, ground: 0x718d91, sun: 0xffe7bd, exposure: .86 },
    fortress: { sky: 0xffead7, ground: 0x80766f, sun: 0xffbd7a, exposure: .9 }
  };
  function applyLightingTheme(mapId) {
    const theme = lightingThemes[mapId] || lightingThemes.townhouse;
    hemisphere.color.setHex(theme.sky); hemisphere.groundColor.setHex(theme.ground);
    sun.color.setHex(theme.sun); renderer.toneMappingExposure = theme.exposure;
    environment.setTheme(mapId); container.dataset.lightingTheme = mapId || 'townhouse';
  }
  const materials = new Map();
  function material(color) {
    if (!materials.has(color)) materials.set(color, new T.MeshStandardMaterial({ color, roughness: 0.88 }));
    return materials.get(color);
  }
  const boxGeometry = new T.BoxGeometry(1, 1, 1), sphereGeometry = new T.SphereGeometry(1, 16, 12);
  function mesh(geometry, color, parent = scene) { const m = new T.Mesh(geometry, material(color)); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
  function box(x, y, z, w, h, d, color, parent) { const m = mesh(boxGeometry, color, parent); m.position.set(x, y, z); m.scale.set(w, h, d); return m; }
  function sphere(x, y, z, r, color, parent) { const m = mesh(sphereGeometry, color, parent); m.position.set(x, y, z); m.scale.setScalar(r); return m; }
  // Keep the simple island only as a fallback if the sculpted GLB cannot load.
  const arenaFallback = new T.Group(); scene.add(arenaFallback);
  box(0, -1.25, 0, 57, 2.2, 12, 0x766f63, arenaFallback);
  box(0, -0.45, 0, 57.5, 0.7, 12.5, 0xc7b79a, arenaFallback);
  box(0, -0.12, 0, 58, 0.25, 13, 0xe8d9b7, arenaFallback);
  box(0, 0.01, 5.85, 56.5, 0.06, 1.15, 0xc7b79a, arenaFallback);
  box(0, 0.005, 3.8, 56, 0.06, 1.15, 0xe0ccaa, arenaFallback);
  for (let x = -27; x <= 27; x += 1.6) box(x, 0.045, 3.8, 1.35, 0.055, 0.8, 0xeadbc0, arenaFallback);
  box(0, -2.7, -0.4, 53, 0.8, 10, 0x807b6c, arenaFallback);
  for (let i = 0; i < 24; i++) {
    const x = -27.5 + i * 2.3;
    const rock = mesh(new T.DodecahedronGeometry(0.7 + (i % 3) * 0.16, 0), i % 2 ? 0xa1987e : 0x8b8572, arenaFallback);
    rock.position.set(x, -1.5 - (i % 3) * 0.18, 5.8); rock.rotation.z = i * 2;
  }
  const beachPebbles = new T.InstancedMesh(new T.DodecahedronGeometry(.12, 0), new T.MeshStandardMaterial({ color: 0x9f927a, roughness: 1 }), 44);
  const beachTransform = new T.Object3D();
  for (let i = 0; i < 44; i++) {
    beachTransform.position.set(-27 + (i * 11.93 % 54), .16, 4.55 + Math.sin(i * 1.41) * .55); beachTransform.rotation.set(i * .7, i * 1.9, i * .37);
    const size = .55 + i % 4 * .18; beachTransform.scale.set(size, .45 + i % 3 * .12, size); beachTransform.updateMatrix(); beachPebbles.setMatrixAt(i, beachTransform.matrix);
  }
  beachPebbles.castShadow = true; beachPebbles.receiveShadow = true; scene.add(beachPebbles);
  // Seven crossed blade cards read as a tuft from every camera angle, while a
  // density mask keeps vegetation clustered at the beach edges and out of play.
  function grassGeometry() {
    const positions = [], normals = [], uvs = [], indices = [];
    for (let blade = 0; blade < 7; blade++) {
      const angle = blade * 2.399, radius = blade ? .055 + blade % 3 * .035 : 0;
      const ox = Math.cos(blade * 1.71) * radius, oz = Math.sin(blade * 1.71) * radius;
      const halfWidth = .045 + blade % 3 * .012, height = .68 + blade % 4 * .09;
      const dx = Math.cos(angle) * halfWidth, dz = Math.sin(angle) * halfWidth, base = positions.length / 3;
      positions.push(ox - dx, 0, oz - dz, ox + dx, 0, oz + dz, ox + dx * .18, height, oz + dz * .18, ox - dx * .18, height, oz - dz * .18);
      for (let i = 0; i < 4; i++) normals.push(Math.sin(angle), 0, Math.cos(angle));
      uvs.push(0, 0, 1, 0, 1, 1, 0, 1); indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3)); geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeBoundingSphere(); return geometry;
  }
  const grassUniforms = { uTime: { value: 0 }, uWind: { value: 0 } };
  const grassMaterial = new T.MeshBasicMaterial({ color: 0x76965c, side: T.DoubleSide, toneMapped: true });
  grassMaterial.onBeforeCompile = shader => {
    shader.uniforms.uTime = grassUniforms.uTime; shader.uniforms.uWind = grassUniforms.uWind;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\nuniform float uTime; uniform float uWind;`)
      .replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position);
        float bladeTip = smoothstep(0.08, 1.0, position.y);
        float seed = instanceMatrix[3].x * .37 + instanceMatrix[3].z * .61;
        float sway = sin(uTime * (1.45 + abs(uWind) * .16) + seed) * (.055 + abs(uWind) * .035);
        transformed.x += (sway + uWind * .025) * bladeTip * bladeTip;
        transformed.z += cos(uTime * 1.13 + seed * 1.7) * .035 * bladeTip;
      `);
  };
  grassMaterial.customProgramCacheKey = () => 'coastal-grass-wind-v1';
  function random01(index, salt) { return Math.abs(Math.sin(index * 91.731 + salt * 17.123) * 43758.5453) % 1; }
  function grassDensity(x, z) {
    const beachBand = Math.max(0, Math.min(1, (Math.abs(z) - 3.45) / 2.25));
    const clusters = .46 + .54 * Math.sin(x * .71 + z * 1.37) * Math.sin(x * .19 - z * 2.11);
    const centerPath = Math.min(1, Math.abs(x) / 4.2), structureGap = Math.abs(z) < 3.5 ? .08 : 1;
    return beachBand * (.28 + clusters * .72) * (.3 + centerPath * .7) * structureGap;
  }
  const grassSpots = [];
  for (let i = 0; i < 2600 && grassSpots.length < 460; i++) {
    const x = -28 + random01(i, 1) * 56, z = -5.9 + random01(i, 2) * 11.8;
    if (random01(i, 3) < grassDensity(x, z)) grassSpots.push({ x, z, scale: .46 + random01(i, 4) * .72, angle: random01(i, 5) * Math.PI });
  }
  function grassInstances(spots, name) {
    const mesh = new T.InstancedMesh(grassGeometry(), grassMaterial, spots.length); mesh.name = name;
    spots.forEach((spot, i) => {
      beachTransform.position.set(spot.x, .06, spot.z); beachTransform.rotation.set(0, spot.angle, 0);
      beachTransform.scale.set(.8 + random01(i, 6) * .45, spot.scale, .8 + random01(i, 7) * .3); beachTransform.updateMatrix();
      mesh.setMatrixAt(i, beachTransform.matrix);
    });
    mesh.receiveShadow = true; mesh.computeBoundingSphere(); scene.add(mesh); return mesh;
  }
  const grassNear = grassInstances(grassSpots, 'Dense coastal grass');
  const grassFar = grassInstances(grassSpots.filter((_, i) => i % 2 === 0), 'Coastal grass LOD');
  grassNear.visible = false; container.dataset.grassDensity = String(grassSpots.length);
  const treeCrowns = [];
  function tree(x, z, scale = 1) {
    const group = new T.Group(); scene.add(group); group.position.set(x, 0, z); group.scale.setScalar(scale);
    box(0, 1.3, 0, 0.32, 2.6, 0.32, 0x8e7860, group);
    const crown = new T.Group(); group.add(crown); crown.position.y = 2.3; treeCrowns.push(crown);
    sphere(0, .7, 0, 1.4, 0x588873, crown); sphere(-.7, .5, .3, .9, 0x89ab74, crown); sphere(.5, 1.3, 0, .9, 0xa9bf80, crown);
    for (let i = 0; i < 5; i++) sphere(Math.cos(i * 2) * .9, .75 + Math.sin(i * 1.8) * .65, .85, .12, 0xe9ac69, crown);
  }
  [-27, -24, 24, 27].forEach((x, i) => tree(x, -3.8, 0.85 + (i % 2) * 0.3));
  for (let i = 0; i < 18; i++) {
    const x = -27 + i * 3.18;
    for (let j = 0; j < 3; j++) sphere(x + j * 0.13, 0.14 + j * 0.06, 5.3, 0.09, [0xfff3c4, 0xf2a28c, 0xf0d477][i % 3]);
  }
  for (const x of [-7, 7]) {
    box(x, 0.4, -3.5, 2.2, 0.15, 0.6, 0xd1a16d); box(x, 0.9, -3.8, 2.2, 0.6, 0.15, 0xd1a16d);
    for (const dx of [-0.8, 0.8]) box(x + dx, 0.2, -3.5, 0.12, 0.4, 0.5, 0x54706a);
  }
  const pennants = [];
  for (let team = 0; team < 2; team++) {
    const x = team === 0 ? -24 : 24;
    box(x, 3.1, -1, 0.12, 6.2, 0.12, 0xf6e5c6);
    const flag = box(x + 0.7, 5.6, -1, 1.45, 0.85, 0.06, COLORS[team]); pennants.push(flag);
  }
  // Garden details stay outside the collision plane; all structural details follow their body.
  for (const x of [-27.2, 27.2]) {
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
  const birds = [];
  for (let i = 0; i < 3; i++) {
    const bird = new T.Group(); bird.position.set(-12 + i * 10, 14 + i, -23 - i * 4); scene.add(bird);
    const left = box(-.16, 0, 0, .36, .035, .1, 0x67828b, bird), right = box(.16, 0, 0, .36, .035, .1, 0x67828b, bird);
    birds.push({ bird, left, right });
  }
  const objects = new Map(); const projectileMeshes = new Map(); let shot = null; let particles = []; let impactMarks = []; let lastEvent = 0; let shake = 0; let trailAt = 0; let mode = 'home';
  let impactPauseUntil = 0, replayTurn = null, replayFrames = [], replayEventCursor = 0, replay = null, lastReplayFinal = null;
  const mapDecor = new T.Group(); mapDecor.name = 'MapDecor'; scene.add(mapDecor);
  let currentMap = null, activeShooter = null, gamePhase = 'aim', overview = false, currentWind = 0, tacticalTarget = new T.Vector3();
  const selection = new T.Mesh(new T.TorusGeometry(.68, .035, 6, 36), new T.MeshBasicMaterial({ color: 0xffd376, depthTest: false }));
  selection.renderOrder = 9; selection.visible = false; scene.add(selection);
  const viewTarget = new T.Vector3(0, 2, 0); let viewDistance = 50, impactFocus = null;
  function kitKey(item) {
    if (['fuelBarrel', 'bouncePad'].includes(item.kind)) return item.kind;
    if (item.kind === 'resident') return `resident${item.team}`;
    return item.kind === 'block' ? item.material : null;
  }
  const interactiveKinds = new Set(['fuelBarrel', 'bouncePad', 'firePlank', 'glassTrap', 'rockFall', 'magnet']);
  function residentClips(model) {
    const scalar = (name, duration, times, values) => new T.NumberKeyframeTrack(`${name}.rotation[z]`, times.map(t => t * duration), values);
    const bounce = (duration, height) => new T.VectorKeyframeTrack('CharacterRig.position', [0, duration * .5, duration], [0, 0, 0, 0, height, 0, 0, 0, 0]);
    const available = tracks => tracks.filter(track => model.getObjectByName(track.name.split('.')[0]));
    return [
      new T.AnimationClip('idle', 1.8, available([bounce(1.8, .025), scalar('Head', 1.8, [0, .5, 1], [-.025, .025, -.025])])),
      new T.AnimationClip('move', .62, available([bounce(.62, .075), scalar('Leg_L', .62, [0, .5, 1], [-.48, .48, -.48]), scalar('Leg_R', .62, [0, .5, 1], [.48, -.48, .48]), scalar('Arm_L', .62, [0, .5, 1], [.34, -.34, .34]), scalar('Arm_R', .62, [0, .5, 1], [-.34, .34, -.34])])),
      new T.AnimationClip('aim', .8, available([bounce(.8, .012), scalar('Arm_L', .8, [0, .5, 1], [-1.05, -.98, -1.05]), scalar('Arm_R', .8, [0, .5, 1], [1.05, .98, 1.05])])),
      new T.AnimationClip('shoot', .48, available([
        bounce(.48, .055),
        scalar('CharacterRig', .48, [0, .16, .48, .72, 1], [0, -.16, .07, -.035, 0]),
        scalar('Arm_L', .48, [0, .16, .48, .72, 1], [-1.05, -.42, -1.32, -1.12, -1.05]),
        scalar('Arm_R', .48, [0, .16, .48, .72, 1], [1.05, .42, 1.32, 1.12, 1.05]),
        scalar('Head', .48, [0, .2, .52, 1], [0, -.16, .065, 0])
      ])),
      new T.AnimationClip('hit', .28, available([scalar('CharacterRig', .28, [0, .25, .5, .75, 1], [0, -.16, .14, -.08, 0]), scalar('Head', .28, [0, .5, 1], [0, .15, 0])])),
      new T.AnimationClip('celebrate', .72, available([bounce(.72, .20), scalar('Arm_L', .72, [0, .5, 1], [-2.1, -2.45, -2.1]), scalar('Arm_R', .72, [0, .5, 1], [2.1, 2.45, 2.1])]))
    ];
  }
  function attachResidentAsset(obj, asset) {
    if (obj.userData.assetModel) return;
    const visual = asset.scene.clone(true), model = new T.Group(); model.name = 'ResidentAsset';
    let characterRig = visual.getObjectByName('CharacterRig');
    if (characterRig) model.add(visual);
    else { characterRig = new T.Group(); characterRig.name = 'CharacterRig'; characterRig.add(visual); model.add(characterRig); }
    model.updateMatrixWorld(true);
    const bounds = new T.Box3().setFromObject(model), dimensions = bounds.getSize(new T.Vector3());
    const scale = 1.56 / dimensions.y; model.scale.setScalar(scale); model.updateMatrixWorld(true);
    bounds.setFromObject(model); const center = bounds.getCenter(new T.Vector3());
    model.position.set(-center.x, -.73 - bounds.min.y, -center.z);
    model.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
    obj.userData.rig.visible = false; obj.add(model); obj.userData.assetModel = model;
    const mixer = new T.AnimationMixer(model), actions = Object.fromEntries(residentClips(model).map(clip => [clip.name, mixer.clipAction(clip)]));
    for (const name of ['shoot', 'hit']) { actions[name].setLoop(T.LoopOnce, 1); actions[name].clampWhenFinished = true; }
    actions.idle.play(); obj.userData.assetAnimator = { mixer, actions, current: 'idle' };
    obj.userData.assetItem = null;
  }
  function attachWeaponAsset(obj, weapon) {
    if (!obj.userData.gun || obj.userData.assetWeapon === weapon) return;
    const asset = kit.get(`weapon:${weapon}`); if (!asset) return;
    if (obj.userData.weaponModel) obj.userData.gun.remove(obj.userData.weaponModel);
    for (const child of obj.userData.gun.children) child.visible = false;
    const model = asset.scene.clone(true); model.scale.setScalar(.78);
    model.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
    obj.userData.gun.add(model); model.visible = true;
    obj.userData.weaponModel = model; obj.userData.assetWeapon = weapon;
  }
  function decorClone(key, parent, position, scale = 1, rotation = 0) {
    const asset = kit.get(`decor:${key}`); if (!asset) return null;
    const model = asset.scene.clone(true); model.position.set(...position); model.scale.setScalar(scale); model.rotation.y = rotation;
    model.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
    parent.add(model); return model;
  }
  const decorLayouts = {
    townhouse: [['streetlamp', -9.5, 0, 2.8, 1], ['streetlamp', 9.5, 0, 2.8, 1], ['planter', -7.8, 0, 3.0, .8], ['planter', 7.8, 0, 3.0, .8], ['crate', -11, 0, 2.5, .9], ['crate', 11, 0, 2.5, .9]],
    tower: [['streetlamp', -8.7, 0, 3.0, 1], ['streetlamp', 8.7, 0, 3.0, 1], ['crate', -10.4, 0, 2.5, 1], ['crate', -11.1, 0, 2.35, .72], ['crate', 10.4, 0, 2.5, 1], ['crate', 11.1, 0, 2.35, .72]],
    bridge: [['streetlamp', -9.2, 0, 2.9, 1], ['streetlamp', 9.2, 0, 2.9, 1], ['planter', -11, 0, 2.8, .85], ['planter', 11, 0, 2.8, .85], ['crate', -7.7, 0, 2.5, .8], ['crate', 7.7, 0, 2.5, .8]],
    fortress: [['streetlamp', -9.4, 0, 2.8, .9], ['streetlamp', 9.4, 0, 2.8, .9], ['crate', -10.6, 0, 2.5, 1], ['crate', 10.6, 0, 2.5, 1], ['planter', -7.8, 0, 2.8, .7], ['planter', 7.8, 0, 2.8, .7]]
  };
  function rebuildMapDecor() {
    mapDecor.clear(); let count = 0;
    for (const [key, x, y, z, scale] of decorLayouts[currentMap] || []) if (decorClone(key, mapDecor, [x, y, z], scale)) count++;
    container.dataset.mapDecor = String(count);
  }
  function decorateStructure(obj, item) {
    if (obj.userData.structureDecor || !item?.size || item.kind === 'resident') return;
    const [w, h, d = 1] = item.size; const group = new T.Group(); group.name = 'StructureDecor'; let count = 0;
    const add = (key, p, scale = 1) => { const model = decorClone(key, group, p, scale); if (model) count++; return model; };
    const trim = (x, y, z, width, height, depth, color) => { box(x, y, z, width, height, depth, color, group); count++; };
    const sequence = Number(item.id) || 0;
    if (item.kind === 'beam' && w > 2.5 && sequence % 2 === 0) {
      add('window', [0, -h / 2 - .62, d / 2 + .08], Math.min(.85, w / 4));
      if (currentMap === 'townhouse') add('sign', [w * .27, -h / 2 - .48, d / 2 + .12], .62);
    } else if (item.kind === 'roof') {
      add('chimney', [w * (item.team === 0 ? -.28 : .28), h / 2, -.30], .72);
    } else if (item.kind === 'bridge') {
      add('railing', [0, h / 2, d / 2], Math.min(1.7, w / 2));
    } else if (item.kind === 'block' && w > 1.05 && item.material !== 'glass') {
      add(sequence % 2 ? 'door' : 'window', [0, -h / 2, d / 2 + .08], Math.min(.85, w / 1.3));
    }
    if (item.kind === 'block' && h >= 1.4 && item.material !== 'glass') {
      const stone = currentMap === 'fortress';
      trim(0, -h / 2 + .09, 0, w + .18, .18, d + .12, stone ? 0x8b9997 : 0xe6c69c);
      trim(0, h / 2 - .08, 0, w + .14, .16, d + .08, stone ? 0xb3bbb4 : 0xf1d6ae);
    }
    if (['beam', 'roof'].includes(item.kind)) {
      const fascia = currentMap === 'fortress' ? 0x9ca6a1 : 0xe7c18f;
      trim(0, -h / 2 + .055, d / 2 + .075, w + .12, .11, .15, fascia);
      for (const x of [-w * .34, w * .34]) {
        const bracket = box(x, -h / 2 - .18, d / 2 + .03, .13, .46, .16, currentMap === 'fortress' ? 0x687776 : 0x8f623e, group);
        bracket.rotation.z = x < 0 ? -.48 : .48; count++;
      }
    }
    if (item.terrace) {
      const railScale = Math.min(1.2, w / 3.8);
      add('railing', [-w * .23, h / 2 + .05, d / 2 + .02], railScale);
      add('railing', [w * .23, h / 2 + .05, d / 2 + .02], railScale);
    }
    if (currentMap === 'fortress' && item.kind === 'roof') {
      for (let i = 0; i < 5; i++) trim(-w * .4 + i * w * .2, h / 2 + .24, d / 2 - .12, Math.min(.42, w * .12), .48, .42, 0x879592);
    }
    if (!count) return;
    obj.add(group); obj.userData.structureDecor = group; container.dataset.structureDecor = String(Number(container.dataset.structureDecor || 0) + count);
  }
  function applyKit(obj, item) {
    if (obj.userData.assetModel) return;
    const key = kitKey(item); if (!key) return;
    const asset = kit.get(key);
    if (!asset) { obj.userData.assetItem = { kind: item.kind, material: item.material, team: item.team, size: [...item.size] }; return; }
    if (item.kind === 'resident') { attachResidentAsset(obj, asset); return; }
    for (const child of obj.children) if (!obj.userData.cracks?.includes(child)) child.visible = false;
    const model = asset.scene.clone(true), [bw, bh, bd] = asset.size, [w, h, d] = item.size;
    const thinGlass = item.material === 'glass';
    model.scale.set(w / bw, h / bh, thinGlass ? 1 : d / bd);
    model.position.set(0, -h / 2, thinGlass ? d / 2 - bd / 2 : 0);
    model.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
    obj.add(model); obj.userData.assetModel = model; obj.userData.assetItem = null;
  }
  const ktx2Loader = new KTX2Loader().setTranscoderPath('/vendor/three-addons/libs/basis/').detectSupport(renderer);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(ktx2Loader);
  container.dataset.meshCompression = 'meshopt'; container.dataset.textureCompression = 'ktx2-ready';
  container.dataset.terrainMesh = 'loading'; container.dataset.sandShader = 'loading'; container.dataset.grassLod = 'loading';
  container.dataset.rockKit = 'loading'; container.dataset.terrainBlend = 'loading'; container.dataset.contactShadows = 'loading';
  function coastalSandMaterial(source) {
    const sand = source?.clone?.() || new T.MeshStandardMaterial();
    sand.vertexColors = true; sand.roughness = .94; sand.metalness = 0;
    if (sand.normalScale) sand.normalScale.set(.62, .62);
    sand.name = source?.name || 'Triplanar coastal sand';
    sand.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `
        #include <common>
        varying vec3 vSandWorldPosition;
        varying vec3 vSandWorldNormal;
      `).replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vSandWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vSandWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
        #include <common>
        varying vec3 vSandWorldPosition;
        varying vec3 vSandWorldNormal;
        float sandHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float sandNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(sandHash(i), sandHash(i + vec2(1.0, 0.0)), f.x), mix(sandHash(i + vec2(0.0, 1.0)), sandHash(i + 1.0), f.x), f.y);
        }
      `).replace('#include <color_fragment>', `
        #include <color_fragment>
        vec3 sandBlend = pow(abs(normalize(vSandWorldNormal)), vec3(4.0));
        sandBlend /= max(dot(sandBlend, vec3(1.0)), .001);
        float sandDetail = sandNoise(vSandWorldPosition.yz * 3.8) * sandBlend.x
          + sandNoise(vSandWorldPosition.xz * 3.8) * sandBlend.y
          + sandNoise(vSandWorldPosition.xy * 3.8) * sandBlend.z;
        float sandGrain = sandNoise(vSandWorldPosition.xz * 17.0 + sandDetail * 4.0);
        diffuseColor.rgb *= .86 + sandDetail * .2 + sandGrain * .055;
      `).replace('#include <roughnessmap_fragment>', `
        #include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (sandGrain - .5) * .11, .78, 1.0);
      `);
    };
    sand.customProgramCacheKey = () => 'coastal-sand-triplanar-v1'; return sand;
  }
  loader.loadAsync('/assets/environment/arena_coast.glb?v=pbr-rocks-2').then(({ scene: terrain }) => {
    let hasRockKit = false, hasBlend = false, hasContact = false;
    terrain.traverse(child => {
      if (child.isMesh) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        const label = `${child.name} ${materials.map(material => material?.name || '').join(' ')}`;
        child.castShadow = true; child.receiveShadow = true;
        if (/Arena coast|Sculpted coast|Coastal sand PBR/i.test(label)) child.material = coastalSandMaterial(child.material);
        if (/PBR rock kit|Rock atlas PBR/i.test(label)) hasRockKit = true;
        if (/Height-blended sand|height blend/i.test(label)) { hasBlend = true; child.receiveShadow = true; }
        if (/Contact shadow|Soft rock contact shadow/i.test(label)) { hasContact = true; child.castShadow = false; child.receiveShadow = false; child.renderOrder = 2; }
      }
    });
    scene.add(terrain);
    arenaFallback.visible = false;
    container.dataset.terrainMesh = 'glb'; container.dataset.sandShader = 'triplanar-pbr-vertex-color';
    container.dataset.rockKit = hasRockKit ? 'pbr-atlas-lod0' : 'legacy';
    container.dataset.terrainBlend = hasBlend ? 'vertex-height-blend' : 'none';
    container.dataset.contactShadows = hasContact ? 'baked-decals' : 'none';
  }).catch(() => { container.dataset.terrainMesh = 'fallback'; });
  Promise.allSettled(Object.entries(kitFiles).map(async ([key, [file, size]]) => {
    const loaded = await loader.loadAsync(`/assets/kit/${file}`); kit.set(key, { scene: loaded.scene, size });
  })).then(results => {
    const failures = results.filter(result => result.status === 'rejected').length;
    container.dataset.assetKit = kit.size ? String(kit.size) : 'fallback';
    container.dataset.assetFailures = String(failures);
    container.dataset.residentAssets = String([...kit.keys()].filter(key => key.startsWith('resident')).length);
    container.dataset.weaponAssets = String([...kit.keys()].filter(key => key.startsWith('weapon:')).length);
    container.dataset.decorAssets = String([...kit.keys()].filter(key => key.startsWith('decor:')).length);
    for (const obj of objects.values()) {
      if (obj.userData.assetItem) applyKit(obj, obj.userData.assetItem);
      if (obj.userData.weaponKey) attachWeaponAsset(obj, obj.userData.weaponKey);
      if (obj.userData.decorItem) decorateStructure(obj, obj.userData.decorItem);
    }
    rebuildMapDecor();
    container.dataset.residentModels = String([...objects.values()].filter(obj => obj.userData.assetAnimator).length);
    container.dataset.weaponModels = String([...objects.values()].filter(obj => obj.userData.weaponModel).length);
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

  let currentWeather = null;
  const rainCount = 300;
  const rainGeo = new T.BufferGeometry();
  const rainPositions = new Float32Array(rainCount * 3);
  for (let i = 0; i < rainCount; i++) {
    rainPositions[i * 3] = (Math.random() - 0.5) * 60;
    rainPositions[i * 3 + 1] = Math.random() * 25;
    rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 15;
  }
  rainGeo.setAttribute('position', new T.BufferAttribute(rainPositions, 3));
  const rainMat = new T.PointsMaterial({ color: 0x98c5e9, size: 0.18, transparent: true, opacity: 0.55, depthWrite: false });
  const rainPoints = new T.Points(rainGeo, rainMat);
  rainPoints.visible = false;
  scene.add(rainPoints);

  let airdropMesh = null;
  function updateAirdrop(drop) {
    if (!drop) {
      if (airdropMesh) airdropMesh.visible = false;
      container.dataset.airdrop = 'none';
      return;
    }
    if (!airdropMesh) {
      airdropMesh = new T.Group();
      const crateGeo = new T.BoxGeometry(0.9, 0.9, 0.9);
      const crateMat = new T.MeshStandardMaterial({ color: 0x8a5229, roughness: 0.7 });
      const crate = new T.Mesh(crateGeo, crateMat);
      crate.castShadow = true;
      crate.receiveShadow = true;
      airdropMesh.add(crate);

      const bandGeo = new T.BoxGeometry(0.92, 0.25, 0.92);
      const bandMat = new T.MeshStandardMaterial({ color: 0xf5a623, roughness: 0.3, emissive: 0x442200 });
      const band = new T.Mesh(bandGeo, bandMat);
      band.name = 'band';
      airdropMesh.add(band);

      const glow = new T.PointLight(0xf5a623, 0, 5, 2);
      glow.name = 'crateGlow'; glow.position.set(0, .65, 1); airdropMesh.add(glow);

      const chuteGeo = new T.ConeGeometry(1.6, 1.1, 16, 1, true);
      const chuteMat = new T.MeshStandardMaterial({ color: 0xffffff, side: T.DoubleSide, roughness: 0.5 });
      const chute = new T.Mesh(chuteGeo, chuteMat);
      chute.position.y = 1.6;
      chute.name = 'chute';
      airdropMesh.add(chute);
      scene.add(airdropMesh);
    }
    airdropMesh.visible = true;
    const targetY = drop.y + 0.45;
    if (!Number.isFinite(airdropMesh.userData.targetY) || Math.abs(airdropMesh.position.y - targetY) > 4) airdropMesh.position.y = targetY;
    airdropMesh.userData.targetY = targetY; airdropMesh.userData.landed = drop.landed;
    container.dataset.airdrop = drop.landed ? 'landed' : 'falling';
    airdropMesh.position.x = drop.x; airdropMesh.position.z = 0;
    const chute = airdropMesh.getObjectByName('chute');
    if (chute) chute.visible = !drop.landed;
    const band = airdropMesh.getObjectByName('band');
    if (band) {
      const colors = { heal: 0x2ec4b6, power: 0xe71d36, armor: 0xff9f1c };
      band.material.color.setHex(colors[drop.buff] || 0xf5a623);
      band.material.emissive.setHex(colors[drop.buff] ? colors[drop.buff] >> 2 : 0x442200);
      const glow = airdropMesh.getObjectByName('crateGlow'); if (glow) glow.color.setHex(colors[drop.buff] || 0xf5a623);
    }
  }

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
      const maxVisibleDots = currentWeather?.trajectoryDots ?? 15;
      const t = (i + 1) * .095;
      const g = 4.91 * (currentWeather?.gravityMod || 1.0);
      const y = origin[1] + velocity.y * t - g * t * t;
      const isHeavy = activeShooter.weapon === 'heavy';
      const windFactor = isHeavy ? (WEAPONS.heavy.windFactor || 1) : (currentWeather?.windAllWeapons ? 0.6 : 0);
      const windX = .5 * wind * (currentWeather?.windMod || 1.0) * windFactor * t * t;
      const x = origin[0] + velocity.x * t + windX;
      const passedImpact = impact?.p && (team === 0 ? x > impact.p[0] + .15 : x < impact.p[0] - .15);
      dot.visible = visible && y > 0 && !passedImpact && (i < maxVisibleDots);
      dot.position.set(x, y, 1.45);
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
  const copySnapshot = data => typeof structuredClone === 'function' ? structuredClone(data) : JSON.parse(JSON.stringify(data));
  function compactReplayFrame(data, events) {
    return copySnapshot({
      mapId: data.mapId, mapName: data.mapName, time: data.time, turn: data.turn, phase: data.phase,
      team: data.team, shooterId: data.shooterId, winner: data.winner, wind: data.wind,
      weather: data.weather, airdrop: data.airdrop, aim: data.aim, aimImpact: data.aimImpact,
      items: data.items, environment: data.environment, projectile: data.projectile, projectiles: data.projectiles, events,
    });
  }
  function captureReplayFrame(data) {
    if (data.turn !== replayTurn) { replayTurn = data.turn; replayFrames = []; replayEventCursor = 0; }
    const events = data.events || [], newestEvent = events.at(-1)?.id || replayEventCursor;
    if (!['flight', 'settle', 'over'].includes(data.phase)) { replayEventCursor = newestEvent; return; }
    const freshEvents = events.filter(event => event.id > replayEventCursor); replayEventCursor = newestEvent;
    replayFrames.push(compactReplayFrame(data, freshEvents));
    if (replayFrames.length > 100) replayFrames.shift();
  }
  function beginReplay(finalSnapshot) {
    if (replay || reducedMotion.matches || finalSnapshot.winner == null || replayFrames.length < 3) return false;
    const frames = replayFrames.slice(-90), eventIds = frames.flatMap(frame => frame.events || []).map(event => event.id).filter(Number.isFinite);
    const shooter = frames[0].items.find(item => item.id === frames[0].shooterId), now = performance.now();
    lastReplayFinal = copySnapshot(finalSnapshot);
    replay = {
      frames, index: 0, playAt: now + 850, lastAt: now + 850, sourceTime: frames[0].time,
      baseSpeed: .72, impactSlowUntil: 0, completeAt: 0, stage: 'shooter',
      shooterP: shooter?.p || [0, 2, 0], weapon: shooter?.weapon || frames[0].projectile?.weapon || 'pebble',
      finalSnapshot: lastReplayFinal,
    };
    lastEvent = eventIds.length ? Math.min(...eventIds) - 1 : lastEvent; eventBaseline = true;
    impactFocus = null; shake = 0;
    container.dataset.replay = 'playing'; container.dataset.replayFrames = String(frames.length); container.dataset.replayStage = 'shooter'; container.dataset.replaySpeed = '0.00';
    update(frames[0], true);
    window.dispatchEvent(new CustomEvent('replay-start', { detail: { weapon: replay.weapon, weaponName: WEAPONS[replay.weapon]?.name || 'Vũ khí' } }));
    window.dispatchEvent(new CustomEvent('weapon-sound', { detail: { type: 'replayStart' } }));
    return true;
  }
  function finishReplay() {
    if (!replay) return;
    const finalSnapshot = replay.finalSnapshot; replay = null; update(finalSnapshot, true);
    container.dataset.replay = 'complete'; window.dispatchEvent(new CustomEvent('replay-end'));
  }
  function replayLast() { return lastReplayFinal ? beginReplay(lastReplayFinal) : false; }
  function triggerImpactPause(duration = 70) {
    if (reducedMotion.matches || replay) return;
    impactPauseUntil = Math.max(impactPauseUntil, performance.now() + duration);
    container.dataset.impactPause = 'active'; container.dataset.impactPauseMs = String(duration);
    window.dispatchEvent(new CustomEvent('weapon-sound', { detail: { type: 'impactWhoosh' } }));
  }
  function triggerShake(amount, x, y, radius = 3) {
    if (reducedMotion.matches) return;
    const distance = Math.hypot(x - viewTarget.x, y - viewTarget.y);
    const attenuation = Math.max(.18, 1 - distance / 36);
    shake = Math.max(shake, amount * attenuation * Math.min(1.35, .7 + radius * .1));
    container.dataset.shakeStrength = shake.toFixed(3);
  }
  function update(data, fromReplay = false) {
    if (!data) return;
    const previousPhase = gamePhase;
    if (!fromReplay) captureReplayFrame(data);
    container.dataset.map = data.mapId;
    container.setAttribute('aria-label', `Đấu trường 3D · ${data.mapName}`);
    if (currentMap !== data.mapId) { reset(); currentMap = data.mapId; applyLightingTheme(currentMap); rebuildMapDecor(); }
    activeShooter = data.items.find(i => i.id === data.shooterId) || null; gamePhase = data.phase; currentWind = data.wind || 0;
    currentWeather = data.weather || null;
    if (currentWeather) {
      container.dataset.weather = currentWeather.type;
      container.dataset.trajectoryDots = String(currentWeather.trajectoryDots ?? 15);
      const isRain = currentWeather.type === 'rain' || currentWeather.type === 'storm';
      rainPoints.visible = isRain && !reducedMotion.matches;
      container.dataset.weatherParticles = isRain ? (reducedMotion.matches ? 'reduced' : 'rain') : 'none';
      if (isRain) {
        rainMat.opacity = currentWeather.type === 'storm' ? 0.85 : 0.45;
      }
    }
    updateAirdrop(data.airdrop);
    const enemies = data.items.filter(i => i.kind === 'resident' && i.team !== data.team && i.hp > 0);
    const enemyX = enemies.length ? enemies.reduce((sum, item) => sum + item.p[0], 0) / enemies.length : 0;
    const enemyY = enemies.length ? enemies.reduce((sum, item) => sum + item.p[1], 0) / enemies.length : 2;
    tacticalTarget.set(activeShooter ? activeShooter.p[0] * .75 + enemyX * .25 : 0, activeShooter ? Math.max(2.5, activeShooter.p[1] * .65 + enemyY * .35 + 1.1) : 2, 0);
    container.dataset.shooter = String(data.shooterId); container.dataset.weapon = activeShooter?.weapon || '';
    container.dataset.wind = currentWind.toFixed(1);
    const environmentItems = Array.isArray(data.environment) ? data.environment : [];
    container.dataset.fuelBarrels = environmentItems.filter(i => i.kind === 'fuelBarrel').length;
    container.dataset.bouncePads = environmentItems.filter(i => i.kind === 'bouncePad').length;
    container.dataset.specialObjects = String(environmentItems.length);
    container.dataset.environmentKinds = [...new Set(environmentItems.map(i => i.kind))].sort().join(',');
    const allItems = [...data.items, ...environmentItems];
    const ids = new Set(allItems.map(i => i.id));
    for (const [id, obj] of objects) if (!ids.has(id)) { scene.remove(obj); objects.delete(id); }
    for (const item of allItems) {
      let obj = objects.get(item.id);
      if (!obj) {
        obj = item.kind === 'resident' ? art.resident(item.team, item.id, item.weapon)
          : interactiveKinds.has(item.kind) ? art.interactive(item) : art.block(item);
        applyKit(obj, item);
        if (item.kind === 'resident') { obj.userData.weaponKey = item.weapon; attachWeaponAsset(obj, item.weapon); }
        obj.userData.decorItem = item; decorateStructure(obj, item);
        scene.add(obj); objects.set(item.id, obj); obj.position.set(item.p[0], item.p[1], item.kind === 'resident' ? 1.3 : item.p[2]); obj.quaternion.fromArray(item.q);
      }
      obj.userData.targetP = new T.Vector3(item.p[0], item.p[1], item.kind === 'resident' ? 1.3 : item.p[2]); obj.userData.targetQ = item.kind === 'resident' ? new T.Quaternion() : new T.Quaternion(...item.q);
      if (obj.userData.cracks) obj.userData.cracks.forEach((c, i) => { c.visible = item.crack === i + 1; });
      if (obj.userData.hp !== undefined && item.hp < obj.userData.hp) obj.userData.hurtUntil = performance.now() / 1000 + .65;
      obj.userData.hp = item.hp; obj.userData.team = item.team;
      const hazardEffect = obj.getObjectByName('hazardEffect');
      if (hazardEffect) hazardEffect.visible = item.kind === 'magnet' || Boolean(item.burning);
      if (item.released) for (const hanger of obj.children.filter(child => child.name === 'hanger')) hanger.visible = false;
      if (item.kind === 'resident' && obj.userData.weaponKey !== item.weapon) { obj.userData.weaponKey = item.weapon; attachWeaponAsset(obj, item.weapon); }
      obj.userData.activeResident = item.kind === 'resident' && item.id === data.shooterId;
      obj.userData.gamePhase = data.phase;
      obj.visible = item.kind !== 'resident' || item.hp > 0;
      if (item.kind === 'resident') {
        let buffMarker = obj.getObjectByName('buffMarker');
        if (item.buff) {
          if (!buffMarker) {
            const bGeo = new T.SphereGeometry(0.22, 8, 8);
            const bMat = new T.MeshBasicMaterial({ color: item.buff.type === 'power' ? 0xe71d36 : 0xff9f1c });
            buffMarker = new T.Mesh(bGeo, bMat);
            buffMarker.name = 'buffMarker';
            buffMarker.position.set(0, 1.4, 0);
            obj.add(buffMarker);
          }
          buffMarker.visible = true;
          buffMarker.material.color.setHex(item.buff.type === 'power' ? 0xe71d36 : 0xff9f1c);
        } else if (buffMarker) {
          buffMarker.visible = false;
        }
      }
    }
    container.dataset.residentModels = String([...objects.values()].filter(obj => obj.userData.assetAnimator).length);
    container.dataset.weaponModels = String([...objects.values()].filter(obj => obj.userData.weaponModel).length);
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
      if (!shot) { shot = sphere(0, 0, 0, 0.29, WEAPONS[data.projectile.weapon].color); shot.userData.weapon = data.projectile.weapon; }
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
        spawnDrillSparks(event.x, event.y);
        window.dispatchEvent(new CustomEvent('weapon-sound', { detail: { type: 'drill' } }));
      }
      if (event.type === 'skill') {
        const sound = event.action === 'cluster' ? 'cluster' : event.action === 'steer' ? 'rocket' : event.action === 'airburst' ? 'pulse' : event.action === 'boost' ? 'boost' : 'shot';
        if (event.action === 'cluster') for (let i = 0; i < 12; i++) addParticle(sphere(event.x, event.y, .6, .08, 0xdc93bd), (Math.random() - .5) * 7, (Math.random() - .5) * 7, 0, .45);
        window.dispatchEvent(new CustomEvent('weapon-sound', { detail: { type: sound } }));
      }
      if (event.type === 'airdrop_spawn') {
        container.dataset.lastAirdropEvent = 'spawn';
        window.dispatchEvent(new CustomEvent('weapon-sound', { detail: { type: 'airdropSpawn' } }));
      }
      if (event.type === 'airdrop_land') {
        for (let i = 0; i < (reducedMotion.matches ? 3 : 10); i++) {
          const dust = sphere(event.x, event.y + .15, .8, .06 + Math.random() * .08, 0xd6b989);
          addParticle(dust, (Math.random() - .5) * 3, .5 + Math.random() * 1.8, (Math.random() - .5), .45 + Math.random() * .3);
        }
        container.dataset.lastAirdropEvent = 'land';
        window.dispatchEvent(new CustomEvent('weapon-sound', { detail: { type: 'airdropLand' } }));
      }
      if (event.type === 'airdrop_remove') {
        const color = event.buff === 'heal' ? 0x2ec4b6 : event.buff === 'power' ? 0xe71d36 : 0xffb43b;
        const count = event.reason === 'destroyed' ? 16 : event.reason === 'collected' ? 12 : 5;
        for (let i = 0; i < (reducedMotion.matches ? Math.min(4, count) : count); i++) {
          addParticle(effectSphere(event.x, event.y + .55, 1, .06 + Math.random() * .09, color, .72), (Math.random() - .5) * 6, 1 + Math.random() * 5, (Math.random() - .5) * 2, .35 + Math.random() * .35);
        }
        container.dataset.lastAirdropEvent = event.reason;
        window.dispatchEvent(new CustomEvent('weapon-sound', { detail: { type: event.reason === 'destroyed' ? 'airdropBreak' : 'airdropCollect' } }));
      }
      if (event.type === 'break' || event.type === 'hit') {
        const count = event.type === 'break' ? MATERIALS[event.material].fragments : 3;
        const profile = DEBRIS_VFX[event.material] || DEBRIS_VFX.stone;
        const origin = event.impact || event.p || [0, 1, 0];
        const normal = new T.Vector3(...(event.normal || [0, 1, 0])).multiplyScalar(-1);
        const force = Math.min(1.8, Math.max(.65, (event.impactStrength || 12) / 18));
        for (let i = 0; i < (reducedMotion.matches ? Math.min(count, 4) : count); i++) {
          const m = art.fragment(event.material, i);
          const local = new T.Vector3((Math.random() - .5) * event.size[0], (Math.random() - .5) * event.size[1], (Math.random() - .5) * event.size[2]);
          local.applyQuaternion(new T.Quaternion(...event.q)); m.position.fromArray(event.p).add(local);
          m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
          addParticle(m,
            normal.x * profile.lateral * force + (Math.random() - .5) * profile.lateral,
            Math.max(1, normal.y * profile.lift * force + 1 + Math.random() * profile.lift),
            (Math.random() - .5) * profile.lateral * .65,
            profile.life + Math.random() * .7, true, false,
            { gravity: profile.gravity, drag: profile.drag, spin: profile.spin });
        }
        spawnMaterialDust(event);
        if (event.type === 'hit') addImpactMark(origin[0], origin[1], event.cause === 'blast' ? 0x241812 : 0x4b3d34, .34 + Math.min(.7, force * .3), event.itemId, event.size);
        container.dataset.lastMaterial = event.material;
        window.dispatchEvent(new CustomEvent('material-sound', { detail: { material: event.material, strength: event.type === 'break' ? 1 : .4 } }));
        if (event.type === 'break' && event.criticalSupport) triggerImpactPause(95);
      }
      if (event.type === 'directHit') triggerImpactPause(70);
      if (event.type === 'shot') {
        const actor = objects.get(event.shooterId); if (actor) { actor.userData.recoil = .25; actor.userData.shotUntil = performance.now() / 1000 + .48; }
        spawnMuzzleFlash(event);
        window.dispatchEvent(new CustomEvent('game-shot'));
      }
      if (event.type === 'blast') {
        const profile = WEAPON_VFX[event.weapon] || WEAPON_VFX.pebble;
        triggerShake(profile.shake, event.x, event.y, event.radius);
        blastLight.color.setHex(profile.core); blastLight.position.set(event.x, Math.max(.5, event.y), 3);
        blastLight.intensity = event.weapon === 'heavy' || event.weapon === 'rocket' ? 52 : 38;
        blastLight.distance = Math.max(18, (event.radius || 3) * 7); blastLight.userData.decayRate = 105;
        spawnWeaponBlast(event);
        focusImpact(event.x, event.y, event.weapon === 'pulse' ? 650 : 480);
        if (fromReplay && replay) {
          replay.stage = 'impact'; replay.impactP = new T.Vector3(event.x, Math.max(1.2, event.y), 0); replay.impactSlowUntil = performance.now() + 720;
          container.dataset.replayStage = 'impact';
        }
        window.dispatchEvent(new CustomEvent('game-blast'));
      }
      if (event.type === 'barrelBlast') {
        triggerShake(.38, event.x, event.y, event.radius);
        blastLight.color.setHex(0xff7b38); blastLight.position.set(event.x, Math.max(.5, event.y), 3); blastLight.intensity = 58; blastLight.distance = 24; blastLight.userData.decayRate = 92;
        for (let i = 0; i < (reducedMotion.matches ? 10 : 34); i++) {
          const m = sphere(event.x, Math.max(.35, event.y), 0, .14 + Math.random() * .28, [0xffee91, 0xff8b38, 0xd84b32, 0x3d4240][i % 4]);
          addParticle(m, (Math.random() - .5) * 13, 2 + Math.random() * 10, (Math.random() - .5) * 6, .65 + Math.random() * .45);
        }
        const ring = new T.Mesh(ringGeometry, barrelRingMaterial); ring.position.set(event.x, Math.max(.35, event.y), 1); ring.scale.setScalar(.4); addParticle(ring, 0, 0, 0, .48, false, true);
        addImpactMark(event.x, event.y, 0x2c1712, 1.45); focusImpact(event.x, event.y, 620);
        container.dataset.lastEnvironmentEvent = 'barrelBlast';
        window.dispatchEvent(new CustomEvent('weapon-sound', { detail: { type: 'barrel' } }));
      }
      if (event.type === 'fireIgnite' || event.type === 'fireTick') {
        const count = event.type === 'fireIgnite' ? 14 : 3;
        for (let i = 0; i < (reducedMotion.matches ? Math.min(3, count) : count); i++) {
          const flame = sphere(event.x + (Math.random() - .5) * .8, event.y + .15, .7, .05 + Math.random() * .09, i % 3 ? 0xff8a3d : 0xffd66e);
          addParticle(flame, (Math.random() - .5) * 1.4, 1.4 + Math.random() * 2.8, (Math.random() - .5), .35 + Math.random() * .25);
        }
        container.dataset.lastEnvironmentEvent = event.type;
      }
      if (event.type === 'glassDrop' || event.type === 'rockDrop' || event.type === 'hazardHit') {
        const material = event.type === 'glassDrop' || event.kind === 'glassTrap' ? 'glass' : 'stone';
        const count = event.type === 'hazardHit' ? 10 : 5;
        for (let i = 0; i < (reducedMotion.matches ? Math.min(3, count) : count); i++) {
          const chip = art.fragment(material, i); chip.position.set(event.x, event.y, .75);
          addParticle(chip, (Math.random() - .5) * 5, 1 + Math.random() * 4, 0, .7, true);
        }
        if (event.type === 'hazardHit') triggerImpactPause(80);
        container.dataset.lastEnvironmentEvent = event.type;
      }
      if (event.type === 'environmentBreak') container.dataset.lastEnvironmentEvent = `${event.kind}Break`;
    }
    if (!fromReplay && data.phase === 'over' && previousPhase !== 'over') {
      lastReplayFinal = copySnapshot(data);
      container.dataset.replay = replayFrames.length >= 3 && !reducedMotion.matches ? 'ready' : 'unavailable';
    }
  }
  const ringGeometry = new T.TorusGeometry(1, .04, 6, 40), flashGeometry = new T.ConeGeometry(.28, 1.1, 8), sparkGeometry = new T.BoxGeometry(.06, .06, .5);
  const impactMarkGeometry = new T.CircleGeometry(.72, 18);
  const ringMaterial = new T.MeshBasicMaterial({ color: 0xffe4aa }), pulseRingMaterial = new T.MeshBasicMaterial({ color: 0x82d4c8 });
  const padRingMaterial = new T.MeshBasicMaterial({ color: 0x86f3dc }), barrelRingMaterial = new T.MeshBasicMaterial({ color: 0xff7b38 });
  function glowMaterial(color, opacity = 1) {
    const material = new T.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: false, blending: T.AdditiveBlending });
    material.color.multiplyScalar(1.7); return material;
  }
  function glowMesh(geometry, color, opacity = 1) {
    const effect = new T.Mesh(geometry, glowMaterial(color, opacity)); effect.userData.effectMaterial = true; return effect;
  }
  function effectSphere(x, y, z, radius, color, opacity = 1) {
    const effect = glowMesh(sphereGeometry, color, opacity); effect.position.set(x, y, z); effect.scale.setScalar(radius); return effect;
  }
  function focusImpact(x, y, duration) {
    if (reducedMotion.matches) return;
    impactFocus = { p: new T.Vector3(x, Math.max(1.2, y), 0), until: performance.now() + duration };
    container.dataset.impactCamera = 'active';
  }
  function addImpactMark(x, y, color, scale = 1, itemId = null, size = null) {
    const mark = new T.Mesh(impactMarkGeometry, new T.MeshBasicMaterial({ color, transparent: true, opacity: .34, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    const target = itemId == null ? null : objects.get(itemId);
    const targetSize = size || target?.userData.decorItem?.size;
    if (target && targetSize) {
      target.updateMatrixWorld(true);
      const local = target.worldToLocal(new T.Vector3(x, Math.max(.18, y), 0));
      mark.position.set(
        T.MathUtils.clamp(local.x, -targetSize[0] * .44, targetSize[0] * .44),
        T.MathUtils.clamp(local.y, -targetSize[1] * .44, targetSize[1] * .44),
        targetSize[2] * .5 + .035
      );
      target.add(mark); mark.userData.attached = true;
    } else {
      mark.position.set(x, Math.max(.18, y), 1.62); scene.add(mark);
    }
    mark.scale.set(scale, scale * .62, 1); mark.rotation.z = Math.random() * Math.PI;
    impactMarks.push({ mesh: mark, life: 9, maxLife: 9 });
    if (impactMarks.length > 18) { const old = impactMarks.shift(); old.mesh.removeFromParent(); old.mesh.material.dispose(); }
    container.dataset.impactMarks = String(impactMarks.length);
    container.dataset.attachedDecals = String(impactMarks.filter(entry => entry.mesh.userData.attached).length);
  }
  function spawnMuzzleFlash(event) {
    const profile = WEAPON_VFX[event.weapon] || WEAPON_VFX.pebble, p = event.p || [0, 1, 0], direction = event.team === 1 ? -1 : 1;
    const flash = glowMesh(flashGeometry, profile.accent); flash.position.set(p[0], p[1], 1.5); flash.rotation.z = -direction * Math.PI / 2;
    addParticle(flash, direction * 1.2, .2, 0, .16);
    for (let i = 0; i < (reducedMotion.matches ? 2 : 7); i++) addParticle(effectSphere(p[0], p[1], 1.5, .055 + Math.random() * .05, profile.core), direction * (2 + Math.random() * 5), (Math.random() - .3) * 3, (Math.random() - .5) * 2, .22 + Math.random() * .16);
    container.dataset.lastWeaponVfx = event.weapon;
  }
  function spawnDrillSparks(x, y) {
    for (let i = 0; i < (reducedMotion.matches ? 3 : 11); i++) {
      const spark = glowMesh(sparkGeometry, i % 2 ? WEAPON_VFX.drill.core : WEAPON_VFX.drill.accent); spark.position.set(x, y, 1.35); spark.rotation.z = Math.random() * Math.PI;
      addParticle(spark, (Math.random() - .5) * 12, (Math.random() - .2) * 8, (Math.random() - .5) * 3, .25 + Math.random() * .3);
    }
  }
  function spawnMaterialDust(event) {
    if (reducedMotion.matches) return;
    const colors = { wood: 0xa86d3f, brick: 0xb85b42, stone: 0x8d918b, glass: 0xc8f4f2 }, color = colors[event.material] || 0x99958c;
    const p = event.impact || event.p || [0, 1, 0], size = event.size || [1, 1, 1];
    const area = Math.min(2.2, Math.max(.75, size[0] * size[1]));
    const density = { wood: .75, brick: 1.25, stone: 1.55, glass: .3 }[event.material] || 1;
    const count = Math.ceil((event.type === 'break' ? 10 : 4) * area * density);
    for (let i = 0; i < count; i++) {
      const material = new T.MeshBasicMaterial({ color, transparent: true, opacity: event.material === 'glass' ? .16 : .3, depthWrite: false });
      const cloud = new T.Mesh(sphereGeometry, material); cloud.userData.effectMaterial = true;
      cloud.position.set(p[0] + (Math.random() - .5) * size[0] * .7, p[1] + (Math.random() - .5) * size[1] * .45, .7 + Math.random() * .7);
      cloud.scale.setScalar(.1 + Math.random() * (event.material === 'stone' ? .28 : .2));
      const heavy = event.material === 'stone' || event.material === 'brick';
      addParticle(cloud, (Math.random() - .5) * (heavy ? 2.4 : 3.8), .3 + Math.random() * (heavy ? 1.5 : 2.8), (Math.random() - .5) * 1.2,
        (heavy ? 1.25 : .85) + Math.random() * .55, false, false,
        { gravity: heavy ? .8 : 1.8, drag: heavy ? 1.7 : 1, grow: heavy ? 1.2 : .65, fade: true });
    }
    container.dataset.collapseDust = event.material;
  }
  function spawnWeaponBlast(event) {
    const profile = WEAPON_VFX[event.weapon] || WEAPON_VFX.pebble, x = event.x, y = Math.max(.3, event.y), compact = reducedMotion.matches;
    const count = compact ? 7 : event.weapon === 'heavy' || event.weapon === 'rocket' ? 28 : 20;
    for (let i = 0; i < count; i++) {
      const smoke = i % 4 === 0, color = smoke ? profile.smoke : i % 2 ? profile.core : profile.accent;
      const particle = smoke ? sphere(x, y, 0, .16 + Math.random() * .28, color) : effectSphere(x, y, 1.15, .1 + Math.random() * .2, color);
      const lateral = event.weapon === 'drill' ? (Math.random() < .5 ? -1 : 1) * (5 + Math.random() * 8) : (Math.random() - .5) * 11;
      addParticle(particle, lateral, Math.random() * (event.weapon === 'bloom' ? 10 : 7), (Math.random() - .5) * 4, .45 + Math.random() * .7);
    }
    const rings = event.weapon === 'pulse' ? 3 : 1;
    for (let i = 0; i < rings; i++) {
      const ring = glowMesh(ringGeometry, i % 2 ? profile.accent : profile.core, .85); ring.position.set(x, y, 1.4 + i * .08); ring.scale.setScalar(.22 + i * .22);
      addParticle(ring, 0, 0, 0, .32 + i * .08, false, true);
    }
    addImpactMark(x, y, event.weapon === 'pulse' ? 0x296e68 : 0x241812, .7 + Math.min(1.2, (event.radius || 2) * .16), event.hitItemId);
    container.dataset.lastWeaponVfx = event.weapon; container.dataset.weaponVfx = 'active';
  }
  function spawnProjectileTrail(projectile) {
    const weapon = projectile.userData.weapon || 'pebble', profile = WEAPON_VFX[weapon] || WEAPON_VFX.pebble, p = projectile.position;
    if (weapon === 'pulse') {
      const ring = glowMesh(ringGeometry, profile.core, .65); ring.position.copy(p); ring.scale.setScalar(.075); addParticle(ring, 0, 0, 0, .2, false, true); return;
    }
    if (weapon === 'drill') {
      const spark = glowMesh(sparkGeometry, profile.core); spark.position.copy(p); spark.rotation.z = Math.atan2(projectile.userData.velocity?.y || 0, projectile.userData.velocity?.x || 1); addParticle(spark, 0, 0, 0, .25); return;
    }
    const main = effectSphere(p.x, p.y, p.z, weapon === 'pebble' ? .055 : .1, profile.core, .72); addParticle(main, 0, .15, 0, .3);
    if (['heavy', 'rocket', 'bloom'].includes(weapon)) addParticle(sphere(p.x, p.y, p.z - .05, .11 + Math.random() * .07, profile.smoke), 0, .2, 0, .48);
  }
  function addParticle(m, vx, vy, vz, life, debris = false, ring = false, options = {}) {
    if (particles.length >= 180) { const old = particles.shift(); old.mesh.removeFromParent(); if (old.mesh.userData.effectMaterial) old.mesh.material.dispose(); }
    scene.add(m); particles.push({ mesh: m, vx, vy, vz, life, maxLife: life, debris, ring,
      gravity: options.gravity ?? (debris ? 12 : 3), drag: options.drag ?? 0, grow: options.grow ?? 0, fade: options.fade ?? false,
      spin: (Math.random() - .5) * (options.spin ?? 7) });
  }
  function reset() {
    aimArrow.visible = false; impactMarker.visible = false; dots.forEach(dot => { dot.visible = false; }); lastEvent = 0; eventBaseline = false; matchWinner = null; activeShooter = null; selection.visible = false;
    rainPoints.visible = false; weatherLight.intensity = 0; currentWeather = null; if (airdropMesh) airdropMesh.visible = false;
    for (const obj of objects.values()) scene.remove(obj); objects.clear();
    if (shot) scene.remove(shot); shot = null; for (const m of projectileMeshes.values()) scene.remove(m); projectileMeshes.clear();
    for (const p of particles) { p.mesh.removeFromParent(); if (p.mesh.userData.effectMaterial) p.mesh.material.dispose(); } particles = [];
    for (const mark of impactMarks) { mark.mesh.removeFromParent(); mark.mesh.material.dispose(); } impactMarks = []; impactFocus = null;
    impactPauseUntil = 0; replayTurn = null; replayFrames = []; replayEventCursor = 0; replay = null; lastReplayFinal = null; shake = 0;
    mapDecor.clear(); currentMap = null; container.dataset.mapDecor = '0'; container.dataset.structureDecor = '0';
    container.dataset.cracked = '0'; container.dataset.fragments = '0'; container.dataset.impactMarks = '0'; container.dataset.attachedDecals = '0'; container.dataset.fuelBarrels = '0'; container.dataset.bouncePads = '0'; container.dataset.airdrop = 'none'; container.dataset.weatherParticles = 'none'; container.dataset.replay = 'idle'; container.dataset.impactPause = 'idle'; delete container.dataset.replayStage; delete container.dataset.weather; delete container.dataset.trajectoryDots; delete container.dataset.lastAirdropEvent; delete container.dataset.lastMaterial; delete container.dataset.collapseDust; delete container.dataset.lastEnvironmentEvent; delete container.dataset.lastWeaponVfx; delete container.dataset.shakeStrength;
  }
  let width, height, composer = null, ssaoPass = null, bloomPass = null, gradePass = null, vignettePass = null;
  function setupPostProcessing() {
    if (renderer.userData.environmentConstrained) {
      composer = null; container.dataset.postprocessing = 'balanced'; container.dataset.bloom = 'false';
      container.dataset.colorGrading = 'balanced';
      return;
    }
    try {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      ssaoPass = new SSAOPass(scene, camera, width, height, 16);
      ssaoPass.kernelRadius = 7; ssaoPass.minDistance = .002; ssaoPass.maxDistance = .09;
      composer.addPass(ssaoPass);
      bloomPass = new UnrealBloomPass(new T.Vector2(width, height), .34, .48, .88);
      composer.addPass(bloomPass);
      gradePass = new ShaderPass(CoastalGradeShader); composer.addPass(gradePass);
      vignettePass = new ShaderPass(VignetteShader);
      vignettePass.uniforms.offset.value = 1.08; vignettePass.uniforms.darkness.value = .62;
      composer.addPass(vignettePass); composer.addPass(new OutputPass());
      container.dataset.postprocessing = 'enabled'; container.dataset.bloom = 'true'; container.dataset.colorGrading = 'coastal-film';
    } catch (error) {
      composer = null; container.dataset.postprocessing = 'fallback'; container.dataset.bloom = 'false';
      container.dataset.colorGrading = 'fallback';
      console.warn('Post-processing disabled:', error);
    }
  }
  function updateRenderQuality() {
    const constrained = renderer.userData.environmentConstrained || reducedMotion.matches || width < 900 || height < 500 || (navigator.deviceMemory && navigator.deviceMemory <= 4);
    if (ssaoPass) ssaoPass.enabled = !constrained;
    if (bloomPass) bloomPass.strength = constrained ? .22 : .34;
    container.dataset.postQuality = constrained ? 'balanced' : 'high';
    container.dataset.ambientOcclusion = String(Boolean(ssaoPass?.enabled));
  }
  function resize() {
    width = container.clientWidth; height = container.clientHeight; renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
    composer?.setSize(width, height); updateRenderQuality();
  }
  window.addEventListener('resize', resize); resize(); setupPostProcessing(); updateRenderQuality();
  reducedMotion.addEventListener?.('change', updateRenderQuality);
  let lastTime = performance.now();
  function render(now) {
    requestAnimationFrame(render); const dt = Math.min(.05, (now - lastTime) / 1000); lastTime = now;
    if (replay && now >= replay.playAt) {
      if (replay.stage === 'shooter') { replay.stage = 'projectile'; container.dataset.replayStage = 'projectile'; replay.lastAt = now; }
      const replaySpeed = replay.stage === 'impact' || now < replay.impactSlowUntil ? .24 : replay.baseSpeed;
      container.dataset.replaySpeed = replaySpeed.toFixed(2);
      replay.sourceTime += Math.max(0, now - replay.lastAt) / 1000 * replaySpeed; replay.lastAt = now;
      while (replay.index + 1 < replay.frames.length && replay.frames[replay.index + 1].time <= replay.sourceTime) update(replay.frames[++replay.index], true);
      if (replay.index === replay.frames.length - 1) {
        replay.completeAt ||= now + 850;
        if (now >= replay.completeAt) finishReplay();
      } else if (now - replay.playAt > 8000) finishReplay();
    }
    const impactPaused = now < impactPauseUntil;
    if (!impactPaused && container.dataset.impactPause === 'active') container.dataset.impactPause = 'idle';
    const presentationScale = impactPaused ? .25 : replay ? (replay.stage === 'impact' || now < replay.impactSlowUntil ? .24 : replay.baseSpeed) : 1;
    const visualDt = dt * presentationScale;
    const portrait = width / height < 1.15;
    const distance = Math.max(48, 88.5 / (width / height));
    const closeMove = mode === 'game' && gamePhase === 'move' && activeShooter && !overview && !reducedMotion.matches;
    const tacticalAim = mode === 'game' && gamePhase === 'aim' && activeShooter && !overview && !reducedMotion.matches;
    const focusingImpact = impactFocus && now < impactFocus.until;
    const replayShooter = replay?.stage === 'shooter' ? activeShooter : null;
    const replayProjectile = replay?.stage === 'projectile' ? projectileMeshes.values().next().value : null;
    const replayImpact = replay?.stage === 'impact' ? replay.impactP : null;
    if (impactFocus && !focusingImpact) { impactFocus = null; container.dataset.impactCamera = 'idle'; }
    const target = focusingImpact ? impactFocus.p
      : replayImpact ? replayImpact
      : replayShooter ? new T.Vector3(replayShooter.p[0], replayShooter.p[1] + 1.1, 0)
      : replayProjectile ? new T.Vector3(replayProjectile.position.x, Math.max(1.5, replayProjectile.position.y), 0)
      : closeMove ? new T.Vector3(activeShooter.p[0] + (activeShooter.team === 0 ? 3 : -3), activeShooter.p[1] + 1.2, 0)
      : tacticalAim ? tacticalTarget
      : new T.Vector3(mode === 'lobby' && !portrait ? -4.6 : 0, mode === 'home' ? 10 : 2, 0);
    const desiredDistance = focusingImpact || replayImpact ? Math.max(29, 48 / (width / height)) : replayShooter ? Math.max(20, 32 / (width / height)) : replayProjectile ? Math.max(25, 40 / (width / height)) : closeMove ? Math.max(23, 36 / (width / height)) : tacticalAim ? Math.max(44, 78 / (width / height)) : mode === 'home' ? Math.max(distance, 62) : distance;
    const blend = reducedMotion.matches ? 1 : 1 - Math.exp(-visualDt * 5);
    viewTarget.lerp(target, blend); viewDistance += (desiredDistance - viewDistance) * blend;
    camera.position.set(viewTarget.x + (mode === 'lobby' && !portrait ? 6.6 : 0), viewTarget.y + Math.max(10, viewDistance * .32), viewDistance);
    const denseGrass = !renderer.userData.environmentConstrained && width >= 760 && viewDistance < 62;
    grassNear.visible = denseGrass; grassFar.visible = !denseGrass;
    container.dataset.grassLod = denseGrass ? 'dense' : 'sparse';
    grassUniforms.uWind.value = reducedMotion.matches ? 0 : currentWind;
    if (!reducedMotion.matches) grassUniforms.uTime.value = now / 1000;
    if (airdropMesh?.visible) {
      const dropBlend = reducedMotion.matches ? 1 : 1 - Math.exp(-dt * 12);
      airdropMesh.position.y += (airdropMesh.userData.targetY - airdropMesh.position.y) * dropBlend;
      const chute = airdropMesh.getObjectByName('chute');
      if (chute?.visible) chute.rotation.z = reducedMotion.matches ? 0 : Math.sin(now / 260) * .09 + currentWind * .025;
      const glow = airdropMesh.getObjectByName('crateGlow');
      if (glow) glow.intensity = airdropMesh.userData.landed && !reducedMotion.matches ? 2.2 + Math.sin(now / 230) * .7 : 0;
    }
    if (currentWeather?.type === 'storm' && !reducedMotion.matches) {
      const lightningPhase = (now / 1000) % 8;
      weatherLight.intensity = lightningPhase < .08 ? 22 * (1 - lightningPhase / .08) : lightningPhase > .18 && lightningPhase < .23 ? 8 * (1 - (lightningPhase - .18) / .05) : 0;
    } else weatherLight.intensity = 0;
    if (currentWeather?.type === 'fog') {
      scene.fog.near = Math.max(15, viewDistance * 0.4);
      scene.fog.far = Math.max(55, viewDistance * 1.1);
      scene.fog.color.setHex(0xb2c2cf);
    } else {
      scene.fog.near = Math.max(80, viewDistance + 30);
      scene.fog.far = Math.max(190, viewDistance + 140);
      scene.fog.color.setHex(0x9bd8ff);
    }
    if (rainPoints.visible && !reducedMotion.matches) {
      const pos = rainGeo.attributes.position.array;
      const isStorm = currentWeather?.type === 'storm';
      const fallSpeed = isStorm ? dt * 34 : dt * 22;
      const windPush = isStorm ? dt * (currentWind * 5 - 6) : dt * (currentWind * 2);
      for (let i = 0; i < rainCount; i++) {
        pos[i * 3 + 1] -= fallSpeed;
        pos[i * 3] += windPush;
        if (pos[i * 3 + 1] < 0) {
          pos[i * 3 + 1] = 22 + Math.random() * 3;
          pos[i * 3] = (Math.random() - 0.5) * 60;
        }
      }
      rainGeo.attributes.position.needsUpdate = true;
    }
    camera.lookAt(viewTarget);
    container.dataset.cameraMode = focusingImpact || replayImpact ? 'replay-impact' : replayShooter ? 'replay-shooter' : replayProjectile ? 'replay-projectile' : closeMove ? 'shooter' : tacticalAim ? 'tactical' : 'overview'; container.dataset.cameraX = viewTarget.x.toFixed(2);
    selection.visible = mode === 'game' && ['move', 'aim'].includes(gamePhase) && Boolean(activeShooter);
    if (selection.visible) selection.position.set(activeShooter.p[0], activeShooter.p[1] + .12, 1.55);
    if (shake > 0 && !reducedMotion.matches) {
      camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake;
      camera.rotation.z += (Math.random() - .5) * shake * .018; shake *= Math.pow(.88, dt * 60);
    }
    for (const obj of objects.values()) {
      obj.userData.moving = obj.position.distanceToSquared(obj.userData.targetP) > .001;
      const followSpeed = obj.userData.rig ? 9 : 22;
      obj.position.lerp(obj.userData.targetP, Math.min(1, visualDt * followSpeed)); obj.quaternion.slerp(obj.userData.targetQ, Math.min(1, visualDt * followSpeed));
      art.animateResident(obj, now, reducedMotion.matches, matchWinner);
      const animator = obj.userData.assetAnimator;
      if (animator) {
        const hurt = now / 1000 < obj.userData.hurtUntil;
        const shooting = now / 1000 < (obj.userData.shotUntil || 0);
        const next = matchWinner === obj.userData.team ? 'celebrate' : hurt ? 'hit' : shooting ? 'shoot' : obj.userData.moving ? 'move' : obj.userData.activeResident && ['aim', 'flight'].includes(obj.userData.gamePhase) ? 'aim' : 'idle';
        if (animator.current !== next) {
          const previous = animator.actions[animator.current], action = animator.actions[next];
          const blend = next === 'shoot' ? .035 : .12;
          previous.fadeOut(blend); action.reset().fadeIn(blend).play(); animator.current = next;
        }
        animator.mixer.timeScale = reducedMotion.matches ? 0 : presentationScale; animator.mixer.update(dt);
        if (obj.userData.activeResident) {
          container.dataset.residentAnimation = next;
          container.dataset.activeWeaponModel = obj.userData.assetWeapon || 'fallback';
        }
      }
      if (obj.userData.gun) {
        const recoil = obj.userData.recoil || 0; obj.userData.gun.position.x = (obj.userData.team === 0 ? -1 : 1) * recoil;
        obj.userData.recoil = Math.max(0, recoil - visualDt * .7);
      }
      const field = obj.getObjectByName('hazardEffect');
      if (field?.visible && obj.userData.environmentKind === 'magnet' && !reducedMotion.matches) field.rotation.z += visualDt * 1.4;
    }
    for (const mesh of projectileMeshes.values()) {
      if (!mesh.userData.serverP) continue;
      const age = Math.min(.12, Math.max(0, (now - mesh.userData.snapshotAt) / 1000)) * presentationScale;
      const predicted = mesh.userData.serverP.clone().addScaledVector(mesh.userData.velocity, age);
      const g = 4.91 * (currentWeather?.gravityMod || 1.0);
      predicted.y -= g * age * age;
      const isHeavy = mesh.userData.weapon === 'heavy';
      const windFactor = isHeavy ? (WEAPONS.heavy.windFactor || 1) : (currentWeather?.windAllWeapons ? 0.6 : 0);
      predicted.x += .5 * currentWind * (currentWeather?.windMod || 1.0) * windFactor * age * age;
      mesh.position.lerp(predicted, reducedMotion.matches ? 1 : 1 - Math.exp(-visualDt * 28));
    }
    if (now - trailAt > 55 && !reducedMotion.matches) {
      const trails = [...projectileMeshes.values()];
      if (shot) trails.push(shot);
      if (trails.length) {
        trailAt = now;
        for (const projectile of trails) spawnProjectileTrail(projectile);
      }
    }
    particles = particles.filter(p => {
      p.life -= visualDt; if (p.life <= 0) { p.mesh.removeFromParent(); if (p.mesh.userData.effectMaterial) p.mesh.material.dispose(); return false; }
      if (p.fade && p.mesh.material?.transparent) p.mesh.material.opacity *= Math.max(0, 1 - visualDt * 1.6 / Math.max(.2, p.life / p.maxLife));
      if (p.ring) { p.mesh.scale.addScalar(visualDt * 9); if (p.mesh.material?.transparent) p.mesh.material.opacity = Math.min(1, p.life / p.maxLife); return true; }
      p.vy -= p.gravity * visualDt;
      const damping = Math.exp(-p.drag * visualDt); p.vx *= damping; p.vy *= damping; p.vz *= damping;
      p.mesh.position.x += p.vx * visualDt; p.mesh.position.y += p.vy * visualDt; p.mesh.position.z += p.vz * visualDt;
      if (p.debris) {
        if (p.mesh.position.y < .12) { p.mesh.position.y = .12; p.vy = Math.abs(p.vy) * p.mesh.userData.bounce; p.vx *= .7; p.vz *= .7; p.spin *= .65; }
        p.mesh.rotation.x += p.spin * visualDt; p.mesh.rotation.z += p.spin * visualDt * .6;
        if (p.life < .5) p.mesh.scale.multiplyScalar(Math.max(0, 1 - visualDt * 5));
      } else if (p.grow) p.mesh.scale.multiplyScalar(1 + visualDt * p.grow);
      else p.mesh.scale.multiplyScalar(1 - visualDt * 1.8);
      return true;
    });
    impactMarks = impactMarks.filter(mark => {
      mark.life -= visualDt; mark.mesh.material.opacity = .28 * Math.min(1, mark.life / 1.5);
      if (mark.life > 0) return true;
      mark.mesh.removeFromParent(); mark.mesh.material.dispose(); return false;
    });
    container.dataset.fragments = particles.filter(p => p.debris).length;
    container.dataset.vfxParticles = String(particles.filter(p => !p.debris).length); container.dataset.impactMarks = String(impactMarks.length);
    container.dataset.attachedDecals = String(impactMarks.filter(mark => mark.mesh.userData.attached).length);
    blastLight.intensity = Math.max(0, blastLight.intensity - visualDt * blastLight.userData.decayRate);

    if (!reducedMotion.matches) {
      pennants.forEach((f, i) => { f.rotation.y = currentWind * .11 + Math.sin(now / 650 + i) * (.04 + Math.abs(currentWind) * .035); });
      treeCrowns.forEach((c, i) => { c.rotation.z = Math.sin(now / 1900 + i) * .025; });
      environment.animate(now, camera);
      birds.forEach(({ bird, left, right }, i) => {
        bird.position.set(Math.sin(now / 14000 + i * 2) * 32, 14 + i * 1.1 + Math.sin(now / 2500 + i) * .5, -23 - i * 4);
        left.rotation.z = Math.sin(now / 190 + i) * .35; right.rotation.z = -left.rotation.z;
      });
    }
    if (composer) composer.render(dt); else renderer.render(scene, camera);
  }
  requestAnimationFrame(render);
  function residentMotion() {
    const resident = [...objects.values()].find(obj => obj.userData.activeResident && obj.userData.assetAnimator);
    const model = resident?.userData.assetModel;
    const rotation = name => model?.getObjectByName(name)?.rotation.z || 0;
    return { state: resident?.userData.assetAnimator?.current || 'none', head: rotation('Head'), armL: rotation('Arm_L'), armR: rotation('Arm_R') };
  }
  return { update, updateAim, reset, aimPreview, skipReplay: finishReplay, replayLast, environmentMotion: environment.motionSample, residentMotion, canReplay: () => Boolean(lastReplayFinal && !reducedMotion.matches), setOverview: value => { overview = value; }, setMode: value => { mode = value; } };
}
