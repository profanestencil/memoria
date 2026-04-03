import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useWallets } from '@privy-io/react-auth'
import { pickEthereumSigningWallet } from '@/lib/privyWallet'
import { getMapboxClientTokenState } from '@/lib/mapboxClientToken'

const mapboxTokenState = getMapboxClientTokenState()
const indexerUrl = import.meta.env.VITE_INDEXER_URL ?? 'http://localhost:8787'

export type MemoryPin = {
  memoryId: string
  creator: `0x${string}`
  timestamp: number
  latitude: number
  longitude: number
  isPublic: boolean
  title: string
  note: string
}

type Props = {
  className?: string
  style?: React.CSSProperties
  /** Follow user: initial center + zoom, then moving dot (watchPosition). */
  trackUser?: boolean
  onMapReady?: (map: mapboxgl.Map) => void
}

type GeoUi = 'off' | 'requesting' | 'active' | 'need-tap' | 'denied' | 'unsupported'

const clearGeoWatch = (watchIdRef: MutableRefObject<number | null>) => {
  if (watchIdRef.current != null && typeof navigator !== 'undefined' && navigator.geolocation) {
    navigator.geolocation.clearWatch(watchIdRef.current)
    watchIdRef.current = null
  }
}

export function MemoriesMapCanvas({ className, style, trackUser = true, onMapReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const onMapReadyRef = useRef(onMapReady)
  onMapReadyRef.current = onMapReady
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const userFocusedRef = useRef(false)
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const [geoUi, setGeoUi] = useState<GeoUi>('off')
  const [myMemories, setMyMemories] = useState<MemoryPin[]>([])
  const [publicMemories, setPublicMemories] = useState<MemoryPin[]>([])
  const { wallets } = useWallets()
  const signingWallet = pickEthereumSigningWallet(wallets)
  const myAddress = useMemo(
    () => (signingWallet?.address ? (signingWallet.address as `0x${string}`) : null),
    [signingWallet?.address]
  )

  const applyUserPosition = useCallback((lng: number, lat: number, animateCenter: boolean) => {
    const map = mapRef.current
    if (!map) return
    if (!userMarkerRef.current) {
      const el = document.createElement('div')
      el.style.width = '14px'
      el.style.height = '14px'
      el.style.borderRadius = '50%'
      el.style.background = '#e8c547'
      el.style.boxShadow = '0 0 0 6px rgba(232, 197, 71, 0.22)'
      el.style.border = '2px solid rgba(255,255,255,0.9)'
      userMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map)
    } else {
      userMarkerRef.current.setLngLat([lng, lat])
    }
    if (animateCenter && !userFocusedRef.current) {
      userFocusedRef.current = true
      map.easeTo({ center: [lng, lat], zoom: 14, duration: 900 })
    }
  }, [])

  const requestUserLocation = useCallback(
    (fromUserGesture: boolean) => {
      if (!trackUser || !mapRef.current || !navigator.geolocation) return
      setGeoUi('requesting')
      navigator.geolocation.getCurrentPosition(
        (p) => {
          setGeoUi('active')
          applyUserPosition(p.coords.longitude, p.coords.latitude, true)
          clearGeoWatch(watchIdRef)
          watchIdRef.current = navigator.geolocation.watchPosition(
            (q) => applyUserPosition(q.coords.longitude, q.coords.latitude, false),
            () => {},
            { enableHighAccuracy: true, maximumAge: 2000 }
          )
        },
        (e) => {
          if (e.code === e.PERMISSION_DENIED) setGeoUi('denied')
          else setGeoUi('need-tap')
        },
        {
          enableHighAccuracy: true,
          timeout: fromUserGesture ? 20000 : 12000,
          maximumAge: fromUserGesture ? 0 : 3000,
        }
      )
    },
    [applyUserPosition, trackUser]
  )

  useEffect(() => {
    if (!trackUser) {
      setGeoUi('off')
      clearGeoWatch(watchIdRef)
      userMarkerRef.current?.remove()
      userMarkerRef.current = null
      userFocusedRef.current = false
      return
    }
    if (!mapReady) {
      clearGeoWatch(watchIdRef)
      return
    }
    if (!navigator.geolocation) {
      setGeoUi('unsupported')
      return
    }
    requestUserLocation(false)
  }, [mapReady, trackUser, requestUserLocation])

  const handleShareLocation = useCallback(() => {
    requestUserLocation(true)
  }, [requestUserLocation])

  useEffect(() => {
    if (!mapboxTokenState.ok) return
    if (!containerRef.current) return
    mapboxgl.accessToken = mapboxTokenState.token
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-98, 39],
      zoom: 3,
      attributionControl: true,
    })
    mapRef.current = map
    onMapReadyRef.current?.(map)

    const handleMapError = (e: { error?: Error }) => {
      const msg = e.error?.message?.trim() || 'Map failed to load tiles or style.'
      setMapError(msg)
    }
    map.on('error', handleMapError)

    const finishInit = () => {
      map.resize()
      requestAnimationFrame(() => map.resize())
      setMapReady(true)
    }
    if (map.loaded()) {
      finishInit()
    } else {
      map.once('load', finishInit)
    }

    const handleWindowResize = () => {
      map.resize()
    }
    window.addEventListener('resize', handleWindowResize)

    return () => {
      window.removeEventListener('resize', handleWindowResize)
      map.off('error', handleMapError)
      setMapReady(false)
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      userMarkerRef.current?.remove()
      userMarkerRef.current = null
      userFocusedRef.current = false
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!myAddress) {
      setMyMemories([])
      return
    }
    const u = new URL('/memories', indexerUrl)
    u.searchParams.set('user', myAddress)
    fetch(u.toString())
      .then((r) => r.json())
      .then((j: { memories?: MemoryPin[] }) => setMyMemories(j.memories ?? []))
      .catch(() => setMyMemories([]))
  }, [myAddress])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    async function loadPublicInView() {
      if (!mapRef.current) return
      const b = mapRef.current.getBounds()
      const u = new URL('/memories', indexerUrl)
      u.searchParams.set('latMin', String(b?.getSouth?.() ?? -90))
      u.searchParams.set('latMax', String(b?.getNorth?.() ?? 90))
      u.searchParams.set('lngMin', String(b?.getWest?.() ?? -180))
      u.searchParams.set('lngMax', String(b?.getEast?.() ?? 180))
      try {
        const j: { memories?: MemoryPin[] } = await fetch(u.toString()).then((r) => r.json())
        setPublicMemories(j.memories ?? [])
      } catch {
        setPublicMemories([])
      }
    }

    loadPublicInView()
    map.on('moveend', loadPublicInView)
    return () => {
      map.off('moveend', loadPublicInView)
    }
  }, [mapReady, indexerUrl])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    const all = [...publicMemories, ...myMemories]
    const seen = new Set<string>()

    for (const mem of all) {
      const key = `${mem.creator.toLowerCase()}-${mem.memoryId}`
      if (seen.has(key)) continue
      seen.add(key)

      const isMine = myAddress ? mem.creator.toLowerCase() === myAddress.toLowerCase() : false

      const el = document.createElement('div')
      el.className = 'memory-marker'
      el.style.width = isMine ? '34px' : '28px'
      el.style.height = isMine ? '34px' : '28px'
      el.style.borderRadius = '50%'
      el.style.background = isMine ? '#c9a227' : '#6b5344'
      el.style.border = '2px solid rgba(255,248,235,0.92)'
      el.style.cursor = 'pointer'
      el.style.boxShadow = isMine
        ? '0 0 0 6px rgba(201, 162, 39, 0.22)'
        : '0 0 0 5px rgba(107, 83, 68, 0.2)'

      const marker = new mapboxgl.Marker({ element: el }).setLngLat([mem.longitude, mem.latitude]).addTo(map)

      const when = mem.timestamp ? new Date(mem.timestamp * 1000).toLocaleString() : ''
      const popupHtml = `
        <div style="max-width:240px">
          <div style="font-weight:600;margin-bottom:6px">${escapeHtml(mem.title || 'Memory')}</div>
          ${mem.note ? `<div style="margin-bottom:8px;opacity:0.9;white-space:pre-wrap">${escapeHtml(mem.note)}</div>` : ''}
          ${when ? `<div style="font-size:12px;opacity:0.75;margin-bottom:4px">${escapeHtml(when)}</div>` : ''}
          <div style="font-size:12px;opacity:0.75">${isMine ? 'You' : shortAddr(mem.creator)} • ${mem.isPublic ? 'Public' : 'Private'}</div>
        </div>
      `
      const popup = new mapboxgl.Popup({ closeButton: false, offset: 18 }).setHTML(popupHtml)
      marker.setPopup(popup)

      markersRef.current.push(marker)
    }
  }, [mapReady, publicMemories, myMemories, myAddress])

  if (!mapboxTokenState.ok) {
    return (
      <div
        style={{ padding: 20, color: 'var(--mem-danger)', lineHeight: 1.5, ...style }}
        className={className}
        role="alert"
      >
        {mapboxTokenState.message}
      </div>
    )
  }

  if (mapError) {
    return (
      <div
        style={{ padding: 20, color: 'var(--mem-danger)', lineHeight: 1.5, ...style }}
        className={className}
        role="alert"
      >
        {mapError}
      </div>
    )
  }

  const showGeoPrompt =
    trackUser &&
    mapReady &&
    geoUi !== 'active' &&
    geoUi !== 'off' &&
    mapboxTokenState.ok &&
    !mapError

  return (
    <div
      className={className}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 0,
        position: 'relative',
        ...style,
      }}
    >
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      {showGeoPrompt ? (
        <div
          role="region"
          aria-label="Location access"
          style={{
            position: 'absolute',
            left: 12,
            right: 12,
            bottom: 24,
            zIndex: 5,
            maxWidth: 420,
            margin: '0 auto',
            padding: '14px 16px',
            borderRadius: 12,
            background: 'rgba(12, 10, 8, 0.92)',
            border: '1px solid var(--mem-border, rgba(255,248,235,0.15))',
            boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
            color: 'var(--mem-text, #f5f0e8)',
            fontSize: 14,
            lineHeight: 1.45,
          }}
        >
          {geoUi === 'unsupported' ? (
            <p style={{ margin: 0 }}>This browser does not support location. Use a device with GPS or try another browser.</p>
          ) : geoUi === 'denied' ? (
            <>
              <p style={{ margin: '0 0 10px' }}>
                Location is blocked for this site. Enable it in your browser or system settings so the map can center on you
                and mints can use your position.
              </p>
              <button
                type="button"
                className="mem-btn mem-btn--secondary"
                onClick={handleShareLocation}
                style={{ width: '100%' }}
              >
                Try again
              </button>
            </>
          ) : geoUi === 'requesting' ? (
            <p style={{ margin: 0 }}>Requesting location… allow the prompt if your browser shows one.</p>
          ) : (
            <>
              <p style={{ margin: '0 0 10px' }}>
                Location is used to show your position on the map and for geo memories. Tap to allow.
              </p>
              <button
                type="button"
                className="mem-btn mem-btn--primary"
                onClick={handleShareLocation}
                style={{ width: '100%' }}
              >
                Share location
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

function shortAddr(a: string) {
  if (!a || a.length < 10) return a
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

function escapeHtml(s: string) {
  return s
    .split('&')
    .join('&amp;')
    .split('<')
    .join('&lt;')
    .split('>')
    .join('&gt;')
    .split('"')
    .join('&quot;')
    .split("'")
    .join('&#039;')
}
