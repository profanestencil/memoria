import { useEffect, useRef } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import type { Map as MapboxMap } from 'mapbox-gl'
import { MemoriesMapCanvas } from '@/components/MemoriesMapCanvas'
import { RuntimeClaimsPanel } from '@/components/RuntimeClaimsPanel'
import { WalletProfileButton } from '@/components/WalletProfileButton'
import { getMapboxClientTokenState } from '@/lib/mapboxClientToken'

const mapboxState = getMapboxClientTokenState()

type MapLocationState = { mapRefreshEpoch?: number }

export function Map() {
  const navigate = useNavigate()
  const { state } = useLocation()
  const mapRefreshEpoch = (state as MapLocationState | null)?.mapRefreshEpoch ?? 0
  const [searchParams] = useSearchParams()
  const mapInstanceRef = useRef<MapboxMap | null>(null)

  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !lat || !lng) return
    const la = Number(lat)
    const lo = Number(lng)
    if (Number.isNaN(la) || Number.isNaN(lo)) return
    map.easeTo({ center: [lo, la], zoom: 15, duration: 900 })
  }, [lat, lng])

  if (!mapboxState.ok) {
    return (
      <div className="mem-page">
        <div className="mem-config-error">
          <h1>Mapbox token</h1>
          <p style={{ margin: 0, color: 'var(--mem-text-muted)', lineHeight: 1.6 }}>
            {mapboxState.message}
          </p>
          <button type="button" className="mem-btn mem-btn--secondary" style={{ marginTop: 24, maxWidth: 200 }} onClick={() => navigate('/')}>
            Home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <MemoriesMapCanvas
        trackUser
        refreshEpoch={mapRefreshEpoch}
        style={{ width: '100%', height: '100%' }}
        onMapReady={(m) => {
          mapInstanceRef.current = m
        }}
      />
      <RuntimeClaimsPanel />
      <div className="mem-map-overlay">
        <WalletProfileButton />
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mem-btn mem-btn--icon"
          aria-label="Go back"
        >
          ←
        </button>
        <button type="button" onClick={() => navigate('/')} className="mem-btn mem-btn--ghost" aria-label="Home">
          Home
        </button>
      </div>
    </div>
  )
}
