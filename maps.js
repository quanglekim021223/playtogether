const defaultMaterial = kind => (kind === 'resident' ? null : (['beam', 'bridge'].includes(kind) ? 'wood' : 'brick'));
const withId = (p, id) => { if (id) p.id = id; return p; };
const part = (kind, x, y, size, mass, hp, material = null) => ({ kind, x, y, size, mass, hp, material: material || defaultMaterial(kind) });
// Load-bearing pieces are deliberately heavier than facade props: a single
// blast may open a room, but should not erase an entire building at once.
const pillar = (x, y, height = 1.9, width = 0.72, hp = 105) => part('block', x, y, [width, height, 1.7], 6, hp);
const beam = (x, y, width, kind = 'beam', id = undefined) => withId(part(kind, x, y, [width, 0.5, 2.05], 8, 145), id);
const resident = (x, y) => part('resident', x, y, [0.46], 0.8, 100);
const tower = [];
for (let floor = 0; floor < 4; floor++) {
  const base = floor * 2.45;
  tower.push(pillar(-2.15, base + 0.95), pillar(2.15, base + 0.95), beam(0, base + 2.16, 5.3));
}
tower.push(withId(part('roof', 0, 10.2, [5.8, 0.7, 2.4], 7, 155), 'tower-roof'));
// A two-storey side wing has its own load path and can collapse independently.
for (let floor = 0; floor < 2; floor++) {
  const base = floor * 2.45;
  tower.push(pillar(-5.4, base + .95), pillar(-3.35, base + .95), withId(beam(-4.375, base + 2.16, 2.7, floor === 1 ? 'roof' : 'beam'), floor === 1 ? 'tower-wing-roof' : 'tower-wing-beam'));
}

const townhouse = [];
for (let floor = 0; floor < 3; floor++) {
  const base = floor * 2.45;
  const columns = floor === 2 ? [-2.6, 0, 2.6] : [-5.2, -2.6, 0, 2.6, 5.2];
  const rooms = floor === 2 ? [-1.3, 1.3] : [-3.9, -1.3, 1.3, 3.9];
  townhouse.push(...columns.map(x => pillar(x, base + .95, 1.9, .55)));
  townhouse.push(...rooms.map(x => {
    let id;
    if (floor === 2 && x === -1.3) id = 'townhouse-roof-1';
    else if (floor === 2 && x === 1.3) id = 'townhouse-roof-2';
    else if (floor === 1 && x === -3.9) id = 'townhouse-roof-back';
    else if (floor === 1 && x === 3.9) id = 'townhouse-roof-front';
    else if (floor === 0 && x === 1.3) id = 'townhouse-beam-mid-1';
    else if (floor === 0 && x === -1.3) id = 'townhouse-beam-mid-2';
    return beam(x, base + 2.16, 2.6, floor === 2 || (floor === 1 && Math.abs(x) > 3) ? 'roof' : 'beam', id);
  }));
}
const bridge = [];
for (const x of [-3, 3]) {
  for (let floor = 0; floor < 3; floor++) {
    const base = floor * 2.45;
    // Recess the upper inner columns so the bridge does not intersect their colliders.
    const left = x - (floor === 2 && x > 0 ? .65 : 1.05), right = x + (floor === 2 && x < 0 ? .65 : 1.05);
    const beamId = floor === 1 ? (x > 0 ? 'bridge-beam-front-2' : 'bridge-beam-back-2') : undefined;
    bridge.push(pillar(left, base + 0.95), pillar(right, base + 0.95), beam(x, base + 2.16, 2.9, 'beam', beamId));
  }
  bridge.push(beam(x, 7.61, 3.2, 'roof', x > 0 ? 'bridge-roof-front' : 'bridge-roof-back'));
}
bridge.push(withId(part('bridge', 0, 5.03, [3.8, 0.3, 1.8], 2, 60), 'bridge-span'));

const fortress = [
  pillar(-2.55, 0.95, 1.9, 0.9, 100), pillar(2.55, 0.95, 1.9, 0.9, 100), beam(0, 2.16, 6.2, 'beam', 'fortress-beam-base'),
  pillar(-2.55, 2.45 + 0.95, 1.9, 0.9, 100), pillar(2.55, 2.45 + 0.95, 1.9, 0.9, 100), beam(0, 2.45 + 2.16, 6.2, 'beam', 'fortress-beam-mid'),
  pillar(-2.55, 4.9 + 0.95, 1.9, 0.9, 100), pillar(2.55, 4.9 + 0.95, 1.9, 0.9, 100), beam(0, 4.9 + 2.16, 6.2, 'beam', 'fortress-beam-top'),
  ...[-2.6, -1.3, 0, 1.3, 2.6].map(x => part('block', x, 7.74, [0.7, 0.8, 1.7], 1.3, 60)),
  part('block', 4.35, 1.3, [0.8, 2.6, 2], 5, 135),
  part('block', 4.35, 3.75, [0.8, 2.2, 2], 4, 120),
  beam(4.35, 5.12, 1.4, 'roof', 'fortress-roof-front'),
  // Rear guard tower and front wall frame the three-storey keep.
  part('block', -4.35, 1.3, [.8, 2.6, 2], 5, 110),
  part('block', -4.35, 3.75, [.8, 2.2, 2], 4, 100),
  beam(-4.35, 5.12, 1.4, 'roof', 'fortress-roof-back'),
];

// Open firing positions: garden, staggered balconies, rooftop, bridge and low lookout.
// Stagger the balconies to give the lower shooter an unobstructed overhead lane.
for (const floor of [0, 1]) {
  const slab = tower.find(p => p.kind === 'beam' && Math.abs(p.y - (floor * 2.45 + 2.16)) < .01 && p.x === 0);
  slab.x = floor === 0 ? 1.7 : 1.1; slab.size[0] = floor === 0 ? 8.7 : 7.5;
  slab.id = floor === 0 ? 'tower-beam-0' : 'tower-beam-1';
  tower.push(pillar(floor === 0 ? 5.5 : 4.5, floor * 2.45 + .95));
}
const frontRoom = townhouse.find(p => p.kind === 'beam' && p.x === 3.9 && p.y < 3);
frontRoom.x = 4.85; frontRoom.size[0] = 4.5; frontRoom.id = 'townhouse-beam-front'; townhouse.push(pillar(6.6, .95));
const landing = bridge.find(p => p.kind === 'beam' && p.x === 3 && p.y < 3);
landing.x = 3.7; landing.size[0] = 4.3; landing.id = 'bridge-beam-front-1'; bridge.push(pillar(5.3, .95));
function lookout(parts, x, height, id) { parts.push(withId(part('block', x, height / 2, [1.35, height, 1.8], 5, 95, 'wood'), id)); }
lookout(tower, -6.6, 1.4, 'tower-lookout'); lookout(townhouse, -6.6, 1, 'townhouse-lookout'); lookout(bridge, 6.6, 1.4, 'bridge-lookout'); lookout(fortress, 6.5, 1.4, 'fortress-lookout');
const roster = ['pebble', 'heavy', 'bloom', 'rocket', 'drill', 'pulse'];
function populate(parts, spots, mapPrefix) {
  spots.forEach(([x, y, spot], i) => parts.push({ ...resident(x, y), weapon: roster[i], spot, residentIndex: i, nodeId: `${mapPrefix}-node-${i}` }));
  for (const p of parts) if (p.kind === 'roof') {
    p.terrace = spots.some(([x, y]) => Math.abs(x - p.x) < p.size[0] / 2 && Math.abs(y - (p.y + p.size[1] / 2 + .46)) < .2);
  }
}
populate(tower, [[7.8, .53, 'Sân trước'], [5.45, 2.94, 'Ban công thấp'], [1, 11.08, 'Sân thượng'], [-4.35, 5.39, 'Mái cánh phụ'], [-6.6, 1.93, 'Chòi vườn'], [4, 5.39, 'Ban công cao']], 'tower');
populate(townhouse, [[7.8, .53, 'Sân trước'], [6, 2.94, 'Hiên nhà'], [-1.3, 7.84, 'Sân thượng'], [-3.9, 5.39, 'Mái phía sau'], [-6.6, 1.53, 'Chòi vườn'], [3.9, 5.39, 'Mái phía trước']], 'townhouse');
populate(bridge, [[7.8, .53, 'Bờ sân'], [5, 2.94, 'Ban công'], [3, 8.39, 'Đỉnh tháp trước'], [-3, 8.39, 'Đỉnh tháp sau'], [6.6, 1.93, 'Chòi vườn'], [.65, 5.71, 'Cầu nối']], 'bridge');
populate(fortress, [[7.8, .53, 'Sân thành'], [4.35, 5.9, 'Tháp gác trước'], [2.6, 8.67, 'Mặt thành'], [-4.35, 5.9, 'Tháp gác sau'], [6.5, 1.93, 'Chòi ngoài'], [-2.6, 8.67, 'Đỉnh thành sau']], 'fortress');

// Glass columns are actual destructible supports, not cosmetic window decals.
for (const p of townhouse) if (p.kind === 'block' && p.y > 3 && p.x > 0) p.material = 'glass';
for (const p of tower) if (p.kind === 'block' && p.y > 5 && p.x < 0) p.material = 'glass';
for (const p of bridge) {
  if (p.kind === 'block' && p.y > 3 && Math.abs(p.x) < 3) p.material = 'glass';
  else if (p.kind === 'block') p.material = 'stone';
}
for (const p of fortress) {
  if (p.kind === 'block') p.material = 'stone';
}

function tagParts(parts, prefix) {
  parts.forEach((p, idx) => { if (!p.id) p.id = `${prefix}-${p.kind}-${idx}`; });
}
tagParts(tower, 'tower');
tagParts(townhouse, 'townhouse');
tagParts(bridge, 'bridge');
tagParts(fortress, 'fortress');

const towerNodes = [
  { id: 'tower-node-0', label: 'Sân trước', x: 7.8, y: 0.53, supportId: null, neighbors: ['tower-node-6', 'tower-node-1'] },
  { id: 'tower-node-1', label: 'Ban công thấp', x: 5.45, y: 2.94, supportId: 'tower-beam-0', neighbors: ['tower-node-0', 'tower-node-6', 'tower-node-8'] },
  { id: 'tower-node-2', label: 'Sân thượng', x: 1, y: 11.08, supportId: 'tower-roof', neighbors: ['tower-node-9'] },
  { id: 'tower-node-3', label: 'Mái cánh phụ', x: -4.35, y: 5.39, supportId: 'tower-wing-roof', neighbors: ['tower-node-10', 'tower-node-9'] },
  { id: 'tower-node-4', label: 'Chòi vườn', x: -6.6, y: 1.93, supportId: 'tower-lookout', neighbors: ['tower-node-7', 'tower-node-10'] },
  { id: 'tower-node-5', label: 'Ban công cao', x: 4, y: 5.39, supportId: 'tower-beam-1', neighbors: ['tower-node-9'] },
  { id: 'tower-node-6', label: 'Chân tháp trước', x: 2.15, y: 0.53, supportId: null, neighbors: ['tower-node-0', 'tower-node-7', 'tower-node-1', 'tower-node-8', 'tower-drop-center'] },
  { id: 'tower-node-7', label: 'Chân tháp sau', x: -2.15, y: 0.53, supportId: null, neighbors: ['tower-node-6', 'tower-node-4', 'tower-node-10', 'tower-drop-center'] },
  { id: 'tower-node-8', label: 'Hành lang lầu 1', x: 0, y: 2.94, supportId: 'tower-beam-0', neighbors: ['tower-node-1', 'tower-node-6', 'tower-node-9', 'tower-node-10'] },
  { id: 'tower-node-9', label: 'Hành lang lầu 2', x: 0, y: 5.39, supportId: 'tower-beam-1', neighbors: ['tower-node-8', 'tower-node-5', 'tower-node-3', 'tower-node-2'] },
  { id: 'tower-node-10', label: 'Hiên cánh phụ', x: -4.35, y: 2.94, supportId: 'tower-wing-beam', neighbors: ['tower-node-7', 'tower-node-8', 'tower-node-3', 'tower-node-4'] },
  { id: 'tower-drop-center', label: 'Sân trung tâm', x: 0, y: 0.53, neutral: true, supportId: null, neighbors: ['tower-node-6', 'tower-node-7'] },
  { id: 'tower-relay-approach', label: 'Lối trống trước tháp', x: 9.2, y: 0.53, supportId: null, neighbors: [] },
];

const townhouseNodes = [
  { id: 'townhouse-node-0', label: 'Sân trước', x: 7.8, y: 0.53, supportId: null, neighbors: ['townhouse-node-6', 'townhouse-node-1'] },
  { id: 'townhouse-node-1', label: 'Hiên nhà', x: 6, y: 2.94, supportId: 'townhouse-beam-front', neighbors: ['townhouse-node-0', 'townhouse-node-8', 'townhouse-node-5'] },
  { id: 'townhouse-node-2', label: 'Sân thượng', x: -1.3, y: 7.84, supportId: 'townhouse-roof-1', neighbors: ['townhouse-node-9', 'townhouse-node-3', 'townhouse-node-10'] },
  { id: 'townhouse-node-3', label: 'Mái phía sau', x: -3.9, y: 5.39, supportId: 'townhouse-roof-back', neighbors: ['townhouse-node-4', 'townhouse-node-9', 'townhouse-node-2'] },
  { id: 'townhouse-node-4', label: 'Chòi vườn', x: -6.6, y: 1.53, supportId: 'townhouse-lookout', neighbors: ['townhouse-node-7', 'townhouse-node-3'] },
  { id: 'townhouse-node-5', label: 'Mái phía trước', x: 3.9, y: 5.39, supportId: 'townhouse-roof-front', neighbors: ['townhouse-node-1', 'townhouse-node-8', 'townhouse-node-10'] },
  { id: 'townhouse-node-6', label: 'Sân giữa', x: 2.6, y: 0.53, supportId: null, neighbors: ['townhouse-node-0', 'townhouse-node-7', 'townhouse-node-8', 'townhouse-drop-center'] },
  { id: 'townhouse-node-7', label: 'Sân sau', x: -2.6, y: 0.53, supportId: null, neighbors: ['townhouse-node-6', 'townhouse-node-4', 'townhouse-node-9', 'townhouse-drop-center'] },
  { id: 'townhouse-node-8', label: 'Ban công giữa', x: 1.3, y: 2.94, supportId: 'townhouse-beam-mid-1', neighbors: ['townhouse-node-6', 'townhouse-node-1', 'townhouse-node-9', 'townhouse-node-5'] },
  { id: 'townhouse-node-9', label: 'Hành lang sau lầu 1', x: -1.3, y: 2.94, supportId: 'townhouse-beam-mid-2', neighbors: ['townhouse-node-7', 'townhouse-node-8', 'townhouse-node-3', 'townhouse-node-2'] },
  { id: 'townhouse-node-10', label: 'Đỉnh mái trước', x: 1.3, y: 7.84, supportId: 'townhouse-roof-2', neighbors: ['townhouse-node-5', 'townhouse-node-2'] },
  { id: 'townhouse-drop-center', label: 'Sân trung tâm', x: 0, y: 0.53, neutral: true, supportId: null, neighbors: ['townhouse-node-6', 'townhouse-node-7'] },
  { id: 'townhouse-relay-approach', label: 'Lối trống trước nhà', x: 9.2, y: 0.53, supportId: null, neighbors: [] },
  { id: 'townhouse-relay-balcony', label: 'Mép hiên ngoài trời', x: 7, y: 2.94, supportId: 'townhouse-beam-front', neighbors: [] },
];

const bridgeNodes = [
  { id: 'bridge-node-0', label: 'Bờ sân', x: 7.8, y: 0.53, supportId: null, neighbors: ['bridge-node-6', 'bridge-node-4', 'bridge-node-1'] },
  { id: 'bridge-node-1', label: 'Ban công', x: 5, y: 2.94, supportId: 'bridge-beam-front-1', neighbors: ['bridge-node-0', 'bridge-node-4', 'bridge-node-6', 'bridge-node-8'] },
  { id: 'bridge-node-2', label: 'Đỉnh tháp trước', x: 3, y: 8.39, supportId: 'bridge-roof-front', neighbors: ['bridge-node-8'] },
  { id: 'bridge-node-3', label: 'Đỉnh tháp sau', x: -3, y: 8.39, supportId: 'bridge-roof-back', neighbors: ['bridge-node-9'] },
  { id: 'bridge-node-4', label: 'Chòi vườn', x: 6.6, y: 1.93, supportId: 'bridge-lookout', neighbors: ['bridge-node-0', 'bridge-node-1'] },
  { id: 'bridge-node-5', label: 'Cầu nối', x: 0.65, y: 5.71, supportId: 'bridge-span', neighbors: ['bridge-node-8', 'bridge-node-10'] },
  { id: 'bridge-node-6', label: 'Chân tháp trước', x: 3, y: 0.53, supportId: null, neighbors: ['bridge-node-0', 'bridge-node-7', 'bridge-node-1', 'bridge-drop-center'] },
  { id: 'bridge-node-7', label: 'Chân tháp sau', x: -3, y: 0.53, supportId: null, neighbors: ['bridge-node-6', 'bridge-node-9', 'bridge-drop-center'] },
  { id: 'bridge-node-8', label: 'Cửa cầu tháp trước', x: 3, y: 5.39, supportId: 'bridge-beam-front-2', neighbors: ['bridge-node-1', 'bridge-node-5', 'bridge-node-2'] },
  { id: 'bridge-node-9', label: 'Cửa cầu tháp sau', x: -3, y: 5.39, supportId: 'bridge-beam-back-2', neighbors: ['bridge-node-7', 'bridge-node-10', 'bridge-node-3'] },
  { id: 'bridge-node-10', label: 'Cầu nối sau', x: -0.65, y: 5.71, supportId: 'bridge-span', neighbors: ['bridge-node-5', 'bridge-node-9'] },
  { id: 'bridge-drop-center', label: 'Sân trung tâm', x: 0, y: 0.53, neutral: true, supportId: null, neighbors: ['bridge-node-6', 'bridge-node-7'] },
  { id: 'bridge-relay-approach', label: 'Lối trống trước cầu', x: 9.2, y: 0.53, supportId: null, neighbors: [] },
];

const fortressNodes = [
  { id: 'fortress-node-0', label: 'Sân thành', x: 7.8, y: 0.53, supportId: null, neighbors: ['fortress-node-4', 'fortress-node-6'] },
  { id: 'fortress-node-1', label: 'Tháp gác trước', x: 4.35, y: 5.9, supportId: 'fortress-roof-front', neighbors: ['fortress-node-6', 'fortress-node-9', 'fortress-node-2'] },
  { id: 'fortress-node-2', label: 'Mặt thành', x: 2.6, y: 8.67, supportId: 'fortress-beam-top', neighbors: ['fortress-node-1', 'fortress-node-10'] },
  { id: 'fortress-node-3', label: 'Tháp gác sau', x: -4.35, y: 5.9, supportId: 'fortress-roof-back', neighbors: ['fortress-node-7', 'fortress-node-9', 'fortress-node-5'] },
  { id: 'fortress-node-4', label: 'Chòi ngoài', x: 6.5, y: 1.93, supportId: 'fortress-lookout', neighbors: ['fortress-node-0', 'fortress-node-6'] },
  { id: 'fortress-node-5', label: 'Đỉnh thành sau', x: -2.6, y: 8.67, supportId: 'fortress-beam-top', neighbors: ['fortress-node-3', 'fortress-node-10'] },
  { id: 'fortress-node-6', label: 'Cổng thành trước', x: 4.35, y: 0.53, supportId: null, neighbors: ['fortress-node-0', 'fortress-node-4', 'fortress-node-8', 'fortress-node-1', 'fortress-drop-center'] },
  { id: 'fortress-node-7', label: 'Chân thành sau', x: -4.35, y: 0.53, supportId: null, neighbors: ['fortress-node-8', 'fortress-node-3', 'fortress-drop-center'] },
  { id: 'fortress-node-8', label: 'Tầng hầm thành', x: 0, y: 2.94, supportId: 'fortress-beam-base', neighbors: ['fortress-node-6', 'fortress-node-7', 'fortress-node-9'] },
  { id: 'fortress-node-9', label: 'Gian giữa lầu 2', x: 0, y: 5.39, supportId: 'fortress-beam-mid', neighbors: ['fortress-node-8', 'fortress-node-1', 'fortress-node-3', 'fortress-node-10'] },
  { id: 'fortress-node-10', label: 'Vọng lâu chính diện', x: 0, y: 8.67, supportId: 'fortress-beam-top', neighbors: ['fortress-node-9', 'fortress-node-2', 'fortress-node-5'] },
  { id: 'fortress-drop-center', label: 'Sân trung tâm', x: 0, y: 0.53, neutral: true, supportId: null, neighbors: ['fortress-node-6', 'fortress-node-7'] },
  { id: 'fortress-relay-approach', label: 'Lối trống trước thành', x: 9.2, y: 0.53, supportId: null, neighbors: [] },
];

// Use more of the coastal arena while preserving every authored support and
// movement relationship. Residents keep their original body size, but their
// feet follow the enlarged floors.
function expandArchitecture(parts, nodes, xScale = 1.12, yScale = 1.06) {
  for (const part of parts) {
    part.x *= xScale;
    if (part.kind === 'resident') part.y = (part.y - .46) * yScale + .46;
    else {
      part.y *= yScale;
      part.size[0] *= xScale; part.size[1] *= yScale;
      if (part.size[2]) part.size[2] *= 1.04;
    }
  }
  for (const node of nodes) {
    node.x *= xScale;
    node.y = node.y <= .6 ? .53 : (node.y - .46) * yScale + .46;
  }
}
expandArchitecture(townhouse, townhouseNodes);
expandArchitecture(tower, towerNodes);
expandArchitecture(bridge, bridgeNodes);
expandArchitecture(fortress, fortressNodes);

// Neutral interactives sit in the open middle lane. Every map gets five objects,
// but a different mix so the arena changes how players aim and move.
const coreObjects = [
  { id: 'fuel-left', kind: 'fuelBarrel', x: -3.4, y: .58, size: [.88, 1.16, .88], mass: 1.4, hp: 42 },
  { id: 'fuel-right', kind: 'fuelBarrel', x: 3.4, y: .58, size: [.88, 1.16, .88], mass: 1.4, hp: 42 },
  { id: 'pad-left', kind: 'bouncePad', x: -1.65, y: .15, size: [1.25, .3, 1.65], mass: 0, angle: .2 },
  { id: 'pad-right', kind: 'bouncePad', x: 1.65, y: .15, size: [1.25, .3, 1.65], mass: 0, angle: -.2 },
];
const arenaObjects = {
  townhouse: [
    ...coreObjects.slice(0, 3),
    { id: 'burning-plank', kind: 'firePlank', x: 1.1, y: .22, size: [2.4, .44, 1.25], mass: 0, hp: 58 },
    { id: 'glass-awning', kind: 'glassTrap', x: 0, y: 4.8, size: [2.2, .28, 1.2], mass: 0, fallMass: 3.4, hp: 48 },
  ],
  tower: [
    ...coreObjects,
    { id: 'rocket-magnet', kind: 'magnet', x: 0, y: 2.1, size: [1.05, 1.05, 1.05], mass: 0, hp: 68, radius: 6.5 },
  ],
  bridge: [
    coreObjects[0], coreObjects[2],
    { id: 'plank-left', kind: 'firePlank', x: .15, y: .22, size: [1.6, .44, 1.25], mass: 0, hp: 58 },
    { id: 'plank-right', kind: 'firePlank', x: 2.1, y: .22, size: [1.6, .44, 1.25], mass: 0, hp: 58 },
    { id: 'glass-bridge', kind: 'glassTrap', x: .35, y: 5.5, size: [2.5, .3, 1.2], mass: 0, fallMass: 3.8, hp: 50 },
  ],
  fortress: [
    coreObjects[1], coreObjects[3],
    { id: 'rock-left', kind: 'rockFall', x: -2.5, y: 6.8, size: [1.4, 1.25, 1.45], mass: 0, fallMass: 8, hp: 90, blockNodeId: 'fortress-drop-center' },
    { id: 'rock-right', kind: 'rockFall', x: 2.5, y: 7.4, size: [1.6, 1.4, 1.55], mass: 0, fallMass: 9, hp: 100, blockNodeId: 'fortress-drop-center' },
    { id: 'rocket-magnet', kind: 'magnet', x: 0, y: 2.2, size: [1.05, 1.05, 1.05], mass: 0, hp: 68, radius: 6.5 },
  ],
};

// Asymmetric blockout for the objective mode: raiders stage from the docks on
// the left, while defenders hold a compact customs fort on the right.
const harborRaiders = [
  pillar(-25, .95), pillar(-20, .95), beam(-22.5, 2.16, 6.2, 'beam', 'harbor-raider-deck'),
  pillar(-24.5, 3.4), pillar(-19.9, 3.4), beam(-22.2, 4.61, 5.8, 'roof', 'harbor-raider-roof'),
  withId(part('block', -15, .7, [1.5, 1.4, 1.9], 5, 105, 'wood'), 'harbor-raider-crane'),
];
const harborDefenders = [
  pillar(15, .95, 1.9, .9, 120), pillar(20, .95, 1.9, .9, 120), beam(17.5, 2.16, 6.2, 'beam', 'harbor-fort-deck'),
  pillar(15.4, 3.4, 1.9, .9, 120), pillar(19.6, 3.4, 1.9, .9, 120), beam(17.5, 4.61, 5.5, 'roof', 'harbor-fort-roof'),
  withId(part('block', 24, 1.45, [3.5, 2.9, 2.2], 12, 230, 'stone'), 'harbor-vault-wall'),
  withId(part('block', 26.1, .7, [1.4, 1.4, 1.9], 6, 130, 'stone'), 'harbor-watch-post'),
];
function populateHarbor(parts, team, spots) {
  spots.forEach(([x, y, spot], index) => parts.push({
    ...resident(x, y), weapon: roster[index], spot, residentIndex: index,
    nodeId: `harbor-${team === 0 ? 'attack' : 'defend'}-${index}`,
  }));
}
populateHarbor(harborRaiders, 0, [
  [-27, .53, 'Bến xuất phát'], [-23.5, 2.94, 'Sàn container'], [-21, 2.94, 'Cầu cảng'],
  [-24, 5.39, 'Mái kho'], [-20.5, 5.39, 'Đài cẩu'], [-15, 1.93, 'Chòi bến'],
]);
populateHarbor(harborDefenders, 1, [
  [12.5, .53, 'Cổng hải quan'], [16.5, 2.94, 'Ban công trái'], [18.5, 2.94, 'Ban công phải'],
  [15.6, 5.39, 'Mái pháo đài'], [19.4, 5.39, 'Vọng gác'], [26.1, 1.93, 'Chốt kho lõi'],
]);
tagParts(harborRaiders, 'harbor-raider');
tagParts(harborDefenders, 'harbor-defender');

const harborNodes = [
  ...[
    [-27, .53, 'Bến xuất phát'], [-23.5, 2.94, 'Sàn container'], [-21, 2.94, 'Cầu cảng'],
    [-24, 5.39, 'Mái kho'], [-20.5, 5.39, 'Đài cẩu'], [-15, 1.93, 'Chòi bến'],
  ].map(([x, y, label], index) => ({ id: `harbor-attack-${index}`, label, x, y, world: true, team: 0, neighbors: [`harbor-attack-${(index + 1) % 6}`] })),
  ...[
    [12.5, .53, 'Cổng hải quan'], [16.5, 2.94, 'Ban công trái'], [18.5, 2.94, 'Ban công phải'],
    [15.6, 5.39, 'Mái pháo đài'], [19.4, 5.39, 'Vọng gác'], [26.1, 1.93, 'Chốt kho lõi'],
  ].map(([x, y, label], index) => ({ id: `harbor-defend-${index}`, label, x, y, world: true, team: 1, neighbors: [`harbor-defend-${(index + 1) % 6}`] })),
  { id: 'harbor-seal-a', label: 'Khóa cầu cảng', x: -4.5, y: .53, world: true, neutral: true, neighbors: [] },
  { id: 'harbor-seal-b', label: 'Khóa tháp canh', x: 8.5, y: 3.15, world: true, neutral: true, neighbors: [] },
  { id: 'harbor-vault', label: 'Kho lõi', x: 23.5, y: .53, world: true, neutral: true, neighbors: [] },
  { id: 'harbor-extraction', label: 'Bến thoát', x: -28, y: .53, world: true, neutral: true, neighbors: [] },
];
// Normal repositioning remains local; objective interactions are exposed as
// explicit actions by Match so the first blockout is immediately playable.
for (const node of harborNodes) {
  if (node.team === 0) node.neighbors.push('harbor-seal-a');
  if (node.team === 1) node.neighbors.push('harbor-seal-b');
}
const harborObjects = [
  { id: 'harbor-fuel', kind: 'fuelBarrel', x: 2.8, y: .58, size: [.88, 1.16, .88], mass: 1.4, hp: 42 },
  { id: 'harbor-pad', kind: 'bouncePad', x: -.5, y: .15, size: [1.25, .3, 1.65], mass: 0, angle: .18 },
  { id: 'harbor-plank', kind: 'firePlank', x: 5.2, y: .22, size: [2.4, .44, 1.25], mass: 0, hp: 58 },
  { id: 'harbor-glass', kind: 'glassTrap', x: 10, y: 5.4, size: [2.2, .28, 1.2], mass: 0, fallMass: 3.4, hp: 48 },
  { id: 'harbor-magnet', kind: 'magnet', x: 6.4, y: 1.1, size: [1.05, 1.05, 1.05], mass: 0, hp: 68, radius: 6.5 },
];

export const MAPS = {
  townhouse: { id: 'townhouse', name: 'Nhà phố', tag: 'BỐN GIAN · BA TẦNG', description: 'Dãy nhà phố mở rộng với sân thượng, hiên và sáu cư dân. Chọn phòng và nhắm từng trụ.', tip: 'Đốt ván để cháy lan hoặc bắn sập mái kính.', center: 16.2, parts: townhouse, nodes: townhouseNodes, dropNodes: ['townhouse-drop-center'], relayRoute: ['townhouse-relay-approach', 'townhouse-relay-balcony', 'townhouse-node-5'], arenaObjects: arenaObjects.townhouse },
  tower: { id: 'tower', name: 'Tháp cao', tag: 'THÁP BẬC · CÁNH PHỤ', description: 'Tháp bậc bốn tầng, cánh phụ hai tầng và sáu cư dân trên một chiến tuyến rộng.', tip: 'Nam châm giữa sân sẽ bẻ đường bay của tên lửa.', center: 16.2, parts: tower, nodes: towerNodes, dropNodes: ['tower-drop-center'], relayRoute: ['tower-relay-approach', 'tower-node-1'], arenaObjects: arenaObjects.tower },
  bridge: { id: 'bridge', name: 'Cầu trên không', tag: 'HAI THÁP · CẦU DÀI', description: 'Hai tháp canh lớn nối bằng cầu gỗ trên cao, với nhiều tuyến bắn ở cả hai đầu.', tip: 'Lửa lan qua ván; kính treo có thể rơi xuống sân.', center: 16.2, parts: bridge, nodes: bridgeNodes, dropNodes: ['bridge-drop-center'], relayRoute: ['bridge-relay-approach', 'bridge-node-1'], arenaObjects: arenaObjects.bridge },
  fortress: { id: 'fortress', name: 'Pháo đài', tag: 'THÀNH RỘNG · THÁP GÁC', description: 'Pháo đài đá mở rộng với vọng lâu, tường chắn và nhiều lớp kết cấu chịu lực.', tip: 'Bắn đá treo để khóa sân giữa, nhưng coi chừng nam châm.', center: 16.2, parts: fortress, nodes: fortressNodes, dropNodes: ['fortress-drop-center'], relayRoute: ['fortress-relay-approach', 'fortress-node-4'], arenaObjects: arenaObjects.fortress },
  harbor: {
    id: 'harbor', name: 'Hải cảng', tag: 'ĐỘT KÍCH · PHÒNG THỦ',
    description: 'Đội Đột kích phá hai khóa, lấy lõi trong kho rồi rút về bến thoát trước khi hết lượt.',
    tip: 'Phá khóa cầu cảng và khóa tháp canh trước khi tiếp cận kho lõi.',
    asymmetric: true, center: 0, parts: [...harborRaiders, ...harborDefenders], partsByTeam: [harborRaiders, harborDefenders],
    nodes: harborNodes, dropNodes: ['harbor-seal-a'], arenaObjects: harborObjects,
    heist: { sealNodeIds: ['harbor-seal-a', 'harbor-seal-b'], vaultNodeId: 'harbor-vault', extractionNodeId: 'harbor-extraction', maxAttackerTurns: 12 },
  },
};
export const DEFAULT_MAP = 'tower';
export const MAP_CATALOG = Object.values(MAPS).map(({ parts, partsByTeam: _partsByTeam, nodes, dropNodes: _dropNodes, arenaObjects: _arenaObjects, heist: _heist, ...map }) => ({ ...map, thumbnail: parts.map(({ kind, x, y, size, material }) => ({ kind, x, y, size, material })) }));
