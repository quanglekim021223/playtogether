import { AIM_CANCEL_RADIUS, aimPullRange, crossedPowerMilestones, dragAim, smoothAimPoint } from './aim.js';
import { createGameAudio } from './audio.js';
import { MATERIALS } from './materials.js';
import { WEAPONS } from './weapons.js';
const app = document.querySelector('#app');
const socket = io();
const params = new URLSearchParams(location.search);
let controller = params.has('room') || params.has('controller');
if (controller) document.body.classList.add('controller');
let token = sessionStorage.getItem('bp-token');
if (!token) { token = globalThis.crypto?.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(24)), v => v.toString(16).padStart(2, '0')).join(''); sessionStorage.setItem('bp-token', token); }
let state = null, scene = null, playerId = null, screenKey = '', qrCode = '', connection = null, lastTurn = null, replayActive = false, replayWeapon = '';
let mapCatalog = [], previewRequest = 0, previewMap = null;
let autoJoinFailed = false;
let draft = { angle: 42, power: 30, weapon: 'pebble' };
let gesture = null, steerGesture = null, aimTimer = null, shotPending = false, skillSequence = 0, lastSteerSentAt = 0;
const audio = createGameAudio();
let muted = localStorage.getItem('bp-muted') === 'true'; audio.mute(muted);
const teams = ['San Hô', 'Ngọc Lam'];
const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toast = text => { const t = document.querySelector('#toast'); t.textContent = text; t.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove('show'), 4000); };
const emit = (event, data = {}) => new Promise(resolve => ((event === 'fire' || (event === 'skill' && data.action === 'steer')) ? socket.volatile : socket).timeout(4500).emit(event, data, (err, result) => {
  if (err) { toast('Mất kết nối. Đang thử kết nối lại…'); return resolve(null); }
  if (result?.error) toast(result.error); resolve(result);
}));
function unlockAudio() { audio.unlock(); }
window.addEventListener('game-blast', () => audio.play('blast'));
window.addEventListener('game-shot', () => audio.play('shot'));
window.addEventListener('material-sound', e => audio.play(e.detail.material, e.detail.strength));
window.addEventListener('weapon-sound', e => audio.play(e.detail.type));
window.addEventListener('replay-start', event => { if (!controller) { replayActive = true; replayWeapon = event.detail?.weaponName || ''; render(); } });
window.addEventListener('replay-end', () => { if (!controller) { replayActive = false; render(); } });
function updateWindIndicator(element, value, weather = null) {
  if (!element) return;
  const wind = Number.isFinite(value) ? value : 0;
  const direction = wind < -.05 ? 'left' : wind > .05 ? 'right' : 'calm';
  const arrow = direction === 'left' ? '←' : direction === 'right' ? '→' : '•';
  const label = direction === 'left' ? 'sang trái' : direction === 'right' ? 'sang phải' : 'lặng';
  const isStorm = Boolean(weather?.windAllWeapons);
  const note = isStorm ? 'Bão lớn: Gió đẩy mọi vũ khí!' : 'Chỉ ảnh hưởng Bazooka';
  element.dataset.direction = direction;
  if (isStorm) element.dataset.storm = 'true';
  else delete element.dataset.storm;
  element.style.setProperty('--wind-strength', `${Math.min(100, Math.abs(wind) / 1.5 * 100)}%`);
  element.setAttribute('aria-label', `Gió ${label}, cường độ ${Math.abs(wind).toFixed(1)}. ${note}.`);
  element.title = isStorm ? 'Bão lớn: Gió đẩy mọi vũ khí!' : 'Gió chỉ ảnh hưởng Bazooka';
  element.innerHTML = `<span class="wind-arrow" aria-hidden="true">${arrow}</span><span class="wind-name">${isStorm ? 'BÃO' : 'GIÓ'}</span><span class="wind-track" aria-hidden="true"><i></i></span><b>${Math.abs(wind).toFixed(1)}</b>`;
}
const brand = `<a class="brand" href="/" aria-label="Block Party trang chủ"><span class="brand-mark">b<span>p</span></span><span>BLOCK<br>PARTY<span class="brand-sub">ĐẠI CHIẾN HÀNG XÓM</span></span></a>`;
function header() { return `<header>${brand}<div class="header-actions"><span class="connection"><i></i><span id="network-label">Đã kết nối</span></span><button id="sound" class="icon-button" aria-label="Bật hoặc tắt âm thanh">${muted ? 'Âm thanh: tắt' : 'Âm thanh: bật'}</button><button id="fullscreen" class="icon-button" aria-label="Toàn màn hình">⛶</button></div></header>`; }
function bindHeader() {
  document.querySelector('#sound')?.addEventListener('click', () => { muted = !muted; localStorage.setItem('bp-muted', muted); audio.mute(muted); unlockAudio(); document.querySelector('#sound').textContent = muted ? 'Âm thanh: tắt' : 'Âm thanh: bật'; });
  document.querySelector('#fullscreen')?.addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else { await document.documentElement.requestFullscreen(); if (controller && screen.orientation?.lock) await screen.orientation.lock('landscape').catch(() => {}); } } catch { toast('Trình duyệt không hỗ trợ toàn màn hình.'); } });
}
async function requestLandscapeLock() {
  if (!controller) return;
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    await screen.orientation?.lock?.('landscape');
  } catch {}
}
function controls() {
  return `<section class="controller-weapons"><div class="shooter-card"><span id="shooter-icon" class="shooter-icon"></span><div><strong id="shooter-weapon"></strong><span id="shooter-spot"></span><span id="shooter-buff" class="shooter-buff" hidden></span><small id="shooter-hint"></small></div></div><div id="move-options" class="move-options" hidden></div><button id="ready-aim" class="button primary compact ready-aim-button" hidden>Sẵn sàng ngắm</button><button id="skill-btn" class="button primary compact skill-button" hidden>⚡ Kích hoạt</button></section>
  <section class="controller-touch"><div class="pull-heading"><span id="pull-status">CHẠM · KÉO · THẢ</span><span class="pull-power"><output id="pull-angle">—</output><small>°</small><output id="pull-power">0</output><small>% LỰC</small></span></div>
    <div id="aim-pad" role="application" aria-label="Vùng kéo ná để ngắm và thả để bắn" aria-disabled="true">
      <div class="pad-grid" aria-hidden="true"></div><div id="pull-cord" aria-hidden="true"></div><div id="pull-cancel" aria-hidden="true"><span>HỦY</span></div><div id="pull-anchor" aria-hidden="true"></div><div id="pull-knob" aria-hidden="true">✦</div>
      <div class="pad-cue"><span id="pull-direction">←</span><span id="pull-hint">Kéo trái lấy lực · lên/xuống chỉnh góc</span><small>Nhìn mũi tên trên màn hình lớn</small></div>
    </div><div class="pull-footer"><span>Ngang = lực · Dọc = góc · Thả = bắn</span><span>Kéo về điểm chạm để hủy</span></div>
  </section>`;
}
function landscape() { return matchMedia('(orientation: landscape)').matches; }
function canControl() { return Boolean(socket.connected && controller && !document.hidden && state?.game?.phase === 'aim' && state.activeId === playerId); }
function canSteer() { return Boolean(socket.connected && controller && !document.hidden && state?.game?.phase === 'flight' && state.activeId === playerId && state.game.activeSkill?.weapon === 'rocket' && state.game.activeSkill.available); }
function padPoint(event, pad) {
  const bounds = pad.getBoundingClientRect();
  return landscape()
    ? { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
    : { x: event.clientY - bounds.top, y: bounds.right - event.clientX };
}
function skillInput(action = state?.game?.activeSkill?.action, value) {
  const skill = state?.game?.activeSkill;
  return { turn: state.game.turn, shooterId: state.game.shooterId, projectileId: skill.projectileId, action, ...(value === undefined ? {} : { value }), sequence: ++skillSequence };
}
function sendSteer(value) {
  const now = performance.now();
  if (!canSteer() || now - lastSteerSentAt < 60 || Math.abs(value) < .08) return;
  lastSteerSentAt = now; emit('skill', skillInput('steer', Math.max(-1, Math.min(1, value))));
}
function sendAim() {
  if (aimTimer) return;
  aimTimer = setTimeout(() => { aimTimer = null; if (canControl() && !shotPending) socket.volatile.emit('aim', { ...draft, turn: state.game.turn, shooterId: state.game.shooterId }); }, 33);
}
function clearSteerGesture() {
  const pad = document.querySelector('#aim-pad'), previous = steerGesture; steerGesture = null;
  if (previous && pad?.hasPointerCapture(previous.id)) pad.releasePointerCapture(previous.id);
  pad?.classList.remove('steering');
}
function clearGesture({ steer = true } = {}) {
  clearTimeout(aimTimer); aimTimer = null;
  const pad = document.querySelector('#aim-pad'); const previous = gesture; gesture = null;
  if (previous && pad?.hasPointerCapture(previous.id)) pad.releasePointerCapture(previous.id);
  pad?.classList.remove('dragging', 'armed', 'canceling');
  for (const id of ['pull-anchor', 'pull-knob', 'pull-cord', 'pull-cancel']) document.getElementById(id)?.removeAttribute('style');
  const power = document.querySelector('#pull-power'); if (power) power.textContent = '0';
  const angle = document.querySelector('#pull-angle'); if (angle) angle.textContent = '—';
  if (steer) clearSteerGesture();
}
function cancelGesture() { clearGesture(); updateControls(); }
function moveGesture(event) {
  if (!gesture || event.pointerId !== gesture.id) return;
  if (!canControl() || gesture.turn !== state.game.turn) { cancelGesture(); return; }
  const point = padPoint(event, document.querySelector('#aim-pad'));
  const dx = point.x - gesture.x, dy = point.y - gesture.y;
  const rawDistance = Math.hypot(dx, dy);
  const canceling = rawDistance < AIM_CANCEL_RADIUS;
  gesture.filtered = canceling ? { x: dx, y: dy } : smoothAimPoint(gesture.filtered, { x: dx, y: dy });
  const shownDx = gesture.filtered.x, shownDy = gesture.filtered.y;
  const distance = Math.hypot(shownDx, shownDy); const scale = Math.min(1, gesture.maxPull / Math.max(1, distance));
  const pad = document.querySelector('#aim-pad');
  const rawAim = dragAim(dx, dy, state.game.team, gesture.maxPull);
  const previewAim = canceling ? null : dragAim(shownDx, shownDy, state.game.team, gesture.maxPull);
  gesture.rawAim = rawAim;
  gesture.aim = previewAim;
  const crossed = crossedPowerMilestones(gesture.lastPower, rawAim?.power, gesture.milestones);
  if (crossed.length) {
    crossed.forEach(mark => gesture.milestones.add(mark));
    navigator.vibrate?.(crossed.includes(100) ? 14 : 8);
  }
  gesture.lastPower = rawAim?.power || 0;
  const knob = document.querySelector('#pull-knob'), cord = document.querySelector('#pull-cord');
  knob.style.left = `${gesture.localX + shownDx * scale}px`; knob.style.top = `${gesture.localY + shownDy * scale}px`;
  cord.style.width = `${Math.min(distance, gesture.maxPull)}px`; cord.style.transform = `rotate(${Math.atan2(shownDy, shownDx)}rad)`;
  pad.classList.toggle('armed', Boolean(rawAim));
  pad.classList.toggle('canceling', canceling);
  document.querySelector('#pull-power').textContent = previewAim ? Math.round(previewAim.power) : '0';
  document.querySelector('#pull-angle').textContent = previewAim ? Math.round(previewAim.angle) : '—';
  document.querySelector('#pull-status').textContent = canceling ? 'THẢ ĐỂ HỦY CÚ BẮN' : rawAim ? 'THẢ TAY ĐỂ BẮN' : 'KÉO NGANG NGƯỢC ĐỐI THỦ';
  if (previewAim) { draft = { ...draft, ...previewAim }; sendAim(); }
}
function bindControls() {
  const pad = document.querySelector('#aim-pad'); if (!pad) return;
  pad.addEventListener('contextmenu', e => e.preventDefault());
  pad.addEventListener('pointerdown', event => {
    if (canSteer() && !steerGesture && event.isPrimary !== false && (event.pointerType === 'touch' || event.button === 0)) {
      event.preventDefault(); unlockAudio(); const point = padPoint(event, pad); steerGesture = { id: event.pointerId, y: point.y, lastY: point.y };
      pad.setPointerCapture(event.pointerId); pad.classList.add('steering'); return;
    }
    if (!canControl() || shotPending || gesture || event.isPrimary === false || (event.pointerType !== 'touch' && event.button !== 0)) return;
    event.preventDefault(); unlockAudio();
    const point = padPoint(event, pad);
    gesture = { id: event.pointerId, x: point.x, y: point.y, localX: point.x, localY: point.y, maxPull: aimPullRange(pad.clientWidth), turn: state.game.turn, aim: null, rawAim: null, filtered: null, lastPower: 0, milestones: new Set() };
    pad.setPointerCapture(event.pointerId); pad.classList.add('dragging');
    for (const id of ['pull-anchor', 'pull-knob', 'pull-cord', 'pull-cancel']) {
      const element = document.getElementById(id); element.style.left = `${gesture.localX}px`; element.style.top = `${gesture.localY}px`;
    }
    updateControls();
  });
  pad.addEventListener('pointermove', event => {
    if (steerGesture && event.pointerId === steerGesture.id) {
      const y = padPoint(event, pad).y;
      const delta = (steerGesture.lastY - y) / 42;
      steerGesture.lastY = y; sendSteer(delta); return;
    }
    moveGesture(event);
  });
  pad.addEventListener('pointerup', async event => {
    if (steerGesture && event.pointerId === steerGesture.id) { clearGesture(); updateControls(); return; }
    if (!gesture || event.pointerId !== gesture.id) return;
    moveGesture(event);
    const aim = gesture?.rawAim; const turn = gesture?.turn;
    const shouldFire = aim && canControl() && !shotPending && turn === state.game.turn;
    const input = { ...draft, ...aim, turn, shooterId: state.game.shooterId };
    clearGesture();
    if (!shouldFire) { updateControls(); return; }
    // Never queue a shot offline, and send final coordinates with the shot itself.
    shotPending = true; updateControls();
    const result = await emit('fire', input);
    if (result?.ok) { audio.play('shot'); navigator.vibrate?.(35); }
    shotPending = false; updateControls();
  });
  pad.addEventListener('pointercancel', event => { if (event.pointerId === gesture?.id || event.pointerId === steerGesture?.id) cancelGesture(); });
  pad.addEventListener('lostpointercapture', event => { if (event.pointerId === gesture?.id || event.pointerId === steerGesture?.id) cancelGesture(); });
  const readyBtn = document.querySelector('#ready-aim');
  if (readyBtn) {
    readyBtn.onclick = async () => {
      unlockAudio();
      await emit('readyAim');
    };
  }
  const skillBtn = document.querySelector('#skill-btn');
  if (skillBtn) {
    skillBtn.onclick = async () => {
      unlockAudio();
      navigator.vibrate?.(45);
      const skill = state?.game?.activeSkill;
      if (skill) await emit('skill', skillInput(skill.action, skill.weapon === 'rocket' ? -.75 : undefined));
    };
  }
}
function updateControls() {
  const isMove = state?.game?.phase === 'move' && state.activeId === playerId;
  const isFlight = state?.game?.phase === 'flight' && state.activeId === playerId;
  const steering = canSteer();
  const enabled = canControl() && !shotPending;
  if (!enabled && gesture) clearGesture();

  const readyBtn = document.querySelector('#ready-aim');
  if (readyBtn) readyBtn.hidden = !isMove;

  const skillBtn = document.querySelector('#skill-btn');
  if (skillBtn) {
    const hasSkill = isFlight && Boolean(state?.game?.activeSkill?.available);
    skillBtn.hidden = !hasSkill;
    if (hasSkill) {
      skillBtn.textContent = state.game.activeSkill.weapon === 'rocket' ? '🎯 Bổ nhào · hoặc vuốt dọc' : `⚡ ${state.game.activeSkill.label || 'Kích hoạt'}`;
    }
  }

  const moveOptions = document.querySelector('#move-options');
  if (moveOptions) {
    const moves = isMove && Array.isArray(state?.game?.availableMoves) ? state.game.availableMoves : [];
    if (moves.length > 0) {
      moveOptions.hidden = false;
      const html = moves.map(m => {
        const buffLabel = m.airdropBuff === 'heal' ? '+35 HP' : m.airdropBuff === 'power' ? 'x1.5 Dmg' : 'Khiên -50%';
        const airdropBadge = m.hasAirdrop ? ` 🎁 [${buffLabel}]` : '';
        const airdropClass = m.hasAirdrop ? ' airdrop-node' : '';
        return `<button class="button secondary compact move-btn${airdropClass}" data-node="${m.id}" style="margin-top:4px;font-size:10px;padding:6px 10px;width:100%">🏃 ${escape(m.label)}${airdropBadge}</button>`;
      }).join('');
      const sig = moves.map(m => `${m.id}:${m.hasAirdrop}`).join(',');
      if (moveOptions.dataset.signature !== sig) {
        moveOptions.dataset.signature = sig;
        moveOptions.innerHTML = html;
        moveOptions.querySelectorAll('.move-btn').forEach(btn => {
          btn.onclick = async () => {
            unlockAudio();
            await emit('move', { nodeId: btn.dataset.node, turn: state.game.turn, shooterId: state.game.shooterId });
          };
        });
      }
    } else {
      moveOptions.hidden = true;
      moveOptions.dataset.signature = '';
      moveOptions.innerHTML = '';
    }
  }

  const pad = document.querySelector('#aim-pad'); if (!pad) return;
  pad.setAttribute('aria-disabled', String(!(enabled || steering)));
  if (!gesture) {
    const statusEl = document.querySelector('#pull-status');
    if (statusEl) {
      statusEl.textContent = steering ? 'VUỐT LÊN / XUỐNG ĐỂ BẺ LÁI'
        : shotPending || state?.game?.phase === 'flight' ? 'ĐẠN ĐANG BAY…'
        : state?.game?.phase === 'settle' ? 'CÔNG TRÌNH ĐANG LẮNG XUỐNG…'
        : isMove ? 'PHA DI CHUYỂN · BẤM SẴN SÀNG'
        : enabled ? 'CHẠM · KÉO · THẢ'
        : !socket.connected ? 'ĐANG KẾT NỐI LẠI…' : 'CHỜ ĐẾN LƯỢT';
    }
  }
  const team = state?.players.find(p => p.id === playerId)?.team || 0;
  document.querySelector('#pull-direction').textContent = steering ? '↕' : team === 0 ? '←' : '→';
  document.querySelector('#pull-hint').textContent = steering ? 'Vuốt dọc để điều khiển tên lửa' : team === 0 ? 'Kéo trái lấy lực · lên/xuống chỉnh góc' : 'Kéo phải lấy lực · lên/xuống chỉnh góc';
}
window.addEventListener('resize', cancelGesture);
window.addEventListener('blur', cancelGesture);
document.addEventListener('visibilitychange', cancelGesture);
function teamLists() {
  for (const team of [0, 1]) {
    const list = document.querySelector(`#team-${team}`); if (!list) continue;
    const players = state.players.filter(p => p.team === team);
    list.innerHTML = players.length ? players.map((p, index) => `<div class="player"><span class="avatar">${index + 1}</span><span>Tay cầm ${index + 1}${p.id === playerId ? ' <small>(bạn)</small>' : ''}</span><small>${p.connected ? 'Sẵn sàng' : 'Mất kết nối'}</small></div>`).join('') : '<div class="empty-player">Đang chờ tay cầm…</div>';
  }
  const count = document.querySelector('#player-count'); if (count) count.textContent = `${state.players.filter(p => p.connected).length}/8 người đã vào`;
  updateMapUI();
  const practice = document.querySelector('#practice'); if (practice) practice.disabled = !state.players.some(p => p.team === 0 && p.connected);
  const start = document.querySelector('#start'); if (start) start.disabled = ![0, 1].every(t => state.players.some(p => p.team === t && p.connected));
}
function teamsMarkup() { return `<div class="teams"><div class="team coral"><h3><i></i> SAN HÔ</h3><div id="team-0"></div></div><div class="team teal"><h3><i></i> NGỌC LAM</h3><div id="team-1"></div></div></div>`; }
function mapThumbnail(map) {
  const minX = Math.min(...map.thumbnail.map(p => p.x - p.size[0] / 2));
  const maxX = Math.max(...map.thumbnail.map(p => p.x + p.size[0] / 2));
  const top = Math.max(...map.thumbnail.map(p => p.y + (p.size[1] || p.size[0]) / 2));
  const scale = Math.min(108 / (maxX - minX), 84 / top), center = (minX + maxX) / 2;
  return `<svg viewBox="0 0 120 100" aria-hidden="true"><path d="M5 93H115" stroke="#b8c7ba" stroke-width="3"/>${map.thumbnail.map(p => {
    const x = 60 + (p.x - center) * scale, y = 92 - p.y * scale;
    if (p.kind === 'resident') return `<circle cx="${x}" cy="${y}" r="4" fill="#d7654f"/>`;
    return `<rect x="${x - p.size[0] * scale / 2}" y="${y - p.size[1] * scale / 2}" width="${p.size[0] * scale}" height="${p.size[1] * scale}" rx="1" fill="${MATERIALS[p.material]?.color || '#51a69e'}" stroke="#fff8e9" stroke-width=".7"/>`;
  }).join('')}</svg>`;
}
function updateMapUI() {
  if (!state || state.game) return;
  const map = mapCatalog.find(m => m.id === state.mapId);
  const picker = document.querySelector('#map-picker');
  if (picker && !picker.children.length && mapCatalog.length) {
    picker.innerHTML = mapCatalog.map(m => `<button class="map-option" data-map="${m.id}" aria-pressed="false"><span class="map-thumb">${mapThumbnail(m)}</span><span><strong>${escape(m.name)}</strong><small>${escape(m.tag)}</small></span><span class="map-check" aria-hidden="true">✓</span></button>`).join('') + '<button class="map-option map-random" data-map="random" aria-pressed="false"><span class="random-icon" aria-hidden="true">⚄</span><span><strong>Ngẫu nhiên mỗi ván</strong><small>BẤT NGỜ CHO CẢ HAI ĐỘI</small></span><span class="map-check" aria-hidden="true">✓</span></button>';
    picker.querySelectorAll('[data-map]').forEach(button => button.onclick = () => emit('selectMap', { mapId: button.dataset.map }));
  }
  document.querySelectorAll('#map-picker [data-map]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.map === state.mapId)));
  const summary = document.querySelector('#map-summary');
  if (summary) summary.textContent = map ? `${map.name} · ${map.description}` : 'Ngẫu nhiên · Bản đồ được chọn khi bắt đầu ván.';
  const tip = document.querySelector('#map-tip'); if (tip) tip.textContent = map?.tip || 'Mỗi ván chọn một trong bốn công trình.';
  if (scene) loadPreview(state.mapId === 'random' ? 'tower' : state.mapId);
}
async function loadPreview(mapId = 'tower') {
  if (!scene || state?.game || previewMap === mapId) return;
  previewMap = mapId; const request = ++previewRequest;
  try {
    const response = await fetch(`/preview.json?map=${encodeURIComponent(mapId)}`);
    if (!response.ok) throw new Error('Preview request failed');
    const preview = await response.json();
    // A slow earlier response must never replace a newer selection or a live match.
    if (request !== previewRequest || state?.game) return;
    scene.reset(); scene.update(preview);
  } catch { if (request === previewRequest) { previewMap = null; toast('Chưa tải được hình xem trước. Thử chọn lại bản đồ.'); } }
}
async function setupScene() {
  try {
    const response = await fetch('/maps'); if (!response.ok) throw new Error('Map catalog failed');
    mapCatalog = await response.json(); updateMapUI();
  } catch { toast('Không tải được danh sách bản đồ. Hãy tải lại trang.'); }
  if (controller) { document.body.classList.add('controller'); screen.orientation?.lock?.('landscape').catch(() => {}); return; }
  try {
    const { createScene } = await import('./scene.js'); scene = createScene(document.querySelector('#scene'));
    if (state?.game) { scene.update(state.game); scene.setMode('game'); }
    else { scene.setMode(screenKey === 'lobby' ? 'lobby' : 'home'); updateMapUI(); loadPreview(state?.mapId === 'random' ? 'tower' : state?.mapId || 'tower'); }
  } catch (error) { toast('Không khởi tạo được 3D. Hãy dùng trình duyệt có WebGL2.'); console.error(error); }
}
function renderHome() {
  screenKey = 'home'; scene?.setMode('home');
  app.innerHTML = `${header()}<main class="home"><div class="hero-copy"><span class="eyebrow">BẠN BÈ TỐT. HÀNG XÓM KHÓ ƯA.</span><h1>Chào hàng xóm.<br><span>Đỡ lấy này!</span></h1><p>Một màn hình. Cả hội cùng chơi.<br>Kéo ná trên điện thoại, và cho nhà bên một bất ngờ.</p><button id="create" class="button primary">Tạo cuộc vui <span>↗</span></button><button id="join-link" class="text-button">Có mã phòng? Tham gia bằng điện thoại →</button><div class="home-facts"><span>2–8 người</span><span>Điện thoại là tay cầm</span><span>Không cần cài app</span></div></div><div class="world-caption"><span class="tiny-star">✦</span> ĐẢO HÀNG XÓM <small>Đấu trường đầu tiên</small></div></main><footer><span>CHƠI GẦN NHAU. VUI HƠN CÙNG NHAU.</span><span>BẢN THỬ NGHIỆM 0.1</span></footer>`;
  bindHeader();
  document.querySelector('#create').onclick = async () => { unlockAudio(); const result = await emit('create', { token }); if (result?.code) { sessionStorage.setItem('bp-host', result.code); render(); } };
  document.querySelector('#join-link').onclick = () => { location.href = '/?controller=1'; };
}
function renderJoin() {
  screenKey = 'join';
  const scannedCode = params.get('room')?.toUpperCase();
  if (scannedCode && !autoJoinFailed) {
    app.innerHTML = `<main class="controller-connect"><span class="connect-mark">↻</span><h1>Đang kết nối tay cầm</h1><p>Giữ điện thoại nằm ngang.</p></main>`;
    return;
  }
  app.innerHTML = `${header()}<main class="phone-shell"><span class="eyebrow">KẾT NỐI TAY CẦM</span><h1>Nhập mã phòng.</h1><form id="join-form"><label>Mã phòng<input id="room-code" autocapitalize="characters" autocomplete="off" maxlength="6" minlength="6" required placeholder="A1B2C3" value="${escape(scannedCode || '')}"></label><button class="button primary" type="submit">Kết nối <span>→</span></button></form><a class="text-button" href="/">Mở màn hình chung</a></main>`;
  bindHeader();
  document.querySelector('#join-form').onsubmit = async event => { event.preventDefault(); unlockAudio(); requestLandscapeLock(); const code = document.querySelector('#room-code').value.trim().toUpperCase(); const result = await emit('join', { code, token }); if (result?.id) { playerId = result.id; sessionStorage.setItem('bp-room', code); render(); } };
}
async function refreshQr() {
  if (qrCode === state.code && connection) { showQr(); return; }
  qrCode = state.code;
  try { const response = await fetch(`/connection?room=${state.code}`); if (!response.ok) throw Error(); connection = await response.json(); showQr(); } catch { toast('Chưa tải được QR. Bạn vẫn có thể nhập mã phòng.'); }
}
function showQr() {
  const img = document.querySelector('#qr'); if (img && connection) img.src = connection.qr;
  const url = document.querySelector('#join-url'); if (url && connection) { url.textContent = connection.url; url.href = connection.url; }
}
function renderLobby() {
  clearGesture(); document.body.classList.remove('controller-playing');
  screenKey = 'lobby'; scene?.setMode('lobby');
  if (controller) {
    app.innerHTML = `${header()}<main class="phone-shell"><span class="eyebrow">PHÒNG ${state.code}</span><h1>Tay cầm đã kết nối.</h1><p>Chọn phe. Trận đấu sẽ bắt đầu trên màn hình lớn.</p>${teamsMarkup()}<div class="team-switch"><button class="button coral-button" data-team="0">Phe San Hô</button><button class="button teal-button" data-team="1">Phe Ngọc Lam</button></div><p id="map-summary" class="phone-map"></p></main>`;
    document.querySelectorAll('[data-team]').forEach(b => b.onclick = () => emit('team', { team: Number(b.dataset.team) }));
  } else {
    app.innerHTML = `${header()}<main class="lobby-layout"><div class="lobby-copy"><span class="eyebrow">MỜI CẢ HỘI VÀO CHƠI</span><h1>Chọn nhà.<br><span>Rủ hàng xóm.</span></h1><p>Quét QR bằng điện thoại cùng Wi-Fi.<br>Chọn công trình cho cuộc đấu tiếp theo.</p><section class="map-selection" aria-label="Chọn bản đồ"><div id="map-picker"></div><p id="map-summary"></p><p id="map-tip"></p><div class="material-key" aria-label="Độ bền vật liệu"><span><i style="background:#8ee0e5"></i>Kính · dễ vỡ</span><span><i style="background:#b77943"></i>Gỗ · nhẹ</span><span><i style="background:#cd795c"></i>Gạch · vừa</span><span><i style="background:#83969c"></i>Đá · bền</span><span><i style="background:#d94b3f"></i>Thùng xăng · nổ</span><span><i style="background:#71d9c9"></i>Tấm nảy · đổi quỹ đạo</span></div></section></div><section class="lobby-panel"><div class="room-label"><span>PHÒNG CỦA BẠN</span><b id="player-count"></b></div><div class="join-block"><img id="qr" alt="Mã QR để tham gia phòng" width="148" height="148"><div><span class="small-label">QUÉT ĐỂ THAM GIA</span><strong class="room-code">${state.code}</strong><span class="qr-help">Hoặc mở link và nhập mã</span><a id="join-url" target="_blank" rel="noopener"></a></div></div>${teamsMarkup()}<button id="start" class="button primary">Bắt đầu trận <span>↗</span></button><button id="practice" class="button secondary">Một điện thoại + bot</button><p class="panel-note">Đấu nhóm: mỗi đội 1 người. Đấu bot: 1 người ở San Hô.</p></section></main><footer><span>NGẮM CHO CHUẨN. CƯỜI CHO ĐÃ.</span><span>ĐẢO HÀNG XÓM / 01</span></footer>`;
    document.querySelector('#start').onclick = () => { unlockAudio(); emit('start', { mode: 'party' }); };
    document.querySelector('#practice').onclick = () => { unlockAudio(); emit('start', { mode: 'practice' }); };
    refreshQr();
  }
  bindHeader(); teamLists();
}
function renderGame() {
  screenKey = 'game'; scene?.setMode('game'); document.body.classList.toggle('controller-playing', controller);
  if (controller) {
    app.innerHTML = `<main class="gamepad"><div class="gamepad-status"><span class="eyebrow" id="phone-team"></span><strong id="turn-heading"></strong><span id="weather-badge" class="weather-badge"></span><span class="wind" id="wind"></span><span class="timer" id="timer"></span></div><div class="gamepad-body">${controls()}</div></main>`;
  } else {
    app.innerHTML = `${header()}<div class="match-hud"><div class="score coral"><span>SAN HÔ</span><div id="health-0"></div></div><div class="round"><span id="round-label"></span><span id="weather-badge" class="weather-badge"></span><small class="wind" id="wind"></small><strong id="timer"></strong></div><div class="score teal"><span>NGỌC LAM</span><div id="health-1"></div></div></div><div class="turn-banner"><span class="turn-dot"></span><span id="turn-heading"></span><small id="turn-detail"></small><div id="aim-readout" class="aim-readout"></div></div><div class="bottom-game"><button id="back-lobby" class="button secondary compact">← Về sảnh</button><div class="spectator-note">Kéo trên điện thoại · Bắn từ nhân vật</div><button id="camera-toggle" class="button secondary compact" aria-pressed="false">Toàn cảnh</button><span class="room-badge"><span id="match-map"></span> · PHÒNG <b>${state.code}</b></span></div>`;
    document.querySelector('#back-lobby').onclick = () => emit('lobby');
    scene?.setOverview(false);
    document.querySelector('#camera-toggle').onclick = event => {
      const button = event.currentTarget, overview = button.getAttribute('aria-pressed') !== 'true';
      button.setAttribute('aria-pressed', String(overview)); button.textContent = overview ? 'Theo người bắn' : 'Toàn cảnh'; scene?.setOverview(overview);
    };
  }
  bindHeader(); bindControls(); updateGameUI();
}
function updateAimReadout(game = state?.game) {
  if (!game) return;
  const blocked = Boolean(game.aimImpact?.blockedByOwn);
  const readout = document.querySelector('#aim-readout');
  if (readout) {
    readout.hidden = game.phase !== 'aim';
    readout.classList.toggle('blocked', blocked);
    readout.textContent = `${game.team === 0 ? '↗' : '↖'} ${Math.round(game.aim.angle)}° · LỰC ${Math.round(game.aim.power)}%${blocked ? ' · ⚠ NHÀ MÌNH ĐANG CHE' : ''}`;
  }
  const pad = document.querySelector('#aim-pad');
  pad?.classList.toggle('blocked', blocked && game.phase === 'aim');
  if (gesture && blocked) document.querySelector('#pull-status').textContent = '⚠ ĐƯỜNG BẮN BỊ CHE';
}
function updateGameUI() {
  const game = state.game;
  const shooter = game.items.find(i => i.id === game.shooterId), weapon = WEAPONS[shooter?.weapon];
  const mapLabel = document.querySelector('#match-map'); if (mapLabel) mapLabel.textContent = game.mapName;
  updateAimReadout(game);
  updateWindIndicator(document.querySelector('#wind'), game.wind, game.weather);
  const weatherBadge = document.querySelector('#weather-badge');
  if (weatherBadge && game.weather) {
    const weatherIcons = { clear: '☀️', rain: '🌧️', fog: '🌫️', storm: '⛈️' };
    weatherBadge.textContent = `${weatherIcons[game.weather.type] || '☀️'} ${game.weather.name || ''}`;
    weatherBadge.dataset.weather = game.weather.type;
  }
  const activeLabel = state.mode === 'practice' && game.team === 1 ? 'Máy' : `Phe ${teams[game.team]}`;
  const mine = controller && state.activeId === playerId;
  const isMove = game.phase === 'move';
  const isFlight = game.phase === 'flight';
  const isSettle = game.phase === 'settle';
  document.querySelector('#turn-heading').textContent = isFlight ? 'Đạn đang bay' : isSettle ? 'Đang ổn định' : isMove ? (mine ? 'Chọn vị trí' : `${activeLabel} di chuyển`) : mine ? 'Kéo để ngắm' : `${activeLabel} đang ngắm`;
  const detail = document.querySelector('#turn-detail');
  if (detail) detail.textContent = isFlight || isSettle ? 'Chờ công trình ổn định…' : `${weapon?.name || ''} · ${shooter?.spot || ''}`;
  document.querySelector('#timer').textContent = ['move', 'aim'].includes(game.phase) ? `${game.remaining}s` : '•••';
  document.querySelector('#round-label')?.replaceChildren(`LƯỢT ${game.turn}`);
  for (let team = 0; team < 2; team++) {
    const residents = game.items.filter(i => i.kind === 'resident' && i.team === team);
    const el = document.querySelector(`#health-${team}`);
    if (el) el.innerHTML = residents.map(i => `<span class="life ${i.hp <= 0 ? 'lost' : ''} ${i.id === game.shooterId ? 'active' : ''}" title="${WEAPONS[i.weapon]?.name} · ${Math.ceil(i.hp)} máu">${i.hp > 0 ? '●' : '×'}<i style="width:${Math.max(0, i.hp)}%"></i></span>`).join('');
  }
  if (controller) {
    document.querySelector('#shooter-spot').textContent = shooter?.spot || '';
    document.querySelector('#shooter-weapon').textContent = weapon?.name || '';
    document.querySelector('#shooter-icon').textContent = weapon?.icon || '';
    document.querySelector('#shooter-hint').textContent = weapon?.hint || '';
    const buffEl = document.querySelector('#shooter-buff');
    if (buffEl) {
      if (shooter?.buff) {
        buffEl.hidden = false;
        buffEl.className = `shooter-buff buff-${shooter.buff.type}`;
        buffEl.textContent = shooter.buff.type === 'power'
          ? `⚡ Sát thương x1.5 (${shooter.buff.charges})`
          : shooter.buff.type === 'armor'
          ? `🛡️ Khiên -50% (${shooter.buff.charges})`
          : `❤️ Hồi máu`;
      } else {
        buffEl.hidden = true;
      }
    }
    const me = state.players.find(p => p.id === playerId);
    document.querySelector('#phone-team').textContent = `${teams[me?.team || 0].toUpperCase()} · LƯỢT ${game.turn}`;
    document.body.dataset.team = me?.team || 0;
  }
  updateControls();
}
function renderOver() {
  clearGesture(); document.body.classList.remove('controller-playing');
  screenKey = 'over'; const game = state.game;
  const actions = controller ? '<p>Chờ chủ phòng mở ván tiếp theo.</p>' : `<div class="result-actions">${scene?.canReplay?.() ? '<button id="watch-replay" class="button secondary">Xem lại cú bắn <span>▶</span></button>' : ''}<button id="again" class="button primary">Về sảnh · Chơi tiếp <span>↻</span></button></div>`;
  app.innerHTML = `${header()}<main class="results"><span class="eyebrow">HÀNG XÓM NHỚ NHAU LÂU</span><div class="trophy">✦</div><h1>${game.winner === -1 ? 'Hòa rồi!' : `${teams[game.winner]}<br>thắng rồi!`}</h1><p>${game.turn} lượt bắn. Một cuộc vui đáng nhớ.</p>${actions}</main>`;
  bindHeader(); document.querySelector('#again')?.addEventListener('click', () => emit('lobby')); document.querySelector('#watch-replay')?.addEventListener('click', () => scene?.replayLast());
}
function renderReplay() {
  screenKey = 'replay';
  app.innerHTML = `${header()}<div class="replay-letterbox" aria-hidden="true"></div><div class="replay-hud"><span>PHÁT LẠI CÚ BẮN QUYẾT ĐỊNH${replayWeapon ? `<strong>${escape(replayWeapon)}</strong>` : ''}</span><button id="skip-replay" class="button secondary compact">Bỏ qua ›</button></div>`;
  bindHeader(); document.querySelector('#skip-replay')?.addEventListener('click', () => scene?.skipReplay());
}
function render() {
  if (!state) { if (controller) renderJoin(); else renderHome(); return; }
  if (controller && !playerId) return;
  const target = !state.game ? 'lobby' : state.game.phase === 'over' ? (!controller && replayActive ? 'replay' : 'over') : 'game';
  if (screenKey !== target) {
    if (target === 'lobby') renderLobby(); else if (target === 'over') renderOver(); else if (target === 'replay') renderReplay(); else renderGame();
  } else if (target === 'lobby') teamLists(); else if (target === 'game') updateGameUI();
}
socket.on('state', next => {
  const changedMatch = Boolean(next.game) !== Boolean(state?.game);
  if (changedMatch) { ++previewRequest; previewMap = null; scene?.reset(); lastTurn = null; replayActive = false; }
  const actorChanged = next.game?.shooterId !== state?.game?.shooterId || next.game?.turn !== state?.game?.turn || next.activeId !== state?.activeId;
  if (actorChanged || next.game?.phase !== 'aim') clearGesture({ steer: false });
  if (actorChanged || next.game?.phase !== 'flight' || next.game?.activeSkill?.weapon !== 'rocket') clearSteerGesture();
  state = next;
  if (next.game) {
    if (lastTurn !== `${next.game.turn}:${next.game.shooterId}`) { lastTurn = `${next.game.turn}:${next.game.shooterId}`; draft = { ...next.game.aim }; skillSequence = 0; }
    scene?.update(next.game);
  } else if (changedMatch) loadPreview(next.mapId === 'random' ? 'tower' : next.mapId);
  render();
});
socket.on('aimPreview', preview => {
  if (!state?.game || state.game.phase !== 'aim' || preview.turn !== state.game.turn || preview.shooterId !== state.game.shooterId) return;
  state.game.aim = preview.aim;
  state.game.aimImpact = preview.impact;
  scene?.updateAim(preview);
  updateAimReadout(state.game);
});
socket.on('connect', async () => {
  const label = document.querySelector('#network-label'); if (label) label.textContent = 'Đã kết nối';
  if (controller) {
    const scannedCode = params.get('room')?.toUpperCase();
    const code = scannedCode || sessionStorage.getItem('bp-room');
    if (code) {
      const result = await emit('join', { code, token });
      if (result?.id) { playerId = result.id; sessionStorage.setItem('bp-room', code); screen.orientation?.lock?.('landscape').catch(() => {}); render(); }
      else { autoJoinFailed = true; state = null; playerId = null; renderJoin(); }
    }
  } else {
    const code = sessionStorage.getItem('bp-host');
    if (code) { const result = await emit('resumeHost', { code, token }); if (!result?.code) { sessionStorage.removeItem('bp-host'); state = null; renderHome(); } }
  }
});
socket.on('disconnect', () => { clearGesture(); const label = document.querySelector('#network-label'); if (label) label.textContent = 'Đang kết nối lại…'; updateControls(); toast('Mất kết nối. Giữ trang mở để tự kết nối lại.'); });
render(); setupScene();
