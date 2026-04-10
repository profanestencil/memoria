import { useNavigate, useSearchParams } from 'react-router-dom'
import { useRef, useEffect, useState, useCallback } from 'react'
import { getCurrentPosition } from '@/lib/geo'
import { fetchRuntimeActive, type ActiveCampaign } from '@/lib/runtimeActive'
import { MemoriesMapCanvas } from '@/components/MemoriesMapCanvas'
import { WalletProfileButton } from '@/components/WalletProfileButton'
import { getMapboxClientTokenState } from '@/lib/mapboxClientToken'

const mapboxState = getMapboxClientTokenState()
const MAPBOX_TOKEN = mapboxState.ok ? mapboxState.token : ''

type FacingPreference = 'environment' | 'user'

type ZoomUiState = {
  min: number
  max: number
  step: number
  value: number
}

const readZoomSupport = (track: MediaStreamTrack): ZoomUiState | null => {
  if (typeof track.getCapabilities !== 'function') return null
  const caps = track.getCapabilities() as MediaTrackCapabilities & {
    zoom?: { min: number; max: number; step?: number }
  }
  const z = caps.zoom
  if (!z || typeof z.min !== 'number' || typeof z.max !== 'number') return null
  if (z.max - z.min < 0.02) return null
  const step = typeof z.step === 'number' && z.step > 0 ? z.step : Math.max(0.01, (z.max - z.min) / 24)
  const settings = track.getSettings() as { zoom?: number }
  const cur = typeof settings.zoom === 'number' ? settings.zoom : z.min
  const value = Math.min(z.max, Math.max(z.min, cur))
  return { min: z.min, max: z.max, step, value }
}

const applyZoom = async (track: MediaStreamTrack, value: number) => {
  const constraints = { zoom: value } as MediaTrackConstraints
  await track.applyConstraints(constraints)
}

/** Camera style filters: id and CSS filter string applied at capture. */
const CAMERA_FILTERS: { id: string; label: string; filter: string }[] = [
  { id: 'normal', label: 'Normal', filter: '' },
  { id: 'sepia', label: 'Sepia', filter: 'sepia(1)' },
  { id: 'vintage', label: 'Vintage', filter: 'sepia(0.45) contrast(1.1) saturate(0.85)' },
  { id: 'bw', label: 'B&W', filter: 'grayscale(1)' },
  { id: 'cool', label: 'Cool', filter: 'hue-rotate(200deg) saturate(0.9)' },
  { id: 'warm', label: 'Warm', filter: 'sepia(0.3) saturate(1.2)' },
  { id: 'faded', label: 'Faded', filter: 'contrast(0.92) saturate(0.75)' },
  { id: 'dramatic', label: 'Dramatic', filter: 'contrast(1.25) saturate(1.1)' },
]

function staticMapUrl(lng: number, lat: number, zoom: number, width: number, height: number): string {
  if (!MAPBOX_TOKEN) return ''
  const base = 'https://api.mapbox.com/styles/v1/mapbox/dark-v11/static'
  const pos = `${lng.toFixed(5)},${lat.toFixed(5)},${zoom},0,0`
  return `${base}/${pos}/${width}x${height}@2x?access_token=${MAPBOX_TOKEN}`
}

export function Camera() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const mapOpen = searchParams.get('map') === '1'

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const lastObjectUrlRef = useRef<string | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mapCoords, setMapCoords] = useState<{ lng: number; lat: number } | null>(null)
  const [selectedFilterId, setSelectedFilterId] = useState<string>('normal')
  const [facingMode, setFacingMode] = useState<FacingPreference>('environment')
  const [flipBusy, setFlipBusy] = useState(false)
  const [flipHint, setFlipHint] = useState<string | null>(null)
  const [zoomUi, setZoomUi] = useState<ZoomUiState | null>(null)
  const [activeCampaign, setActiveCampaign] = useState<ActiveCampaign | null>(null)

  const handleOpenMap = () => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        p.set('map', '1')
        return p
      },
      { replace: false }
    )
  }

  const handleCloseMap = () => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        p.delete('map')
        return p
      },
      { replace: true }
    )
  }

  useEffect(() => {
    return () => {
      if (lastObjectUrlRef.current) {
        URL.revokeObjectURL(lastObjectUrlRef.current)
        lastObjectUrlRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (flipHint == null) return
    const t = window.setTimeout(() => setFlipHint(null), 3200)
    return () => window.clearTimeout(t)
  }, [flipHint])

  useEffect(() => {
    let cancelled = false
    let created: MediaStream | null = null

    const start = async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode === 'environment' ? 'environment' : 'user' },
          },
          audio: false,
        })
        if (cancelled) {
          s.getTracks().forEach((tr) => tr.stop())
          return
        }
        created = s
        streamRef.current?.getTracks().forEach((tr) => tr.stop())
        streamRef.current = s
        if (videoRef.current) {
          videoRef.current.srcObject = s
        }
        const vt = s.getVideoTracks()[0]
        setZoomUi(vt ? readZoomSupport(vt) : null)
        setReady(true)
        setError(null)
      } catch {
        if (cancelled) return
        if (facingMode === 'environment') {
          setError('Camera access failed')
          setReady(false)
          streamRef.current = null
        } else {
          setFlipHint('Could not switch to front camera')
          setFacingMode('environment')
        }
      }
    }

    void start()

    return () => {
      cancelled = true
      created?.getTracks().forEach((tr) => tr.stop())
      if (streamRef.current === created) {
        streamRef.current = null
      }
    }
  }, [facingMode])

  const handleFlipCamera = useCallback(() => {
    if (flipBusy || !ready) return
    setFlipBusy(true)
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
    window.setTimeout(() => setFlipBusy(false), 600)
  }, [flipBusy, ready])

  const handleZoomChange = useCallback(
    async (next: number) => {
      const track = streamRef.current?.getVideoTracks()[0]
      if (!track || !zoomUi) return
      const clamped = Math.min(zoomUi.max, Math.max(zoomUi.min, next))
      setZoomUi((z) => (z ? { ...z, value: clamped } : null))
      try {
        await applyZoom(track, clamped)
      } catch {
        try {
          const again = readZoomSupport(track)
          if (again) setZoomUi(again)
        } catch {
          // ignore
        }
      }
    },
    [zoomUi]
  )

  useEffect(() => {
    getCurrentPosition()
      .then((c) => setMapCoords({ lng: c.longitude, lat: c.latitude }))
      .catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      try {
        const c = await getCurrentPosition()
        const r = await fetchRuntimeActive(c.latitude, c.longitude)
        if (!cancelled) setActiveCampaign(r.campaigns?.[0] ?? null)
      } catch {
        if (!cancelled) setActiveCampaign(null)
      }
    }
    void refresh()
    const id = window.setInterval(refresh, 90_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  const selectedFilter = CAMERA_FILTERS.find((f) => f.id === selectedFilterId) ?? CAMERA_FILTERS[0]

  function capture() {
    if (!videoRef.current || !streamRef.current) return
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.save()
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(video, 0, 0)
    ctx.restore()
    const filterDef = CAMERA_FILTERS.find((f) => f.id === selectedFilterId)
    if (filterDef?.filter) {
      ctx.save()
      ctx.filter = filterDef.filter
      ctx.drawImage(canvas, 0, 0)
      ctx.restore()
    }
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        if (lastObjectUrlRef.current) {
          URL.revokeObjectURL(lastObjectUrlRef.current)
          lastObjectUrlRef.current = null
        }
        const url = URL.createObjectURL(blob)
        lastObjectUrlRef.current = url
        navigate('/preview', { state: { imageBlob: blob, imageUrl: url, activeCampaign } })
      },
      'image/jpeg',
      0.92
    )
  }

  if (error) {
    return (
      <div className="mem-page mem-page--center">
        <main className="mem-main">
          <p className="mem-error" style={{ marginBottom: 20 }}>
            {error}
          </p>
          <button type="button" className="mem-btn mem-btn--secondary" onClick={() => navigate('/')}>
            Back home
          </button>
        </main>
      </div>
    )
  }

  const filterStripBottom = zoomUi
    ? 'calc(var(--mem-camera-bottom) + 92px + 52px)'
    : 'calc(var(--mem-camera-bottom) + 92px)'

  return (
    <div className="mem-camera">
      {flipHint ? (
        <div className="mem-camera__flip-hint" role="status">
          {flipHint}
        </div>
      ) : null}

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`mem-camera__video${facingMode === 'user' ? ' mem-camera__video--mirror' : ''}`}
        style={{ filter: selectedFilter.filter || 'none' }}
      />

      {mapOpen && MAPBOX_TOKEN ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Map"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1600,
            background: '#0a0a0a',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
            <MemoriesMapCanvas trackUser style={{ width: '100%', height: '100%' }} />
            <button
              type="button"
              onClick={handleCloseMap}
              aria-label="Close map"
              className="mem-btn mem-btn--ghost"
              style={{
                position: 'absolute',
                top: 14,
                right: 14,
                zIndex: 10,
                background: 'rgba(10, 9, 8, 0.92)',
              }}
            >
              Close map
            </button>
          </div>
        </div>
      ) : null}

      {zoomUi ? (
        <div
          className="mem-camera__zoom"
          style={{ bottom: 'calc(var(--mem-camera-bottom) + 92px)' }}
        >
          <span className="mem-camera__zoom-label" id="mem-camera-zoom-label">
            Zoom
          </span>
          <input
            type="range"
            min={zoomUi.min}
            max={zoomUi.max}
            step={zoomUi.step}
            value={zoomUi.value}
            onChange={(e) => {
              void handleZoomChange(Number(e.target.value))
            }}
            aria-labelledby="mem-camera-zoom-label"
            aria-valuemin={zoomUi.min}
            aria-valuemax={zoomUi.max}
            aria-valuenow={zoomUi.value}
          />
        </div>
      ) : null}

      <div
        className="camera-filter-strip"
        style={{
          position: 'absolute',
          bottom: filterStripBottom,
          left: 'var(--mem-camera-left)',
          right: 'calc(var(--mem-camera-right) + var(--mem-camera-thumb) + 12px)',
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          paddingBottom: 4,
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {CAMERA_FILTERS.map((f) => {
          const selected = f.id === selectedFilterId
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setSelectedFilterId(f.id)}
              className={`mem-filter-pill ${selected ? 'mem-filter-pill--active' : ''}`}
            >
              {f.label}
            </button>
          )
        })}
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 'var(--mem-camera-bottom)',
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <button
          type="button"
          onClick={capture}
          disabled={!ready}
          className="mem-ios-shutter"
          aria-label="Capture photo"
        />
      </div>
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          right: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          color: 'white',
          zIndex: 5,
          pointerEvents: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, pointerEvents: 'auto' }}>
          <WalletProfileButton />
          <span className="mem-brand" style={{ fontSize: '1.15rem', textShadow: '0 2px 12px rgba(0,0,0,0.5)' }}>
            Memoria
          </span>
        </div>
        <button
          type="button"
          className="mem-btn mem-btn--ghost"
          onClick={() => navigate('/')}
          aria-label="Back to home"
          style={{
            pointerEvents: 'auto',
            flexShrink: 0,
            boxShadow: '0 2px 16px rgba(0,0,0,0.35)',
          }}
        >
          Home
        </button>
      </div>

      <button
        type="button"
        className="mem-camera__flip"
        onClick={handleFlipCamera}
        disabled={!ready || flipBusy}
        aria-label={facingMode === 'environment' ? 'Switch to front camera' : 'Switch to back camera'}
        title={facingMode === 'environment' ? 'Selfie camera' : 'Back camera'}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 10a7.5 7.5 0 0113.08-2.5M20 14a7.5 7.5 0 01-13.08 2.5"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 5L4 10h5M18 19l2-5h-5" />
        </svg>
      </button>

      <button
        type="button"
        onClick={() => {
          if (!MAPBOX_TOKEN) {
            navigate('/map')
            return
          }
          handleOpenMap()
        }}
        aria-label={MAPBOX_TOKEN ? 'Open fullscreen map' : 'Open map'}
        style={{
          position: 'absolute',
          bottom: 'var(--mem-camera-bottom)',
          right: 'var(--mem-camera-right)',
          width: 'var(--mem-camera-thumb)',
          height: 'var(--mem-camera-thumb)',
          padding: 0,
          margin: 0,
          border: '3px solid rgba(201, 162, 39, 0.65)',
          borderRadius: 10,
          boxShadow:
            'inset 0 0 14px rgba(0,0,0,0.45), 0 4px 18px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)',
          background: '#1a1714',
          overflow: 'hidden',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 5,
        }}
      >
        {MAPBOX_TOKEN && mapCoords ? (
          <img
            src={staticMapUrl(mapCoords.lng, mapCoords.lat, 13, 200, 200)}
            alt=""
            width={104}
            height={104}
            style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
            draggable={false}
          />
        ) : (
          <span style={{ color: 'rgba(232, 197, 71, 0.75)', fontSize: '0.75rem', fontWeight: 600 }}>Map</span>
        )}
      </button>
    </div>
  )
}
