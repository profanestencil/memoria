import { useNavigate, useLocation } from 'react-router-dom'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useEffect, useState } from 'react'
import { readExif } from '@/lib/exif'
import { watermarkImage } from '@/lib/watermark'
import {
  uploadImage,
  uploadMetadata,
  ipfsToHttp,
  isStorageConfigured,
  type MemoryMetadata,
} from '@/lib/storage'
import { mintMemory } from '@/lib/mint'
import { getCurrentPosition } from '@/lib/geo'
import { pickEthereumSigningWallet } from '@/lib/privyWallet'
import { WalletProfileButton } from '@/components/WalletProfileButton'

type LocationState = { imageBlob?: Blob; imageUrl?: string }

export function Preview() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state ?? {}) as LocationState
  const { ready, authenticated, login, user } = usePrivy()
  const { wallets } = useWallets()
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')

  const imageUrl = state.imageUrl
  const imageBlob = state.imageBlob
  const signingWallet = pickEthereumSigningWallet(wallets)

  if (!imageUrl || !imageBlob) {
    return (
      <div className="mem-page mem-page--center">
        <main className="mem-main">
          <p className="mem-subtitle" style={{ marginBottom: 20 }}>
            No photo in this session.
          </p>
          <button type="button" className="mem-btn mem-btn--primary" onClick={() => navigate('/camera')}>
            Take one
          </button>
        </main>
      </div>
    )
  }

  useEffect(() => {
    return () => {
      if (imageUrl && imageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(imageUrl)
      }
    }
  }, [imageUrl])

  const handlePublish = async () => {
    if (!authenticated) {
      login()
      return
    }
    if (!signingWallet?.address || !signingWallet.getEthereumProvider) {
      setError('Wallet not ready')
      return
    }
    setError(null)
    setPublishing(true)
    try {
      const blob = imageBlob!
      const [coords, exif] = await Promise.all([getCurrentPosition(), readExif(blob)])
      const watermarked = await watermarkImage(blob)
      const imageUri = await uploadImage(watermarked)
      const captureTime = exif.date ?? new Date().toISOString()
      const author = user?.id ?? signingWallet.address
      const name = title.trim() ? title.trim() : `Memory ${captureTime.slice(0, 10)}`
      const metadata: MemoryMetadata = {
        name,
        description: 'A memory minted on Memoria',
        image: ipfsToHttp(imageUri),
        attributes: [
          { trait_type: 'title', value: name },
          { trait_type: 'latitude', value: coords.latitude },
          { trait_type: 'longitude', value: coords.longitude },
          { trait_type: 'captureTime', value: captureTime },
          { trait_type: 'author', value: author },
          ...(exif.device ? [{ trait_type: 'device', value: exif.device }] : []),
        ],
      }
      const metadataUri = await uploadMetadata(metadata)
      await mintMemory(
        () => signingWallet.getEthereumProvider!(),
        signingWallet.address as `0x${string}`,
        metadataUri
      )
      navigate('/map')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Publish failed'
      setError(msg.includes('denied') || msg.includes('timeout') ? 'Location required. Enable location and try again.' : msg)
    } finally {
      setPublishing(false)
    }
  }

  const storageReady = isStorageConfigured()

  const handleSavePhoto = () => {
    if (!imageBlob) return
    const url = URL.createObjectURL(imageBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'memoria-photo.jpg'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100dvh',
        position: 'relative',
        background: 'var(--mem-bg-deep)',
      }}
    >
      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10 }}>
        <WalletProfileButton />
      </div>
      {!storageReady && (
        <div className="mem-banner" role="alert">
          <strong>IPFS storage not configured.</strong> Set{' '}
          <code>VITE_PINATA_API_KEY</code> and <code>VITE_PINATA_SECRET</code> (recommended,{' '}
          <a href="https://pinata.cloud">Pinata</a>
          ) at <strong>build time</strong>, or <code>VITE_NFT_STORAGE_API_KEY</code> as a fallback. For
          Vercel: Environment Variables → Redeploy with cache cleared. Locally: <code>.env</code> then
          restart dev.
        </div>
      )}
      <img
        src={imageUrl}
        alt="Captured memory preview"
        style={{ width: '100%', flex: 1, objectFit: 'contain', background: '#0c0b0a', minHeight: 0 }}
      />
      <div
        style={{
          padding: 18,
          background: 'rgba(12, 10, 8, 0.95)',
          borderTop: '1px solid var(--mem-border)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      >
        <label className="mem-label" style={{ display: 'block', marginBottom: 8 }}>
          Title
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Give this memory a title"
          maxLength={60}
          className="mem-input"
          style={{ width: '100%' }}
          disabled={publishing}
        />
      </div>
      {error ? <p className="mem-error" style={{ padding: '12px 18px', margin: 0, fontSize: 14, background: 'rgba(12,10,8,0.9)' }}>{error}</p> : null}
      <div style={{ padding: '18px 18px max(18px, env(safe-area-inset-bottom))', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={handleSavePhoto} className="mem-btn mem-btn--secondary" style={{ flex: 1, minWidth: 100 }} disabled={publishing}>
          Save photo
        </button>
        <button type="button" onClick={() => navigate('/camera')} className="mem-btn mem-btn--secondary" style={{ flex: 1, minWidth: 100 }} disabled={publishing}>
          Retake
        </button>
        <button
          type="button"
          onClick={handlePublish}
          disabled={!ready || publishing || !storageReady}
          className="mem-btn mem-btn--primary"
          style={{ flex: '2 1 180px' }}
        >
          {!storageReady
            ? 'Set storage keys'
            : !authenticated
              ? 'Sign in to publish'
              : publishing
                ? 'Publishing…'
                : 'Publish'}
        </button>
      </div>
    </div>
  )
}
