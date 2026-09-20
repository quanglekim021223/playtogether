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
  const rock = new T.IcosahedronGeometry(1, constrained ? 1 : 2), ball = new T.SphereGeometry(1, 12, 8);
  const rockPositions = rock.attributes.position;
  for (let i = 0; i < rockPositions.count; i++) {
    const x = rockPositions.getX(i), y = rockPositions.getY(i), z = rockPositions.getZ(i);
    const variation = 1 + Math.sin(x * 7.1 + z * 4.3) * .1 + Math.sin(y * 9.7 - x * 3.4) * .055;
    rockPositions.setXYZ(i, x * variation * 1.08, y * variation * .82, z * variation);
  }
  rock.computeVertexNormals();
  const cube = new T.BoxGeometry(1, 1, 1), cylinder = new T.CylinderGeometry(1, 1, 1, 12);
  const roofGeometry = new T.ConeGeometry(1, 1, 4);
  const headlands = [
    { side: -1, x: -59, z: -51, rx: 43, rz: 27 },
    { side: 1, x: 60, z: -54, rx: 39, rz: 24 }
  ];
  function coastHeight(land, x, z) {
    const dx = (x - land.x) / land.rx, dz = (z - land.z) / land.rz;
    const r = Math.min(1, Math.hypot(dx, dz)), angle = Math.atan2(dz, dx);
    const ridge = Math.sin(angle * 3 + land.side * .8) * .8 + Math.sin(angle * 7 - r * 5) * .34;
    const erosion = Math.sin(x * .22 + z * .13) * .72 + Math.sin(x * .49 - z * .31) * .3;
    const cliff = Math.sin(angle * 11 + r * 8) * Math.pow(r, 4) * .34;
    return -4.65 + 16.4 * Math.pow(1 - r, .68) + (ridge + erosion) * (1 - r) * 1.25 + cliff;
  }
  const headlandNormal = normalMap(19); headlandNormal.repeat.set(5, 3); headlandNormal.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const headlandMaterial = new T.MeshStandardMaterial({ vertexColors: true, side: T.DoubleSide, roughness: .94, metalness: 0, normalMap: headlandNormal, normalScale: new T.Vector2(.34, .34), envMapIntensity: .32 });
  headlandMaterial.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `
      #include <common>
      varying vec3 vHeadlandWorld;
    `).replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vHeadlandWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
      #include <common>
      varying vec3 vHeadlandWorld;
      float coastHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float coastNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(coastHash(i), coastHash(i + vec2(1., 0.)), f.x), mix(coastHash(i + vec2(0., 1.)), coastHash(i + 1.), f.x), f.y);
      }
    `).replace('#include <color_fragment>', `
      #include <color_fragment>
      float coastMacro = coastNoise(vHeadlandWorld.xz * .095);
      float coastGrain = coastNoise(vHeadlandWorld.xz * .72 + coastMacro * 2.4);
      diffuseColor.rgb *= .86 + coastMacro * .2 + coastGrain * .07;
      float strata = smoothstep(.46, .54, sin(vHeadlandWorld.y * 2.15 + coastMacro * 2.0) * .5 + .5);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.83, .79, .72), strata * .12);
    `).replace('#include <roughnessmap_fragment>', `
      #include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + (coastGrain - .5) * .08, .82, 1.0);
    `);
  };
  headlandMaterial.customProgramCacheKey = () => 'headland-pbr-v2';
  const headlandRockMaterial = new T.MeshStandardMaterial({ color: 0xffffff, roughness: .91, metalness: 0, envMapIntensity: .38 });
  for (const land of headlands) {
    // A radial LOD mesh gives the distant coast a clean silhouette without a heavy GLB.
    const segments = constrained ? 44 : 72, ringCount = constrained ? 11 : 17;
    const vertices = [land.x, coastHeight(land, land.x, land.z), land.z], colors = [], uvs = [.5, .5], indices = [];
    const centerColor = new T.Color(0x718a63); colors.push(centerColor.r, centerColor.g, centerColor.b);
    for (let ring = 1; ring <= ringCount; ring++) for (let i = 0; i < segments; i++) {
      const r = ring / ringCount;
      const angle = i / segments * Math.PI * 2;
      const edge = 1 + (Math.sin(angle * 5 + land.side) * .04 + Math.sin(angle * 9) * .022 + Math.sin(angle * 17) * .009) * r;
      const x = land.x + Math.cos(angle) * land.rx * r * edge;
      const z = land.z + Math.sin(angle) * land.rz * r * edge;
      const y = coastHeight(land, x, z);
      vertices.push(x, y, z);
      const color = new T.Color(y > 5.5 ? 0x718a63 : y > 1.2 ? 0x87916f : y > -1.5 ? 0x9b8d70 : 0x77756a);
      color.multiplyScalar(.9 + .09 * Math.sin(x * .37 + z * .23) + .035 * Math.sin(x * 1.3 - z));
      colors.push(color.r, color.g, color.b);
      uvs.push((x - land.x) / land.rx * 2.5 + .5, (z - land.z) / land.rz * 2.5 + .5);
    }
    for (let i = 0; i < segments; i++) indices.push(0, 1 + i, 1 + (i + 1) % segments);
    for (let ring = 1; ring < ringCount; ring++) for (let i = 0; i < segments; i++) {
      const a = 1 + (ring - 1) * segments + i, b = 1 + (ring - 1) * segments + (i + 1) % segments;
      const c = 1 + ring * segments + i, d = 1 + ring * segments + (i + 1) % segments;
      indices.push(a, b, c, b, d, c);
    }
    const terrain = new T.BufferGeometry(); terrain.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
    terrain.setAttribute('color', new T.Float32BufferAttribute(colors, 3)); terrain.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2)); terrain.setIndex(indices); terrain.computeVertexNormals();
    const coast = new T.Mesh(terrain, headlandMaterial);
    coast.name = land.side < 0 ? 'Village headland' : 'Lighthouse headland'; scene.add(coast);
    const stoneCount = constrained ? 22 : 38;
    const stones = new T.InstancedMesh(rock, headlandRockMaterial, stoneCount), instance = new T.Object3D();
    stones.name = 'Headland rock clusters'; stones.receiveShadow = true; scene.add(stones);
    for (let i = 0; i < stoneCount; i++) {
      const angle = .1 * Math.PI + i / Math.max(1, stoneCount - 1) * .8 * Math.PI;
      const r = .68 + (i * 7 % 17) / 17 * .29;
      const x = land.x + Math.cos(angle) * land.rx * r, z = land.z + Math.sin(angle) * land.rz * r;
      const size = .55 + (i * 11 % 9) * .17;
      instance.position.set(x, coastHeight(land, x, z) + size * .22, z);
      instance.scale.set(size * (1.1 + i % 3 * .18), size * (.62 + i % 4 * .07), size); instance.rotation.set(i * .17, i * 1.37, i * .23); instance.updateMatrix();
      stones.setMatrixAt(i, instance.matrix); stones.setColorAt(i, new T.Color([0x8e897b, 0xa3947c, 0x6f7772, 0xb09a7b][i % 4]));
    }
    stones.instanceMatrix.needsUpdate = true; if (stones.instanceColor) stones.instanceColor.needsUpdate = true;
    stones.computeBoundingSphere();
  }
  // A compact Mediterranean architecture kit shared by both hills.
  const village = headlands[0], lighthouseLand = headlands[1];
  const buildingSites = Array.from({ length: 12 }, (_, i) => ({
    land: village, x: -36 - i % 4 * 7.3, z: -42 - Math.floor(i / 4) * 6.3, variant: i
  })).concat([
    { land: lighthouseLand, x: 51, z: -47, variant: 12 }, { land: lighthouseLand, x: 58, z: -51, variant: 13 },
    { land: lighthouseLand, x: 65, z: -55, variant: 14 }, { land: lighthouseLand, x: 55, z: -59, variant: 15 }
  ]);
  const buildingCount = buildingSites.length, instance = new T.Object3D();
  const plaster = new T.MeshStandardMaterial({ color: 0xffffff, roughness: .92, metalness: 0, normalMap: headlandNormal, normalScale: new T.Vector2(.08, .08), envMapIntensity: .28 });
  const terracotta = new T.MeshStandardMaterial({ color: 0xffffff, roughness: .88, metalness: 0, envMapIntensity: .3 });
  const stoneTrim = new T.MeshStandardMaterial({ color: 0xffffff, roughness: .96, metalness: 0 });
  const timber = new T.MeshStandardMaterial({ color: 0x765443, roughness: .9 });
  const villageGlass = new T.MeshStandardMaterial({ color: 0x79aeb2, roughness: .28, metalness: .05, emissive: 0x18383b, emissiveIntensity: .12 });
  const houses = new T.InstancedMesh(cube, plaster, buildingCount);
  const foundations = new T.InstancedMesh(cube, stoneTrim, buildingCount);
  const roofs = new T.InstancedMesh(roofGeometry, terracotta, buildingCount);
  const cornices = new T.InstancedMesh(cube, stoneTrim, buildingCount * 2);
  const windowFrames = new T.InstancedMesh(cube, timber, buildingCount * 2);
  const windows = new T.InstancedMesh(cube, villageGlass, buildingCount * 2);
  const doors = new T.InstancedMesh(cube, timber, buildingCount);
  const chimneys = new T.InstancedMesh(cube, terracotta, buildingCount);
  scene.add(houses, foundations, roofs, cornices, windowFrames, windows, doors, chimneys);
  houses.name = 'PBR hillside plaster houses'; foundations.name = 'Stone house foundations'; roofs.name = 'Terracotta tiled roofs';
  cornices.name = 'House cornice bands'; windowFrames.name = 'Timber window frames'; windows.name = 'Village glass panes'; doors.name = 'Village doors'; chimneys.name = 'Village chimneys';
  const updateInstance = (mesh, index) => { instance.updateMatrix(); mesh.setMatrixAt(index, instance.matrix); };
  for (let i = 0; i < buildingCount; i++) {
    const site = buildingSites[i], width = 3.1 + site.variant % 3 * .28, depth = 2.75 + site.variant % 2 * .3;
    const height = 2.55 + site.variant % 3 * .48, base = coastHeight(site.land, site.x, site.z), yaw = (site.variant % 3 - 1) * .035;
    instance.rotation.set(0, yaw, 0); instance.position.set(site.x, base + height / 2 + .28, site.z); instance.scale.set(width, height, depth); updateInstance(houses, i);
    houses.setColorAt(i, new T.Color([0xf2dfc3, 0xe8c6ad, 0xeadfca, 0xd6ded0][site.variant % 4]));
    instance.position.set(site.x, base + .18, site.z); instance.scale.set(width + .34, .42, depth + .34); updateInstance(foundations, i);
    foundations.setColorAt(i, new T.Color(site.variant % 2 ? 0x918675 : 0xa2957e));
    instance.rotation.y = Math.PI / 4 + yaw; instance.position.set(site.x, base + height + 1.08, site.z); instance.scale.set(width * .76, 1.72, depth * .76); updateInstance(roofs, i);
    roofs.setColorAt(i, new T.Color([0xb9674f, 0xc57b58, 0xa95748][site.variant % 3]));
    for (let band = 0; band < 2; band++) {
      instance.rotation.y = yaw; instance.position.set(site.x, base + (band ? height + .3 : .42), site.z + depth * .51); instance.scale.set(width + .22, .16, .12); updateInstance(cornices, i * 2 + band);
      cornices.setColorAt(i * 2 + band, new T.Color(0xf2dfbd));
      const wx = site.x + (band ? -.62 : .62), wy = base + height * .6;
      instance.position.set(wx, wy, site.z + depth * .515); instance.scale.set(.82, .92, .14); updateInstance(windowFrames, i * 2 + band);
      instance.position.z += .045; instance.scale.set(.6, .68, .08); updateInstance(windows, i * 2 + band);
    }
    instance.position.set(site.x + width * .27, base + 1.0, site.z + depth * .52); instance.scale.set(.72, 1.55, .14); updateInstance(doors, i);
    instance.position.set(site.x - width * .25, base + height + 1.25, site.z - depth * .2); instance.scale.set(.38, 1.2, .38); updateInstance(chimneys, i);
    chimneys.setColorAt(i, new T.Color(site.variant % 2 ? 0x9e5747 : 0xb76a4e));
  }
  for (const mesh of [houses, foundations, roofs, cornices, windowFrames, windows, doors, chimneys]) {
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; mesh.computeBoundingSphere();
  }
  const terraceMaterial = new T.MeshStandardMaterial({ color: 0xa99a7f, roughness: .97 });
  for (let i = 0; i < 3; i++) {
    const x = -47 - i * 3.4, z = -38 - i * 6.2, wall = new T.Mesh(cube, terraceMaterial);
    wall.name = 'Village retaining terrace'; wall.position.set(x, coastHeight(village, x, z) - .15, z); wall.scale.set(18 - i * 2.4, .8, .7); wall.rotation.y = -.06; wall.receiveShadow = true; scene.add(wall);
  }
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
  const shrubCount = constrained ? 28 : 48;
  const shrubGeometry = new T.ConeGeometry(.42, 1.15, 5);
  shrubGeometry.translate(0, .55, 0);
  const shrubs = new T.InstancedMesh(shrubGeometry, new T.MeshStandardMaterial({ color: 0xffffff, roughness: .96 }), shrubCount);
  shrubs.name = 'Headland scrub scatter'; scene.add(shrubs);
  for (let i = 0; i < shrubCount; i++) {
    const land = headlands[i % 2], angle = i * 2.399 + (land.side < 0 ? .4 : 1.1), r = .42 + (i * 5 % 13) / 13 * .39;
    const x = land.x + Math.cos(angle) * land.rx * r, z = land.z + Math.sin(angle) * land.rz * r;
    const size = .42 + (i * 7 % 6) * .09;
    instance.position.set(x, coastHeight(land, x, z), z); instance.rotation.set(0, angle + i * .31, (i % 3 - 1) * .08); instance.scale.set(size * .72, size, size * .72); instance.updateMatrix();
    shrubs.setMatrixAt(i, instance.matrix); shrubs.setColorAt(i, new T.Color(i % 3 ? 0x607957 : 0x7d875c));
  }
  shrubs.instanceMatrix.needsUpdate = true; if (shrubs.instanceColor) shrubs.instanceColor.needsUpdate = true; shrubs.computeBoundingSphere();
  const lighthouse = new T.Group(); lighthouse.name = 'Detailed coastal lighthouse';
  lighthouse.position.set(43, coastHeight(lighthouseLand, 43, -51), -51); scene.add(lighthouse);
  const lighthousePlaster = new T.MeshStandardMaterial({ color: 0xf3dfbd, roughness: .88, normalMap: headlandNormal, normalScale: new T.Vector2(.08, .08) });
  const lighthouseRed = new T.MeshStandardMaterial({ color: 0xb85e50, roughness: .82 });
  const lighthouseMetal = new T.MeshStandardMaterial({ color: 0x334e55, roughness: .46, metalness: .35 });
  const lanternGlass = new T.MeshStandardMaterial({ color: 0xffe2a0, emissive: 0xffb84f, emissiveIntensity: .8, transparent: true, opacity: .72, roughness: .16 });
  const addLighthouse = (geometry, mat, y) => { const mesh = new T.Mesh(geometry, mat); mesh.position.y = y; mesh.receiveShadow = true; lighthouse.add(mesh); return mesh; };
  addLighthouse(new T.CylinderGeometry(1.45, 1.75, .8, 20), stoneTrim, .4);
  addLighthouse(new T.CylinderGeometry(.95, 1.42, 6.6, 24), lighthousePlaster, 4.05);
  for (const y of [1.55, 4.05]) addLighthouse(new T.CylinderGeometry(1.3 - y * .045, 1.36 - y * .045, .62, 24), lighthouseRed, y);
  const lighthouseDoor = new T.Mesh(cube, timber); lighthouseDoor.position.set(0, 1.25, 1.31); lighthouseDoor.scale.set(.72, 1.55, .12); lighthouse.add(lighthouseDoor);
  for (const y of [3.0, 5.35]) {
    const slit = new T.Mesh(cube, villageGlass); slit.position.set(0, y, 1.13 - y * .045); slit.scale.set(.38, .62, .1); lighthouse.add(slit);
  }
  addLighthouse(new T.CylinderGeometry(1.55, 1.55, .24, 24), lighthouseMetal, 7.45);
  addLighthouse(new T.CylinderGeometry(.88, .88, 1.25, 16), lanternGlass, 8.1);
  addLighthouse(new T.ConeGeometry(1.28, 1.25, 20), lighthouseRed, 9.35);
  const railGeometry = new T.CylinderGeometry(.035, .035, .78, 6), railPosts = new T.InstancedMesh(railGeometry, lighthouseMetal, 12);
  for (let i = 0; i < 12; i++) {
    const angle = i / 12 * Math.PI * 2; instance.position.set(Math.cos(angle) * 1.34, 7.85, Math.sin(angle) * 1.34); instance.rotation.set(0, 0, 0); instance.scale.set(1, 1, 1); updateInstance(railPosts, i);
  }
  railPosts.instanceMatrix.needsUpdate = true; lighthouse.add(railPosts);
  const railRing = new T.Mesh(new T.TorusGeometry(1.34, .045, 5, 28), lighthouseMetal); railRing.rotation.x = Math.PI / 2; railRing.position.y = 8.22; lighthouse.add(railRing);

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
    headlandQuality: constrained ? 'pbr-radial-balanced' : 'pbr-radial-high',
    headlandScatter: constrained ? 72 : 124,
    architectureQuality: 'mediterranean-pbr-instanced',
    architectureBuildings: buildingCount,
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
