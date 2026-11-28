/**
 * DIGIPIN: India Post's national addressing grid. Every 4 m square in India has a 10-character code,
 * so a family can give a mason, a cement lorry or a relative the exact plot instead of "near the temple".
 *
 * Ported from the Department of Posts' reference implementation (Apache-2.0):
 * https://github.com/INDIAPOST-gov/digipin (src/digipin.js, May 2026 format).
 * The code is stored and copied as one continuous string; India Post allows a 3-4-3 grouping for reading.
 */
const GRID = ['FC98', 'J327', 'K456', 'LMPT']
const BOUNDS = { minLat: 2.5, maxLat: 38.5, minLon: 63.5, maxLon: 99.5 }

/** The 10-character DIGIPIN for a point, or null outside India's grid. */
export function digipin(lat: number, lon: number): string | null {
  if (!(lat >= BOUNDS.minLat && lat <= BOUNDS.maxLat && lon >= BOUNDS.minLon && lon <= BOUNDS.maxLon)) return null
  let { minLat, maxLat, minLon, maxLon } = BOUNDS
  let code = ''
  for (let level = 0; level < 10; level++) {
    const latDiv = (maxLat - minLat) / 4
    const lonDiv = (maxLon - minLon) / 4
    const row = Math.max(0, Math.min(3, 3 - Math.floor((lat - minLat) / latDiv)))
    const col = Math.max(0, Math.min(3, Math.floor((lon - minLon) / lonDiv)))
    code += GRID[row][col]
    maxLat = minLat + latDiv * (4 - row)
    minLat = minLat + latDiv * (3 - row)
    minLon = minLon + lonDiv * col
    maxLon = minLon + lonDiv
  }
  return code
}

/** The square a DIGIPIN names, as [[south, west], [north, east]]. */
export function digipinCell(code: string): [[number, number], [number, number]] | null {
  const pin = code.replace(/\s/g, '').toUpperCase()
  if (!/^[23456789CJKLMPFT]{10}$/.test(pin)) return null
  let { minLat, maxLat, minLon, maxLon } = BOUNDS
  for (const ch of pin) {
    const row = GRID.findIndex(r => r.includes(ch))
    const col = GRID[row].indexOf(ch)
    const latDiv = (maxLat - minLat) / 4
    const lonDiv = (maxLon - minLon) / 4
    ;[minLat, maxLat] = [maxLat - latDiv * (row + 1), maxLat - latDiv * row]
    ;[minLon, maxLon] = [minLon + lonDiv * col, minLon + lonDiv * (col + 1)]
  }
  return [[minLat, minLon], [maxLat, maxLon]]
}

/** 4T396F42L7 → "4T3 96F4 2L7", the grouping India Post permits on screen. */
export const digipinDisplay = (code: string) => `${code.slice(0, 3)} ${code.slice(3, 7)} ${code.slice(7)}`
