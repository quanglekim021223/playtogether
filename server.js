import express from 'express';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { randomBytes, randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import QRCode from 'qrcode';
import { Match } from './game.js';
import { MAPS, MAP_CATALOG, DEFAULT_MAP } from './maps.js';

export function createApp({ port = 3000 } = {}) {
  const app = express(); const http = createServer(app); const io = new Server(http, { maxHttpBufferSize: 8192 });
  const rooms = new Map();
  const publicPath = fileURLToPath(new URL('./public/', import.meta.url));
  app.use(express.static(publicPath));
  app.use('/vendor/three', express.static(fileURLToPath(new URL('./node_modules/three/build/', import.meta.url))));
  app.get('/health', (_, res) => res.json({ ok: true }));
  const previews = new Map();
  app.get('/maps', (_, res) => res.json(MAP_CATALOG));
  app.get('/preview.json', (req, res) => {
    const mapId = req.query.map || DEFAULT_MAP;
    if (typeof mapId !== 'string' || !Object.hasOwn(MAPS, mapId)) return res.status(400).json({ error: 'Bản đồ không hợp lệ.' });
    if (!previews.has(mapId)) previews.set(mapId, new Match(mapId).snapshot());
    res.json(previews.get(mapId));
  });
  app.get('/connection', async (req, res) => {
    const addresses = Object.values(networkInterfaces()).flat().filter(i => i.family === 'IPv4' && !i.internal).map(i => i.address);
    const host = req.hostname;
    const base = process.env.PUBLIC_URL || (['localhost', '127.0.0.1', '::1'].includes(host) ? `http://${addresses[0] || 'localhost'}:${port}` : `${req.protocol}://${req.get('host')}`);
    const code = typeof req.query.room === 'string' ? req.query.room.toUpperCase() : '';
    if (!rooms.has(code)) return res.status(404).json({ error: 'Không tìm thấy phòng.' });
    const url = `${base.replace(/\/$/, '')}/?room=${code}`;
    res.json({ url, qr: await QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: '#253b48', light: '#fff8e9' } }) });
  });
  function activePlayer(room) {
    if (!room.game || (room.mode === 'practice' && room.game.team === 1)) return null;
    const players = room.players.filter(p => p.team === room.game.team && p.connected);
    return players[Math.floor((room.game.turn - 1) / 2) % Math.max(1, players.length)] || null;
  }
  function state(room) {
    return { code: room.code, mapId: room.mapId, mode: room.mode, hostOnline: Boolean(room.hostSocket), players: room.players.map(({ token, ...p }) => p), game: room.game?.snapshot() || null, activeId: activePlayer(room)?.id || null };
  }
  function broadcast(room) { io.to(room.code).emit('state', state(room)); }
  const validToken = t => typeof t === 'string' && /^[a-zA-Z0-9-]{20,80}$/.test(t);
  io.on('connection', socket => {
    let room = null; let player = null; let host = false; let windowAt = 0; let count = 0; let lastSteerAt = 0;
    function limited() { const now = Date.now(); if (now - windowAt > 1000) { windowAt = now; count = 0; } return ++count > 45; }
    function handle(event, fn) {
      socket.on(event, (data = {}, ack = () => {}) => {
        if (typeof ack !== 'function') ack = () => {};
        if (!data || typeof data !== 'object' || limited()) return ack({ error: 'Thao tác quá nhanh hoặc dữ liệu không hợp lệ.' });
        try { ack(fn(data) || { ok: true }); } catch { ack({ error: 'Không thể thực hiện thao tác.' }); }
      });
    }
    handle('create', ({ token }) => {
      if (room || !validToken(token)) return { error: 'Phiên không hợp lệ.' };
      if (rooms.size >= 100) return { error: 'Máy chủ đã đầy phòng.' };
      let code; do { code = randomBytes(3).toString('hex').toUpperCase(); } while (rooms.has(code));
      room = { code, hostToken: token, hostSocket: socket.id, players: [], game: null, mapId: DEFAULT_MAP, mode: 'party', touched: Date.now() };
      rooms.set(code, room); host = true; socket.join(code); broadcast(room); return { code };
    });
    handle('resumeHost', ({ code, token }) => {
      if (room) return { error: 'Đã ở trong phòng.' };
      const found = rooms.get(code);
      if (!found || found.hostToken !== token) return { error: 'Phòng cũ đã đóng. Hãy tạo phòng mới.' };
      room = found; host = true;
      if (room.hostSocket) io.sockets.sockets.get(room.hostSocket)?.disconnect(true);
      room.hostSocket = socket.id; socket.join(code); broadcast(room); return { code };
    });
    handle('join', ({ code, token, name }) => {
      if (room || !validToken(token) || typeof code !== 'string') return { error: 'Phiên không hợp lệ.' };
      const found = rooms.get(code.toUpperCase());
      if (!found) return { error: 'Không tìm thấy phòng. Kiểm tra lại mã.' };
      const existing = found.players.find(p => p.token === token);
      if (!existing && found.game) return { error: 'Trận đã bắt đầu. Hãy chờ ván tiếp theo.' };
      if (!existing && found.players.length >= 8) return { error: 'Phòng đủ 8 người.' };
      if (!existing && (typeof name !== 'string' || !name.trim())) return { error: 'Nhập tên để tham gia.' };
      room = found;
      if (existing) {
        io.sockets.sockets.get(existing.id)?.disconnect(true); player = existing; player.id = socket.id; player.connected = true;
      } else {
        const count = room.players.filter(p => p.team === 0).length;
        player = { id: socket.id, token, name: name.trim().slice(0, 20), team: count <= room.players.length - count ? 0 : 1, connected: true };
        room.players.push(player);
      }
      socket.join(room.code); broadcast(room); return { id: player.id, code: room.code };
    });
    handle('team', ({ team }) => {
      if (!player || room.game || ![0, 1].includes(team)) return { error: 'Chỉ đổi đội khi ở sảnh.' };
      if (room.players.filter(p => p.team === team && p !== player).length >= 4) return { error: 'Đội đã đủ 4 người.' };
      player.team = team; broadcast(room);
    });
    handle('selectMap', ({ mapId }) => {
      if (!host || room.hostSocket !== socket.id || room.game) return { error: 'Chỉ chủ phòng được chọn bản đồ ở sảnh.' };
      if (mapId !== 'random' && (typeof mapId !== 'string' || !Object.hasOwn(MAPS, mapId))) return { error: 'Bản đồ không hợp lệ.' };
      room.mapId = mapId; broadcast(room);
    });
    handle('start', ({ mode }) => {
      if (!host || room.hostSocket !== socket.id || room.game) return { error: 'Chỉ chủ phòng được bắt đầu ở sảnh.' };
      if (!['practice', 'party'].includes(mode)) return { error: 'Chế độ không hợp lệ.' };
      if (mode === 'party' && ![0, 1].every(t => room.players.some(p => p.team === t && p.connected))) return { error: 'Cần ít nhất một điện thoại ở mỗi đội.' };
      if (mode === 'practice' && !room.players.some(p => p.team === 0 && p.connected)) return { error: 'Kết nối một điện thoại vào đội San Hô để đấu bot.' };
      const mapIds = Object.keys(MAPS);
      const mapId = room.mapId === 'random' ? mapIds[randomInt(mapIds.length)] : room.mapId;
      room.mode = mode; room.game = new Match(mapId); broadcast(room);
    });
    const canMove = () => room?.game?.phase === 'move' && activePlayer(room)?.id === socket.id;
    const canAim = () => room?.game?.phase === 'aim' && activePlayer(room)?.id === socket.id;
    const canSkill = () => room?.game?.phase === 'flight' && activePlayer(room)?.id === socket.id;
    const currentActor = input => input.turn === room?.game?.turn && input.shooterId === room?.game?.shooter?.id;
    handle('move', input => {
      if (!canMove() || !currentActor(input)) return { error: 'Chưa thể di chuyển hoặc lượt đã thay đổi.' };
      if (!input || typeof input.nodeId !== 'string') return { error: 'Vị trí di chuyển không hợp lệ.' };
      const result = room.game.moveShooter(input.nodeId);
      if (!result.ok) return { error: result.error };
      broadcast(room);
      return result;
    });
    handle('readyAim', () => {
      if (!canMove()) return { error: 'Chưa thể vào pha ngắm.' };
      if (!room.game.readyAim()) return { error: 'Không thể vào pha ngắm.' };
      broadcast(room);
    });
    handle('aim', input => {
      if (!canAim() || !currentActor(input)) return { error: 'Lượt hoặc nhân vật đã thay đổi.' };
      if (!room.game.setAim(input)) return { error: 'Góc, lực hoặc vũ khí không hợp lệ.' };
    });
    handle('fire', input => {
      if (!canAim() || !currentActor(input)) return { error: 'Lượt hoặc nhân vật đã thay đổi.' };
      if (!room.game.fire(input)) return { error: 'Thông số bắn không hợp lệ.' };
      broadcast(room);
    });
    handle('skill', input => {
      if (!canSkill() || !currentActor(input)) return { error: 'Chỉ kích hoạt kỹ năng khi đạn đang bay và tới lượt của bạn.' };
      if (!Number.isInteger(input.projectileId) || typeof input.action !== 'string') return { error: 'Đạn hoặc kỹ năng không hợp lệ.' };
      const projectile = room.game.projectiles.get(input.projectileId);
      if (!projectile || projectile.turn !== room.game.turn || projectile.shooterId !== input.shooterId || projectile.team !== room.game.team) return { error: 'Đạn không thuộc lượt hiện tại.' };
      if (input.action === 'steer') {
        if (!Number.isInteger(input.sequence) || !Number.isFinite(input.value)) return { error: 'Lệnh bẻ lái không hợp lệ.' };
        const now = Date.now();
        if (now - lastSteerAt < 50) return { error: 'Lệnh bẻ lái quá nhanh.' };
        const result = room.game.triggerSkill(input);
        if (!result.ok) return { error: result.error };
        lastSteerAt = now; broadcast(room); return result;
      }
      const result = room.game.triggerSkill(input);
      if (!result.ok) return { error: result.error };
      broadcast(room);
      return result;
    });
    handle('lobby', () => {
      if (!host || room.hostSocket !== socket.id) return { error: 'Chỉ chủ phòng được về sảnh.' };
      room.game = null; room.players = room.players.filter(p => p.connected); broadcast(room);
    });
    socket.on('disconnect', () => {
      if (!room) return;
      if (host && room.hostSocket === socket.id) room.hostSocket = null;
      if (player && player.id === socket.id) player.connected = false;
      room.touched = Date.now(); broadcast(room);
    });
  });
  let frame = 0;
  const timer = setInterval(() => {
    for (const room of rooms.values()) {
      const connected = room.hostSocket || room.players.some(p => p.connected);
      if (!connected && Date.now() - room.touched > 10 * 60_000) { rooms.delete(room.code); continue; }
      if (room.game && connected && room.game.phase !== 'over') {
        room.game.step();
        const bot = room.mode === 'practice' ? room.game.team === 1 : !activePlayer(room);
        if (bot) {
          if (room.game.phase === 'move' && room.game.deadline - room.game.time < 5.2) {
            room.game.readyAim();
          } else if (room.game.phase === 'aim' && room.game.deadline - room.game.time < 16) {
            room.game.fire(room.game.botAim());
          }
        }
      }
      if (frame % 4 === 0 && connected && room.game) broadcast(room);
    }
    frame++;
  }, 1000 / 60);
  return { app, http, io, rooms, close: () => { clearInterval(timer); io.close(); http.close(); } };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  const { http } = createApp({ port });
  http.listen(port, '0.0.0.0', () => console.log(`Block Party: http://localhost:${port}`));
}
