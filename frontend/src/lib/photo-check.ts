/**
 * Site photo checks for the in-browser demo, mirroring backend/app/photo_checks.py:
 * where (photo GPS vs plot pin), when (capture time vs upload) and reused (a 16x16 grey thumbnail
 * compared with every other site photo). Flags for a reviewer, never a verdict.
 */

export const NEAR_M = 150
export const FAR_M = 1000
export const STALE_DAYS = 30
export const SAME_PICTURE = 0.06

export type PhotoMeta = { taken_at: string | null; gps: [number, number] | null; fingerprint: string | null }
export type Other = { evidence_id: number; case_id: number; who: string; village: string; stage_name: string; same_case: boolean; fingerprint: string | null }
export type Checks = {
  where: { state: 'no_plot' | 'no_gps' | 'at_plot' | 'near' | 'far'; flag: boolean; distance_m?: number; bearing_deg?: number }
  when: { state: 'no_time' | 'fresh' | 'stale' | 'future'; flag: boolean; taken_at?: string; days_before_upload?: number }
  reused: { state: 'unique' | 'reused' | 'unknown'; flag: boolean; matches: Array<Omit<Other, 'fingerprint'> & { distance: number }> }
  flags: Array<'where' | 'when' | 'reused'>
}

/** GPS and DateTimeOriginal from a JPEG's EXIF block. Anything unreadable comes back as null. */
export function readExif(buf: ArrayBuffer): { taken_at: string | null; gps: [number, number] | null } {
  const v = new DataView(buf)
  const none = { taken_at: null, gps: null }
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return none
  let off = 2
  while (off + 4 < v.byteLength) {
    const marker = v.getUint16(off)
    const size = v.getUint16(off + 2)
    if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) return parseTiff(v, off + 10)
    if ((marker & 0xff00) !== 0xff00) break
    off += 2 + size
  }
  return none
}

function parseTiff(v: DataView, t: number) {
  const le = v.getUint16(t) === 0x4949
  const u16 = (o: number) => v.getUint16(o, le)
  const u32 = (o: number) => v.getUint32(o, le)
  const ifd = (start: number) => {
    const out = new Map<number, { type: number; count: number; at: number }>()
    if (start <= 0 || start + 2 > v.byteLength) return out
    const n = u16(start)
    for (let i = 0; i < n; i++) {
      const e = start + 2 + i * 12
      if (e + 12 > v.byteLength) break
      const type = u16(e + 2); const count = u32(e + 4)
      const bytes = count * ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8 } as Record<number, number>)[type] || 0
      out.set(u16(e), { type, count, at: bytes > 4 ? t + u32(e + 8) : e + 8 })
    }
    return out
  }
  const ascii = (x?: { count: number; at: number }) => x ? Array.from({ length: x.count }, (_, i) => String.fromCharCode(v.getUint8(x.at + i))).join('').replace(/\0+$/, '') : ''
  const rationals = (x?: { count: number; at: number }) => x ? Array.from({ length: x.count }, (_, i) => u32(x.at + i * 8) / (u32(x.at + i * 8 + 4) || 1)) : []
  const root = ifd(t + u32(t + 4))
  const exifPtr = root.get(0x8769); const gpsPtr = root.get(0x8825)
  const exif = exifPtr ? ifd(t + u32(exifPtr.at)) : new Map()
  const raw = ascii(exif.get(0x9003)) || ascii(root.get(0x0132))
  const m = raw.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/)
  const taken_at = m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+00:00` : null
  let gps: [number, number] | null = null
  if (gpsPtr) {
    const g = ifd(t + u32(gpsPtr.at))
    const deg = (r: number[], ref: string) => r.length === 3 ? (r[0] + r[1] / 60 + r[2] / 3600) * (ref === 'S' || ref === 'W' ? -1 : 1) : NaN
    const lat = deg(rationals(g.get(2)), ascii(g.get(1))); const lon = deg(rationals(g.get(4)), ascii(g.get(3)))
    if (Number.isFinite(lat) && Number.isFinite(lon)) gps = [Math.round(lat * 1e6) / 1e6, Math.round(lon * 1e6) / 1e6]
  }
  return { taken_at, gps }
}

/** 16x16 grey thumbnail as 512 hex characters, box-averaged like the backend. */
export async function fingerprint(blob: Blob): Promise<string | null> {
  try {
    const bmp = await createImageBitmap(blob)
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height
    const ctx = c.getContext('2d', { willReadFrequently: true }); if (!ctx) return null
    ctx.drawImage(bmp, 0, 0)
    const { data } = ctx.getImageData(0, 0, c.width, c.height)
    const out = new Uint8Array(256)
    for (let gy = 0; gy < 16; gy++) for (let gx = 0; gx < 16; gx++) {
      const x0 = Math.floor((gx * c.width) / 16), x1 = Math.floor(((gx + 1) * c.width) / 16)
      const y0 = Math.floor((gy * c.height) / 16), y1 = Math.floor(((gy + 1) * c.height) / 16)
      let sum = 0, n = 0
      for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { const i = (y * c.width + x) * 4; sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; n++ }
      out[gy * 16 + gx] = Math.round(sum / (n || 1))
    }
    return Array.from(out, b => b.toString(16).padStart(2, '0')).join('')
  } catch { return null }
}

const norm = (fp: string) => {
  const px = fp.match(/../g)!.map(h => parseInt(h, 16))
  const m = px.reduce((a, b) => a + b, 0) / px.length
  const sd = Math.sqrt(px.reduce((a, p) => a + (p - m) ** 2, 0) / px.length) || 1
  return px.map(p => (p - m) / sd)
}
export function pictureDistance(a: string, b: string) {
  const x = norm(a), y = norm(b)
  return Math.sqrt(x.reduce((s, p, i) => s + (p - y[i]) ** 2, 0) / x.length)
}

const rad = (d: number) => (d * Math.PI) / 180
export function distanceM(a: [number, number], b: [number, number]) {
  const dp = rad(b[0] - a[0]), dl = rad(b[1] - a[1])
  const h = Math.sin(dp / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dl / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(h))
}
export function bearingDeg(a: [number, number], b: [number, number]) {
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]))
  const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]))
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

export function evaluate(photo: PhotoMeta & { uploaded_at: string | null }, plot: [number, number] | null, others: Other[]): Checks {
  let where: Checks['where']
  if (!plot) where = { state: 'no_plot', flag: false }
  else if (!photo.gps) where = { state: 'no_gps', flag: true }
  else {
    const d = distanceM(plot, photo.gps)
    const state = d <= NEAR_M ? 'at_plot' : d <= FAR_M ? 'near' : 'far'
    where = { state, flag: state === 'far', distance_m: Math.round(d), bearing_deg: Math.round(bearingDeg(plot, photo.gps)) }
  }
  let when: Checks['when']
  if (!photo.taken_at) when = { state: 'no_time', flag: true }
  else {
    const days = ((photo.uploaded_at ? Date.parse(photo.uploaded_at) : Date.now()) - Date.parse(photo.taken_at)) / 86400000
    const state = days < -1 ? 'future' : days > STALE_DAYS ? 'stale' : 'fresh'
    when = { state, flag: state !== 'fresh', taken_at: photo.taken_at, days_before_upload: Math.round(days * 10) / 10 }
  }
  const matches = photo.fingerprint ? others.filter(o => o.fingerprint && o.fingerprint.length === photo.fingerprint!.length).map(o => ({ o, d: pictureDistance(photo.fingerprint!, o.fingerprint!) })).filter(x => x.d < SAME_PICTURE).map(({ o, d }) => ({ evidence_id: o.evidence_id, case_id: o.case_id, who: o.who, village: o.village, stage_name: o.stage_name, same_case: o.same_case, distance: Math.round(d * 1000) / 1000 })) : []
  const reused: Checks['reused'] = { state: matches.length ? 'reused' : photo.fingerprint ? 'unique' : 'unknown', flag: matches.length > 0, matches: matches.slice(0, 5) }
  const flags = ([['where', where], ['when', when], ['reused', reused]] as const).filter(([, c]) => c.flag).map(([k]) => k)
  return { where, when, reused, flags }
}
