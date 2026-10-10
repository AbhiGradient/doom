let ctx, master, drone
const last = {}

function tone(f, d, type = 'square', v = 0.2, end = f) {
  const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime
  o.type = type
  o.frequency.setValueAtTime(f, t)
  o.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + d)
  g.gain.setValueAtTime(v, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + d)
  o.connect(g).connect(master)
  o.start(t)
  o.stop(t + d)
}

function noise(d, v = 0.3, fc = 1500) {
  const n = (ctx.sampleRate * d) | 0
  const buf = ctx.createBuffer(1, n, ctx.sampleRate)
  const a = buf.getChannelData(0)
  for (let i = 0; i < n; i++) a[i] = Math.random() * 2 - 1
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), t = ctx.currentTime
  s.buffer = buf
  f.type = 'lowpass'
  f.frequency.value = fc
  g.gain.setValueAtTime(v, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + d)
  s.connect(f).connect(g).connect(master)
  s.start(t)
}

const fx = {
  pistol: () => { noise(0.12, 0.5, 3000); tone(300, 0.12, 'square', 0.25, 60) },
  shotgun: () => { noise(0.4, 0.9, 1800); tone(120, 0.3, 'sawtooth', 0.4, 35) },
  plasma: () => tone(900, 0.14, 'sawtooth', 0.15, 200),
  hit: () => tone(1400, 0.04, 'square', 0.1),
  hurt: () => { noise(0.2, 0.5, 600); tone(160, 0.2, 'sawtooth', 0.3, 60) },
  die: () => { tone(220, 0.5, 'sawtooth', 0.3, 40); noise(0.4, 0.4, 500) },
  roar: () => tone(110, 0.5, 'sawtooth', 0.18, 55),
  swing: () => noise(0.25, 0.5, 800),
  efire: () => tone(500, 0.25, 'sawtooth', 0.2, 120),
  pickup: () => { tone(600, 0.08, 'triangle', 0.25); setTimeout(() => tone(900, 0.1, 'triangle', 0.25), 70) },
  door: () => { noise(0.6, 0.4, 300); tone(70, 0.6, 'square', 0.2, 40) },
  click: () => tone(200, 0.04, 'square', 0.15),
  reload: () => { tone(300, 0.06, 'square', 0.2); setTimeout(() => tone(220, 0.08, 'square', 0.2), 400) },
  win: () => [440, 554, 659, 880].forEach((f, i) => setTimeout(() => tone(f, 0.4, 'triangle', 0.3), i * 140))
}

export const Sound = {
  init() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)()
      master = ctx.createGain()
      master.connect(ctx.destination)
    }
    ctx.resume()
    if (!drone) {
      drone = ctx.createOscillator()
      const g = ctx.createGain()
      drone.type = 'sawtooth'
      drone.frequency.value = 42
      g.gain.value = 0.04
      drone.connect(g).connect(master)
      drone.start()
    }
  },
  volume(v) { if (master) master.gain.value = v },
  pause() { if (ctx) ctx.suspend() },
  resume() { if (ctx) ctx.resume() },
  play(name) {
    if (!ctx || ctx.state !== 'running') return
    const t = ctx.currentTime
    if (last[name] && t - last[name] < 0.04) return
    last[name] = t
    fx[name]()
  }
}
