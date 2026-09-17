import * as T from 'three';

// A miniature coastal world behind the arena. Scenery never enters the physics world.
export function createEnvironment(scene) {
  const sky = document.createElement('canvas'); sky.width = 2; sky.height = 512;
  const ctx = sky.getContext('2d'), gradient = ctx.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, '#82bdd5'); gradient.addColorStop(.52, '#c6e2df'); gradient.addColorStop(1, '#f7dfb1');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 2, 512);
  const skyTexture = new T.CanvasTexture(sky); skyTexture.colorSpace = T.SRGBColorSpace; scene.background = skyTexture;
  scene.fog = new T.Fog('#c6ddd6', 80, 190);
  const cube = new T.BoxGeometry(1, 1, 1), stone = new T.DodecahedronGeometry(1, 0), ball = new T.SphereGeometry(1, 16, 8);
  const cone = new T.ConeGeometry(1, 1, 4), cylinder = new T.CylinderGeometry(1, 1, 1, 16);
  const palette = new Map();
  function solid(color) { if (!palette.has(color)) palette.set(color, new T.MeshStandardMaterial({ color, roughness: .85 })); return palette.get(color); }
  function shape(geometry, color, p, scale, parent = scene) {
    const obj = new T.Mesh(geometry, solid(color)); obj.position.set(...p); obj.scale.set(...scale); parent.add(obj); return obj;
  }
  const water = new T.Mesh(new T.PlaneGeometry(260, 260), new T.MeshStandardMaterial({ color: '#68b6bc', roughness: .4, metalness: .12 }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, -4.4, -55); scene.add(water);
  const ripples = new T.InstancedMesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ color: '#d8eee0', transparent: true, opacity: .42, depthWrite: false }), 260);
  const transform = new T.Object3D();
  for (let i = 0; i < 260; i++) {
    transform.position.set(-95 + (i * 17.371 % 190), -4.37, -105 + (i * 7.131 % 155));
    transform.rotation.x = -Math.PI / 2; transform.scale.set(1 + i % 5, .06 + i % 3 * .04, 1); transform.updateMatrix(); ripples.setMatrixAt(i, transform.matrix);
  }
  scene.add(ripples);
  // Low, faceted silhouettes leave open sky above the playable buildings.
  for (let i = 0; i < 9; i++) {
    const mountain = shape(new T.ConeGeometry(1, 1, 5), i % 2 ? 0x8bb0b2 : 0x9dbebc, [-112 + i * 28, -9, -120 - i % 3 * 10], [20 + i % 3 * 5, 14 + i % 4 * 3, 15]);
    mountain.rotation.y = i * .7;
    shape(stone, 0x9bbdb0, [-100 + i * 27, -6.2, -86], [19, 3, 13]);
  }
  function island(x, z, scale = 1) {
    shape(stone, 0xd5c8a0, [x, -4.6, z], [11 * scale, 2 * scale, 7 * scale]);
    shape(stone, 0x94b998, [x, -3.3, z], [10 * scale, 2 * scale, 6 * scale]);
  }
  island(-35, -45, 1.6); island(34, -40, 1.3);
  // Quiet pastel villages on the headlands establish scale without obscuring targets.
  for (const side of [-1, 1]) for (let i = 0; i < 7; i++) {
    const x = side * (25 + i * 3.5), z = -49 - (i % 3) * 2, h = 1.7 + i % 3 * .6;
    shape(cube, [0xf3dfbb, 0xe9bc9e, 0xc8d9bf][i % 3], [x, -1.8 + h / 2, z], [2.7, h, 2.4]);
    const roof = shape(cone, side < 0 ? 0xbe8772 : 0x718f92, [x, -1.8 + h + .65, z], [2.2, 1.3, 2]); roof.rotation.y = Math.PI / 4;
    for (const dx of [-.65, .65]) shape(cube, 0x658a91, [x + dx, -.6, z + 1.21], [.45, .65, .03]);
    shape(cylinder, 0x75856e, [x + 1.6, -.5, z + 1], [.1, 2.5, .1]);
    shape(ball, 0x78a78c, [x + 1.6, .8, z + 1], [.85, 1.2, .85]);
  }
  // Lighthouse: cream stone, coral bands, a glazed lantern and a copper roof.
  const lighthouse = new T.Group(); scene.add(lighthouse); lighthouse.position.set(29, -2.2, -32);
  shape(cylinder, 0xe6d9ba, [0, .2, 0], [2.7, .6, 2.7], lighthouse);
  for (let i = 0; i < 6; i++) shape(cylinder, i % 2 ? 0xe6a08a : 0xffeed0, [0, 1 + i * 1.12, 0], [1.08 - i * .06, 1.13, 1.08 - i * .06], lighthouse);
  shape(cylinder, 0x526f79, [0, 7.35, 0], [1.2, .18, 1.2], lighthouse);
  shape(cylinder, 0xeedbb1, [0, 8, 0], [.67, 1.1, .67], lighthouse);
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; shape(cube, 0x496c77, [Math.cos(a) * .8, 8, Math.sin(a) * .8], [.08, 1.4, .08], lighthouse); }
  shape(new T.ConeGeometry(1, 1, 12), 0x527f80, [0, 8.95, 0], [1.3, .9, 1.3], lighthouse);
  shape(cube, 0x526f79, [0, .9, 1.07], [.48, 1.1, .04], lighthouse);
  island(29, -32, .55);
  const boats = [];
  const sailShape = new T.Shape(); sailShape.moveTo(0, 0); sailShape.lineTo(0, 3.2); sailShape.lineTo(1.65, .1); sailShape.closePath();
  const sailGeometry = new T.ShapeGeometry(sailShape), sailMaterial = new T.MeshStandardMaterial({ color: 0xffeed4, side: T.DoubleSide, roughness: 1 });
  for (let i = 0; i < 3; i++) {
    const boat = new T.Group(); scene.add(boat); boat.position.set(-12 + i * 15, -4.05, -20 - i * 8); boat.rotation.y = -.25;
    shape(stone, [0xb67d60, 0x577f8c, 0xd6ad74][i], [0, 0, 0], [1.35, .3, .45], boat);
    shape(cylinder, 0x8b826c, [0, 1.6, 0], [.04, 3.2, .04], boat);
    const sail = new T.Mesh(sailGeometry, sailMaterial); sail.position.y = .35; boat.add(sail); boats.push(boat);
  }
  const sun = new T.Mesh(new T.CircleGeometry(4.8, 48), new T.MeshBasicMaterial({ color: 0xffefd0, fog: false })); sun.position.set(-43, 10, -105); scene.add(sun);
  const clouds = [];
  for (let i = 0; i < 7; i++) {
    const cloud = new T.Group(); cloud.position.set(-65 + i * 22, 5 + i % 3 * 2, -65 - i % 2 * 12); scene.add(cloud);
    for (let j = 0; j < 4; j++) shape(ball, 0xfff4df, [(j - 1.5) * 2.1, Math.sin(j * 2) * .3, 0], [2.7, .7 + j % 2 * .35, 1.1], cloud);
    clouds.push(cloud);
  }
  return {
    animate(now) {
      ripples.position.x = Math.sin(now / 4500) * .4;
      clouds.forEach((c, i) => { c.position.x = -65 + i * 22 + Math.sin(now / 25000 + i) * 2; });
      boats.forEach((b, i) => { b.rotation.z = Math.sin(now / 1800 + i) * .04; b.position.y = -4.05 + Math.sin(now / 2100 + i) * .06; });
    },
  };
}
