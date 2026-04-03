import { useEffect, useMemo, useRef, useState } from 'react'
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
  const [myMemories, setMyMemories] = useState<MemoryPin[]>([])
  const [publicMemories, setPublicMemories] = useState<MemoryPin[]>([])
  const { wallets } = useWallets()
  const signingWallet = pickEthereumSigningWallet(wallets)
  const myAddress = useMemo(
    () => (signingWallet?.address ? (signingWallet.address as `0x${string}`) : null),
    [signingWallet?.address]
  )

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

    const makeUserDot = () => {
      const el = document.createElement('div')
      el.style.width = '14px'
      el.style.height = '14px'
      el.style.borderRadius = '50%'
      el.style.background = '#e8c547'
      el.style.boxShadow = '0 0 0 6px rgba(232, 197, 71, 0.22)'
      el.style.border = '2px solid rgba(255,255,255,0.9)'
      return el
    }

    const setUserAt = (lng: number, lat: number, animateCenter: boolean) => {
      if (!mapRef.current) return
      if (!userMarkerRef.current) {
        userMarkerRef.current = new mapboxgl.Marker({ element: makeUserDot() })
          .setLngLat([lng, lat])
          .addTo(mapRef.current)
      } else {
        userMarkerRef.current.setLngLat([lng, lat])
      }
      if (animateCenter && !userFocusedRef.current) {
        userFocusedRef.current = true
        mapRef.current.easeTo({ center: [lng, lat], zoom: 14, duration: 900 })
      }
    }

    if (trackUser && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          setUserAt(p.coords.longitude, p.coords.latitude, true)
        },
        () => {},
        { enableHighAccuracy: true, timeout: 10000 }
      )
      watchIdRef.current = navigator.geolocation.watchPosition(
        (p) => {
          setUserAt(p.coords.longitude, p.coords.latitude, false)
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 2000 }
      )
    }

    return () => {
      window.removeEventListener('resize', handleWindowResize)
      map.off('error', handleMapError)
      setMapReady(false)
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      userMarkerRef.current?.remove()
      userMarkerRef.current = null
      userFocusedRef.current = false
      map.remove()
      mapRef.current = null
    }
  }, [trackUser])

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

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 0,
        position: 'relative',
        ...style,
      }}
    />
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
