export const CELL = 4
export const H = 4
export const MAP = [
  '##########################',
  '#S...#.........#.........#',
  '#....#..i...p..#..s....g.#',
  '#....D.........D.........#',
  '#.h..#.........#....i....#',
  '####.###########.#########',
  '#...............a........#',
  '#..p....i.......s....e...#',
  '#...............#####D####',
  '######.#########.........#',
  '#....#.#.....h..#..B.....#',
  '#..a.D.D.....s..D.....e..#',
  '#....#.#........#.......X#',
  '##########################'
]
export const rows = MAP.length
export const cols = MAP[0].length
export const doors = new Map()
export const key = (x, z) => z * cols + x

export function isSolid(cx, cz) {
  if (cx < 0 || cz < 0 || cx >= cols || cz >= rows) return true
  if (MAP[cz][cx] === '#') return true
  const d = doors.get(key(cx, cz))
  return !!d && !d.open
}

export function blockedAt(x, z, r) {
  const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL)
  const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL)
  for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) if (isSolid(cx, cz)) return true
  return false
}

export function lineClear(ax, az, bx, bz) {
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.6)
  for (let i = 1; i < n; i++) {
    const t = i / n
    if (isSolid(Math.floor((ax + (bx - ax) * t) / CELL), Math.floor((az + (bz - az) * t) / CELL))) return false
  }
  return true
}

export function move(o, dx, dz, r) {
  let moved = false
  if (!blockedAt(o.x + dx, o.z, r)) { o.x += dx; moved = true }
  if (!blockedAt(o.x, o.z + dz, r)) { o.z += dz; moved = true }
  return moved
}
