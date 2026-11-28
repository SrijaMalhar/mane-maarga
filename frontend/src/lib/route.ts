/**
 * Visit order for a day in the field: start somewhere, see every chosen plot once, end at the last one.
 * Up to 12 plots the order is exact (Held-Karp dynamic programming, the shortest of every possible order).
 * Beyond that: nearest neighbour, then 2-opt swaps until no swap shortens the path. Distances are straight
 * lines (haversine), so roads will be longer; the order is what matters, and Google Maps does the road routing.
 */
import { distanceM } from './photo-check'

type P = [number, number]

const pathLength = (pts: P[]) => pts.slice(1).reduce((sum, p, i) => sum + distanceM(pts[i], p), 0)

const EXACT_UP_TO = 12

/** The shortest open path through every stop: dp[set][last] = shortest walk covering set, ending at last.
 *  With a start (the officer's location) every walk begins there; without one it may begin at any plot. */
function exactOrder(stops: P[], start: P | null): number[] {
  const m = stops.length, full = 1 << m
  const d = stops.map(a => stops.map(b => distanceM(a, b)))
  const dp = new Float64Array(full * m).fill(Infinity)
  const from = new Int8Array(full * m).fill(-1)
  stops.forEach((p, j) => { dp[(1 << j) * m + j] = start ? distanceM(start, p) : 0 })
  for (let mask = 1; mask < full; mask++) {
    for (let j = 0; j < m; j++) {
      const cur = dp[mask * m + j]
      if (cur === Infinity || !(mask & (1 << j))) continue
      for (let k = 0; k < m; k++) {
        if (mask & (1 << k)) continue
        const next = mask | (1 << k), v = cur + d[j][k]
        if (v < dp[next * m + k]) { dp[next * m + k] = v; from[next * m + k] = j }
      }
    }
  }
  let last = 0
  for (let j = 1; j < m; j++) if (dp[(full - 1) * m + j] < dp[(full - 1) * m + last]) last = j
  const order: number[] = []
  for (let mask = full - 1, j = last; j >= 0; ) { order.push(j); const p = from[mask * m + j]; mask &= ~(1 << j); j = p }
  return order.reverse()
}

/** Indexes of `stops` in visit order: from `start` when given, otherwise from whichever plot makes the shortest day. */
export function visitOrder(stops: P[], start: P | null): number[] {
  if (stops.length <= 1) return stops.map((_, i) => i)
  if (stops.length <= EXACT_UP_TO) return exactOrder(stops, start)
  const left = new Set(stops.map((_, i) => i))
  const order: number[] = []
  let at = start ?? stops[0]
  if (!start) { order.push(0); left.delete(0) }
  while (left.size) {
    let best = -1, bestD = Infinity
    for (const i of left) { const d = distanceM(at, stops[i]); if (d < bestD) { bestD = d; best = i } }
    order.push(best); left.delete(best); at = stops[best]
  }
  // 2-opt on an open path: reverse any stretch that makes the whole walk shorter. The start stays fixed.
  const pts = (o: number[]) => (start ? [start, ...o.map(i => stops[i])] : o.map(i => stops[i]))
  const first = start ? 0 : 1
  let improved = true, guard = 0
  while (improved && guard++ < 200) {
    improved = false
    for (let i = first; i < order.length - 1; i++) {
      for (let k = i + 1; k < order.length; k++) {
        const next = [...order.slice(0, i), ...order.slice(i, k + 1).reverse(), ...order.slice(k + 1)]
        if (pathLength(pts(next)) + 0.5 < pathLength(pts(order))) { order.splice(0, order.length, ...next); improved = true }
      }
    }
  }
  return order
}

export const routeLength = (pts: P[]) => pathLength(pts)

export type TravelMode = 'two-wheeler' | 'driving' | 'walking'

/**
 * Google Maps directions links for the route, split into legs: a link carries an origin, a destination and
 * up to nine waypoints, but phone browsers honour only three. Each leg starts where the last one ended.
 */
export function mapsLegs(points: P[], mode: TravelMode, waypointsPerLeg: number): string[] {
  if (points.length < 2) return []
  const ll = (p: P) => `${p[0]},${p[1]}`
  const legs: string[] = []
  for (let from = 0; from < points.length - 1; from += waypointsPerLeg + 1) {
    const to = Math.min(points.length - 1, from + waypointsPerLeg + 1)
    const mid = points.slice(from + 1, to)
    const q = new URLSearchParams({ api: '1', origin: ll(points[from]), destination: ll(points[to]), travelmode: mode })
    if (mid.length) q.set('waypoints', mid.map(ll).join('|'))
    legs.push(`https://www.google.com/maps/dir/?${q.toString()}`)
  }
  return legs
}
