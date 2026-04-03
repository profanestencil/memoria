import { useNavigate, useSearchParams } from 'react-router-dom'
import { useRef, useEffect, useState } from 'react'
import { getCurrentPosition } from '@/lib/geo'
import { MemoriesMapCanvas } from '@/components/MemoriesMapCanvas'
import { WalletProfileButton } from '@/components/WalletProfileButton'
import { getMapboxClientTokenState } from '@/lib/mapboxClientToken'

const mapboxState = getMapboxClientTokenState()
const MAPBOX_TOKEN = mapboxState.ok ? mapboxState.token : ''

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
    let stream: MediaStream | null = null
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        stream = s
        streamRef.current = s
        if (videoRef.current) {
          videoRef.current.srcObject = s
          setReady(true)
        }
      })
      .catch(() => setError('Camera access failed'))
    return () => {
      stream?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    getCurrentPosition()
      .then((c) => setMapCoords({ lng: c.longitude, lat: c.latitude }))
      .catch(() => {})
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
    ctx.drawImage(video, 0, 0)
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
        navigate('/preview', { state: { imageBlob: blob, imageUrl: url } })
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

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#000' }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          filter: selectedFilter.filter || 'none',
        }}
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

      <div
        className="camera-filter-strip"
        style={{
          position: 'absolute',
          bottom: 132,
          left: 12,
          right: 120,
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
          bottom: 48,
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
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          color: 'white',
          zIndex: 5,
        }}
      >
        <WalletProfileButton />
        <span className="mem-brand" style={{ fontSize: '1.15rem', textShadow: '0 2px 12px rgba(0,0,0,0.5)' }}>
          Memoria
        </span>
      </div>

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
          bottom: 48,
          right: 16,
          width: 100,
          height: 100,
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
            width={100}
            height={100}
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
