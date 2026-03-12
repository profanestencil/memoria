import { useNavigate } from 'react-router-dom'
import { useState } from 'react'

export function Permissions() {
  const navigate = useNavigate()
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
      <h1 style={styles.title}>Memoria</h1>
      <p style={styles.subtitle}>Allow location and camera to capture memories.</p>
      {locationOk === false && <p style={styles.error}>Location was denied.</p>}
      {cameraOk === false && <p style={styles.error}>Camera was denied.</p>}
      <button style={styles.button} onClick={requestPermissions} disabled={requesting}>
        {requesting ? 'Checking…' : 'Allow & continue'}
      </button>
      <button style={styles.secondaryButton} onClick={() => navigate('/map')}>
        Skip to map
      </button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    textAlign: 'center',
  },
  title: { fontSize: '1.75rem', margin: '0 0 8px' },
  subtitle: { color: '#a3a3a3', margin: '0 0 24px' },
  error: { color: '#f87171', marginBottom: 8 },
  button: {
    padding: '14px 28px',
    borderRadius: 12,
    border: 'none',
    background: '#3b82f6',
    color: 'white',
    fontSize: '1rem',
  },
  secondaryButton: {
    marginTop: 12,
    padding: '10px 20px',
    borderRadius: 999,
    border: '1px solid #e5e5e5',
    background: 'white',
    color: '#4b5563',
    fontSize: '0.9rem',
  },
}
