import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { targetOffsetInLocalMeters } from '@/lib/geoAr'

type LocationState = { imageUrl?: string; latitude?: number; longitude?: number }

export function AR() {
  const navigate = useNavigate()
  const { tokenId } = useParams<{ tokenId: string }>()
  const location = useLocation()
  const state = (location.state ?? {}) as LocationState
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [userPose, setUserPose] = useState<{
    latitude: number
    longitude: number
    headingDeg: number
  } | null>(null)
  const [arActive, setArActive] = useState(false)

  const imageUrl = state.imageUrl
  const targetLat = state.latitude
  const targetLng = state.longitude

  useEffect(() => {
    if (!imageUrl || targetLat == null || targetLng == null) return
    let cancelled = false
    const watchId = navigator.geolocation.watchPosition(
      (p) => {
        if (cancelled) return
        setUserPose((prev) => ({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          headingDeg: prev?.headingDeg ?? 0,
        }))
      },
      (err) => {
        if (cancelled) return
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission is required for AR. Enable location and try again.'
            : 'Unable to get your location for AR. Check GPS and try again.'
        )
      },
      { enableHighAccuracy: true }
    )
    let heading = 0
    const onOrientation = (e: DeviceOrientationEvent) => {
      if (e.alpha != null) heading = e.alpha
      setUserPose((prev) => (prev ? { ...prev, headingDeg: heading } : null))
    }
    if (typeof DeviceOrientationEvent !== 'undefined' && (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission) {
      (DeviceOrientationEvent as unknown as { requestPermission: () => Promise<string> })
        .requestPermission()
        .then(() => window.addEventListener('deviceorientation', onOrientation))
        .catch(() => setUserPose((p) => (p ? { ...p, headingDeg: 0 } : null)))
    } else {
      window.addEventListener('deviceorientation', onOrientation)
    }
    return () => {
      cancelled = true
      navigator.geolocation.clearWatch(watchId)
      window.removeEventListener('deviceorientation', onOrientation)
    }
  }, [imageUrl, targetLat, targetLng])

  useEffect(() => {
    if (!canvasRef.current || !imageUrl || targetLat == null || targetLng == null || !userPose) return
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 1000)
    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, alpha: true, antialias: true })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.xr.enabled = true

    const textureLoader = new THREE.TextureLoader()
    const texture = textureLoader.load(imageUrl, undefined, undefined, () => setError('Failed to load image'))
    const aspect = 1
    const planeHeight = 1.5
    const planeWidth = planeHeight * aspect
    const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight)
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
      transparent: true,
    })
    const plane = new THREE.Mesh(geometry, material)
    scene.add(plane)

    const { x, z } = targetOffsetInLocalMeters(userPose, { latitude: targetLat, longitude: targetLng })
    plane.position.set(x, 0, z)
    plane.lookAt(0, 0, 0)

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('resize', onResize)

    let frameId: number
    const animate = () => {
      frameId = requestAnimationFrame(animate)
      renderer.render(scene, camera)
    }
    animate()

    const gl = renderer.getContext()
    const enterAR = async () => {
      if (!gl) return
      const xr = (navigator as unknown as { xr?: { requestSession: (mode: string, options?: unknown) => Promise<XRSession> } }).xr
      const session = await xr?.requestSession?.('immersive-ar', { optionalFeatures: ['local-floor'] })
      if (!session) {
        setError('WebXR AR not supported')
        return
      }
      await renderer.xr.setSession(session as unknown as XRSession)
      setArActive(true)
    }
    ;(window as unknown as { enterAR?: () => void }).enterAR = enterAR as () => void

    return () => {
      window.removeEventListener('resize', onResize)
      cancelAnimationFrame(frameId)
      texture.dispose()
      geometry.dispose()
      material.dispose()
      renderer.dispose()
    }
  }, [imageUrl, targetLat, targetLng, userPose])

  if (!imageUrl || targetLat == null || targetLng == null) {
    return (
      <div style={{ padding: 24 }}>
        <p>No memory data. Open from the map.</p>
        {tokenId && <p>Route token: {tokenId}</p>}
        <button type="button" onClick={() => navigate('/map')}>Back to map</button>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      {error && (
        <p style={{ position: 'absolute', top: 16, left: 16, right: 16, color: '#f87171', margin: 0 }}>
          {error}
        </p>
      )}
      <div
        style={{
          position: 'absolute',
          bottom: 32,
          left: 16,
          right: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {!arActive && (
          <button
            type="button"
            onClick={() => (window as unknown as { enterAR?: () => void }).enterAR?.()}
            style={{
              padding: 16,
              borderRadius: 12,
              border: 'none',
              background: '#3b82f6',
              color: 'white',
              fontSize: 16,
            }}
          >
            Enter AR
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate('/map')}
          style={{
            padding: 12,
            borderRadius: 12,
            border: '1px solid #444',
            background: 'rgba(0,0,0,0.6)',
            color: 'white',
          }}
        >
          Back to map
        </button>
      </div>
    </div>
  )
}
