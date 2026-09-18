import test from 'node:test';
import assert from 'node:assert/strict';
import { Match, rollWeather, getWeatherConfig } from '../game.js';

test('rollWeather respects weights and PRNG seed', () => {
  assert.equal(rollWeather(() => 0.1), 'clear');
  assert.equal(rollWeather(() => 0.39), 'clear');
  assert.equal(rollWeather(() => 0.45), 'rain');
  assert.equal(rollWeather(() => 0.64), 'rain');
  assert.equal(rollWeather(() => 0.70), 'fog');
  assert.equal(rollWeather(() => 0.84), 'fog');
  assert.equal(rollWeather(() => 0.90), 'storm');
  assert.equal(rollWeather(() => 0.99), 'storm');
});

test('getWeatherConfig returns correct parameters for all 4 weather types', () => {
  const clear = getWeatherConfig('clear');
  assert.equal(clear.type, 'clear');
  assert.equal(clear.gravityMod, 1.0);
  assert.equal(clear.trajectoryDots, 15);
  assert.equal(clear.windMod, 1.0);
  assert.equal(clear.windAllWeapons, false);

  const rain = getWeatherConfig('rain');
  assert.equal(rain.type, 'rain');
  assert.equal(rain.gravityMod, 1.08);
  assert.equal(rain.trajectoryDots, 15);
  assert.equal(rain.windMod, 1.0);
  assert.equal(rain.windAllWeapons, false);

  const fog = getWeatherConfig('fog');
  assert.equal(fog.type, 'fog');
  assert.equal(fog.gravityMod, 1.0);
  assert.equal(fog.trajectoryDots, 9);
  assert.equal(fog.windMod, 1.0);
  assert.equal(fog.windAllWeapons, false);

  const storm = getWeatherConfig('storm');
  assert.equal(storm.type, 'storm');
  assert.equal(storm.gravityMod, 1.0);
  assert.equal(storm.trajectoryDots, 15);
  assert.equal(storm.windMod, 1.6);
  assert.equal(storm.windAllWeapons, true);
});

test('Match accepts weather override and exposes weather in snapshot', () => {
  const match = new Match('tower', { weather: 'storm' });
  assert.equal(match.weather.type, 'storm');
  assert.equal(match.weather.windAllWeapons, true);

  const snap = match.snapshot();
  assert.ok(snap.weather);
  assert.equal(snap.weather.type, 'storm');
  assert.equal(snap.weather.windMod, 1.6);
  assert.equal(snap.weather.windAllWeapons, true);
  snap.weather.windMod = 99;
  assert.equal(match.weather.windMod, 1.6, 'snapshot consumers must not mutate authoritative weather');
});

test('engine defaults to deterministic clear weather while live matches can request a weighted roll', () => {
  assert.equal(new Match('tower').weather.type, 'clear');
  assert.equal(new Match('tower', { randomWeather: true, rng: () => .9 }).weather.type, 'storm');
});

test('Rain gravityMod causes steeper ballistic trajectory and lower impact point', () => {
  const clearMatch = new Match('tower', { weather: 'clear' });
  const rainMatch = new Match('tower', { weather: 'rain' });

  const shooter = clearMatch.shooter;
  const aim = { angle: 35, power: 45, weapon: shooter.weapon };

  const clearImpact = clearMatch.traceAim(aim);
  const rainImpact = rainMatch.traceAim(aim);

  assert.ok(clearImpact && clearImpact.p);
  assert.ok(rainImpact && rainImpact.p);

  // Rain gravityMod (1.08) causes trajectory to drop lower on target
  assert.ok(rainImpact.p[1] < clearImpact.p[1], `Rain impact Y (${rainImpact.p[1]}) should be lower than clear (${clearImpact.p[1]})`);

  for (const match of [clearMatch, rainMatch]) {
    match.wind = 0; match.readyAim(); match.fire(aim);
    match.projectile.body.position.set(0, 15, 0); match.projectile.body.velocity.set(8, 3, 0); match.deadline = Infinity;
  }
  for (let i = 0; i < 6; i++) { clearMatch.step(.05); rainMatch.step(.05); }
  assert.ok(rainMatch.projectile.body.position.y < clearMatch.projectile.body.position.y, 'authoritative Cannon trajectory must use rain gravity too');
});

test('Storm wind affects pebble weapons which are normally immune to wind', () => {
  // Clear match: wind does NOT affect pebble
  const clearMatchWindPos = new Match('tower', { weather: 'clear' });
  clearMatchWindPos.wind = 1.5;
  const aimPos = { angle: 35, power: 45, weapon: clearMatchWindPos.shooter.weapon };
  const clearImpactPos = clearMatchWindPos.traceAim(aimPos);

  const clearMatchWindZero = new Match('tower', { weather: 'clear' });
  clearMatchWindZero.wind = 0;
  const aimZero = { angle: 35, power: 45, weapon: clearMatchWindZero.shooter.weapon };
  const clearImpactZero = clearMatchWindZero.traceAim(aimZero);

  // For pebble in clear weather, wind does not alter the trajectory
  assert.equal(clearImpactPos.p[0], clearImpactZero.p[0]);
  assert.equal(clearImpactPos.p[1], clearImpactZero.p[1]);

  // Storm match: windAllWeapons = true deflects pebble
  const stormMatch = new Match('tower', { weather: 'storm' });
  stormMatch.wind = 1.5;
  const aimStorm = { angle: 35, power: 45, weapon: stormMatch.shooter.weapon };
  const stormImpact = stormMatch.traceAim(aimStorm);

  // In storm, wind changes the trajectory impact
  assert.notEqual(stormImpact.p[1], clearImpactZero.p[1]);

  for (const match of [clearMatchWindPos, stormMatch]) {
    match.readyAim(); match.fire({ angle: 35, power: 45, weapon: match.shooter.weapon });
    match.projectile.body.position.set(0, 15, 0); match.projectile.body.velocity.set(0, 0, 0); match.deadline = Infinity;
  }
  for (let i = 0; i < 6; i++) { clearMatchWindPos.step(.05); stormMatch.step(.05); }
  assert.ok(stormMatch.projectile.body.position.x > clearMatchWindPos.projectile.body.position.x + .01, 'authoritative Cannon trajectory must apply storm wind to Pebble');
});

test('Fog weather config specifies 9 trajectory dots for preview', () => {
  const clearMatch = new Match('tower', { weather: 'clear' });
  const fogMatch = new Match('tower', { weather: 'fog' });

  assert.equal(clearMatch.weather.trajectoryDots, 15);
  assert.equal(fogMatch.weather.trajectoryDots, 9);
});
