const defaultMaterial = kind => (kind === 'resident' ? null : (['beam', 'bridge'].includes(kind) ? 'wood' : 'brick'));
const withId = (p, id) => { if (id) p.id = id; return p; };
const part = (kind, x, y, size, mass, hp, material = null) => ({ kind, x, y, size, mass, hp, material: material || defaultMaterial(kind) });
const pillar = (x, y, height = 1.9, width = 0.65, hp = 75) => part('block', x, y, [width, height, 1.7], 3, hp);
const beam = (x, y, width, kind = 'beam', id = undefined) => withId(part(kind, x, y, [width, 0.5, 2.05], 4, 110), id);
const resident = (x, y) => part('resident', x, y, [0.46], 0.8, 100);
const tower = [];
for (let floor = 0; floor < 4; floor++) {
  const base = floor * 2.45;
  tower.push(pillar(-2.15, base + 0.95), pillar(2.15, base + 0.95), beam(0, base + 2.16, 5.3));
}
tower.push(withId(part('roof', 0, 10.2, [5.8, 0.7, 2.4], 3, 110), 'tower-roof'));
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
function lookout(parts, x, height, id) { parts.push(withId(part('block', x, height / 2, [1.35, height, 1.8], 4, 65, 'wood'), id)); }
lookout(tower, -6.6, 1.4, 'tower-lookout'); lookout(townhouse, -6.6, 1, 'townhouse-lookout'); lookout(bridge, 6.6, 1.4, 'bridge-lookout'); lookout(fortress, 6.5, 1.4, 'fortress-lookout');
const roster = [
  ['Tú', 'pebble'], ['Bảo', 'heavy'], ['Mây', 'bloom'], ['Khoa', 'rocket'], ['Linh', 'drill'], ['Sóc', 'pulse'],
];
function populate(parts, spots, mapPrefix) {
  spots.forEach(([x, y, spot], i) => parts.push({ ...resident(x, y), name: roster[i][0], weapon: roster[i][1], spot, residentIndex: i, nodeId: `${mapPrefix}-node-${i}` }));
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
  { id: 'tower-node-6', label: 'Chân tháp trước', x: 2.15, y: 0.53, supportId: null, neighbors: ['tower-node-0', 'tower-node-7', 'tower-node-1', 'tower-node-8'] },
  { id: 'tower-node-7', label: 'Chân tháp sau', x: -2.15, y: 0.53, supportId: null, neighbors: ['tower-node-6', 'tower-node-4', 'tower-node-10'] },
  { id: 'tower-node-8', label: 'Hành lang lầu 1', x: 0, y: 2.94, supportId: 'tower-beam-0', neighbors: ['tower-node-1', 'tower-node-6', 'tower-node-9', 'tower-node-10'] },
  { id: 'tower-node-9', label: 'Hành lang lầu 2', x: 0, y: 5.39, supportId: 'tower-beam-1', neighbors: ['tower-node-8', 'tower-node-5', 'tower-node-3', 'tower-node-2'] },
  { id: 'tower-node-10', label: 'Hiên cánh phụ', x: -4.35, y: 2.94, supportId: 'tower-wing-beam', neighbors: ['tower-node-7', 'tower-node-8', 'tower-node-3', 'tower-node-4'] },
];

const townhouseNodes = [
  { id: 'townhouse-node-0', label: 'Sân trước', x: 7.8, y: 0.53, supportId: null, neighbors: ['townhouse-node-6', 'townhouse-node-1'] },
  { id: 'townhouse-node-1', label: 'Hiên nhà', x: 6, y: 2.94, supportId: 'townhouse-beam-front', neighbors: ['townhouse-node-0', 'townhouse-node-8', 'townhouse-node-5'] },
  { id: 'townhouse-node-2', label: 'Sân thượng', x: -1.3, y: 7.84, supportId: 'townhouse-roof-1', neighbors: ['townhouse-node-9', 'townhouse-node-3', 'townhouse-node-10'] },
  { id: 'townhouse-node-3', label: 'Mái phía sau', x: -3.9, y: 5.39, supportId: 'townhouse-roof-back', neighbors: ['townhouse-node-4', 'townhouse-node-9', 'townhouse-node-2'] },
  { id: 'townhouse-node-4', label: 'Chòi vườn', x: -6.6, y: 1.53, supportId: 'townhouse-lookout', neighbors: ['townhouse-node-7', 'townhouse-node-3'] },
  { id: 'townhouse-node-5', label: 'Mái phía trước', x: 3.9, y: 5.39, supportId: 'townhouse-roof-front', neighbors: ['townhouse-node-1', 'townhouse-node-8', 'townhouse-node-10'] },
  { id: 'townhouse-node-6', label: 'Sân giữa', x: 2.6, y: 0.53, supportId: null, neighbors: ['townhouse-node-0', 'townhouse-node-7', 'townhouse-node-8'] },
  { id: 'townhouse-node-7', label: 'Sân sau', x: -2.6, y: 0.53, supportId: null, neighbors: ['townhouse-node-6', 'townhouse-node-4', 'townhouse-node-9'] },
  { id: 'townhouse-node-8', label: 'Ban công giữa', x: 1.3, y: 2.94, supportId: 'townhouse-beam-mid-1', neighbors: ['townhouse-node-6', 'townhouse-node-1', 'townhouse-node-9', 'townhouse-node-5'] },
  { id: 'townhouse-node-9', label: 'Hành lang sau lầu 1', x: -1.3, y: 2.94, supportId: 'townhouse-beam-mid-2', neighbors: ['townhouse-node-7', 'townhouse-node-8', 'townhouse-node-3', 'townhouse-node-2'] },
  { id: 'townhouse-node-10', label: 'Đỉnh mái trước', x: 1.3, y: 7.84, supportId: 'townhouse-roof-2', neighbors: ['townhouse-node-5', 'townhouse-node-2'] },
];

const bridgeNodes = [
  { id: 'bridge-node-0', label: 'Bờ sân', x: 7.8, y: 0.53, supportId: null, neighbors: ['bridge-node-6', 'bridge-node-4', 'bridge-node-1'] },
  { id: 'bridge-node-1', label: 'Ban công', x: 5, y: 2.94, supportId: 'bridge-beam-front-1', neighbors: ['bridge-node-0', 'bridge-node-4', 'bridge-node-6', 'bridge-node-8'] },
  { id: 'bridge-node-2', label: 'Đỉnh tháp trước', x: 3, y: 8.39, supportId: 'bridge-roof-front', neighbors: ['bridge-node-8'] },
  { id: 'bridge-node-3', label: 'Đỉnh tháp sau', x: -3, y: 8.39, supportId: 'bridge-roof-back', neighbors: ['bridge-node-9'] },
  { id: 'bridge-node-4', label: 'Chòi vườn', x: 6.6, y: 1.93, supportId: 'bridge-lookout', neighbors: ['bridge-node-0', 'bridge-node-1'] },
  { id: 'bridge-node-5', label: 'Cầu nối', x: 0.65, y: 5.71, supportId: 'bridge-span', neighbors: ['bridge-node-8', 'bridge-node-10'] },
  { id: 'bridge-node-6', label: 'Chân tháp trước', x: 3, y: 0.53, supportId: null, neighbors: ['bridge-node-0', 'bridge-node-7', 'bridge-node-1'] },
  { id: 'bridge-node-7', label: 'Chân tháp sau', x: -3, y: 0.53, supportId: null, neighbors: ['bridge-node-6', 'bridge-node-9'] },
  { id: 'bridge-node-8', label: 'Cửa cầu tháp trước', x: 3, y: 5.39, supportId: 'bridge-beam-front-2', neighbors: ['bridge-node-1', 'bridge-node-5', 'bridge-node-2'] },
  { id: 'bridge-node-9', label: 'Cửa cầu tháp sau', x: -3, y: 5.39, supportId: 'bridge-beam-back-2', neighbors: ['bridge-node-7', 'bridge-node-10', 'bridge-node-3'] },
  { id: 'bridge-node-10', label: 'Cầu nối sau', x: -0.65, y: 5.71, supportId: 'bridge-span', neighbors: ['bridge-node-5', 'bridge-node-9'] },
];

const fortressNodes = [
  { id: 'fortress-node-0', label: 'Sân thành', x: 7.8, y: 0.53, supportId: null, neighbors: ['fortress-node-4', 'fortress-node-6'] },
  { id: 'fortress-node-1', label: 'Tháp gác trước', x: 4.35, y: 5.9, supportId: 'fortress-roof-front', neighbors: ['fortress-node-6', 'fortress-node-9', 'fortress-node-2'] },
  { id: 'fortress-node-2', label: 'Mặt thành', x: 2.6, y: 8.67, supportId: 'fortress-beam-top', neighbors: ['fortress-node-1', 'fortress-node-10'] },
  { id: 'fortress-node-3', label: 'Tháp gác sau', x: -4.35, y: 5.9, supportId: 'fortress-roof-back', neighbors: ['fortress-node-7', 'fortress-node-9', 'fortress-node-5'] },
  { id: 'fortress-node-4', label: 'Chòi ngoài', x: 6.5, y: 1.93, supportId: 'fortress-lookout', neighbors: ['fortress-node-0', 'fortress-node-6'] },
  { id: 'fortress-node-5', label: 'Đỉnh thành sau', x: -2.6, y: 8.67, supportId: 'fortress-beam-top', neighbors: ['fortress-node-3', 'fortress-node-10'] },
  { id: 'fortress-node-6', label: 'Cổng thành trước', x: 4.35, y: 0.53, supportId: null, neighbors: ['fortress-node-0', 'fortress-node-4', 'fortress-node-8', 'fortress-node-1'] },
  { id: 'fortress-node-7', label: 'Chân thành sau', x: -4.35, y: 0.53, supportId: null, neighbors: ['fortress-node-8', 'fortress-node-3'] },
  { id: 'fortress-node-8', label: 'Tầng hầm thành', x: 0, y: 2.94, supportId: 'fortress-beam-base', neighbors: ['fortress-node-6', 'fortress-node-7', 'fortress-node-9'] },
  { id: 'fortress-node-9', label: 'Gian giữa lầu 2', x: 0, y: 5.39, supportId: 'fortress-beam-mid', neighbors: ['fortress-node-8', 'fortress-node-1', 'fortress-node-3', 'fortress-node-10'] },
  { id: 'fortress-node-10', label: 'Vọng lâu chính diện', x: 0, y: 8.67, supportId: 'fortress-beam-top', neighbors: ['fortress-node-9', 'fortress-node-2', 'fortress-node-5'] },
];

export const MAPS = {
  townhouse: { id: 'townhouse', name: 'Nhà phố', tag: 'BỐN GIAN · BA TẦNG', description: 'Khu nhà bốn gian với tầng áp mái và sáu cư dân. Chọn phòng và nhắm từng trụ.', tip: 'Thử phá trụ giữa hai gian nhà.', center: 15, parts: townhouse, nodes: townhouseNodes },
  tower: { id: 'tower', name: 'Tháp cao', tag: 'ĐỔ DÂY CHUYỀN', description: 'Tháp bốn tầng và cánh phụ hai tầng, sáu cư dân. Phá chân trụ để kéo cả tháp xuống.', tip: 'Bắn từ ban công; phá trụ tạo phản ứng dây chuyền.', center: 13, parts: tower, nodes: towerNodes },
  bridge: { id: 'bridge', name: 'Cầu trên không', tag: 'HAI THÁP · MỘT CẦU', description: 'Hai tháp ba tầng, sáu cư dân và cầu gỗ trên cao. Cư dân canh trên cầu, mái tháp và sân.', tip: 'Bắn cầu nối để hạ cư dân trên cao.', center: 15, parts: bridge, nodes: bridgeNodes },
  fortress: { id: 'fortress', name: 'Pháo đài', tag: 'TƯỜNG CHẮN PHÍA TRƯỚC', description: 'Thành ba tầng, sáu cư dân, tháp gác và tường đá. Bắn vòng qua hoặc phá tường.', tip: 'Nâng góc từ chòi gác để vượt tường chắn.', center: 15, parts: fortress, nodes: fortressNodes },
};
export const DEFAULT_MAP = 'tower';
export const MAP_CATALOG = Object.values(MAPS).map(({ parts, nodes, ...map }) => ({ ...map, thumbnail: parts.map(({ kind, x, y, size, material }) => ({ kind, x, y, size, material })) }));
