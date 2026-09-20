import * as T from 'three';
import { RGBELoader } from '/vendor/three-addons/loaders/RGBELoader.js';
import { RoomEnvironment } from '/vendor/three-addons/environments/RoomEnvironment.js';

// The arena, sea, coast, boats and clouds are all world-space geometry.
// None of this scenery enters the server's physics simulation.
export function createEnvironment(scene, renderer) {
  const pmrem = new T.PMREMGenerator(renderer); pmrem.compileEquirectangularShader();
  const fallback = pmrem.fromScene(new RoomEnvironment(), .04).texture;
  scene.environment = fallback; scene.environmentIntensity = .36;
  const lightingReady = new Promise(resolve => {
    new RGBELoader().load('/assets/environment/studio_small_09_1k.hdr', hdr => {
      scene.environment = pmrem.fromEquirectangular(hdr).texture;
      hdr.dispose(); fallback.dispose(); pmrem.dispose(); resolve('hdri');
    }, undefined, () => { pmrem.dispose(); resolve('procedural'); });
  });
  scene.background = new T.Color('#a4d0e3');
  scene.fog = new T.Fog('#a5cbd0', 105, 290);

  const sky = new T.Mesh(new T.SphereGeometry(220, 32, 16), new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vWorld; void main() { vWorld = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec3 vWorld;
      void main() {
        vec3 ray = normalize(vWorld - cameraPosition);
        vec3 horizon = vec3(.55, .75, .86), zenith = vec3(.28, .55, .80);
        vec3 color = mix(horizon, zenith, smoothstep(-.18, .19, ray.y));
        float sun = pow(max(dot(ray, normalize(vec3(-.5, .26, -.82))), 0.0), 90.0);
        color += vec3(1.0, .71, .42) * sun * .38;
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  }));
  sky.name = '3D sky dome'; sky.renderOrder = -1000; scene.add(sky);

  const constrained = Boolean(navigator.deviceMemory && navigator.deviceMemory <= 4);
  const waterMaterial = new T.ShaderMaterial({
    fog: true,
    uniforms: T.UniformsUtils.merge([T.UniformsLib.fog, {
      uTime: { value: 0 },
      uShallow: { value: new T.Color('#34abb6') }, uDeep: { value: new T.Color('#145a80') },
      uSky: { value: new T.Color('#a7d3dc') }, uFoam: { value: new T.Color('#e8f5ef') },
      uSunDirection: { value: new T.Vector3(-.45, .72, .52).normalize() }
    }]),
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorld; varying vec3 vNormal; varying float vCrest;
      #include <fog_pars_vertex>
      void main() {
        vec3 p = position; float t = uTime;
        vec2 d1 = normalize(vec2(.86, .50)), d2 = normalize(vec2(-.38, .92)), d3 = normalize(vec2(.64, -.77));
        float a = dot(p.xy, d1) * .19 + t * .83;
        float b = dot(p.xy, d2) * .39 + t * 1.27;
        float c = dot(p.xy, d3) * .84 + t * 1.87;
        float h = sin(a) * .38 + sin(b) * .16 + sin(c) * .07;
        float dx = cos(a) * .38 * .19 * d1.x + cos(b) * .16 * .39 * d2.x + cos(c) * .07 * .84 * d3.x;
        float dy = cos(a) * .38 * .19 * d1.y + cos(b) * .16 * .39 * d2.y + cos(c) * .07 * .84 * d3.y;
        p.z += h; vCrest = h;
        vNormal = normalize(mat3(modelMatrix) * normalize(vec3(-dx, -dy, 1.0)));
        vec4 world = modelMatrix * vec4(p, 1.0); vWorld = world.xyz;
        vec4 mvPosition = viewMatrix * world; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      uniform float uTime; uniform vec3 uShallow, uDeep, uSky, uFoam, uSunDirection;
      varying vec3 vWorld, vNormal; varying float vCrest;
      #include <fog_pars_fragment>
      void main() {
        float t = uTime;
        float ripple = sin(vWorld.x * 2.8 + vWorld.z * 1.6 + t * 2.2) * sin(vWorld.z * 3.4 - vWorld.x * .7 - t * 1.9);
        vec3 normal = normalize(vNormal + vec3(ripple * .035, 0.0, cos(vWorld.x * 2.2 - t) * .035));
        vec3 viewDirection = normalize(cameraPosition - vWorld);
        float fresnel = pow(1.0 - max(dot(viewDirection, normal), 0.0), 3.0);
        float depth = smoothstep(7.0, 85.0, abs(vWorld.z));
        vec3 color = mix(uShallow, uDeep, depth * .82);
        color += vec3(.04, .08, .08) * (.5 + ripple * .5);
        color = mix(color, uSky, fresnel * .25);
        float sunGlint = pow(max(dot(reflect(-uSunDirection, normal), viewDirection), 0.0), 70.0);
        color += vec3(1.0, .79, .51) * sunGlint * .42;
        float foam = smoothstep(.49, .62, vCrest + ripple * .045) * .18;
        float shore = max(abs(vWorld.x) - 25.5, abs(vWorld.z) - 7.6);
        foam += (1.0 - smoothstep(.2, 2.2, abs(shore))) * smoothstep(.2, .9, ripple) * .27;
        color = mix(color, uFoam, clamp(foam, 0.0, .48));
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `
  });
  const water = new T.Mesh(new T.PlaneGeometry(560, 560, constrained ? 88 : 144, constrained ? 88 : 144), waterMaterial);
  water.name = '3D ocean'; water.rotation.x = -Math.PI / 2; water.position.set(0, -4.55, -35); scene.add(water);

  const palette = new Map();
  function material(color) {
    if (!palette.has(color)) palette.set(color, new T.MeshStandardMaterial({ color, roughness: .9 }));
    return palette.get(color);
  }
  function shape(geometry, color, position, scale, parent = scene) {
    const object = new T.Mesh(geometry, material(color)); object.position.set(...position); object.scale.set(...scale);
    object.castShadow = true; object.receiveShadow = true; parent.add(object); return object;
  }
  const rock = new T.IcosahedronGeometry(1, 1), ball = new T.SphereGeometry(1, 12, 8);
  const cube = new T.BoxGeometry(1, 1, 1), cylinder = new T.CylinderGeometry(1, 1, 1, 12);
  const roofGeometry = new T.ConeGeometry(1, 1, 4);
  for (const side of [-1, 1]) {
    // Layered 3D headlands frame the open bay without crossing the shot lane.
    for (let i = 0; i < 4; i++) {
      const x = side * (49 + i * 24), z = -48 - i * 22;
      shape(rock, i % 2 ? 0xb4ac8f : 0x8f9985, [x, -2 + i * .3, z], [17 + i * 7, 8 + i * 3, 15 + i * 4]);
      shape(rock, 0x789875, [x, 3 + i * 1.5, z - 2], [13 + i * 5, 3 + i, 11 + i * 3]);
    }
    for (let i = 0; i < 10; i++) {
      const x = side * (39 + i * 4.4), z = -52 - i % 3 * 3;
      const height = 2.0 + i % 3 * .55;
      shape(cube, [0xf1d9b8, 0xe6bba2, 0xd5d9bb][i % 3], [x, 2 + height / 2, z], [2.7, height, 2.6]);
      const roof = shape(roofGeometry, i % 2 ? 0xb8755c : 0x9b6e5d, [x, 2 + height + .7, z], [2.1, 1.45, 2.1]); roof.rotation.y = Math.PI / 4;
      shape(cube, 0x69888b, [x, 2.9, z + 1.33], [.68, .75, .04]);
    }
    for (let i = 0; i < 7; i++) {
      const x = side * (34 + i * 5), z = -38 - i % 3 * 3;
      shape(cylinder, 0x7b6650, [x, 1.2, z], [.16, 3.4, .16]);
      shape(ball, i % 2 ? 0x6a9d70 : 0x4c896d, [x, 3.1, z], [1.5, 1.0, 1.35]);
    }
  }
  const lighthouse = new T.Group(); lighthouse.position.set(49, 1.0, -49); scene.add(lighthouse);
  shape(cylinder, 0xffe8c4, [0, 3.3, 0], [1.4, 6.6, 1.4], lighthouse);
  for (let y = 1.2; y < 6; y += 2.5) shape(cylinder, 0xce806f, [0, y, 0], [1.43, .58, 1.43], lighthouse);
  shape(cylinder, 0x426b77, [0, 7, 0], [1.5, .25, 1.5], lighthouse);
  shape(cylinder, 0xf9d693, [0, 7.8, 0], [.9, 1.4, .9], lighthouse);
  shape(new T.ConeGeometry(1, 1, 12), 0xb96659, [0, 8.9, 0], [1.65, 1.2, 1.65], lighthouse);

  const boatHull = new T.IcosahedronGeometry(1, 0), sailShape = new T.Shape();
  sailShape.moveTo(0, 0); sailShape.lineTo(0, 3.3); sailShape.lineTo(1.9, .1); sailShape.closePath();
  const sailGeometry = new T.ShapeGeometry(sailShape);
  const sailMaterial = new T.MeshStandardMaterial({ color: 0xfff3d8, side: T.DoubleSide, roughness: 1 });
  const boats = [];
  for (let i = 0; i < 2; i++) {
    const boat = new T.Group(); boat.position.set(-18 + i * 30, -3.9, -30 - i * 18); boat.scale.setScalar(1 + i * .2); scene.add(boat);
    shape(boatHull, i ? 0x547f8b : 0xb8785e, [0, 0, 0], [1.7, .38, .58], boat);
    shape(cylinder, 0x886d58, [0, 1.6, 0], [.055, 3.3, .055], boat);
    const sail = new T.Mesh(sailGeometry, sailMaterial); sail.position.y = .18; boat.add(sail); boats.push(boat);
  }
  const clouds = [];
  for (let i = 0; i < 6; i++) {
    const cloud = new T.Group(); cloud.position.set(-72 + i * 29, 7 + i % 3 * 2, -78 - i % 2 * 12); scene.add(cloud);
    for (let j = 0; j < 5; j++) shape(ball, 0xfff1d7, [(j - 2) * 3.5, Math.sin(j * 1.9) * .7, 0], [3.8, 1.8 + j % 2 * .5, 2.0], cloud);
    clouds.push(cloud);
  }

  function setTheme(mapId = 'townhouse') {
    const colors = {
      townhouse: ['#37b1b6', '#145a80'], tower: ['#34aab7', '#165f83'],
      bridge: ['#40b5b5', '#18627e'], fortress: ['#3ba5ad', '#275d78']
    };
    const [shallow, deep] = colors[mapId] || colors.townhouse;
    waterMaterial.uniforms.uShallow.value.set(shallow);
    waterMaterial.uniforms.uDeep.value.set(deep);
  }
  setTheme();
  return {
    lightingReady,
    backgroundReady: Promise.resolve('world-3d'),
    waterMode: 'world-surface',
    waterQuality: constrained ? 'balanced' : 'high',
    motionLayers: 'water-boats-clouds',
    motionSample: () => ({ waveTime: waterMaterial.uniforms.uTime.value, boatX: boats[0].position.x, cloudX: clouds[0].position.x }),
    setTheme,
    animate(now) {
      waterMaterial.uniforms.uTime.value = now / 1000;
      boats.forEach((boat, i) => {
        boat.position.x = -18 + ((now * (.00055 + i * .00014) + i * 29) % 36);
        boat.position.y = -3.9 + Math.sin(now / 1100 + i) * .14;
        boat.rotation.z = Math.sin(now / 1800 + i) * .04;
      });
      clouds.forEach((cloud, i) => { cloud.position.x = -105 + ((now * (.0016 + i * .00012) + i * 39) % 210); });
    }
  };
}
