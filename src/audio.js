let ctx = null;
let muted = false;
let lastTumbleAt = 0;

export function initAudio(initialMuted = false) {
  muted = initialMuted;
  if (typeof window === 'undefined') return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else ctx.resume();
  });
  // ensure resume on first user gesture (autoplay rules)
  const onFirst = () => {
    ctx.resume();
    document.removeEventListener('pointerdown', onFirst);
  };
  document.addEventListener('pointerdown', onFirst);
}

export function setMuted(v) { muted = v; }
export function isMuted()  { return muted; }

function tone({ freq = 440, duration = 0.1, type = 'sine', gain = 0.15, attack = 0.005, decay = 0.1, freqEnd = null }) {
  if (!ctx || muted) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime);
  if (freqEnd !== null) o.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + duration);
  g.gain.setValueAtTime(0, ctx.currentTime);
  g.gain.linearRampToValueAtTime(gain, ctx.currentTime + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + attack + decay);
  o.connect(g).connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + attack + decay + 0.05);
}

export const Sfx = {
  launch:    () => tone({ freq: 440, freqEnd: 880, duration: 0.08, type: 'sawtooth', gain: 0.1 }),
  // impulse-aware impact: softer for low impulse, harder for high
  impact:    (impulse = 5) => tone({ freq: 200 + Math.min(impulse, 15) * 30, duration: 0.06, type: 'square', gain: 0.18, decay: 0.08 }),
  tumble:    () => {
    const now = performance.now();
    if (now - lastTumbleAt < 25) return;   // throttle ≤4 per 100ms ≈ 1 per 25ms
    lastTumbleAt = now;
    tone({ freq: 320, duration: 0.04, type: 'square', gain: 0.06, decay: 0.04 });
  },
  off:       () => tone({ freq: 120, duration: 0.12, type: 'triangle', gain: 0.12, decay: 0.12 }),
  levelClear: () => {
    [523, 659, 784].forEach((f, i) => setTimeout(() => tone({ freq: f, duration: 0.18, type: 'triangle', gain: 0.15, decay: 0.18 }), i * 100));
  },
};
