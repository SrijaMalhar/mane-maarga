/* A real map of a family's plot: satellite or street tiles, the plot pin with its DIGIPIN square,
   the 150 m and 1 km rings the photo checks use, and where each site photo says it was taken.
   Leaflet is loaded only when a map is on screen (see PlotPanel's lazy import). */
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Crosshair, Images } from 'lucide-react'
import { FAR_M, NEAR_M } from '../lib/photo-check'
import { digipin, digipinCell } from '../lib/digipin'

export type LatLon = [number, number]
export type MapPhoto = { id: number; at: LatLon; state: 'at_plot' | 'near' | 'far' | 'no_plot'; n: number; label: string }
type Layer = 'satellite' | 'street'

/* Tile sources can be swapped per deployment (for example a state GIS server) without a code change. */
const TILES: Record<Layer, { url: string; attribution: string; maxNativeZoom: number }> = {
  satellite: {
    url: import.meta.env.VITE_SATELLITE_TILES || 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
    maxNativeZoom: 18,
  },
  street: {
    url: import.meta.env.VITE_MAP_TILES || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxNativeZoom: 19,
  },
}
const KARNATAKA: LatLon = [14.6, 76.1]
const LAYER_KEY = 'mm_map_layer'
const readLayer = (): Layer => { try { return localStorage.getItem(LAYER_KEY) === 'street' ? 'street' : 'satellite' } catch { return 'satellite' } }

const HOUSE_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M3 11.2 12 4l9 7.2V20H3z" fill="currentColor"/><path d="M10 20v-5.2h4V20" fill="#A5442B"/></svg>'
const plotIcon = (moving: boolean) => L.divIcon({ className: '', html: `<span class="pm-plot${moving ? ' moving' : ''}">${HOUSE_SVG}</span>`, iconSize: [36, 44], iconAnchor: [18, 44], tooltipAnchor: [0, -40] })
const photoIcon = (p: MapPhoto) => L.divIcon({ className: '', html: `<span class="pm-photo pm-${p.state}">${p.n}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] })
const ringLabel = (text: string) => L.divIcon({ className: '', html: `<span class="pm-ring-l">${text}</span>`, iconSize: [52, 18], iconAnchor: [26, 9] })
const south = (p: LatLon, m: number): LatLon => [p[0] - m / 111320, p[1]]

export default function PlotMap({ plot, photos = [], candidate = null, accuracy = null, moving = false, onPick, onPhoto, height, label }: {
  plot: LatLon | null
  photos?: MapPhoto[]
  /** While moving the pin: where it would go. */
  candidate?: LatLon | null
  accuracy?: { at: LatLon; m: number } | null
  moving?: boolean
  onPick?: (p: LatLon) => void
  onPhoto?: (id: number) => void
  /** Fixed height in px; leave out to fill the parent (min 380 px). */
  height?: number
  label: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const tiles = useRef<L.TileLayer | null>(null)
  const marks = useRef<L.LayerGroup | null>(null)
  const pick = useRef(onPick); pick.current = onPick
  const openPhoto = useRef(onPhoto); openPhoto.current = onPhoto
  const [layer, setLayer] = useState<Layer>(readLayer)
  const [tilesFailed, setTilesFailed] = useState(false)
  const here = candidate ?? plot

  // One Leaflet map for the life of the component.
  useEffect(() => {
    if (!box.current) return
    const m = L.map(box.current, { center: here ?? KARNATAKA, zoom: here ? 18 : 7, scrollWheelZoom: false, zoomSnap: 0.5, attributionControl: true })
    m.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>')
    m.on('click', e => pick.current?.([+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)]))
    marks.current = L.layerGroup().addTo(m)
    const el = box.current
    const zoomed = () => el.classList.toggle('pm-low', m.getZoom() < 15)
    m.on('zoomend', zoomed); zoomed()
    map.current = m
    const ro = new ResizeObserver(() => m.invalidateSize())
    ro.observe(box.current)
    return () => { ro.disconnect(); m.remove(); map.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Base tiles. If none load (offline, or blocked by a network policy), say so; the pin and codes still work.
  useEffect(() => {
    const m = map.current; if (!m) return
    tiles.current?.remove()
    const t = TILES[layer]
    let loaded = 0, failed = 0
    setTilesFailed(false)
    tiles.current = L.tileLayer(t.url, { attribution: t.attribution, maxNativeZoom: t.maxNativeZoom, maxZoom: 20, referrerPolicy: 'strict-origin-when-cross-origin' })
      .on('tileload', () => { loaded++ })
      .on('tileerror', () => { failed++; if (failed >= 4 && loaded === 0) setTilesFailed(true) })
      .addTo(m)
    try { localStorage.setItem(LAYER_KEY, layer) } catch { /* storage unavailable */ }
  }, [layer])

  // Everything drawn on top: rings, DIGIPIN square, photo locations, the pin.
  useEffect(() => {
    const m = map.current, g = marks.current; if (!m || !g) return
    g.clearLayers()
    const pin = candidate ?? plot
    if (pin) {
      L.circle(pin, { radius: FAR_M, className: 'pm-ring far', interactive: false }).addTo(g)
      L.circle(pin, { radius: NEAR_M, className: 'pm-ring near', interactive: false }).addTo(g)
      L.marker(south(pin, FAR_M), { icon: ringLabel('1 km'), interactive: false, keyboard: false }).addTo(g)
      L.marker(south(pin, NEAR_M), { icon: ringLabel('150 m'), interactive: false, keyboard: false }).addTo(g)
      const code = digipin(pin[0], pin[1]); const cell = code && digipinCell(code)
      if (cell) L.rectangle(cell, { className: 'pm-cell', interactive: false }).addTo(g)
    }
    if (accuracy) L.circle(accuracy.at, { radius: accuracy.m, className: 'pm-acc', interactive: false }).addTo(g)
    for (const p of photos) {
      if (pin && p.state === 'far') L.polyline([pin, p.at], { className: 'pm-far-line', interactive: false }).addTo(g)
      L.marker(p.at, { icon: photoIcon(p), title: p.label, alt: p.label, riseOnHover: true, zIndexOffset: 2000 })
        .bindTooltip(p.label, { direction: 'top', offset: [0, -12] })
        .on('click', () => openPhoto.current?.(p.id))
        .addTo(g)
    }
    if (moving && plot && candidate) L.marker(plot, { icon: plotIcon(false), opacity: 0.45, interactive: false, keyboard: false }).addTo(g)
    if (pin) {
      const mk = L.marker(pin, { icon: plotIcon(moving), draggable: moving, title: 'Plot pin', alt: 'Plot pin', zIndexOffset: 1000, autoPan: true })
      mk.on('dragend', () => { const ll = mk.getLatLng(); pick.current?.([+ll.lat.toFixed(6), +ll.lng.toFixed(6)]) })
      mk.addTo(g)
    }
  }, [plot, candidate, accuracy, photos, moving])

  // Follow the pin when it is set for the first time or moved somewhere off screen.
  useEffect(() => {
    const m = map.current; if (!m || !here) return
    if (m.getZoom() < 12) m.setView(here, 18)
    else if (!m.getBounds().pad(-0.1).contains(here)) m.panTo(here)
  }, [here?.[0], here?.[1]]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { box.current?.classList.toggle('picking', moving) }, [moving])

  const fitAll = () => {
    const m = map.current; if (!m) return
    const pts = [...(here ? [here] : []), ...photos.map(p => p.at)]
    if (pts.length > 1) m.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 17 })
    else if (pts.length) m.setView(pts[0], 17)
  }

  return (
    <div className={`pm on-${layer}`} style={height ? { height } : undefined}>
      <div ref={box} className="pm-map" role="region" aria-label={label} />
      <div className="pm-tools">
        <div className="pm-switch" role="group" aria-label="Map type">
          <button type="button" aria-pressed={layer === 'satellite'} onClick={() => setLayer('satellite')}>Satellite</button>
          <button type="button" aria-pressed={layer === 'street'} onClick={() => setLayer('street')}>Map</button>
        </div>
        {here && <button type="button" className="pm-tool" onClick={() => map.current?.setView(here, 18)} title="Zoom to the plot"><Crosshair size={15} aria-hidden /><span>Plot</span></button>}
        {photos.length > 0 && <button type="button" className="pm-tool" onClick={fitAll} title="Show every photo location"><Images size={15} aria-hidden /><span>All photos</span></button>}
      </div>
      {tilesFailed && <p className="pm-offline" role="status">The map pictures could not load here. The pin, its DIGIPIN and directions still work.</p>}
    </div>
  )
}
