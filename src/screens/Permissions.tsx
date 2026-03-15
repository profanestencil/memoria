import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'

export function Permissions() {
  const navigate = useNavigate()
  const { ready, authenticated, login } = usePrivy()
  const [locationOk, setLocationOk] = useState<boolean | null>(null)
  const [cameraOk, setCameraOk] = useState<boolean | null>(null)
  const [requesting, setRequesting] = useState(false)

  async function requestPermissions() {
    setRequesting(true)
    let locOk = false
    let camOk = false
    try {
      await new Promise<void>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(() => resolve(), reject, { enableHighAccuracy: true })
      })
      locOk = true
      setLocationOk(true)
    } catch {
      setLocationOk(false)
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      stream.getTracks().forEach((t) => t.stop())
      camOk = true
      setCameraOk(true)
    } catch {
      setCameraOk(false)
    }
    setRequesting(false)
    if (locOk && camOk) navigate('/camera')
  }

  return (
    <div style={styles.page}>
      <button
        type="button"
        onClick={() => navigate('/profile')}
        aria-label="Profile"
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
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
      <h1 style={styles.title}>Memoria</h1>
      <p style={styles.subtitle}>Capture a photo, mint it, pin it on the map.</p>
      {locationOk === false && <p style={styles.error}>Location was denied.</p>}
      {cameraOk === false && <p style={styles.error}>Camera was denied.</p>}
      <div style={styles.actions}>
        <button style={styles.button} onClick={requestPermissions} disabled={requesting}>
        {requesting ? 'Checking…' : 'Allow & continue'}
        </button>
        <button style={styles.secondaryButton} onClick={() => navigate('/map')}>
          Explore
        </button>
        {!authenticated && (
          <button style={styles.ghostButton} onClick={() => login()} disabled={!ready}>
            {ready ? 'Log in / create account' : 'Loading…'}
          </button>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    minHeight: '100vh',
    position: 'relative',
    textAlign: 'center',
    paddingTop: 64,
    boxSizing: 'border-box',
  },
  title: { fontSize: '1.75rem', margin: '0 0 8px' },
  subtitle: { color: '#a3a3a3', margin: '0 0 24px' },
  error: { color: '#f87171', marginBottom: 8 },
  actions: {
    width: '100%',
    maxWidth: 420,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    marginTop: 8,
  },
  button: {
    padding: '14px 28px',
    borderRadius: 12,
    border: 'none',
    background: '#3b82f6',
    color: 'white',
    fontSize: '1rem',
    width: '100%',
  },
  secondaryButton: {
    padding: '12px 20px',
    borderRadius: 12,
    border: '1px solid #2a2a2a',
    background: '#111',
    color: '#e5e5e5',
    fontSize: '0.95rem',
    width: '100%',
  },
  ghostButton: {
    padding: '12px 20px',
    borderRadius: 12,
    border: '1px dashed #333',
    background: 'transparent',
    color: '#a3a3a3',
    fontSize: '0.95rem',
    width: '100%',
  },
}
