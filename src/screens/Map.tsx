import { useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useWallets } from '@privy-io/react-auth'
import { usePublicClient } from 'wagmi'
import { fetchMemoriesForAddress, type MemoryMeta } from '@/lib/memories'

const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN

export function Map() {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [memories, setMemories] = useState<MemoryMeta[]>([])
  const publicClient = usePublicClient()
  const { wallets } = useWallets()
  const embeddedWallet = wallets?.find((w) => w.walletClientType === 'privy')

  useEffect(() => {
    if (!token) {
      setError('Set VITE_MAPBOX_ACCESS_TOKEN')
      return
    }
    if (!containerRef.current) return
    mapboxgl.accessToken = token
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      // Will be updated to user location if available.
      center: [-98, 39],
      zoom: 3,
    })
    mapRef.current = map

    // Show user location + zoom into local area.
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const lng = p.coords.longitude
          const lat = p.coords.latitude
          map.easeTo({ center: [lng, lat], zoom: 14, duration: 900 })

          const el = document.createElement('div')
          el.style.width = '14px'
          el.style.height = '14px'
          el.style.borderRadius = '50%'
          el.style.background = '#22c55e'
          el.style.boxShadow = '0 0 0 6px rgba(34,197,94,0.18)'
          el.style.border = '2px solid rgba(255,255,255,0.9)'
          userMarkerRef.current?.remove()
          userMarkerRef.current = new mapboxgl.Marker({ element: el })
            .setLngLat([lng, lat])
            .addTo(map)
        },
        () => {
          // Permission denied or unavailable; keep default view.
        },
        { enableHighAccuracy: true, timeout: 8000 }
      )
    }

    return () => {
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      userMarkerRef.current?.remove()
      userMarkerRef.current = null
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!publicClient || !embeddedWallet?.address || !mapRef.current) return
    fetchMemoriesForAddress(publicClient, embeddedWallet.address as `0x${string}`)
      .then(setMemories)
      .catch(() => setMemories([]))
  }, [publicClient, embeddedWallet?.address])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !memories.length) return
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []
    for (const mem of memories) {
      const el = document.createElement('div')
      el.className = 'memory-marker'
      el.style.width = '32px'
      el.style.height = '32px'
      el.style.borderRadius = '50%'
      el.style.background = '#3b82f6'
      el.style.border = '2px solid white'
      el.style.cursor = 'pointer'
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([mem.longitude, mem.latitude])
        .addTo(map)
      el.addEventListener('click', () => {
        navigate(`/ar/${mem.tokenId}`, {
          state: { imageUrl: mem.image, latitude: mem.latitude, longitude: mem.longitude },
        })
      })
      markersRef.current.push(marker)
    }
  }, [memories, navigate])

  if (error) {
    return (
      <div style={{ padding: 24, color: '#f87171' }}>
        {error}
        <button type="button" onClick={() => navigate('/camera')}>Back to camera</button>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <a
        href="/camera"
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          padding: '8px 16px',
          background: 'rgba(0,0,0,0.6)',
          color: 'white',
          borderRadius: 8,
          textDecoration: 'none',
        }}
      >
        Camera
      </a>
    </div>
  )
}
