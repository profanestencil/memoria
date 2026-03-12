import { useNavigate, useLocation } from 'react-router-dom'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useState } from 'react'
import { readExif } from '@/lib/exif'
import { watermarkImage } from '@/lib/watermark'
import {
  uploadImage,
  uploadMetadata,
  ipfsToHttp,
  isNftStorageConfigured,
  type MemoryMetadata,
} from '@/lib/storage'
import { mintMemory } from '@/lib/mint'
import { getCurrentPosition } from '@/lib/geo'

type LocationState = { imageBlob?: Blob; imageUrl?: string }

export function Preview() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state ?? {}) as LocationState
  const { ready, authenticated, login, user } = usePrivy()
  const { wallets } = useWallets()
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const imageUrl = state.imageUrl
  const imageBlob = state.imageBlob
  const embeddedWallet = wallets?.find((w) => w.walletClientType === 'privy')

  if (!imageUrl || !imageBlob) {
    return (
      <div style={{ padding: 24 }}>
        No photo. <button onClick={() => navigate('/camera')}>Take one</button>
      </div>
    )
  }

  async function handlePublish() {
    if (!authenticated) {
      login()
      return
    }
    if (!embeddedWallet?.address || !embeddedWallet.getEthereumProvider) {
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
      const author = user?.id ?? embeddedWallet.address
      const metadata: MemoryMetadata = {
        name: `Memory ${captureTime.slice(0, 10)}`,
        description: 'A memory minted on Memoria',
        image: ipfsToHttp(imageUri),
        attributes: [
          { trait_type: 'latitude', value: coords.latitude },
          { trait_type: 'longitude', value: coords.longitude },
          { trait_type: 'captureTime', value: captureTime },
          { trait_type: 'author', value: author },
          ...(exif.device ? [{ trait_type: 'device', value: exif.device }] : []),
        ],
      }
      const metadataUri = await uploadMetadata(metadata)
      await mintMemory(
        () => embeddedWallet.getEthereumProvider!(),
        embeddedWallet.address as `0x${string}`,
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

  const storageReady = isNftStorageConfigured()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {!storageReady && (
        <div
          style={{
            padding: 16,
            background: '#3f1f1f',
            color: '#fca5a5',
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          <strong>NFT.Storage API key missing.</strong> Publish needs{' '}
          <code style={{ color: '#e5e5e5' }}>VITE_NFT_STORAGE_API_KEY</code> at{' '}
          <strong>build time</strong>. Add it in Vercel → Settings → Environment Variables (get a key at{' '}
          <a href="https://nft.storage" style={{ color: '#93c5fd' }}>
            nft.storage
          </a>
          ), then <strong>Redeploy</strong> with cache cleared. Locally, add it to <code style={{ color: '#e5e5e5' }}>.env</code> and restart dev.
        </div>
      )}
      <img
        src={imageUrl}
        alt="Preview"
        style={{ width: '100%', flex: 1, objectFit: 'contain', background: '#111' }}
      />
      {error && <p style={{ padding: 12, margin: 0, color: '#f87171', fontSize: 14 }}>{error}</p>}
      <div style={{ padding: 24, display: 'flex', gap: 12 }}>
        <button
          type="button"
          onClick={() => navigate('/camera')}
          style={btnStyle}
          disabled={publishing}
        >
          Retake
        </button>
        <button
          type="button"
          onClick={handlePublish}
          disabled={!ready || publishing || !storageReady}
          style={{ ...btnStyle, background: '#3b82f6', color: 'white' }}
        >
          {!storageReady
            ? 'Set VITE_NFT_STORAGE_API_KEY'
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

const btnStyle: React.CSSProperties = {
  flex: 1,
  padding: 14,
  borderRadius: 12,
  border: '1px solid #333',
  background: '#1a1a1a',
  color: '#e5e5e5',
}
