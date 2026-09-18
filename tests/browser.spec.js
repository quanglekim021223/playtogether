import { test, expect } from '@playwright/test';

async function joinPhone(browser, code, _label, viewport = { width: 844, height: 390 }) {
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
  const phone = await context.newPage();
  await phone.goto(`http://localhost:3000/?room=${code}`);
  await expect(phone.getByRole('heading', { name: 'Tay cầm đã kết nối.' })).toBeVisible();
  await expect(phone.locator('#join-form')).toHaveCount(0);
  const touch = await context.newCDPSession(phone);
  return { context, phone, touch };
}
async function pullStart({ phone, touch }, dx, dy) {
  const box = await phone.locator('#aim-pad').boundingBox();
  const x = box.x + box.width * 0.5, y = box.y + box.height * 0.35;
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx, y: y + dy }] });
  return { x, y };
}
const release = ({ touch }) => touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
const cancel = ({ touch }) => touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
async function createRoom(page) {
  await page.goto('/'); await expect(page.locator('#scene canvas')).toBeVisible(); await page.locator('#create').click();
  await expect(page.locator('#qr')).toHaveAttribute('src', /^data:image\/png/);
  return (await page.locator('.room-code').textContent()).trim();
}

test('phone-only practice: drag updates TV aim, release fires, bot returns turn', async ({ page, browser }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const code = await createRoom(page); await expect(page.locator('#practice')).toBeDisabled();
  const player = await joinPhone(browser, code, 'Quang');
  try {
    player.phone.on('pageerror', e => errors.push(e.message));
    await page.locator('#practice').click();
    await expect(page.locator('#scene')).toHaveAttribute('data-fuel-barrels', '2');
    await expect(page.locator('#scene')).toHaveAttribute('data-bounce-pads', '2');
    await expect(page.locator('#wind')).toHaveAttribute('data-direction', /^(left|right|calm)$/);
    await expect(page.locator('#wind')).toHaveAttribute('aria-label', /Chỉ ảnh hưởng Bazooka/);
    await expect(player.phone.locator('#wind .wind-track')).toBeVisible();
    await expect(page.locator('input[type="range"], #fire, #aim-pad')).toHaveCount(0);
    await expect(player.phone.locator('.move-btn')).toHaveCount(1);
    await player.phone.locator('.move-btn').click();
    await expect(player.phone.locator('#shooter-spot')).toHaveText('Chân tháp trước');
    await player.phone.getByRole('button', { name: /Sân trước/ }).click();
    await expect(player.phone.locator('#shooter-spot')).toHaveText('Sân trước');
    await player.phone.locator('#ready-aim').click();
    await expect(player.phone.locator('#aim-pad')).toHaveAttribute('aria-disabled', 'false');
    await expect(player.phone.locator('#shooter-name')).toHaveCount(0);
    await expect(player.phone.locator('#shooter-weapon')).toHaveText('Ná cao su');
    await expect(page.locator('#scene')).toHaveAttribute('data-camera-mode', 'tactical');
    await expect.poll(() => page.locator('#scene').getAttribute('data-camera-x').then(Number)).toBeLessThan(-1);
    await page.screenshot({ path: 'artifacts/resident-aim.png', scale: 'css' });
    await player.phone.screenshot({ path: 'artifacts/resident-controller.png', scale: 'css' });
    await pullStart(player, -35, 100);
    await expect(player.phone.locator('#aim-pad')).toHaveClass(/armed/);
    const power = await player.phone.locator('#pull-power').textContent();
    await expect(player.phone.locator('#pull-angle')).not.toHaveText('—');
    await expect(page.locator('#aim-readout')).toContainText(`LỰC ${power}%`);
    await expect(page.locator('#scene')).toHaveAttribute('data-aim-impact', /^(block|resident|fuelBarrel|bouncePad|ground|out)$/);
    await expect(page.locator('#scene')).toHaveAttribute('data-trajectory-samples', '15');
    await release(player);
    await expect(player.phone.locator('#skill-btn')).toBeVisible({ timeout: 2000 });
    await expect(player.phone.locator('#skill-btn')).toContainText('Đạn kép');
    await expect(page.locator('#scene')).toHaveAttribute('data-projectile-interpolation', 'prediction');
    await player.phone.locator('#skill-btn').click();
    await expect(player.phone.locator('#skill-btn')).toBeHidden();
    await expect(page.locator('#aim-readout')).toBeHidden();
    await expect(page.locator('#round-label')).toHaveText('LƯỢT 2', { timeout: 12_000 });
    await expect(page.locator('#round-label')).toHaveText('LƯỢT 3', { timeout: 15_000 });
    await player.phone.locator('#ready-aim').click();
    await expect(player.phone.locator('#aim-pad')).toHaveAttribute('aria-disabled', 'false');
    const weapon = await page.locator('#scene').getAttribute('data-weapon');
    const weaponNames = { pebble: 'Ná cao su', heavy: 'Bazooka', bloom: 'Súng cối', rocket: 'Tên lửa', drill: 'Súng phá giáp', pulse: 'Súng xung lực' };
    expect(weaponNames[weapon]).toBeTruthy();
    await expect(player.phone.locator('#shooter-weapon')).toHaveText(weaponNames[weapon]);
    await player.phone.reload();
    await expect(player.phone.locator('#shooter-weapon')).toHaveText(weaponNames[weapon]);
    expect(errors).toEqual([]);
    await page.locator('#back-lobby').click();
  } finally { await player.context.close(); }
});

test('landscape controllers: orientation, cancel, mirrored pull, turns, reconnect', async ({ page, browser }) => {
  const code = await createRoom(page); const players = [];
  try {
    players.push(await joinPhone(browser, code, 'Quang', { width: 390, height: 844 }));
    players.push(await joinPhone(browser, code, 'Linh'));
    const [a, b] = players;
    await page.locator('#start').click();
    await expect(a.phone.locator('#aim-pad')).toHaveAttribute('aria-disabled', 'true');
    await expect.poll(() => a.phone.locator('#app').evaluate(element => getComputedStyle(element).transform)).not.toBe('none');
    await a.phone.screenshot({ path: 'artifacts/controller-auto-landscape.png', scale: 'css' });
    await a.phone.locator('#ready-aim').click();
    await expect(a.phone.locator('#aim-pad')).toHaveAttribute('aria-disabled', 'false');
    await a.phone.evaluate(() => {
      globalThis.testVibrations = [];
      Object.defineProperty(navigator, 'vibrate', { configurable: true, value: duration => { globalThis.testVibrations.push(duration); return true; } });
    });
    await pullStart(a, -35, -40);
    await expect(a.phone.locator('#aim-pad')).toHaveClass(/armed/);
    await expect.poll(() => a.phone.evaluate(() => globalThis.testVibrations)).toContain(8);
    await cancel(a);
    await a.phone.setViewportSize({ width: 844, height: 390 });
    await expect.poll(() => a.phone.locator('#app').evaluate(element => getComputedStyle(element).transform)).toBe('none');
    await expect(a.phone.locator('#aim-pad')).toHaveAttribute('aria-disabled', 'false');
    await expect(b.phone.locator('#aim-pad')).toHaveAttribute('aria-disabled', 'true');
    expect(await a.phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    // A short pull is a valid low-power shot; cancellation only arms after a longer pull.
    await pullStart(a, -18, 0);
    await expect(a.phone.locator('#aim-pad')).toHaveClass(/armed/);
    await expect.poll(() => a.phone.locator('#pull-power').textContent().then(Number)).toBeLessThan(25);
    await cancel(a);
    // Wrong-direction pulls, pointer cancellation, and returning to origin never fire.
    await pullStart(a, 50, 35); await release(a); await expect(page.locator('#round-label')).toHaveText('LƯỢT 1');
    await pullStart(a, -50, 35); await cancel(a); await expect(a.phone.locator('#aim-pad')).not.toHaveClass(/dragging/);
    const origin = await pullStart(a, -45, 35);
    await a.touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [origin] });
    await expect(a.phone.locator('#pull-status')).toHaveText('THẢ ĐỂ HỦY CÚ BẮN');
    await expect(a.phone.locator('#aim-pad')).toHaveClass(/canceling/);
    await release(a);
    await expect(a.phone.locator('#aim-pad')).toHaveAttribute('aria-disabled', 'false');
    // Rotating mid-pull cancels it instead of releasing a shot.
    await pullStart(a, -40, 35); await a.phone.setViewportSize({ width: 390, height: 844 }); await cancel(a);
    await a.phone.setViewportSize({ width: 844, height: 390 });
    await expect(a.phone.locator('#aim-pad')).not.toHaveClass(/dragging/);
    await pullStart(a, -40, 35); await release(a);
    await expect(b.phone.locator('#ready-aim')).toBeVisible({ timeout: 15_000 });
    await b.phone.locator('#ready-aim').click();
    await expect(b.phone.locator('#aim-pad')).toHaveAttribute('aria-disabled', 'false');
    await a.phone.reload(); await expect(a.phone.locator('#phone-team')).toContainText('SAN HÔ');
    await expect(a.phone.locator('#aim-pad')).toHaveAttribute('aria-disabled', 'true');
    await expect(b.phone.locator('#pull-hint')).toHaveText('Kéo phải lấy lực · lên/xuống chỉnh góc');
    await pullStart(b, 40, 35);
    const power = await b.phone.locator('#pull-power').textContent();
    await expect(page.locator('#aim-readout')).toContainText(`LỰC ${power}%`);
    await expect(page.locator('#aim-readout')).toContainText('↖');
    await release(b);
    await expect(page.locator('#aim-readout')).toBeHidden();
    await page.locator('#back-lobby').click();
    await expect(a.phone.getByRole('heading', { name: 'Tay cầm đã kết nối.' })).toBeVisible();
    await expect(page.locator('#player-count')).toHaveText('2/8 người đã vào');
  } finally { for (const player of players) await player.context.close(); }
});

test('resident shot triggers live material damage, fragments and cracks on TV', async ({ page, browser }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const code = await createRoom(page); const player = await joinPhone(browser, code, 'Phá nhà');
  try {
    await page.locator('#map-picker [data-map="tower"]').click();
    await page.locator('#practice').click();
    await player.phone.locator('#ready-aim').click();
    await expect(player.phone.locator('#aim-pad')).toHaveAttribute('aria-disabled', 'false');
    await page.evaluate(() => {
      window.liveMaterials = [];
      window.addEventListener('material-sound', e => window.liveMaterials.push(e.detail.material));
    });
    await expect(player.phone.locator('#shooter-weapon')).toHaveText('Ná cao su');
    const box = await player.phone.locator('#aim-pad').boundingBox();
    const maxPull = Math.max(120, Math.min(180, box.width * .42));
    const horizontal = 10 + (30 - 15) / 85 * (maxPull - 10);
    const angleTravel = Math.max(60, Math.min(100, maxPull * .55));
    const vertical = (35 - 45) / 35 * angleTravel;
    await pullStart(player, -horizontal, vertical);
    await expect(page.locator('#aim-readout')).toContainText('LỰC 30%');
    await release(player);
    await expect.poll(() => page.evaluate(() => window.liveMaterials.length), { timeout: 8000 }).toBeGreaterThan(0);
    await expect.poll(() => page.locator('#scene').getAttribute('data-fragments').then(Number)).toBeGreaterThan(0);
    await expect.poll(() => page.locator('#scene').getAttribute('data-cracked').then(Number)).toBeGreaterThan(0);
    await page.screenshot({ path: 'artifacts/material-live-destruction.png', scale: 'css' });
    expect(errors).toEqual([]);
    await page.locator('#back-lobby').click();
  } finally { await player.context.close(); }
});

test('four maps: shared selection, correct 3D geometry, replay, random and slow preview', async ({ page, browser }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const code = await createRoom(page); const player = await joinPhone(browser, code, 'Kiến trúc sư');
  let releasePreview;
  try {
    for (const [mapId, name] of [['townhouse', 'Nhà phố'], ['tower', 'Tháp cao'], ['bridge', 'Cầu trên không'], ['fortress', 'Pháo đài']]) {
      await page.locator(`#map-picker [data-map="${mapId}"]`).click();
      await expect(page.locator('#scene')).toHaveAttribute('data-map', mapId);
      await expect(player.phone.locator('#map-summary')).toContainText(name);
      await page.locator('#practice').click();
      await player.phone.locator('#ready-aim').click();
      await expect(page.locator('#match-map')).toHaveText(name);
      await expect(player.phone.locator('#phone-team')).toContainText('SAN HÔ');
      await expect(player.phone.locator('#phone-health')).toHaveCount(0);
      await expect(page.locator('#health-0 .life')).toHaveCount(6);
      await expect(page.locator('#health-1 .life')).toHaveCount(6);
      await expect(page.locator('#scene')).toHaveAttribute('data-map', mapId);
      await page.locator('#camera-toggle').click();
      await expect(page.locator('#scene')).toHaveAttribute('data-camera-mode', 'overview');
      await expect.poll(() => page.locator('#scene').getAttribute('data-camera-x').then(Number)).toBeCloseTo(0, 1);
      await page.screenshot({ path: `artifacts/map-${mapId}.png`, scale: 'css' });
      if (mapId === 'tower') {
        await page.setViewportSize({ width: 390, height: 844 });
        const hud = await page.locator('.match-hud').boundingBox();
        expect(hud.x).toBeGreaterThanOrEqual(0); expect(hud.x + hud.width).toBeLessThanOrEqual(390);
        await page.screenshot({ path: 'artifacts/six-residents-narrow.png', scale: 'css' });
        await page.setViewportSize({ width: 1280, height: 800 });
      }
      await page.locator('#back-lobby').click();
      await expect(page.locator(`#map-picker [data-map="${mapId}"]`)).toHaveAttribute('aria-pressed', 'true');
    }
    await page.screenshot({ path: 'artifacts/map-picker.png', scale: 'css' });
    await page.locator('#map-picker [data-map="random"]').click(); await page.locator('#practice').click();
    await expect(page.locator('#scene')).toHaveAttribute('data-map', /^(townhouse|tower|bridge|fortress)$/);
    await expect(page.locator('#match-map')).not.toBeEmpty();
    await page.locator('#back-lobby').click();
    await expect(page.locator('#map-picker [data-map="random"]')).toHaveAttribute('aria-pressed', 'true');
    // Delay an obsolete preview until after a different map's match starts.
    const gate = new Promise(resolve => { releasePreview = resolve; });
    let intercepted;
    const seen = new Promise(resolve => { intercepted = resolve; });
    await page.route('**/preview.json?map=townhouse', async route => { intercepted(); await gate; await route.continue(); });
    await page.locator('#map-picker [data-map="townhouse"]').click(); await seen;
    await page.locator('#map-picker [data-map="bridge"]').click();
    await expect(page.locator('#scene')).toHaveAttribute('data-map', 'bridge');
    await page.locator('#practice').click();
    const response = page.waitForResponse(r => r.url().includes('preview.json?map=townhouse'));
    releasePreview(); await response;
    await expect(page.locator('#scene')).toHaveAttribute('data-map', 'bridge');
    await expect(page.locator('#match-map')).toHaveText('Cầu trên không');
    await page.locator('#back-lobby').click();
    expect(errors).toEqual([]);
  } finally { releasePreview?.(); await player.context.close(); }
});
