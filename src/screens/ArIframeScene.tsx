import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { distanceMeters } from '@/lib/geoAr'

type Props = {
  iframeUrl: string
  latitude: number
  longitude: number
  geoRadiusM?: number
  sceneName?: string
}

export const ArIframeScene = ({ iframeUrl, latitude, longitude, geoRadiusM = 50, sceneName }: Props) => {
  const navigate = useNavigate()
  const [dist, setDist] = useState<number | null>(null)
  const [allowed, setAllowed] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError('Location not supported')
      return
    }
    const watchId = navigator.geolocation.watchPosition(
      (p) => {
        const d = distanceMeters(p.coords.latitude, p.coords.longitude, latitude, longitude)
        setDist(d)
        setAllowed(d <= geoRadiusM)
        setGeoError(null)
      },
      (e) => {
        if (e.code === e.PERMISSION_DENIED) setGeoError('Enable location to unlock this scene.')
        else setGeoError('Could not read location.')
      },
      { enableHighAccuracy: true, maximumAge: 2000 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [latitude, longitude, geoRadiusM])

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#080706', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, flexShrink: 0 }}>
        <button
          type="button"
          className="mem-btn mem-btn--ghost"
          onClick={() => navigate('/map')}
          aria-label="Back to map"
          style={{ background: 'rgba(10, 9, 8, 0.88)' }}
        >
          Back to map
        </button>
        {dist != null ? (
          <span style={{ color: 'rgba(255,248,235,0.75)', fontSize: 13 }}>
            {Math.round(dist)}m · {allowed ? 'unlocked' : `within ${geoRadiusM}m`}
          </span>
        ) : null}
      </div>
      {geoError ? (
        <p style={{ padding: 16, color: 'var(--mem-danger)', margin: 0 }}>{geoError}</p>
      ) : null}
      {!allowed && !geoError ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            color: '#f5f0e8',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          <p style={{ margin: 0, maxWidth: 360 }}>
            Move closer to unlock this scene.
            {dist != null ? ` You are about ${Math.round(dist)}m away (limit ${geoRadiusM}m).` : null}
          </p>
        </div>
      ) : null}
      {allowed ? (
        <iframe
          title={sceneName ?? 'AR scene'}
          src={iframeUrl}
          style={{ flex: 1, minHeight: 0, width: '100%', border: 0 }}
          allow="xr-spatial-tracking; camera; microphone; fullscreen"
          referrerPolicy="no-referrer-when-downgrade"
        />
      ) : null}
    </div>
  )
}
