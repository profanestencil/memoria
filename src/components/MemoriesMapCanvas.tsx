import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useNavigate } from 'react-router-dom'
import { useWallets } from '@privy-io/react-auth'
import { pickEthereumSigningWallet } from '@/lib/privyWallet'
import { getMapboxClientTokenState } from '@/lib/mapboxClientToken'
import type { MemoryPin } from '@/lib/memoryPin'
import { loadOptimisticPins } from '@/lib/optimisticPinsStorage'
import { MemoryPinFull, MemoryPinPeek } from '@/components/MemoryInspect'
import {
  fetchRuntimeActive,
  type ActiveRuntimeResponse,
  type RuntimeArScene,
  type RuntimeClaimCampaign,
  type RuntimePoi,
} from '@/lib/runtimeActive'

const mapboxTokenState = getMapboxClientTokenState()
const indexerUrl = (import.meta.env.VITE_INDEXER_URL ?? 'http://localhost:8787').replace(/\/$/, '')

const indexerUrlLooksBrokenInProd = (): string | null => {
  if (!import.meta.env.PROD) return null
  if (indexerUrl.includes('localhost') || indexerUrl.includes('127.0.0.1')) {
    return 'Map pins need VITE_INDEXER_URL pointing at your deployed indexer, not localhost (set in Vercel and redeploy).'
  }
  if (indexerUrl.startsWith('http:')) {
    return 'Indexer URL should use https:// in production (browser blocks http:// API calls from https pages).'
  }
  return null
}

type Props = {
  className?: string
  style?: React.CSSProperties
  /** Follow user: initial center + zoom, then moving dot (watchPosition). */
  trackUser?: boolean
  onMapReady?: (map: mapboxgl.Map) => void
  /** Bumps when navigating here after mint so pins + runtime refetch. */
  refreshEpoch?: number
}

type GeoUi = 'off' | 'requesting' | 'active' | 'need-tap' | 'denied' | 'unsupported'

const clearGeoWatch = (watchIdRef: MutableRefObject<number | null>) => {
  if (watchIdRef.current != null && typeof navigator !== 'undefined' && navigator.geolocation) {
    navigator.geolocation.clearWatch(watchIdRef.current)
    watchIdRef.current = null
  }
}

export function MemoriesMapCanvas({
  className,
  style,
  trackUser = true,
  onMapReady,
  refreshEpoch = 0,
}: Props) {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const onMapReadyRef = useRef(onMapReady)
  onMapReadyRef.current = onMapReady
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const poiMarkersRef = useRef<mapboxgl.Marker[]>([])
  const arSceneMarkersRef = useRef<mapboxgl.Marker[]>([])
  const claimMarkersRef = useRef<mapboxgl.Marker[]>([])
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const userFocusedRef = useRef(false)
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const [geoUi, setGeoUi] = useState<GeoUi>('off')
  const [myMemories, setMyMemories] = useState<MemoryPin[]>([])
  const [publicMemories, setPublicMemories] = useState<MemoryPin[]>([])
  const [indexerFetchHint, setIndexerFetchHint] = useState<string | null>(null)
  const [selectedPin, setSelectedPin] = useState<MemoryPin | null>(null)
  const [detailPin, setDetailPin] = useState<MemoryPin | null>(null)
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null)
  const [runtime, setRuntime] = useState<ActiveRuntimeResponse | null>(null)
  const [runtimeAnchor, setRuntimeAnchor] = useState<{ lat: number; lng: number } | null>(null)
  const [claimTip, setClaimTip] = useState<RuntimeClaimCampaign | null>(null)
  const lastRuntimeGridKey = useRef('')
  const indexerConfigHint = indexerUrlLooksBrokenInProd()
  const indexerBanner = indexerConfigHint ?? indexerFetchHint
  const { wallets } = useWallets()
  const signingWallet = pickEthereumSigningWallet(wallets)
  const myAddress = useMemo(
    () => (signingWallet?.address ? (signingWallet.address as `0x${string}`) : null),
    [signingWallet?.address]
  )

  const fetchMyMemories = useCallback(async () => {
    if (!myAddress) {
      setMyMemories([])
      return
    }
    const u = new URL('/memories', indexerUrl)
    u.searchParams.set('user', myAddress)
    try {
      const r = await fetch(u.toString())
      if (!r.ok) {
        setIndexerFetchHint(`Indexer error ${r.status} loading your pins (${u.origin}).`)
        setMyMemories([])
        return
      }
      const j = (await r.json()) as { memories?: MemoryPin[] }
      setMyMemories(j.memories ?? [])
    } catch {
      setMyMemories([])
      setIndexerFetchHint(
        `Could not reach indexer at ${indexerUrl}. Is it running with CORS and a public URL?`
      )
    }
  }, [myAddress])

  useEffect(() => {
    void fetchMyMemories()
  }, [fetchMyMemories, refreshEpoch])

  useEffect(() => {
    if (!mapReady) return
    const pins = loadOptimisticPins()
    if (!pins.length) return

    if (myAddress) {
      const mine = pins.filter((p) => p.creator.toLowerCase() === myAddress.toLowerCase())
      if (mine.length) {
        setMyMemories((prev) => {
          const seen = new Set(prev.map((p) => `${p.creator.toLowerCase()}-${p.memoryId}`))
          const merged = [...mine.filter((p) => !seen.has(`${p.creator.toLowerCase()}-${p.memoryId}`)), ...prev]
          return merged
        })
      }
    }

    const pub = pins.filter((p) => p.isPublic)
    if (pub.length) {
      setPublicMemories((prev) => {
        const seen = new Set(prev.map((p) => `${p.creator.toLowerCase()}-${p.memoryId}`))
        const merged = [...pub.filter((p) => !seen.has(`${p.creator.toLowerCase()}-${p.memoryId}`)), ...prev]
        return merged
      })
    }
  }, [mapReady, myAddress])

  const applyUserPosition = useCallback((lng: number, lat: number, animateCenter: boolean) => {
    setUserPos({ lat, lng })
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
      poiMarkersRef.current.forEach((m) => m.remove())
      poiMarkersRef.current = []
      arSceneMarkersRef.current.forEach((m) => m.remove())
      arSceneMarkersRef.current = []
      claimMarkersRef.current.forEach((m) => m.remove())
      claimMarkersRef.current = []
      userMarkerRef.current?.remove()
      userMarkerRef.current = null
      userFocusedRef.current = false
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const loadPublicInView = async () => {
      if (!mapRef.current) return
      const b = mapRef.current.getBounds()
      const u = new URL('/memories', indexerUrl)
      u.searchParams.set('latMin', String(b?.getSouth?.() ?? -90))
      u.searchParams.set('latMax', String(b?.getNorth?.() ?? 90))
      u.searchParams.set('lngMin', String(b?.getWest?.() ?? -180))
      u.searchParams.set('lngMax', String(b?.getEast?.() ?? 180))
      try {
        const res = await fetch(u.toString())
        if (!res.ok) {
          setIndexerFetchHint(`Indexer error ${res.status} for public pins (${u.origin}).`)
          setPublicMemories([])
          return
        }
        const j: { memories?: MemoryPin[] } = await res.json()
        setPublicMemories(j.memories ?? [])
        setIndexerFetchHint(null)
      } catch {
        setPublicMemories([])
        setIndexerFetchHint(
          `Could not reach indexer at ${indexerUrl}. Is it running with CORS and a public URL?`
        )
      }
    }

    void loadPublicInView()
    const handleIdle = () => void loadPublicInView()
    map.on('moveend', loadPublicInView)
    map.on('idle', handleIdle)
    return () => {
      map.off('moveend', loadPublicInView)
      map.off('idle', handleIdle)
    }
  }, [mapReady, indexerUrl, refreshEpoch])

  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    if (!map) return
    const syncAnchor = () => {
      if (userPos) {
        setRuntimeAnchor(userPos)
        return
      }
      const c = map.getCenter()
      setRuntimeAnchor({ lat: c.lat, lng: c.lng })
    }
    syncAnchor()
    if (!userPos) {
      map.on('moveend', syncAnchor)
    }
    return () => {
      if (!userPos) map.off('moveend', syncAnchor)
    }
  }, [mapReady, userPos])

  useEffect(() => {
    if (!runtimeAnchor) return
    const gridKey = `${runtimeAnchor.lat.toFixed(2)}_${runtimeAnchor.lng.toFixed(2)}_${refreshEpoch}`
    if (gridKey === lastRuntimeGridKey.current) return
    lastRuntimeGridKey.current = gridKey
    let cancelled = false
    void fetchRuntimeActive(runtimeAnchor.lat, runtimeAnchor.lng).then((r) => {
      if (!cancelled) setRuntime(r)
    })
    return () => {
      cancelled = true
    }
  }, [runtimeAnchor, refreshEpoch])

  const handlePoiTap = useCallback(
    (poi: RuntimePoi) => {
      if (poi.tapAction === 'open_url') {
        const url = typeof poi.payload?.url === 'string' ? poi.payload.url : ''
        if (url) window.open(url, '_blank', 'noopener,noreferrer')
        return
      }
      if (poi.tapAction === 'open_memory_list') {
        navigate('/map')
        return
      }
      if (poi.tapAction === 'open_ar_scene') {
        const p = poi.payload
        let iframeUrl: string | null =
          typeof p.iframeUrl === 'string' ? p.iframeUrl : typeof p.url === 'string' ? p.url : null
        let lat = poi.lat
        let lng = poi.lng
        let geoRadiusM = typeof p.geoRadiusM === 'number' ? p.geoRadiusM : 80
        const sceneId = typeof p.sceneId === 'string' ? p.sceneId : null
        if (sceneId && runtime?.arScenes?.length) {
          const sc = runtime.arScenes.find((s) => s.id === sceneId)
          if (sc) {
            lat = sc.lat
            lng = sc.lng
            geoRadiusM = sc.geoRadiusM
            if (sc.sceneType === 'iframe_url') {
              const pl = sc.scenePayload
              iframeUrl =
                typeof pl.url === 'string' ? pl.url : typeof pl.iframeUrl === 'string' ? pl.iframeUrl : iframeUrl
            }
          }
        }
        if (iframeUrl) {
          navigate('/ar', {
            state: {
              mode: 'iframe' as const,
              iframeUrl,
              latitude: lat,
              longitude: lng,
              geoRadiusM,
              sceneName: poi.name,
            },
          })
        }
      }
    },
    [navigate, runtime]
  )

  const handleArSceneTap = useCallback(
    (scene: RuntimeArScene) => {
      if (scene.sceneType === 'iframe_url') {
        const pl = scene.scenePayload
        const iframeUrl =
          typeof pl?.url === 'string'
            ? pl.url
            : typeof pl?.iframeUrl === 'string'
              ? pl.iframeUrl
              : null
        if (iframeUrl) {
          navigate('/ar', {
            state: {
              mode: 'iframe' as const,
              iframeUrl,
              latitude: scene.lat,
              longitude: scene.lng,
              geoRadiusM: scene.geoRadiusM,
              sceneName: scene.name,
            },
          })
        }
      }
    },
    [navigate]
  )

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    poiMarkersRef.current.forEach((m) => m.remove())
    poiMarkersRef.current = []
    for (const poi of runtime?.pois ?? []) {
      const el = document.createElement('button')
      el.type = 'button'
      el.setAttribute('aria-label', poi.name || 'Point of interest')
      el.style.width = '40px'
      el.style.height = '40px'
      el.style.borderRadius = '10px'
      el.style.cursor = 'pointer'
      el.style.padding = '0'
      el.style.border = '2px solid rgba(232, 197, 71, 0.85)'
      el.style.background = 'rgba(12,10,8,0.88)'
      el.style.overflow = 'hidden'
      el.style.boxShadow = '0 4px 14px rgba(0,0,0,0.45)'
      if (poi.iconUrl) {
        const img = document.createElement('img')
        img.src = poi.iconUrl
        img.alt = ''
        img.draggable = false
        img.style.width = '100%'
        img.style.height = '100%'
        img.style.objectFit = 'cover'
        img.style.pointerEvents = 'none'
        el.appendChild(img)
      } else {
        el.textContent = '📍'
        el.style.fontSize = '20px'
        el.style.lineHeight = '38px'
        el.style.textAlign = 'center'
      }
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        handlePoiTap(poi)
      })
      const marker = new mapboxgl.Marker({ element: el }).setLngLat([poi.lng, poi.lat]).addTo(map)
      poiMarkersRef.current.push(marker)
    }
  }, [mapReady, runtime, handlePoiTap])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    arSceneMarkersRef.current.forEach((m) => m.remove())
    arSceneMarkersRef.current = []
    for (const scene of runtime?.arScenes ?? []) {
      const el = document.createElement('button')
      el.type = 'button'
      el.setAttribute('aria-label', scene.name ? `AR: ${scene.name}` : 'AR scene')
      el.style.width = '40px'
      el.style.height = '40px'
      el.style.borderRadius = '50%'
      el.style.cursor = 'pointer'
      el.style.padding = '0'
      el.style.border = '2px solid rgba(255, 150, 70, 0.9)'
      el.style.background = 'rgba(12,10,8,0.88)'
      el.style.overflow = 'hidden'
      el.style.boxShadow = '0 4px 14px rgba(0,0,0,0.45)'
      const img = document.createElement('img')
      img.src = `${import.meta.env.BASE_URL}ar-scene-pin.png`
      img.alt = ''
      img.draggable = false
      img.style.width = '100%'
      img.style.height = '100%'
      img.style.objectFit = 'cover'
      img.style.pointerEvents = 'none'
      img.style.display = 'block'
      el.appendChild(img)
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        handleArSceneTap(scene)
      })
      const marker = new mapboxgl.Marker({ element: el }).setLngLat([scene.lng, scene.lat]).addTo(map)
      arSceneMarkersRef.current.push(marker)
    }
  }, [mapReady, runtime, handleArSceneTap])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    claimMarkersRef.current.forEach((m) => m.remove())
    claimMarkersRef.current = []
    for (const camp of runtime?.claimCampaigns ?? []) {
      if (camp.lat == null || camp.lng == null) continue
      if (!Number.isFinite(camp.lat) || !Number.isFinite(camp.lng)) continue
      const el = document.createElement('button')
      el.type = 'button'
      el.setAttribute('aria-label', camp.name ? `Reward: ${camp.name}` : 'Reward campaign')
      el.style.width = '40px'
      el.style.height = '40px'
      el.style.borderRadius = '50%'
      el.style.cursor = 'pointer'
      el.style.padding = '0'
      el.style.border = '2px solid rgba(255, 200, 140, 0.85)'
      el.style.background = 'rgba(12,10,8,0.88)'
      el.style.overflow = 'hidden'
      el.style.boxShadow = '0 4px 14px rgba(0,0,0,0.45)'
      const img = document.createElement('img')
      img.src = `${import.meta.env.BASE_URL}claim-pin.png`
      img.alt = ''
      img.draggable = false
      img.style.width = '100%'
      img.style.height = '100%'
      img.style.objectFit = 'cover'
      img.style.pointerEvents = 'none'
      img.style.display = 'block'
      el.appendChild(img)
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        setClaimTip(camp)
      })
      const marker = new mapboxgl.Marker({ element: el }).setLngLat([camp.lng, camp.lat]).addTo(map)
      claimMarkersRef.current.push(marker)
    }
  }, [mapReady, runtime])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const clearSelection = () => {
      setSelectedPin(null)
      setClaimTip(null)
    }
    map.on('click', clearSelection)
    return () => {
      map.off('click', clearSelection)
    }
  }, [mapReady])

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
      const showAsPoi = mem.isPublic || isMine
      const size = showAsPoi && mem.imageUrl ? (isMine ? 40 : 36) : isMine ? 34 : 28
      const hex = mem.pinColor && /^#[0-9a-fA-F]{6}$/i.test(mem.pinColor) ? mem.pinColor : null

      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'memory-marker-el'
      el.setAttribute('aria-label', mem.title || 'Memory pin')
      el.style.width = `${size}px`
      el.style.height = `${size}px`
      el.style.borderRadius = '50%'
      el.style.cursor = 'pointer'
      el.style.padding = '0'
      el.style.border = hex ? `2px solid ${hex}` : '2px solid rgba(255,248,235,0.92)'
      el.style.boxShadow = hex
        ? `0 0 0 5px ${hex}44`
        : isMine
          ? '0 0 0 6px rgba(201, 162, 39, 0.22)'
          : '0 0 0 5px rgba(107, 83, 68, 0.2)'
      el.style.overflow = 'hidden'
      el.style.background =
        showAsPoi && mem.imageUrl ? (hex ? `${hex}33` : '#1a1714') : hex ?? (isMine ? '#c9a227' : '#6b5344')
      if (showAsPoi && mem.imageUrl) {
        const img = document.createElement('img')
        img.src = mem.imageUrl
        img.alt = ''
        img.draggable = false
        img.style.width = '100%'
        img.style.height = '100%'
        img.style.objectFit = 'cover'
        img.style.display = 'block'
        img.style.pointerEvents = 'none'
        el.appendChild(img)
      }

      el.addEventListener('click', (e) => {
        e.stopPropagation()
        setSelectedPin(mem)
        setDetailPin(null)
      })

      const marker = new mapboxgl.Marker({ element: el }).setLngLat([mem.longitude, mem.latitude]).addTo(map)
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
      {claimTip ? (
        <div
          role="dialog"
          aria-label="Reward campaign"
          style={{
            position: 'absolute',
            left: 12,
            right: 12,
            bottom: showGeoPrompt ? 120 : 24,
            zIndex: 6,
            maxWidth: 400,
            margin: '0 auto',
            padding: '14px 16px',
            borderRadius: 12,
            background: 'rgba(12, 10, 8, 0.94)',
            border: '1px solid rgba(180, 255, 160, 0.35)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
            color: 'var(--mem-text, #f5f0e8)',
            fontSize: 14,
            lineHeight: 1.45,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{claimTip.name}</div>
          <p style={{ margin: '0 0 10px', opacity: 0.9, fontSize: 13 }}>
            Open the <strong>Rewards</strong> panel (bottom-right) to sign and claim this campaign.
          </p>
          <button type="button" className="mem-btn mem-btn--secondary" style={{ width: '100%' }} onClick={() => setClaimTip(null)}>
            Dismiss
          </button>
        </div>
      ) : null}
      {indexerBanner ? (
        <div
          role="status"
          style={{
            position: 'absolute',
            left: 12,
            right: 12,
            top: 12,
            zIndex: 6,
            maxWidth: 480,
            margin: '0 auto',
            padding: '12px 14px',
            borderRadius: 10,
            background: 'rgba(80, 40, 20, 0.92)',
            border: '1px solid rgba(255,200,120,0.35)',
            color: '#fff5e8',
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          {indexerBanner}
        </div>
      ) : null}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      {selectedPin && !detailPin ? (
        <div
          className="mem-memory-peek-anchor"
          onClick={() => setSelectedPin(null)}
          role="presentation"
        >
          <MemoryPinPeek
            pin={selectedPin}
            myAddress={myAddress}
            onClose={() => setSelectedPin(null)}
            onOpenDetail={() => setDetailPin(selectedPin)}
          />
        </div>
      ) : null}
      {detailPin ? (
        <MemoryPinFull
          pin={detailPin}
          myAddress={myAddress}
          onClose={() => {
            setDetailPin(null)
            setSelectedPin(null)
          }}
        />
      ) : null}
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
