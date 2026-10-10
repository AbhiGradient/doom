import * as THREE from 'three'
import { MAP, CELL, H, rows, cols, doors, key, isSolid, blockedAt, lineClear, move } from './level.js'
import { Sound } from './audio.js'

const $ = id => document.getElementById(id)
const DEFAULTS = { sens: 1, vol: 0.6, fov: 75, invert: false, q: '1' }
const cfg = { ...DEFAULTS }
try { Object.assign(cfg, JSON.parse(localStorage.getItem('hellbreach') || '{}')) } catch {}
const persist = () => { try { localStorage.setItem('hellbreach', JSON.stringify(cfg)) } catch {} }

const TYPES = {
  i: { k: 'imp', hp: 50, spd: 3.4, r: 0.45, col: 0x7a3320, eye: 0xffcc00, range: 16, sight: 20, cd: 1.7, dmg: 10, ps: 13, ranged: true, pm: 'e', scale: 1, stop: 2.5 },
  s: { k: 'soldier', hp: 100, spd: 2.6, r: 0.5, col: 0x454b57, eye: 0xff2200, range: 22, sight: 24, cd: 1, dmg: 7, ps: 26, ranged: true, pm: 's', scale: 1.1, stop: 3 },
  B: { k: 'brute', hp: 320, spd: 2, r: 0.9, col: 0x5a1210, eye: 0xff6a00, range: 2.4, sight: 26, cd: 1.8, dmg: 35, wind: 0.8, scale: 1.9, stop: 1.7 }
}
const PICK = { h: 0xff2244, a: 0x3399ff, p: 0xffdd55, g: 0xff8833, e: 0x33ffd0 }
const AMT = { p: 12, g: 6, e: 30 }
const MAXA = { p: 60, g: 24, e: 150 }
const LABEL = { p: 'PISTOL ROUNDS', g: 'SHELLS', e: 'PLASMA CELLS' }
const W = [
  { name: 'COMBAT PISTOL', cd: 0.28, snd: 'pistol', rec: 0.05, sh: 0.1, auto: false },
  { name: 'TACTICAL SHOTGUN', cd: 0.9, a: 'g', snd: 'shotgun', rec: 0.18, sh: 0.4, auto: false },
  { name: 'PLASMA RIFLE', cd: 0.09, a: 'e', snd: 'plasma', rec: 0.03, sh: 0.06, auto: true }
]
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const KILLS_TO_UNLOCK = 5
const fmt = s => `${String((s / 60) | 0).padStart(2, '0')}:${String(s % 60 | 0).padStart(2, '0')}`

function boot() {
  const R = renderer
  const applyQ = () => {
    R.setPixelRatio(Math.min(devicePixelRatio, { 0: 0.75, 1: 1, 2: 1.75 }[cfg.q] ?? 1))
    R.setSize(innerWidth, innerHeight)
  }
  applyQ()
  document.body.prepend(R.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x050404)
  scene.fog = new THREE.FogExp2(0x0a0504, 0.05)
  const cam = new THREE.PerspectiveCamera(cfg.fov, innerWidth / innerHeight, 0.05, 90)
  cam.rotation.order = 'YXZ'
  scene.add(cam)
  scene.add(new THREE.AmbientLight(0x664444, 1.6))

  const mkTex = (draw, rx, ry) => {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    draw(c.getContext('2d'))
    const t = new THREE.CanvasTexture(c)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(rx, ry)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }
  const wallTex = mkTex(g => {
    g.fillStyle = '#34363b'; g.fillRect(0, 0, 128, 128)
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${70 + Math.random() * 60 | 0},30,10,${Math.random() * 0.18})`; g.fillRect(Math.random() * 128, Math.random() * 128, 3, 12) }
    g.strokeStyle = '#0d0e10'; g.lineWidth = 4; g.strokeRect(2, 2, 124, 124); g.strokeRect(2, 64, 124, 2)
    g.fillStyle = '#6a6e75';[[10, 10], [118, 10], [10, 118], [118, 118]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill() })
    g.fillStyle = '#b8321a'; g.fillRect(0, 58, 128, 4)
  }, 1, 1)
  const floorTex = mkTex(g => {
    g.fillStyle = '#222326'; g.fillRect(0, 0, 128, 128)
    g.strokeStyle = '#3d4045'; g.lineWidth = 3
    for (let i = 0; i <= 128; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.moveTo(0, i); g.lineTo(128, i); g.stroke() }
    g.strokeStyle = '#000'; g.strokeRect(0, 0, 128, 128)
  }, cols, rows)

  const walls = []
  MAP.forEach((r, z) => [...r].forEach((c, x) => { if (c === '#') walls.push([x, z]) }))
  const wm = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, H, CELL), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.7, metalness: 0.4 }), walls.length)
  const m4 = new THREE.Matrix4()
  walls.forEach(([x, z], i) => { m4.setPosition((x + 0.5) * CELL, H / 2, (z + 0.5) * CELL); wm.setMatrixAt(i, m4) })
  scene.add(wm)

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(cols * CELL, rows * CELL), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.6, metalness: 0.5 }))
  floor.rotation.x = -Math.PI / 2
  floor.position.set(cols * CELL / 2, 0, rows * CELL / 2)
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(cols * CELL, rows * CELL), new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.9 }))
  ceil.rotation.x = Math.PI / 2
  ceil.position.set(cols * CELL / 2, H, rows * CELL / 2)
  scene.add(floor, ceil)

  const lights = []
  ;[[2, 2], [9, 3], [19, 3], [8, 7], [20, 7], [12, 11], [20, 11], [2, 11]].forEach(([x, z], i) => {
    const col = i % 2 ? 0xff6a3a : 0xffd0a0
    const l = new THREE.PointLight(col, 40, 20, 1.5)
    l.position.set((x + 0.5) * CELL, H - 0.4, (z + 0.5) * CELL)
    const f = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.4), new THREE.MeshBasicMaterial({ color: col }))
    f.position.set(l.position.x, H - 0.05, l.position.z)
    scene.add(l, f)
    lights.push({ l, b: 40, ph: Math.random() * 9 })
  })

  const doorMat = new THREE.MeshStandardMaterial({ color: 0x7a1e14, metalness: 0.8, roughness: 0.4, emissive: 0x2a0500 })
  MAP.forEach((r, z) => [...r].forEach((c, x) => {
    if (c !== 'D') return
    const alongX = MAP[z][x - 1] === '#'
    const m = new THREE.Mesh(new THREE.BoxGeometry(alongX ? CELL : 0.7, H, alongX ? 0.7 : CELL), doorMat)
    m.position.set((x + 0.5) * CELL, H / 2, (z + 0.5) * CELL)
    scene.add(m)
    doors.set(key(x, z), { x, z, m, open: false, locked: x >= 16 && z >= 8 })
  }))

  let exitPos = { x: 0, z: 0 }
  const exitMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
  const portal = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, H, 24, 1, true), exitMat)
  MAP.forEach((r, z) => [...r].forEach((c, x) => { if (c === 'X') exitPos = { x: (x + 0.5) * CELL, z: (z + 0.5) * CELL } }))
  portal.position.set(exitPos.x, H / 2, exitPos.z)
  const exitLight = new THREE.PointLight(0xff2a1a, 30, 14)
  exitLight.position.set(exitPos.x, 2, exitPos.z)
  scene.add(portal, exitLight)

  const dyn = new THREE.Group()
  scene.add(dyn)

  const pg = new THREE.SphereGeometry(0.18, 8, 8)
  const pm = { e: new THREE.MeshBasicMaterial({ color: 0xff7a1a }), s: new THREE.MeshBasicMaterial({ color: 0xff2a2a }), p: new THREE.MeshBasicMaterial({ color: 0x33ffd0 }) }
  const pool = Array.from({ length: 48 }, () => {
    const m = new THREE.Mesh(pg, pm.e)
    m.visible = false
    scene.add(m)
    return { m, on: false, v: new THREE.Vector3(), dmg: 0, hostile: false, life: 0 }
  })
  const parts = Array.from({ length: 90 }, () => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: 0xffaa33 }))
    m.visible = false
    scene.add(m)
    return { m, v: new THREE.Vector3(), life: 0 }
  })

  const P = { x: 0, z: 0, jy: 0, vy: 0, vx: 0, vz: 0, yaw: 0, pitch: 0, hp: 100, armor: 0 }
  let state = 'menu', panel = 'menu', prevPanel = 'menu'
  let enemies = [], pickups = [], A, mag, cur, stat, total
  let fireT = 0, reloadT = 0, reloadTake = 0, flash = 0, recoil = 0, shake = 0, dmgV = 0, hm = 0, nt = 0, bobT = 0, swap = 0
  let firing = false, tt = 0, lastCell = -1
  const dist = new Int16Array(rows * cols)
  const keys = new Set()
  const _o = new THREE.Vector3(), _c = new THREE.Vector3(), fd = new THREE.Vector3()

  const vm = new THREE.Group()
  cam.add(vm)
  vm.position.set(0.26, -0.24, -0.5)
  const mk = (w, h, l, c, x, y, z, em = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), new THREE.MeshStandardMaterial({ color: c, metalness: 0.8, roughness: 0.35, emissive: em }))
    m.position.set(x, y, z)
    return m
  }
  const models = [new THREE.Group(), new THREE.Group(), new THREE.Group()]
  models[0].add(mk(0.07, 0.1, 0.35, 0x2a2a2e, 0, 0, -0.2), mk(0.06, 0.06, 0.3, 0x777b83, 0, 0.06, -0.25), mk(0.06, 0.16, 0.08, 0x1a1a1c, 0, -0.12, -0.05))
  models[1].add(mk(0.09, 0.1, 0.45, 0x4a3420, 0, -0.02, -0.1), mk(0.05, 0.05, 0.75, 0x6a6e75, 0, 0.03, -0.55), mk(0.07, 0.07, 0.4, 0x444444, 0, -0.04, -0.45))
  models[2].add(mk(0.14, 0.16, 0.6, 0x1d2a30, 0, 0, -0.3), mk(0.08, 0.08, 0.2, 0x33ffd0, 0, 0.02, -0.65, 0x33ffd0), mk(0.1, 0.05, 0.3, 0x33ffd0, 0, 0.11, -0.25, 0x118877))
  vm.add(...models)
  const flashM = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.35), new THREE.MeshBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0.9, depthWrite: false }))
  flashM.visible = false
  vm.add(flashM)
  const flashL = new THREE.PointLight(0xffaa55, 0, 12)
  flashL.position.set(0, 0, -1)
  cam.add(flashL)
  const FLASH_Z = [-0.45, -0.95, -0.75]

  function selectWeapon(i) {
    cur = i
    models.forEach((m, j) => { m.visible = j === i })
    flashM.position.set(0, 0.03, FLASH_Z[i])
    flashM.material.color.setHex(i === 2 ? 0x33ffd0 : 0xffcc66)
    flashL.color.setHex(i === 2 ? 0x33ffd0 : 0xffaa55)
    reloadT = 0
    fireT = 0.2
    swap = 0.3
  }

  function burst(pos, col, n, sp, grav = 6, life = 0.5) {
    for (const p of parts) {
      if (n <= 0) break
      if (p.life > 0) continue
      n--
      p.life = life * (0.6 + Math.random() * 0.6)
      p.m.visible = true
      p.m.position.copy(pos)
      p.m.material.color.setHex(col)
      p.v.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(sp * 2)
      p.g = grav
    }
  }

  function shoot(pos, dir, spd, dmg, hostile, mat) {
    const p = pool.find(q => !q.on)
    if (!p) return
    p.on = true
    p.m.visible = true
    p.m.material = mat
    p.m.position.copy(pos)
    p.v.copy(dir).multiplyScalar(spd)
    p.dmg = dmg
    p.hostile = hostile
    p.life = 3
  }

  function buildEnemy(D) {
    const g = new THREE.Group()
    const mat = new THREE.MeshStandardMaterial({ color: D.col, roughness: 0.6, metalness: 0.2 })
    const eye = new THREE.MeshBasicMaterial({ color: D.eye })
    const part = (w, h, l, x, y, z, m = mat) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), m); o.position.set(x, y, z); return o }
    const arm = part(0.22, 0.9, 0.22, -0.6, 1.15, 0)
    const arm2 = part(0.22, 0.9, 0.22, 0.6, 1.15, 0)
    arm.geometry.translate(0, -0.35, 0)
    arm2.geometry.translate(0, -0.35, 0)
    g.add(part(0.9, 1.1, 0.55, 0, 0.95, 0), part(0.5, 0.45, 0.45, 0, 1.75, 0), part(0.28, 0.5, 0.3, -0.22, 0.25, 0), part(0.28, 0.5, 0.3, 0.22, 0.25, 0),
      part(0.12, 0.07, 0.05, -0.12, 1.8, 0.23, eye), part(0.12, 0.07, 0.05, 0.12, 1.8, 0.23, eye), arm, arm2)
    if (D.k === 'brute') g.add(part(0.12, 0.5, 0.12, -0.28, 2.15, 0), part(0.12, 0.5, 0.12, 0.28, 2.15, 0))
    if (D.k === 'imp') g.add(part(0.1, 0.3, 0.1, -0.18, 2.05, 0), part(0.1, 0.3, 0.1, 0.18, 2.05, 0))
    g.scale.setScalar(D.scale)
    return { g, mat, arm, arm2 }
  }

  function addEnemy(c, x, z) {
    const D = TYPES[c], b = buildEnemy(D)
    b.g.position.set(x, 0, z)
    dyn.add(b.g)
    enemies.push({ def: D, x, z, hp: D.hp, state: 'idle', cd: 1, t: 0, ht: 0, wt: 0, armT: 0, flash: 0, alert: false, ...b })
  }

  const pickGeo = new THREE.OctahedronGeometry(0.3)
  function addPickup(c, x, z) {
    const m = new THREE.Mesh(pickGeo, new THREE.MeshStandardMaterial({ color: PICK[c], emissive: PICK[c], emissiveIntensity: 0.8 }))
    m.position.set(x, 0.8, z)
    dyn.add(m)
    pickups.push({ t: c, m, x, z, ph: Math.random() * 6, gone: false })
  }

  function flow() {
    dist.fill(-1)
    const pc = Math.floor(P.x / CELL), pr = Math.floor(P.z / CELL)
    if (isSolid(pc, pr)) return
    const q = [[pc, pr]]
    dist[key(pc, pr)] = 0
    for (let i = 0; i < q.length; i++) {
      const [x, z] = q[i]
      for (const [a, b] of N4) {
        const nx = x + a, nz = z + b
        if (isSolid(nx, nz) || dist[key(nx, nz)] >= 0) continue
        dist[key(nx, nz)] = dist[key(x, z)] + 1
        q.push([nx, nz])
      }
    }
  }

  function nextCell(e) {
    const cx = Math.floor(e.x / CELL), cz = Math.floor(e.z / CELL)
    let bd = dist[key(cx, cz)], best = null
    if (bd < 0) return null
    for (const [a, b] of N4) {
      const nx = cx + a, nz = cz + b
      if (isSolid(nx, nz)) continue
      const d = dist[key(nx, nz)]
      if (d >= 0 && d < bd) { bd = d; best = [(nx + 0.5) * CELL, (nz + 0.5) * CELL] }
    }
    return best || [P.x, P.z]
  }

  function resetWorld() {
    dyn.clear()
    enemies = []
    pickups = []
    pool.forEach(p => { p.on = false; p.m.visible = false })
    parts.forEach(p => { p.life = 0; p.m.visible = false })
    doors.forEach(d => { d.open = false })
    MAP.forEach((r, z) => [...r].forEach((c, x) => {
      const wx = (x + 0.5) * CELL, wz = (z + 0.5) * CELL
      if (c === 'S') { P.x = wx; P.z = wz }
      else if (TYPES[c]) addEnemy(c, wx, wz)
      else if (PICK[c]) addPickup(c, wx, wz)
    }))
    Object.assign(P, { hp: 100, armor: 0, vx: 0, vz: 0, vy: 0, jy: 0, yaw: -Math.PI / 2, pitch: 0 })
    A = { p: 36, g: 8, e: 20 }
    mag = 12
    stat = { shots: 0, hits: 0, kills: 0, time: 0 }
    total = enemies.length
    shake = dmgV = hm = flash = recoil = 0
    firing = false
    selectWeapon(0)
    lastCell = -1
    flow()
  }

  function note(t) { nt = 1.6; $('note').textContent = t }

  function collect(t) {
    if (t === 'h') { if (P.hp >= 100) return false; P.hp = Math.min(100, P.hp + 25); note('+25 HEALTH') }
    else if (t === 'a') { if (P.armor >= 100) return false; P.armor = Math.min(100, P.armor + 25); note('+25 ARMOR') }
    else {
      if (A[t] >= MAXA[t]) return false
      A[t] = Math.min(MAXA[t], A[t] + AMT[t])
      note(`+${AMT[t]} ${LABEL[t]}`)
    }
    return true
  }

  function hurt(d) {
    if (P.hp <= 0 || state !== 'playing') return
    const ab = Math.min(P.armor, d * 0.5)
    P.armor -= ab
    P.hp -= d - ab
    dmgV = 1
    shake = Math.max(shake, 0.5)
    Sound.play('hurt')
    if (P.hp <= 0) { P.hp = 0; finish('over') }
  }

  function damageEnemy(e, d) {
    if (e.state === 'dead') return
    e.hp -= d
    e.alert = true
    Sound.play('hit')
    e.mat.emissive.setHex(0xff3300)
    e.flash = 0.08
    if (e.hp <= 0) {
      e.state = 'dead'
      e.t = 0
      stat.kills++
      Sound.play('die')
      burst(_c.set(e.x, 1, e.z), 0xcc1100, 24, 3, 8, 0.9)
    } else if (e.def.k !== 'brute') { e.state = 'hurt'; e.ht = 0.18 }
  }

  function ray(dir) {
    cam.getWorldPosition(_o)
    let tw = 60
    for (let t = 0.3; t < 60; t += 0.25) {
      const y = _o.y + dir.y * t
      if (y < 0 || y > H || blockedAt(_o.x + dir.x * t, _o.z + dir.z * t, 0)) { tw = t; break }
    }
    let best = null, bt = tw
    for (const e of enemies) {
      if (e.state === 'dead') continue
      _c.set(e.x, 0.9 * e.def.scale, e.z).sub(_o)
      const tca = _c.dot(dir), rr = 0.75 * e.def.scale, d2 = _c.lengthSq() - tca * tca
      if (tca < 0 || d2 > rr * rr) continue
      const t = tca - Math.sqrt(rr * rr - d2)
      if (t < bt) { bt = t; best = e }
    }
    return { e: best, p: _o.clone().addScaledVector(dir, bt) }
  }

  function reload() {
    if (cur !== 0 || reloadT > 0 || mag >= 12 || A.p <= 0) return
    reloadTake = Math.min(12 - mag, A.p)
    reloadT = 1
    Sound.play('reload')
  }

  function fire() {
    if (state !== 'playing' || fireT > 0 || reloadT > 0) return
    const w = W[cur]
    if (cur === 0) { if (mag <= 0) { reload(); return }; mag-- }
    else { if (A[w.a] <= 0) { Sound.play('click'); fireT = 0.25; return }; A[w.a]-- }
    fireT = w.cd
    stat.shots++
    flash = 0.06
    recoil = w.rec
    shake = Math.max(shake, w.sh)
    Sound.play(w.snd)
    cam.updateMatrixWorld()
    cam.getWorldDirection(fd)
    if (cur === 2) {
      cam.getWorldPosition(_o)
      _o.addScaledVector(fd, 0.8)
      _o.y -= 0.15
      shoot(_o, fd, 38, 14, false, pm.p)
      return
    }
    let hit = false
    for (let i = 0; i < (cur === 1 ? 8 : 1); i++) {
      const d = fd.clone()
      if (cur === 1) { d.x += (Math.random() - 0.5) * 0.16; d.y += (Math.random() - 0.5) * 0.1; d.z += (Math.random() - 0.5) * 0.16; d.normalize() }
      const r = ray(d)
      if (r.e) { hit = true; damageEnemy(r.e, cur === 1 ? 11 : 28); burst(r.p, 0xaa1111, 4, 1.5) }
      else burst(r.p, 0xffbb55, 3, 1.5)
    }
    if (hit) { stat.hits++; hm = 0.1 }
  }

  function eshot(e) {
    const D = e.def
    const o = new THREE.Vector3(e.x, 1.3 * D.scale, e.z)
    const d = new THREE.Vector3(P.x, 1.1 + P.jy, P.z).sub(o).normalize()
    d.x += (Math.random() - 0.5) * 0.05
    d.z += (Math.random() - 0.5) * 0.05
    shoot(o, d.normalize(), D.ps, D.dmg, true, pm[D.pm])
    Sound.play('efire')
  }

  function updEnemy(e, dt) {
    const D = e.def, g = e.g
    if (e.flash > 0) { e.flash -= dt; if (e.flash <= 0) e.mat.emissive.setHex(0) }
    if (e.state === 'dead') { e.t += dt; g.rotation.x = Math.min(Math.PI / 2, e.t * 4); return }
    e.cd -= dt
    const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz)
    const see = d < 30 && lineClear(e.x, e.z, P.x, P.z)
    g.rotation.y = Math.atan2(dx, dz)
    if (e.state === 'idle') {
      g.position.y = Math.sin(tt * 2 + e.x) * 0.03
      if ((see && d < D.sight) || e.alert) { e.state = 'chase'; Sound.play('roar') }
      return
    }
    if (e.state === 'hurt') { e.ht -= dt; if (e.ht <= 0) e.state = 'chase'; return }
    if (e.state === 'wind') {
      e.wt -= dt
      e.arm.rotation.x = e.arm2.rotation.x = -2.4
      if (e.wt <= 0) {
        Sound.play('swing')
        if (d < D.range + 0.9) hurt(D.dmg)
        e.state = 'chase'
        e.cd = D.cd
      }
      return
    }
    if (see && d <= D.range && e.cd <= 0) {
      if (D.ranged) { eshot(e); e.cd = D.cd; e.armT = 0.25 }
      else { e.state = 'wind'; e.wt = D.wind }
      return
    }
    let tx = P.x, tz = P.z
    if (!see) { const c = nextCell(e); if (!c) return; tx = c[0]; tz = c[1] }
    const hold = see && D.ranged && d < D.range * 0.55
    if (!hold && d > D.stop) {
      const ax = tx - e.x, az = tz - e.z, l = Math.hypot(ax, az) || 1, s = D.spd * dt
      if (!move(e, ax / l * s, az / l * s, D.r)) move(e, -az / l * s, ax / l * s, D.r)
    }
    g.position.set(e.x, Math.abs(Math.sin(tt * 8 + e.x)) * 0.08, e.z)
    e.armT -= dt
    const sw = e.armT > 0 ? -1.6 : Math.sin(tt * 8 + e.x) * 0.5
    e.arm.rotation.x = sw
    e.arm2.rotation.x = e.armT > 0 ? 0 : -sw
    g.position.x = e.x
    g.position.z = e.z
  }

  function updatePlayer(dt) {
    const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0)
    const s = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0)
    const sp = keys.has('ShiftLeft') && f > 0 ? 8.5 : 5.5
    let tx = 0, tz = 0
    if (f || s) {
      const l = Math.hypot(f, s), sn = Math.sin(P.yaw), cs = Math.cos(P.yaw)
      tx = (-sn * f + cs * s) / l * sp
      tz = (-cs * f - sn * s) / l * sp
    }
    const k = Math.min(1, dt * (f || s ? 10 : 7))
    P.vx += (tx - P.vx) * k
    P.vz += (tz - P.vz) * k
    move(P, P.vx * dt, P.vz * dt, 0.4)
    if (keys.has('Space') && P.jy === 0) P.vy = 6.5
    P.vy -= 20 * dt
    P.jy += P.vy * dt
    if (P.jy <= 0) { P.jy = 0; P.vy = 0 }
    const spd = Math.hypot(P.vx, P.vz)
    bobT += dt * spd * 1.6
    const bob = P.jy === 0 ? Math.sin(bobT) * 0.05 * Math.min(1, spd / 5) : 0
    const sh = shake * 0.04
    cam.position.set(P.x + (Math.random() - 0.5) * sh, 1.7 + P.jy + bob + (Math.random() - 0.5) * sh, P.z + (Math.random() - 0.5) * sh)
    cam.rotation.set(P.pitch + recoil, P.yaw, 0)
    vm.position.set(0.26 + Math.cos(bobT * 0.5) * 0.008 * Math.min(1, spd / 5), -0.24 + bob * 0.4 - swap, -0.5 + recoil * 2)
  }

  function updateWeapons(dt) {
    fireT -= dt
    swap = Math.max(0, swap - dt)
    recoil *= Math.pow(0.001, dt)
    shake = Math.max(0, shake - dt * 2)
    if (reloadT > 0) {
      reloadT -= dt
      vm.position.y -= 0.12
      if (reloadT <= 0) { mag += reloadTake; A.p -= reloadTake }
    }
    if (firing && W[cur].auto) fire()
    flash = Math.max(0, flash - dt)
    flashM.visible = flash > 0
    flashL.intensity = flash > 0 ? 25 : 0
    flashM.rotation.z = Math.random() * 6
  }

  function updateProjectiles(dt) {
    for (const p of pool) {
      if (!p.on) continue
      p.life -= dt
      const q = p.m.position
      q.addScaledVector(p.v, dt)
      let dead = p.life <= 0 || q.y < 0 || q.y > H || blockedAt(q.x, q.z, 0)
      if (!dead && p.hostile) {
        if (Math.hypot(q.x - P.x, q.z - P.z) < 0.55 && Math.abs(q.y - (0.9 + P.jy)) < 1) { hurt(p.dmg); dead = true }
      } else if (!dead) {
        for (const e of enemies) {
          if (e.state === 'dead') continue
          if (q.distanceTo(_c.set(e.x, 0.9 * e.def.scale, e.z)) < 0.75 * e.def.scale + 0.15) {
            damageEnemy(e, p.dmg); stat.hits++; hm = 0.1; dead = true; break
          }
        }
        if (!dead && Math.random() < 0.5) burst(q, 0x33ffd0, 1, 0.2, 0, 0.25)
      }
      if (dead) { p.on = false; p.m.visible = false; burst(q, p.hostile ? 0xff7a1a : 0x33ffd0, 6, 1.5) }
    }
    for (const p of parts) {
      if (p.life <= 0) continue
      p.life -= dt
      p.v.y -= (p.g ?? 6) * dt
      p.m.position.addScaledVector(p.v, dt)
      if (p.life <= 0 || p.m.position.y < 0) { p.life = 0; p.m.visible = false }
    }
  }

  function updateWorld(dt) {
    for (const p of pickups) {
      if (p.gone) continue
      p.m.rotation.y += dt * 2
      p.m.position.y = 0.8 + Math.sin(tt * 3 + p.ph) * 0.12
      if (state === 'playing' && Math.hypot(p.x - P.x, p.z - P.z) < 1.1 && collect(p.t)) { p.gone = true; dyn.remove(p.m); Sound.play('pickup') }
    }
    doors.forEach(d => { d.m.position.y += ((d.open ? H * 1.45 : H / 2) - d.m.position.y) * Math.min(1, dt * 4) })
    portal.rotation.y += dt
  }

  function interact() {
    let near = null, nd = 4.5
    doors.forEach(d => {
      const dd = Math.hypot((d.x + 0.5) * CELL - P.x, (d.z + 0.5) * CELL - P.z)
      if (!d.open && dd < nd) { nd = dd; near = d }
    })
    if (!near) return
    if (near.locked && stat.kills < KILLS_TO_UNLOCK) { note(`LOCKED - ELIMINATE ${KILLS_TO_UNLOCK - stat.kills} MORE DEMONS`); Sound.play('click'); return }
    near.open = true
    Sound.play('door')
    flow()
  }

  function updateHud(left) {
    $('hpn').textContent = Math.ceil(P.hp)
    $('hpb').style.width = P.hp + '%'
    $('arn').textContent = Math.ceil(P.armor)
    $('arb').style.width = P.armor + '%'
    $('wn').textContent = W[cur].name + (reloadT > 0 ? ' - RELOADING' : '')
    $('am').textContent = cur === 0 ? `${mag} / ${A.p}` : A[W[cur].a]
    $('kills').textContent = `KILLS ${stat.kills}/${total}`
    $('time').textContent = fmt(stat.time)
    $('obj').textContent = left === 0 ? 'OBJECTIVE: REACH THE EXIT PORTAL'
      : stat.kills < KILLS_TO_UNLOCK ? `OBJECTIVE: PUSH THROUGH THE FACILITY (${stat.kills}/${KILLS_TO_UNLOCK} TO UNLOCK INNER DOORS)`
        : `OBJECTIVE: PURGE REMAINING DEMONS (${left})`
    $('dmg').style.opacity = dmgV
    $('hitm').style.opacity = hm > 0 ? 1 : 0
    $('note').style.opacity = Math.min(1, nt)
    document.body.classList.toggle('low', P.hp < 30 && P.hp > 0)
  }

  function sim(dt) {
    stat.time += dt
    const pc = Math.floor(P.x / CELL) + Math.floor(P.z / CELL) * cols
    if (pc !== lastCell) { lastCell = pc; flow() }
    updatePlayer(dt)
    updateWeapons(dt)
    enemies.forEach(e => updEnemy(e, dt))
    updateProjectiles(dt)
    dmgV = Math.max(0, dmgV - dt * 1.5)
    hm = Math.max(0, hm - dt)
    nt = Math.max(0, nt - dt)
    const left = enemies.filter(e => e.state !== 'dead').length
    exitMat.color.setHex(left === 0 ? 0x33ff88 : 0xff2a1a)
    exitLight.color.setHex(left === 0 ? 0x33ff88 : 0xff2a1a)
    if (state === 'playing' && left === 0 && Math.hypot(exitPos.x - P.x, exitPos.z - P.z) < 2.2) finish('win')
    updateHud(left)
  }

  const show = id => {
    panel = id
    ;['nogl', 'menu', 'settings', 'controls', 'about', 'pause', 'over', 'win'].forEach(p => { $(p).hidden = p !== id })
  }
  const openPanel = id => { prevPanel = panel; show(id) }
  const report = () => {
    const acc = stat.shots ? Math.round(stat.hits / stat.shots * 100) : 0
    return `Time ${fmt(stat.time)} · Demons slain ${stat.kills}/${total} · Accuracy ${acc}%`
  }
  const setMode = playing => {
    vm.visible = playing
    scene.fog.density = playing ? 0.05 : 0.012
    $('hud').hidden = !playing
  }

  function finish(kind) {
    state = kind
    keys.clear()
    firing = false
    document.exitPointerLock()
    $('hud').hidden = true
    $(kind === 'over' ? 'o-stats' : 'w-stats').textContent = report()
    if (kind === 'win') Sound.play('win')
    show(kind)
  }

  function lock() { try { const r = R.domElement.requestPointerLock(); if (r && r.catch) r.catch(() => {}) } catch {} }
  function begin() {
    Sound.init()
    Sound.volume(cfg.vol)
    Sound.resume()
    resetWorld()
    state = 'playing'
    setMode(true)
    show(null)
    lock()
  }
  function pause() {
    if (state !== 'playing') return
    state = 'paused'
    keys.clear()
    firing = false
    Sound.pause()
    show('pause')
  }
  function resume() {
    $('p-msg').textContent = ''
    Sound.resume()
    state = 'playing'
    show(null)
    lock()
  }
  function toMenu() {
    state = 'menu'
    document.exitPointerLock()
    resetWorld()
    setMode(false)
    Sound.resume()
    show('menu')
  }

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== R.domElement && state === 'playing') pause()
  })
  document.addEventListener('pointerlockerror', () => {
    if (state === 'playing') { pause(); $('p-msg').textContent = 'The browser blocked mouse capture. Press RESUME again.' }
  })
  R.domElement.addEventListener('click', () => { if (state === 'playing' && document.pointerLockElement !== R.domElement) lock() })
  addEventListener('mousemove', e => {
    if (state !== 'playing' || document.pointerLockElement !== R.domElement) return
    P.yaw -= e.movementX * 0.0022 * cfg.sens
    P.pitch = Math.max(-1.5, Math.min(1.5, P.pitch - e.movementY * 0.0022 * cfg.sens * (cfg.invert ? -1 : 1)))
  })
  addEventListener('mousedown', e => { if (e.button === 0 && state === 'playing' && document.pointerLockElement === R.domElement) { firing = true; fire() } })
  addEventListener('mouseup', () => { firing = false })
  addEventListener('contextmenu', e => e.preventDefault())
  addEventListener('keydown', e => {
    if (state !== 'playing') return
    if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault()
    if (e.code === 'Escape') { pause(); return }
    keys.add(e.code)
    if (e.code === 'Digit1') selectWeapon(0)
    else if (e.code === 'Digit2') selectWeapon(1)
    else if (e.code === 'Digit3') selectWeapon(2)
    else if (e.code === 'KeyR') reload()
    else if (e.code === 'KeyE') interact()
  })
  addEventListener('keyup', e => keys.delete(e.code))
  addEventListener('blur', () => { keys.clear(); firing = false })
  addEventListener('resize', () => { applyQ(); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix() })

  const on = (id, fn) => $(id).addEventListener('click', () => { Sound.init(); Sound.volume(cfg.vol); Sound.play('click'); fn() })
  on('b-start', begin)
  on('b-set', () => openPanel('settings'))
  on('b-ctl', () => openPanel('controls'))
  on('b-abt', () => openPanel('about'))
  on('p-set', () => openPanel('settings'))
  on('p-resume', resume)
  ;['p-restart', 'o-restart', 'w-restart'].forEach(id => on(id, begin))
  ;['p-menu', 'o-menu', 'w-menu'].forEach(id => on(id, toMenu))
  document.querySelectorAll('.back').forEach(b => b.addEventListener('click', () => show(prevPanel)))

  const sync = () => {
    $('s-vol').value = cfg.vol
    $('s-sens').value = cfg.sens
    $('s-fov').value = cfg.fov
    $('s-q').value = cfg.q
    $('s-inv').checked = cfg.invert
    cam.fov = cfg.fov
    cam.updateProjectionMatrix()
    Sound.volume(cfg.vol)
    applyQ()
  }
  const bind = (id, k, parse) => $(id).addEventListener('input', e => {
    cfg[k] = parse(e.target)
    persist()
    sync()
  })
  bind('s-vol', 'vol', t => +t.value)
  bind('s-sens', 'sens', t => +t.value)
  bind('s-fov', 'fov', t => +t.value)
  bind('s-q', 'q', t => t.value)
  bind('s-inv', 'invert', t => t.checked)
  $('s-reset').addEventListener('click', () => { Object.assign(cfg, DEFAULTS); persist(); sync() })
  $('s-full').addEventListener('click', () => {
    try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen() } catch {}
  })

  let last = performance.now()
  function frame(now) {
    requestAnimationFrame(frame)
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    tt += dt
    lights.forEach(o => { o.l.intensity = o.b * (0.85 + 0.15 * Math.sin(tt * 9 + o.ph) * Math.sin(tt * 3.7 + o.ph)) * (Math.random() < 0.006 ? 0.3 : 1) })
    if (state === 'playing') { sim(dt); updateWorld(dt) }
    else if (state === 'menu') {
      const cx = cols * CELL / 2, cz = rows * CELL / 2
      cam.position.set(cx + Math.cos(tt * 0.12) * 30, 20, cz + Math.sin(tt * 0.12) * 20)
      cam.lookAt(cx, 0, cz)
      updateWorld(dt)
    }
    R.render(scene, cam)
  }
  sync()
  resetWorld()
  setMode(false)
  show('menu')
  requestAnimationFrame(frame)
}

let renderer = null
try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }) } catch {}
if (renderer) boot()
else $('nogl').hidden = false
