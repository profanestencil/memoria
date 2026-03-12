import { useNavigate } from 'react-router-dom'
import { useRef, useEffect, useState } from 'react'

export function Camera() {
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  function capture() {
    if (!videoRef.current || !streamRef.current) return
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
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
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
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
      <div style={{ position: 'absolute', top: 16, left: 16, color: 'white', fontSize: '1.25rem' }}>
        Memoria
      </div>
    </div>
  )
}
