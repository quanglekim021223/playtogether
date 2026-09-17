// Procedural effects: no external audio download. Output is routed through a master gain.
const profiles = {
  wood: { frequency: 185, filter: 800, duration: .2, tone: 'triangle', noise: .6 },
  brick: { frequency: 340, filter: 2600, duration: .26, tone: 'square', noise: 1 },
  stone: { frequency: 65, filter: 420, duration: .42, tone: 'sine', noise: .9 },
  glass: { frequency: 2100, filter: 6500, duration: .58, tone: 'sine', noise: .32 },
  blast: { frequency: 85, filter: 550, duration: .5, tone: 'triangle', noise: 1 },
  shot: { frequency: 210, filter: 900, duration: .16, tone: 'triangle', noise: .5 },
};
export function synthesize(context, output, type, strength = 1) {
  const p = profiles[type]; if (!p) return;
  const now = context.currentTime, duration = p.duration, volume = Math.max(.05, Math.min(1, strength)) * .13;
  const envelope = context.createGain(); envelope.gain.setValueAtTime(0, now); envelope.gain.linearRampToValueAtTime(volume, now + .004); envelope.gain.exponentialRampToValueAtTime(.0001, now + duration); envelope.connect(output);
  const osc = context.createOscillator(); osc.type = p.tone; osc.frequency.setValueAtTime(p.frequency, now); osc.frequency.exponentialRampToValueAtTime(p.frequency * (type === 'glass' ? .83 : .32), now + duration);
  const toneGain = context.createGain(); toneGain.gain.value = type === 'brick' ? .12 : .38; osc.connect(toneGain); toneGain.connect(envelope); osc.start(now); osc.stop(now + duration);
  const noise = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate), channel = noise.getChannelData(0);
  let seed = 523; for (let i = 0; i < channel.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; channel[i] = (seed / 4294967296 * 2 - 1) * p.noise; }
  const source = context.createBufferSource(); source.buffer = noise;
  const filter = context.createBiquadFilter(); filter.type = type === 'glass' ? 'highpass' : 'lowpass'; filter.frequency.value = p.filter; source.connect(filter); filter.connect(envelope); source.start(now);
  const extras = [];
  if (type === 'glass') for (const ratio of [1.47, 2.13, 2.81]) {
    const ring = context.createOscillator(), gain = context.createGain(); ring.frequency.value = p.frequency * ratio; gain.gain.value = .09; ring.connect(gain); gain.connect(envelope); ring.start(now); ring.stop(now + duration); extras.push(ring, gain);
  }
  source.onended = () => { [osc, toneGain, source, filter, envelope, ...extras].forEach(node => node.disconnect()); };
}
export function createGameAudio() {
  let context = null, master = null, muted = false;
  const lastPlayed = new Map();
  return {
    unlock() {
      if (!context) {
        const Audio = window.AudioContext || window.webkitAudioContext; if (!Audio) return;
        context = new Audio(); master = context.createGain(); master.gain.value = muted ? 0 : .75;
        const compressor = context.createDynamicsCompressor(); compressor.threshold.value = -14; compressor.ratio.value = 8; master.connect(compressor); compressor.connect(context.destination);
      }
      context.resume().catch(() => {});
    },
    mute(value) { muted = value; if (master) master.gain.setValueAtTime(value ? 0 : .75, context.currentTime); },
    play(type, strength = 1) {
      if (!context || muted || context.state !== 'running') return;
      const now = context.currentTime;
      if (now - (lastPlayed.get(type) ?? -1) < .09) return;
      lastPlayed.set(type, now); synthesize(context, master, type, strength);
    },
  };
}
