import * as T from 'three';
import { RGBELoader } from '/vendor/three-addons/loaders/RGBELoader.js';
import { RoomEnvironment } from '/vendor/three-addons/environments/RoomEnvironment.js';

// The arena, sea, coast, boats and clouds are all world-space geometry.
// None of this scenery enters the server's physics simulation.
export function createEnvironment(scene, renderer) {
  const pmrem = new T.PMREMGenerator(renderer); pmrem.compileEquirectangularShader();
  const fallback = pmrem.fromScene(new RoomEnvironment(), .04).texture;
  let environmentTexture = fallback;
  const waterMaterials = [];
  scene.environment = fallback; scene.environmentIntensity = .36;
  const lightingReady = new Promise(resolve => {
    new RGBELoader().load('/assets/environment/studio_small_09_1k.hdr', hdr => {
      environmentTexture = pmrem.fromEquirectangular(hdr).texture; scene.environment = environmentTexture;
      waterMaterials.forEach(water => {
        water.uniforms.uEnvironment.value = environmentTexture; water.envMap = environmentTexture; water.needsUpdate = true;
      });
      hdr.dispose(); fallback.dispose(); pmrem.dispose(); resolve('hdri');
    }, undefined, () => { pmrem.dispose(); resolve('procedural'); });
  });
  scene.background = new T.Color('#63a9d2');
  scene.fog = new T.Fog('#a5cbd0', 105, 290);

  const sky = new T.Mesh(new T.SphereGeometry(220, 32, 16), new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, depthTest: false, fog: false,
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vDirection = normalize(world.xyz - cameraPosition);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vDirection;
      void main() {
        vec3 ray = normalize(vDirection);
        vec3 horizon = vec3(.36, .69, .88), middle = vec3(.16, .48, .78), zenith = vec3(.05, .20, .52);
        vec3 color = mix(horizon, middle, smoothstep(-.08, .28, ray.y));
        color = mix(color, zenith, smoothstep(.2, .82, ray.y));
        float haze = exp(-abs(ray.y) * 14.0);
        color = mix(color, vec3(.72, .82, .88), haze * .08);
        float sunDot = max(dot(ray, normalize(vec3(-.48, .34, -.81))), 0.0);
        color += vec3(1.0, .70, .38) * pow(sunDot, 18.0) * .17;
        color += vec3(1.0, .88, .68) * pow(sunDot, 900.0) * .75;
        float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - .5;
        color += dither / 255.0;
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `
  }));
  sky.onBeforeRender = (_renderer, _scene, camera) => { sky.position.copy(camera.position); sky.updateMatrixWorld(); };
  sky.name = '3D sky dome'; sky.renderOrder = -1000; scene.add(sky);

  const gl = renderer.getContext(), debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const gpuName = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : '';
  const constrained = Boolean(navigator.webdriver || (navigator.deviceMemory && navigator.deviceMemory <= 4) || /swiftshader|software/i.test(gpuName));
  renderer.userData ||= {}; renderer.userData.environmentConstrained = constrained;
  function normalMap(seed) {
    const size = 64, heights = new Float32Array(size * size), data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x;
      heights[i] = Math.sin((x + seed * 7) * .39) * .48 + Math.sin((y - seed * 11) * .53) * .32
        + Math.sin((x + y + seed * 17) * .17) * .2;
    }
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const sample = (sx, sy) => heights[((sy + size) % size) * size + (sx + size) % size];
      const nx = (sample(x - 1, y) - sample(x + 1, y)) * .7;
      const ny = (sample(x, y - 1) - sample(x, y + 1)) * .7;
      const n = new T.Vector3(nx, ny, 1).normalize(), i = (y * size + x) * 4;
      data[i] = (n.x * .5 + .5) * 255; data[i + 1] = (n.y * .5 + .5) * 255; data[i + 2] = (n.z * .5 + .5) * 255; data[i + 3] = 255;
    }
    const texture = new T.DataTexture(data, size, size); texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.colorSpace = T.NoColorSpace; texture.needsUpdate = true; return texture;
  }
  const normalA = normalMap(3), normalB = normalMap(11);
  function createWaterMaterial(innerCutoff) { const waterMaterial = new T.ShaderMaterial({
    fog: true,
    defines: { ENVMAP_TYPE_CUBE_UV: '' },
    uniforms: T.UniformsUtils.merge([T.UniformsLib.fog, {
      uTime: { value: 0 },
      uInnerCutoff: { value: innerCutoff }, uEnvironment: { value: environmentTexture },
      uNormalA: { value: normalA }, uNormalB: { value: normalB },
      uShallow: { value: new T.Color('#238d9d') }, uDeep: { value: new T.Color('#104c73') },
      uSky: { value: new T.Color('#a7d3dc') }, uFoam: { value: new T.Color('#e8f5ef') },
      uSunDirection: { value: new T.Vector3(-.45, .72, .52).normalize() }
    }]),
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorld; varying vec3 vNormal; varying float vCrest, vSlope, vGridDistance;
      #include <fog_pars_vertex>
      void wave(vec2 direction, float steepness, float wavelength, float speed, vec2 origin, inout vec3 p, inout vec2 gradient) {
        direction = normalize(direction); float k = 6.2831853 / wavelength;
        float phase = k * dot(direction, origin) + uTime * speed * sqrt(9.81 * k);
        float amplitude = steepness / k;
        p.xy += direction * amplitude * cos(phase);
        p.z += amplitude * sin(phase);
        gradient += direction * steepness * cos(phase);
      }
      void main() {
        vec3 p = position; vec2 origin = p.xy; vec2 gradient = vec2(0.0);
        wave(vec2(.92,.38), .085, 30.0, .72, origin, p, gradient);
        wave(vec2(.48,.88), .075, 19.0, .83, origin, p, gradient);
        wave(vec2(-.36,.93), .068, 12.0, .94, origin, p, gradient);
        wave(vec2(.78,-.62), .058, 7.5, 1.04, origin, p, gradient);
        wave(vec2(-.82,-.57), .046, 4.4, 1.16, origin, p, gradient);
        wave(vec2(.18,.98), .038, 2.6, 1.3, origin, p, gradient);
        wave(vec2(.98,-.18), .03, 1.45, 1.46, origin, p, gradient);
        wave(vec2(-.61,.79), .022, .78, 1.62, origin, p, gradient);
        vCrest = p.z; vSlope = length(gradient); vGridDistance = max(abs(position.x), abs(position.y));
        vNormal = normalize(mat3(modelMatrix) * normalize(vec3(-gradient.x, -gradient.y, 1.0)));
        vec4 world = modelMatrix * vec4(p, 1.0); vWorld = world.xyz;
        vec4 mvPosition = viewMatrix * world; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      uniform float uTime, uInnerCutoff; uniform vec3 uShallow, uDeep, uSky, uFoam, uSunDirection;
      uniform sampler2D uEnvironment, uNormalA, uNormalB;
      varying vec3 vWorld, vNormal; varying float vCrest, vSlope, vGridDistance;
      #include <fog_pars_fragment>
      #include <cube_uv_reflection_fragment>
      float boxDistance(vec2 point, vec2 bounds) {
        vec2 q = abs(point) - bounds; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
      }
      void main() {
        if (vGridDistance < uInnerCutoff) discard;
        vec2 uvA = vWorld.xz * .045 + vec2(uTime * .018, uTime * .011);
        vec2 uvB = mat2(.8,-.6,.6,.8) * vWorld.xz * .075 + vec2(-uTime * .013, uTime * .021);
        vec3 detailA = texture2D(uNormalA, uvA).xyz * 2.0 - 1.0;
        vec3 detailB = texture2D(uNormalB, uvB).xyz * 2.0 - 1.0;
        vec3 normal = normalize(vNormal + vec3(detailA.x + detailB.x, 0.0, detailA.y + detailB.y) * .14);
        vec3 viewDirection = normalize(cameraPosition - vWorld);
        float fresnel = .035 + .965 * pow(1.0 - max(dot(viewDirection, normal), 0.0), 5.0);
        float arenaShore = abs(boxDistance(vWorld.xz, vec2(29.15, 11.55)));
        float leftShore = abs(length((vWorld.xz - vec2(-59.0, -51.0)) / vec2(43.0, 27.0)) - 1.0) * 22.0;
        float rightShore = abs(length((vWorld.xz - vec2(60.0, -54.0)) / vec2(39.0, 24.0)) - 1.0) * 21.0;
        float shoreDepth = min(arenaShore, min(leftShore, rightShore));
        float depth = smoothstep(.35, 13.0, shoreDepth);
        vec3 color = mix(uShallow, uDeep, depth * .88);
        vec3 reflectionDirection = reflect(-viewDirection, normal);
        vec3 reflection = textureCubeUV(uEnvironment, reflectionDirection, .16).rgb;
        color = mix(color, reflection, fresnel * .68);
        float sunGlint = pow(max(dot(reflect(-uSunDirection, normal), viewDirection), 0.0), 70.0);
        color += vec3(1.0, .79, .51) * sunGlint * .42;
        float breakup = texture2D(uNormalB, uvA * 1.7 - uvB * .3).r;
        float crestFoam = smoothstep(.18, .34, vSlope) * smoothstep(.04, .28, vCrest) * (.35 + breakup * .45);
        float shoreFoam = (1.0 - smoothstep(.15, 1.65, shoreDepth)) * smoothstep(.28, .72, breakup + sin(uTime * 1.7 + shoreDepth * 3.0) * .18);
        color = mix(color, uFoam, clamp(crestFoam + shoreFoam * .72, 0.0, .78));
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `
  }); waterMaterial.envMap = environmentTexture; waterMaterials.push(waterMaterial); return waterMaterial; }
  const ocean = new T.Group(); ocean.name = 'Projected ocean LOD'; ocean.position.set(0, -4.55, -35); scene.add(ocean);
  const lods = constrained ? [[96, 48, 0], [250, 30, 44], [560, 18, 115]] : [[96, 88, 0], [250, 52, 44], [560, 30, 115]];
  const waters = lods.map(([size, segments, inner], index) => {
    const water = new T.Mesh(new T.PlaneGeometry(size, size, segments, segments), createWaterMaterial(inner));
    water.name = `Ocean LOD ${index}`; water.rotation.x = -Math.PI / 2; water.frustumCulled = false; ocean.add(water); return water;
  });
  const splashCount = constrained ? 32 : 72, splashPositions = new Float32Array(splashCount * 3);
  const splashes = Array.from({ length: splashCount }, () => ({ life: 0, vx: 0, vy: 0, vz: 0 }));
  splashPositions.fill(-100);
  const splashGeometry = new T.BufferGeometry();
  splashGeometry.setAttribute('position', new T.BufferAttribute(splashPositions, 3).setUsage(T.DynamicDrawUsage));
  const splashCanvas = document.createElement('canvas'); splashCanvas.width = splashCanvas.height = 32;
  const splashContext = splashCanvas.getContext('2d'), splashGradient = splashContext.createRadialGradient(16, 16, 1, 16, 16, 15);
  splashGradient.addColorStop(0, 'rgba(255,255,255,.95)'); splashGradient.addColorStop(.45, 'rgba(235,249,246,.72)'); splashGradient.addColorStop(1, 'rgba(235,249,246,0)');
  splashContext.fillStyle = splashGradient; splashContext.fillRect(0, 0, 32, 32);
  const splashTexture = new T.CanvasTexture(splashCanvas);
  const splashPoints = new T.Points(splashGeometry, new T.PointsMaterial({ map: splashTexture, color: 0xeaf8f2, size: .42, transparent: true, opacity: .75, depthWrite: false, blending: T.AdditiveBlending }));
  splashPoints.name = 'Rock wave spray'; splashPoints.frustumCulled = false; scene.add(splashPoints);
  let splashCursor = 0, lastSplash = 0;
  function spawnSplash(now) {
    if (now - lastSplash < (constrained ? 240 : 140)) return; lastSplash = now;
    const burst = constrained ? 2 : 4, center = -25 + Math.random() * 50;
    for (let j = 0; j < burst; j++) {
      const index = splashCursor++ % splashCount, splash = splashes[index], offset = index * 3;
      splash.life = .5 + Math.random() * .55; splash.vx = (Math.random() - .5) * 1.2;
      splash.vy = .75 + Math.random() * 1.45; splash.vz = (Math.random() - .5) * .7;
      splashPositions[offset] = center + (Math.random() - .5) * 2.2;
      splashPositions[offset + 1] = -4.22 + Math.random() * .18;
      splashPositions[offset + 2] = 11.1 + (Math.random() - .5) * .9;
    }
  }
  function updateSplashes(dt) {
    for (let index = 0; index < splashes.length; index++) {
      const splash = splashes[index], offset = index * 3; if (splash.life <= 0) continue;
      splash.life -= dt; if (splash.life <= 0) { splashPositions[offset + 1] = -100; continue; }
      splash.vy -= 2.8 * dt; splashPositions[offset] += splash.vx * dt;
      splashPositions[offset + 1] += splash.vy * dt; splashPositions[offset + 2] += splash.vz * dt;
    }
    splashGeometry.attributes.position.needsUpdate = true;
  }

  const palette = new Map();
  function material(color) {
    if (!palette.has(color)) palette.set(color, new T.MeshLambertMaterial({ color }));
    return palette.get(color);
  }
  function shape(geometry, color, position, scale, parent = scene) {
    const object = new T.Mesh(geometry, material(color)); object.position.set(...position); object.scale.set(...scale);
    object.castShadow = false; object.receiveShadow = false; parent.add(object); return object;
  }
  const rock = new T.IcosahedronGeometry(1, 1), ball = new T.SphereGeometry(1, 12, 8);
  const cube = new T.BoxGeometry(1, 1, 1), cylinder = new T.CylinderGeometry(1, 1, 1, 12);
  const roofGeometry = new T.ConeGeometry(1, 1, 4);
  const headlands = [
    { side: -1, x: -59, z: -51, rx: 43, rz: 27 },
    { side: 1, x: 60, z: -54, rx: 39, rz: 24 }
  ];
  function coastHeight(land, x, z) {
    const r = Math.min(1, Math.hypot((x - land.x) / land.rx, (z - land.z) / land.rz));
    return -4.65 + 16 * Math.pow(1 - r, .7)
      + (Math.sin(x * .27 + z * .11) + Math.sin(x * .53 - z * .38) * .45) * (1 - r) * 2.2;
  }
  for (const land of headlands) {
    // Concentric height rings form real sloped terrain rather than stacked giant rocks.
    const segments = 28, radii = [0, .18, .36, .54, .7, .84, .94, 1];
    const vertices = [], colors = [], indices = [];
    for (const r of radii) for (let i = 0; i < segments; i++) {
      const angle = i / segments * Math.PI * 2;
      const edge = 1 + (Math.sin(angle * 5 + land.side) * .045 + Math.sin(angle * 9) * .025) * r;
      const x = land.x + Math.cos(angle) * land.rx * r * edge;
      const z = land.z + Math.sin(angle) * land.rz * r * edge;
      const y = coastHeight(land, x, z);
      vertices.push(x, y, z);
      const color = new T.Color(y > 4 ? 0x829973 : y > 0 ? 0x99a084 : y > -2 ? 0xa6a08d : 0x82837a);
      color.multiplyScalar(.92 + .08 * Math.sin(x * .45 + z * .31));
      colors.push(color.r, color.g, color.b);
    }
    for (let ring = 0; ring < radii.length - 1; ring++) for (let i = 0; i < segments; i++) {
      const a = ring * segments + i, b = ring * segments + (i + 1) % segments;
      const c = (ring + 1) * segments + i, d = (ring + 1) * segments + (i + 1) % segments;
      indices.push(a, b, c, b, d, c);
    }
    const terrain = new T.BufferGeometry(); terrain.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
    terrain.setAttribute('color', new T.Float32BufferAttribute(colors, 3)); terrain.setIndex(indices); terrain.computeVertexNormals();
    const coast = new T.Mesh(terrain, new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide }));
    coast.name = land.side < 0 ? 'Village headland' : 'Lighthouse headland'; scene.add(coast);
    const stones = new T.InstancedMesh(rock, material(0xffffff), 14), instance = new T.Object3D();
    stones.name = 'Headland rock clusters'; scene.add(stones);
    for (let i = 0; i < 14; i++) {
      const angle = .13 * Math.PI + i / 13 * .74 * Math.PI;
      const r = .76 + i % 4 * .055;
      const x = land.x + Math.cos(angle) * land.rx * r, z = land.z + Math.sin(angle) * land.rz * r;
      const size = 1.0 + i % 5 * .4;
      instance.position.set(x, coastHeight(land, x, z) + size * .28, z);
      instance.scale.set(size * 1.4, size * .8, size); instance.rotation.set(i * .13, i * 1.7, i * .3); instance.updateMatrix();
      stones.setMatrixAt(i, instance.matrix); stones.setColorAt(i, new T.Color(i % 3 ? 0xa39d8c : 0x787e77));
    }
    stones.computeBoundingSphere();
  }
  // The left slope carries a small stepped village; roofs follow the terrain.
  const village = headlands[0];
  const houses = new T.InstancedMesh(cube, material(0xffffff), 12);
  const roofs = new T.InstancedMesh(roofGeometry, material(0xffffff), 12);
  const windows = new T.InstancedMesh(cube, material(0x63818a), 12);
  const instance = new T.Object3D(); scene.add(houses, roofs, windows);
  houses.name = 'Hillside houses'; roofs.name = 'Terracotta roofs'; windows.name = 'Village windows';
  for (let i = 0; i < 12; i++) {
    const x = -36 - i % 4 * 7.3, z = -42 - Math.floor(i / 4) * 6.3;
    const base = coastHeight(village, x, z), height = 2.5 + i % 3 * .6;
    instance.rotation.set(0, 0, 0); instance.position.set(x, base + height / 2, z); instance.scale.set(3.3, height, 3); instance.updateMatrix();
    houses.setMatrixAt(i, instance.matrix); houses.setColorAt(i, new T.Color([0xf0dac0, 0xe7c1ad, 0xe3d9bd, 0xd8e0cf][i % 4]));
    instance.rotation.y = Math.PI / 4; instance.position.set(x, base + height + .85, z); instance.scale.set(2.45, 1.7, 2.25); instance.updateMatrix();
    roofs.setMatrixAt(i, instance.matrix); roofs.setColorAt(i, new T.Color(i % 3 ? 0xb97960 : 0xc68c69));
    instance.rotation.y = 0; instance.position.set(x, base + height * .55, z + 1.53); instance.scale.set(.75, .78, .08); instance.updateMatrix();
    windows.setMatrixAt(i, instance.matrix);
  }
  houses.computeBoundingSphere(); roofs.computeBoundingSphere(); windows.computeBoundingSphere();
  const trunks = new T.InstancedMesh(cylinder, material(0x806b52), 9);
  const leaves = new T.InstancedMesh(ball, material(0xffffff), 18);
  trunks.name = 'Coastal trees'; leaves.name = 'Coastal canopies'; scene.add(trunks, leaves);
  let treeIndex = 0;
  for (const land of headlands) for (let i = 0; i < (land.side < 0 ? 6 : 3); i++) {
    const angle = i * 2.399 + (land.side < 0 ? .5 : 1.3), r = .5 + i % 4 * .075;
    const x = land.x + Math.cos(angle) * land.rx * r, z = land.z + Math.sin(angle) * land.rz * r;
    const y = coastHeight(land, x, z), height = 2.2 + i % 3 * .45;
    instance.rotation.set(0, 0, 0); instance.position.set(x, y + height / 2, z); instance.scale.set(.13, height, .13); instance.updateMatrix();
    trunks.setMatrixAt(treeIndex, instance.matrix);
    for (let leaf = 0; leaf < 2; leaf++) {
      const a = leaf * Math.PI;
      instance.rotation.y = -a; instance.position.set(x + Math.cos(a) * .72, y + height + .12, z + Math.sin(a) * .72);
      instance.scale.set(1.15, .28, .48); instance.updateMatrix();
      leaves.setMatrixAt(treeIndex * 2 + leaf, instance.matrix);
      leaves.setColorAt(treeIndex * 2 + leaf, new T.Color(i % 2 ? 0x638d68 : 0x5a835e));
    }
    treeIndex++;
  }
  trunks.computeBoundingSphere(); leaves.computeBoundingSphere();
  const lighthouseLand = headlands[1], lighthouse = new T.Group();
  lighthouse.position.set(43, coastHeight(lighthouseLand, 43, -51), -51); scene.add(lighthouse);
  shape(cylinder, 0xffe8c4, [0, 3.3, 0], [1.4, 6.6, 1.4], lighthouse);
  for (let y = 1.2; y < 6; y += 2.5) shape(cylinder, 0xce806f, [0, y, 0], [1.43, .58, 1.43], lighthouse);
  shape(cylinder, 0x426b77, [0, 7, 0], [1.5, .25, 1.5], lighthouse);
  shape(cylinder, 0xf9d693, [0, 7.8, 0], [.9, 1.4, .9], lighthouse);
  shape(new T.ConeGeometry(1, 1, 12), 0xb96659, [0, 8.9, 0], [1.65, 1.2, 1.65], lighthouse);

  const hullOutline = new T.Shape();
  hullOutline.moveTo(-2.3, .02); hullOutline.lineTo(2.3, .02); hullOutline.lineTo(1.65, -.62); hullOutline.lineTo(-1.65, -.62); hullOutline.closePath();
  const hullGeometry = new T.ExtrudeGeometry(hullOutline, { depth: .8, bevelEnabled: true, bevelSegments: 1, bevelSize: .08, bevelThickness: .08 });
  function sail(points, color, parent, z = .5) {
    const outline = new T.Shape(); outline.moveTo(...points[0]);
    for (const point of points.slice(1)) outline.lineTo(...point);
    outline.closePath();
    const mesh = new T.Mesh(new T.ShapeGeometry(outline), new T.MeshStandardMaterial({ color, side: T.DoubleSide, roughness: 1 }));
    mesh.position.z = z; parent.add(mesh); return mesh;
  }
  const boats = [];
  for (let i = 0; i < 2; i++) {
    const boat = new T.Group(); boat.name = 'Detailed sailboat'; boat.position.set(i ? 16 : -2, -3.9, i ? -36 : -58);
    boat.scale.setScalar(i ? 1.6 : 1.05); scene.add(boat);
    const hull = new T.Mesh(hullGeometry, material(i ? 0x56798a : 0xa46c55)); hull.position.z = -.4; hull.castShadow = true; boat.add(hull);
    shape(cube, 0xe4c6a0, [0, .08, 0], [3.7, .1, .7], boat);
    shape(cube, 0x6c5547, [0, -.08, .45], [4.25, .11, .08], boat);
    shape(cylinder, 0x7b6150, [0, 1.9, 0], [.055, 3.8, .055], boat);
    shape(cylinder, 0x8c6a54, [1.05, .42, .15], [.035, 2.1, .035], boat).rotation.z = Math.PI / 2;
    sail([[.12, .4], [.12, 3.65], [2.08, .4]], 0xfff5dd, boat);
    sail([[-.1, 3.35], [-.1, .62], [-1.47, .62]], 0xf2e6c9, boat);
    for (const y of [.78, 1.6, 2.42]) {
      const x0 = 2.08 - (y - .4) / 3.25 * 1.96, x1 = 2.08 - (y + .17 - .4) / 3.25 * 1.96;
      sail([[.14, y], [x0, y], [x1, y + .17], [.14, y + .17]], i ? 0xbe745e : 0x7ca7a6, boat, .515);
    }
    const wake = new T.Mesh(new T.RingGeometry(1.5, 1.8, 32), new T.MeshBasicMaterial({ color: 0xf4f6e9, transparent: true, opacity: .3, side: T.DoubleSide, depthWrite: false }));
    wake.rotation.x = -Math.PI / 2; wake.position.y = -.5; wake.scale.set(1.5, .7, 1); boat.add(wake);
    boats.push(boat);
  }
  const clouds = [];
  for (let i = 0; i < 6; i++) {
    const cloud = new T.Group(); cloud.position.set(-72 + i * 29, 12 + i % 3 * 4, -82 - i % 2 * 16); scene.add(cloud);
    for (let j = 0; j < 5; j++) shape(ball, 0xfff1d7, [(j - 2) * 3.5, Math.sin(j * 1.9) * .7, 0], [3.8, 1.8 + j % 2 * .5, 2.0], cloud);
    clouds.push(cloud);
  }

  function setTheme(mapId = 'townhouse') {
    const colors = {
      townhouse: ['#238d9d', '#104c73'], tower: ['#248b9e', '#124d74'],
      bridge: ['#27949d', '#175476'], fortress: ['#288b98', '#28516e']
    };
    const [shallow, deep] = colors[mapId] || colors.townhouse;
    waterMaterials.forEach(water => {
      water.uniforms.uShallow.value.set(shallow); water.uniforms.uDeep.value.set(deep);
    });
  }
  setTheme();
  return {
    lightingReady,
    backgroundReady: Promise.resolve('world-3d'),
    waterMode: 'gerstner-lod',
    waterReflection: 'pmrem-hdr',
    shorelineFoam: 'terrain-depth',
    waterQuality: constrained ? 'balanced' : 'high',
    motionLayers: 'gerstner-water-boats-clouds-spray',
    motionSample: () => ({ waveTime: waterMaterials[0].uniforms.uTime.value, boatX: boats[0].position.x, cloudX: clouds[0].position.x }),
    setTheme,
    animate(now, camera) {
      waterMaterials.forEach(water => { water.uniforms.uTime.value = now / 1000; });
      if (camera) {
        ocean.position.x = Math.round(camera.position.x / 8) * 8;
        ocean.position.z = Math.round((camera.position.z - 35) / 8) * 8;
      }
      const dt = Math.min(.05, Math.max(0, (now - (splashPoints.userData.lastTime || now)) / 1000));
      splashPoints.userData.lastTime = now; spawnSplash(now); updateSplashes(dt);
      boats.forEach((boat, i) => {
        boat.position.x = (i ? 16 : -2) + Math.sin(now * (.00032 + i * .00007) + i * 1.7) * 5;
        boat.position.y = -3.9 + Math.sin(now / 1100 + i) * .14;
        boat.rotation.z = Math.sin(now / 1800 + i) * .04;
        boat.rotation.y = Math.sin(now / 2400 + i) * .07;
      });
      clouds.forEach((cloud, i) => { cloud.position.x = -105 + ((now * (.0016 + i * .00012) + i * 39) % 210); });
    }
  };
}
