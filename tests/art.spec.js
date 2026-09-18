import { test, expect } from '@playwright/test';
import { Match } from '../game.js';

test('material audio produces distinct, finite, non-silent waveforms', async ({ page }) => {
  await page.goto('/?controller=1');
  const results = await page.evaluate(async () => {
    const { synthesize } = await import('/audio.js'); const results = [];
    for (const type of ['wood', 'brick', 'stone', 'glass', 'barrel', 'pad']) {
      const ctx = new OfflineAudioContext(1, 44100, 44100);
      synthesize(ctx, ctx.destination, type);
      const buffer = await ctx.startRendering(), data = buffer.getChannelData(0);
      let energy = 0, crossings = 0, peak = 0;
      for (let i = 1; i < data.length; i++) { energy += data[i] ** 2; peak = Math.max(peak, Math.abs(data[i])); if (data[i] * data[i - 1] < 0) crossings++; }
      results.push({ type, energy, crossings, peak, finite: data.every(Number.isFinite) });
    }
    return results;
  });
  for (const result of results) { expect(result.finite).toBe(true); expect(result.energy).toBeGreaterThan(.01); expect(result.peak).toBeLessThan(1); }
  expect(new Set(results.filter(r => ['wood', 'brick', 'stone', 'glass'].includes(r.type)).map(r => r.crossings)).size).toBe(4);
  expect(results.find(r => r.type === 'glass').crossings).toBeGreaterThan(results.find(r => r.type === 'stone').crossings * 4);
});

test('environment meshes render and a fuel blast produces bounded effects and audio', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?controller=1');
  const game = new Match('tower'), initial = game.snapshot();
  await page.evaluate(async snapshot => {
    const { createScene } = await import('/scene.js');
    document.querySelector('#app').remove(); document.body.classList.remove('controller');
    const container = document.querySelector('#scene'); container.style.cssText = 'position:fixed;inset:0';
    window.environmentScene = createScene(container); window.environmentScene.setMode('game');
    window.environmentSounds = []; window.addEventListener('weapon-sound', event => window.environmentSounds.push(event.detail.type));
    window.environmentScene.update(snapshot);
  }, initial);
  await expect(page.locator('#scene')).toHaveAttribute('data-fuel-barrels', '2');
  await expect(page.locator('#scene')).toHaveAttribute('data-bounce-pads', '2');
  await expect(page.locator('#scene')).toHaveAttribute('data-asset-kit', '22');
  await expect(page.locator('#scene')).toHaveAttribute('data-resident-assets', '2');
  await expect(page.locator('#scene')).toHaveAttribute('data-weapon-assets', '6');
  await expect(page.locator('#scene')).toHaveAttribute('data-decor-assets', '8');
  await expect(page.locator('#scene')).toHaveAttribute('data-postprocessing', 'enabled');
  await expect(page.locator('#scene')).toHaveAttribute('data-bloom', 'true');
  await expect(page.locator('#scene')).toHaveAttribute('data-ambient-occlusion', 'true');
  await expect(page.locator('#scene')).toHaveAttribute('data-lighting-theme', 'tower');
  await expect(page.locator('#scene')).toHaveAttribute('data-mesh-compression', 'meshopt');
  await expect(page.locator('#scene')).toHaveAttribute('data-texture-compression', 'ktx2-ready');
  await expect(page.locator('#scene')).toHaveAttribute('data-environment-lighting', 'hdri');
  await expect.poll(() => page.locator('#scene').getAttribute('data-resident-models').then(Number)).toBeGreaterThan(0);
  await expect.poll(() => page.locator('#scene').getAttribute('data-weapon-models').then(Number)).toBeGreaterThan(0);
  await expect.poll(() => page.locator('#scene').getAttribute('data-map-decor').then(Number)).toBeGreaterThanOrEqual(6);
  await expect.poll(() => page.locator('#scene').getAttribute('data-structure-decor').then(Number)).toBeGreaterThan(0);
  game.damageEnvironment(game.environmentItems.find(i => i.kind === 'fuelBarrel'), 999, 'test');
  await page.evaluate(snapshot => window.environmentScene.update(snapshot), game.snapshot());
  await expect(page.locator('#scene')).toHaveAttribute('data-fuel-barrels', '1');
  await expect(page.locator('#scene')).toHaveAttribute('data-last-environment-event', 'barrelBlast');
  await expect(page.locator('#scene')).toHaveAttribute('data-impact-camera', 'active');
  await expect.poll(() => page.locator('#scene').getAttribute('data-impact-marks').then(Number)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.environmentSounds)).toContain('barrel');
  await expect.poll(() => page.locator('#scene').getAttribute('data-fragments').then(Number)).toBeLessThanOrEqual(180);
  await page.screenshot({ path: 'artifacts/environment-barrel-blast.png', scale: 'css' });
  await page.evaluate(snapshot => {
    snapshot.events.push({ id: 9999, type: 'blast', time: snapshot.time, x: 1, y: 2.5, radius: 5.2, weapon: 'pulse' });
    window.environmentScene.update(snapshot);
  }, game.snapshot());
  await expect(page.locator('#scene')).toHaveAttribute('data-last-weapon-vfx', 'pulse');
  await expect(page.locator('#scene')).toHaveAttribute('data-weapon-vfx', 'active');
  await expect.poll(() => page.locator('#scene').getAttribute('data-vfx-particles').then(Number)).toBeGreaterThan(0);
  await page.screenshot({ path: 'artifacts/weapon-vfx-pulse.png', scale: 'css' });
  expect(errors).toEqual([]);
});

test('cracks, material fragments, event deduplication, expiry and reconnect', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?controller=1');
  const game = new Match('tower'), initial = game.snapshot();
  const damaged = game.items.find(i => i.team === 1 && i.material === 'brick');
  const contact = damaged.body.position.clone(); contact.x += damaged.size[0] / 2;
  game.damage(damaged, damaged.maxHp * .35, 'blast', contact, 18); const cracked = game.snapshot();
  await page.evaluate(async snapshot => {
    const { createScene } = await import('/scene.js');
    document.querySelector('#app').remove(); document.body.classList.remove('controller');
    const container = document.querySelector('#scene'); container.style.cssText = 'position:fixed;inset:0';
    window.artTestScene = createScene(container); window.artTestScene.setMode('game'); window.artTestScene.update(snapshot);
    window.materialEvents = []; window.addEventListener('material-sound', e => window.materialEvents.push(e.detail.material));
  }, initial);
  await page.evaluate(snapshot => window.artTestScene.update(snapshot), cracked);
  await expect(page.locator('#scene')).toHaveAttribute('data-cracked', '1');
  await expect.poll(() => page.locator('#scene').getAttribute('data-attached-decals').then(Number)).toBeGreaterThan(0);
  await expect(page.locator('#scene')).toHaveAttribute('data-collapse-dust', 'brick');
  await page.screenshot({ path: 'artifacts/material-cracks.png', scale: 'css' });
  const glass = game.items.find(i => i.team === 1 && i.material === 'glass');
  game.damage(glass, 999); const broken = game.snapshot();
  await page.evaluate(snapshot => window.artTestScene.update(snapshot), broken);
  await expect.poll(() => page.locator('#scene').getAttribute('data-fragments').then(Number)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.materialEvents)).toEqual(['brick', 'glass']);
  await page.screenshot({ path: 'artifacts/material-glass-break.png', scale: 'css' });
  await page.evaluate(snapshot => window.artTestScene.update(snapshot), broken);
  expect(await page.evaluate(() => window.materialEvents.length)).toBe(2);
  // More events than one frame can draw must stay bounded.
  const stress = { ...broken, events: Array.from({ length: 80 }, (_, i) => ({ id: 100 + i, type: 'break', time: broken.time, material: ['wood', 'brick', 'stone', 'glass'][i % 4], p: [0, 2, 0], q: [0, 0, 0, 1], size: [1, 1, 1] })) };
  await page.evaluate(snapshot => window.artTestScene.update(snapshot), stress);
  await expect.poll(() => page.locator('#scene').getAttribute('data-fragments').then(Number)).toBeLessThanOrEqual(180);
  await expect(page.locator('#scene')).toHaveAttribute('data-fragments', '0', { timeout: 6000 });
  await page.evaluate(snapshot => { window.materialEvents = []; window.artTestScene.reset(); window.artTestScene.update(snapshot); }, broken);
  expect(await page.evaluate(() => window.materialEvents.length)).toBe(0);
  await expect(page.locator('#scene')).toHaveAttribute('data-cracked', '1');
  expect(errors).toEqual([]);
});

test('character rigs animate visually without changing collider pose; reduced motion stays still', async ({ page }) => {
  await page.goto('/?controller=1');
  const result = await page.evaluate(async () => {
    const { createArt } = await import('/art.js'); const art = createArt(); const resident = art.resident(0, 2);
    resident.position.set(4, 3, 0); resident.userData.team = 0;
    art.animateResident(resident, 1000, false, null); const a = resident.userData.rig.position.y;
    art.animateResident(resident, 1300, false, null); const b = resident.userData.rig.position.y;
    resident.userData.hurtUntil = 2; art.animateResident(resident, 1500, false, null); const hurt = resident.userData.mouth.scale.y;
    art.animateResident(resident, 3000, true, 0); const rest = resident.userData.rig.position.toArray();
    const won = resident.userData.arms[0].rotation.z;
    const fragments = ['wood', 'brick', 'stone', 'glass'].map(m => { const mesh = art.fragment(m, 1); return { material: mesh.userData.material, kind: mesh.userData.fragment, bounce: mesh.userData.bounce, scale: mesh.scale.toArray() }; });
    return { a, b, hurt, rest, won, pose: resident.position.toArray(), fragments };
  });
  expect(result.a).not.toBe(result.b); expect(result.hurt).toBeGreaterThan(1); expect(result.rest).toEqual([0, 0, 0]); expect(result.pose).toEqual([4, 3, 0]); expect(Math.abs(result.won)).toBe(2);
  expect(new Set(result.fragments.map(f => f.kind)).size).toBe(4);
  expect(result.fragments.map(f => f.material)).toEqual(['wood', 'brick', 'stone', 'glass']);
  expect(result.fragments.find(f => f.material === 'glass').scale[2]).toBeLessThan(result.fragments.find(f => f.material === 'wood').scale[2]);
  expect(result.fragments.find(f => f.material === 'stone').bounce).toBeLessThan(result.fragments.find(f => f.material === 'glass').bounce);
});

test('camera follows the active resident across teams and rooftops; overview and reduced motion remain available', async ({ page }) => {
  await page.goto('/?controller=1');
  const game = new Match('tower');
  await page.evaluate(async snapshot => {
    const { createScene } = await import('/scene.js');
    document.querySelector('#app').remove(); document.body.classList.remove('controller');
    const container = document.querySelector('#scene'); container.style.cssText = 'position:fixed;inset:0';
    window.focusScene = createScene(container); window.focusScene.setMode('game'); window.focusScene.update(snapshot);
  }, game.snapshot());
  await expect(page.locator('#scene')).toHaveAttribute('data-camera-mode', 'shooter');
  await expect.poll(() => page.locator('#scene').getAttribute('data-camera-x').then(Number)).toBeCloseTo(game.shooter.body.position.x + 3, 1);
  await page.screenshot({ path: 'artifacts/shooter-closeup.png', scale: 'css' });
  game.readyAim();
  await page.evaluate(snapshot => window.focusScene.update(snapshot), game.snapshot());
  await expect(page.locator('#scene')).toHaveAttribute('data-camera-mode', 'tactical');
  await expect(page.locator('#scene')).toHaveAttribute('data-resident-animation', 'aim');
  await expect(page.locator('#scene')).toHaveAttribute('data-active-weapon-model', 'pebble');
  await expect.poll(() => page.locator('#scene').getAttribute('data-camera-x').then(Number)).toBeGreaterThan(game.shooter.body.position.x + 4);
  await page.screenshot({ path: 'artifacts/tactical-aim.png', scale: 'css' });
  game.enterPhase('move', 12);
  game.team = 1; game.shooterCursor[1] = 2; game.syncShooter();
  await page.evaluate(snapshot => window.focusScene.update(snapshot), game.snapshot());
  await expect(page.locator('#scene')).toHaveAttribute('data-weapon', 'bloom');
  await expect(page.locator('#scene')).toHaveAttribute('data-active-weapon-model', 'bloom');
  await expect.poll(() => page.locator('#scene').getAttribute('data-camera-x').then(Number)).toBeCloseTo(game.shooter.body.position.x - 3, 1);
  await page.screenshot({ path: 'artifacts/rooftop-shooter.png', scale: 'css' });
  await page.evaluate(() => window.focusScene.setOverview(true));
  await expect(page.locator('#scene')).toHaveAttribute('data-camera-mode', 'overview');
  await expect.poll(() => page.locator('#scene').getAttribute('data-camera-x').then(Number)).toBeCloseTo(0, 1);
  await page.screenshot({ path: 'artifacts/resident-positions.png', scale: 'css' });
  await page.evaluate(() => window.focusScene.setOverview(false));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('#scene')).toHaveAttribute('data-camera-mode', 'overview');
  await expect(page.locator('#scene')).toHaveAttribute('data-camera-x', '0.00');
});
