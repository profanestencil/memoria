import { useNavigate } from 'react-router-dom'
import { useRef, useEffect, useState } from 'react'
import { getCurrentPosition } from '@/lib/geo'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN

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

/** Mapbox Static Images API URL for a small map centered on lng,lat. */
function staticMapUrl(lng: number, lat: number, zoom: number, width: number, height: number): string {
  if (!MAPBOX_TOKEN) return ''
  const base = 'https://api.mapbox.com/styles/v1/mapbox/dark-v11/static'
  const pos = `${lng.toFixed(5)},${lat.toFixed(5)},${zoom},0,0`
  return `${base}/${pos}/${width}x${height}@2x?access_token=${MAPBOX_TOKEN}`
}

export function Camera() {
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const lastObjectUrlRef = useRef<string | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mapCoords, setMapCoords] = useState<{ lng: number; lat: number } | null>(null)
  const [selectedFilterId, setSelectedFilterId] = useState<string>('normal')

  // Revoke any object URL we created if Camera unmounts before navigation completes.
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
      <div style={{ padding: 24, color: '#f87171' }}>
        {error}
        <button type="button" onClick={() => navigate('/')} style={{ marginTop: 16 }}>
          Back
        </button>
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
      {/* Filter strip */}
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
              style={{
                flexShrink: 0,
                padding: '8px 14px',
                borderRadius: 999,
                border: selected ? '2px solid white' : '1px solid rgba(255,255,255,0.5)',
                background: selected ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.4)',
                color: 'white',
                fontSize: 13,
                cursor: 'pointer',
              }}
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
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            border: '4px solid white',
            background: 'rgba(255,255,255,0.3)',
          }}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: 'white',
        }}
      >
        <button
          type="button"
          onClick={() => navigate('/profile')}
          aria-label="Profile"
          style={{
            width: 32,
            height: 32,
            borderRadius: '999px',
            border: '1px solid rgba(148,163,184,0.9)',
            background: 'rgba(15,23,42,0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: 14,
            color: '#e5e5e5',
          }}
        >
          ☾
        </button>
        <span style={{ fontSize: '1.25rem' }}>Memoria</span>
      </div>

      {/* Map thumbnail: tap to switch to map view (old RPG style). */}
      <button
        type="button"
        onClick={() => navigate('/map')}
        aria-label="Open map"
        style={{
          position: 'absolute',
          bottom: 48,
          right: 16,
          width: 100,
          height: 100,
          padding: 0,
          margin: 0,
          border: '3px solid rgba(180,160,120,0.95)',
          borderRadius: 8,
          boxShadow: 'inset 0 0 12px rgba(0,0,0,0.4), 4px 4px 12px rgba(0,0,0,0.5)',
          background: '#2a2520',
          overflow: 'hidden',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
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
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem' }}>Map</span>
        )}
      </button>
    </div>
  )
}
