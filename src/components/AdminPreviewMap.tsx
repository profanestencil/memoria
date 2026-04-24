import { useCallback, useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { getMapboxClientTokenState } from '@/lib/mapboxClientToken'

export type AdminMapExtraMarker = {
  id: string
  lat: number
  lng: number
  color?: string
  label?: string
}

type Props = {
  /** Controlled center for the primary (editable) pin */
  lat: string
  lng: string
  onPick: (lat: number, lng: number) => void
  /** Optional geofence preview (campaign tab) */
  previewCircle?: { lat: number; lng: number; radiusM: number } | null
  /** Other entities to show as small reference pins */
  extraMarkers?: AdminMapExtraMarker[]
  /** Map height */
  height?: number
}

const DEFAULT_CENTER: [number, number] = [-98.5, 39.8]

const parseLL = (lat: string, lng: string): { lng: number; lat: number } | null => {
  const la = Number(lat)
  const ln = Number(lng)
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return null
  return { lng: ln, lat: la }
}

export const AdminPreviewMap = ({ lat, lng, onPick, previewCircle, extraMarkers = [], height = 260 }: Props) => {
  const wrapRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const mainMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const extraMarkersRef = useRef<mapboxgl.Marker[]>([])
  const circleIdRef = useRef<string | null>(null)
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick
  const [ready, setReady] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const tokenState = getMapboxClientTokenState()

  const syncMainMarker = useCallback(() => {
    const map = mapRef.current
    if (!map || !mainMarkerRef.current) return
    const p = parseLL(lat, lng)
    if (p) {
      mainMarkerRef.current.setLngLat([p.lng, p.lat])
    }
  }, [lat, lng])

  useEffect(() => {
    if (!tokenState.ok) return
    if (!wrapRef.current) return
    if (!mapboxgl.supported()) {
      setMapError('Map rendering not supported in this browser/device (WebGL unavailable).')
      return
    }
    mapboxgl.accessToken = tokenState.token
    const initial = parseLL(lat, lng)
    const center: [number, number] = initial ? [initial.lng, initial.lat] : DEFAULT_CENTER
    const map = new mapboxgl.Map({
      container: wrapRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center,
      zoom: initial ? 12 : 3,
    })
    mapRef.current = map
    setMapError(null)

    map.on('error', (e) => {
      const maybeMsg = (e as unknown as { error?: { message?: string } }).error?.message
      const msg = typeof maybeMsg === 'string' ? maybeMsg : 'Map failed to load tiles/style.'
      setMapError(msg)
    })

    const el = document.createElement('div')
    el.style.width = '28px'
    el.style.height = '28px'
    el.style.borderRadius = '50%'
    el.style.background = 'linear-gradient(145deg, #e8c547, #c45a1a)'
    el.style.border = '3px solid rgba(255,255,255,0.95)'
    el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)'
    el.style.cursor = 'crosshair'
    el.setAttribute('aria-hidden', 'true')

    const mk = new mapboxgl.Marker({ element: el, draggable: true })
    if (initial) mk.setLngLat([initial.lng, initial.lat])
    else mk.setLngLat(center)
    mk.addTo(map)

    mk.on('dragend', () => {
      const ll = mk.getLngLat()
      onPickRef.current(ll.lat, ll.lng)
    })

    mainMarkerRef.current = mk

    map.on('click', (e) => {
      const { lng: ln, lat: la } = e.lngLat
      mk.setLngLat([ln, la])
      onPickRef.current(la, ln)
    })

    const done = () => {
      map.resize()
      setReady(true)
    }
    if (map.loaded()) done()
    else map.once('load', done)

    return () => {
      mk.remove()
      mainMarkerRef.current = null
      map.remove()
      mapRef.current = null
      setReady(false)
      setMapError(null)
    }
  }, [tokenState.ok])

  useEffect(() => {
    syncMainMarker()
  }, [syncMainMarker, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const p = parseLL(lat, lng)
    if (p) {
      map.easeTo({ center: [p.lng, p.lat], duration: 400 })
    }
  }, [lat, lng, ready])

  // Geofence circle layer for campaign preview
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return

    const removeCircle = () => {
      const id = circleIdRef.current
      if (!id || !map.getSource(id)) return
      if (map.getLayer(`${id}-fill`)) map.removeLayer(`${id}-fill`)
      if (map.getLayer(`${id}-line`)) map.removeLayer(`${id}-line`)
      map.removeSource(id)
      circleIdRef.current = null
    }

    removeCircle()

    if (!previewCircle || previewCircle.radiusM <= 0) return

    const id = `admin-geofence-${Date.now()}`
    circleIdRef.current = id
    const c = previewCircle
    const metersToLat = (m: number) => m / 111_320
    const metersToLng = (m: number, atLat: number) => m / (111_320 * Math.cos((atLat * Math.PI) / 180))
    const steps = 64
    const coords: [number, number][] = []
    for (let i = 0; i < steps; i++) {
      const t = (i / steps) * Math.PI * 2
      const clat = c.lat + metersToLat(c.radiusM) * Math.sin(t)
      const clng = c.lng + metersToLng(c.radiusM, c.lat) * Math.cos(t)
      coords.push([clng, clat])
    }
    if (coords.length > 0) coords.push(coords[0])
    map.addSource(id, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [coords] },
      },
    })
    map.addLayer({
      id: `${id}-fill`,
      type: 'fill',
      source: id,
      paint: { 'fill-color': '#c9a227', 'fill-opacity': 0.12 },
    })
    map.addLayer({
      id: `${id}-line`,
      type: 'line',
      source: id,
      paint: { 'line-color': '#e8c547', 'line-width': 2, 'line-opacity': 0.85 },
    })

    return removeCircle
  }, [previewCircle, ready])

  // Extra reference pins
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    extraMarkersRef.current.forEach((m) => m.remove())
    extraMarkersRef.current = []
    for (const ex of extraMarkers) {
      if (!Number.isFinite(ex.lat) || !Number.isFinite(ex.lng)) continue
      const dot = document.createElement('div')
      dot.style.width = '12px'
      dot.style.height = '12px'
      dot.style.borderRadius = '50%'
      dot.style.background = ex.color ?? 'rgba(150,180,255,0.9)'
      dot.style.border = '2px solid rgba(255,255,255,0.85)'
      dot.title = ex.label ?? ex.id
      const m = new mapboxgl.Marker({ element: dot }).setLngLat([ex.lng, ex.lat]).addTo(map)
      extraMarkersRef.current.push(m)
    }
    return () => {
      extraMarkersRef.current.forEach((m) => m.remove())
      extraMarkersRef.current = []
    }
  }, [extraMarkers, ready])

  if (!tokenState.ok) {
    return (
      <div
        className="mem-subtitle"
        style={{ padding: 16, border: '1px dashed var(--mem-border)', borderRadius: 10, lineHeight: 1.5 }}
        role="status"
      >
        {tokenState.message}
      </div>
    )
  }

  return (
    <div style={{ width: '100%' }}>
      <p className="mem-subtitle" style={{ margin: '0 0 8px', fontSize: 13, lineHeight: 1.45 }}>
        Click the map or drag the gold pin to set latitude and longitude. Other saved points in this tab appear as small dots.
      </p>
      {mapError ? (
        <p className="mem-error" style={{ margin: '0 0 8px', fontSize: 12, lineHeight: 1.45 }}>
          Map error: {mapError}
        </p>
      ) : null}
      <div
        ref={wrapRef}
        style={{
          width: '100%',
          height,
          borderRadius: 10,
          overflow: 'hidden',
          border: '1px solid var(--mem-border)',
        }}
      />
    </div>
  )
}
