import { useNavigate } from 'react-router-dom'

export function CameraPlaceholder() {
  const navigate = useNavigate()
  return (
    <div style={{ padding: 24, maxWidth: 520, margin: '0 auto' }}>
      <h1 style={{ margin: '0 0 8px' }}>Camera</h1>
      <p style={{ color: '#a3a3a3', lineHeight: 1.5, margin: '0 0 18px' }}>
        Camera interface is coming soon. This route is reserved for the future capture flow.
      </p>
      <button
        type="button"
        onClick={() => navigate('/')}
        style={{
          padding: '12px 16px',
          borderRadius: 12,
          border: '1px solid rgba(148,163,184,0.25)',
          background: 'rgba(15,23,42,0.35)',
          color: '#e5e5e5',
          cursor: 'pointer',
        }}
      >
        Back
      </button>
    </div>
  )
}

