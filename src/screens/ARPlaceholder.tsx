import { useNavigate } from 'react-router-dom'

export function ARPlaceholder() {
  const navigate = useNavigate()
  return (
    <div className="mem-ar-placeholder">
      <p className="mem-label" style={{ margin: '0 0 8px' }}>
        Coming soon
      </p>
      <h1 className="mem-title-xl mem-display" style={{ marginBottom: 12 }}>
        AR view
      </h1>
      <p className="mem-subtitle" style={{ textAlign: 'left', marginBottom: 28 }}>
        Geo-anchored WebXR is planned here: your memory as a plane in the world, lined up with GPS
        and compass toward the capture coordinates.
      </p>
      <button type="button" className="mem-btn mem-btn--secondary" onClick={() => navigate('/')} style={{ alignSelf: 'flex-start' }}>
        Back home
      </button>
    </div>
  )
}
