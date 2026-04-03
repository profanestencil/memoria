import { useNavigate, useLocation } from 'react-router-dom'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useEffect, useState } from 'react'
import { isStorageConfigured } from '@/lib/storage'
import { publishMemoryNft } from '@/lib/publishMemoryNft'
import { mintMemoryRegistry } from '@/lib/mintMemoryRegistry'
import { attachMemoryCoverImage } from '@/lib/indexerAttachImage'
import { buildMapboxStaticPreviewUrl } from '@/lib/mapboxStatic'
import { getMapboxClientTokenState } from '@/lib/mapboxClientToken'
import { connectRainbowWallet, isPrivyEmbeddedWallet, pickEthereumSigningWallet } from '@/lib/privyWallet'
import { WalletProfileButton } from '@/components/WalletProfileButton'

const memoryRegistryConfigured = Boolean(import.meta.env.VITE_MEMORY_REGISTRY_CONTRACT_ADDRESS)

type LocationState = { imageBlob?: Blob; imageUrl?: string }

export function Preview() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state ?? {}) as LocationState
  const { ready, authenticated, login, user, connectWallet, sendTransaction } = usePrivy()
  const { wallets, ready: walletsReady } = useWallets()
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [previewCoords, setPreviewCoords] = useState<{ lat: number; lng: number } | null>(null)

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

  useEffect(() => {
    if (!imageUrl || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (p) => setPreviewCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setPreviewCoords(null),
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 12_000 }
    )
  }, [imageUrl])

  const mapboxState = getMapboxClientTokenState()
  const staticMapUrl =
    previewCoords && mapboxState.ok
      ? buildMapboxStaticPreviewUrl(mapboxState.token, previewCoords.lat, previewCoords.lng)
      : null

  const handlePublish = async () => {
    if (!authenticated) {
      login()
      return
    }
    if (!walletsReady) {
      setError('Wallet is still loading. Wait a moment and tap Publish again.')
      return
    }
    if (!signingWallet?.address || !signingWallet.getEthereumProvider) {
      connectRainbowWallet(connectWallet)
      return
    }
    setError(null)
    setPublishing(true)
    try {
      const blob = imageBlob!
      const author = user?.id ?? signingWallet.address
      const walletAddress = signingWallet.address as `0x${string}`
      const sponsorFromEnv = import.meta.env.VITE_PRIVY_GAS_SPONSORSHIP !== 'false'
      const usePrivySponsor = sponsorFromEnv && isPrivyEmbeddedWallet(signingWallet)
      const evmSigner = usePrivySponsor
        ? {
            type: 'privy' as const,
            sendTransaction,
            sponsor: true,
          }
        : {
            type: 'eip1193' as const,
            getEthereumProvider: () => signingWallet.getEthereumProvider!(),
          }
      const published = await publishMemoryNft({
        imageBlob: blob,
        title,
        note,
        authorLabel: author,
        walletAddress,
        evmSigner,
      })
      if (memoryRegistryConfigured) {
        const reg = await mintMemoryRegistry(evmSigner, walletAddress, {
          title: published.title,
          note: published.note,
          latitudeE7: published.latitudeE7,
          longitudeE7: published.longitudeE7,
          isPublic: true,
        })
        if (reg.memoryId != null) {
          try {
            await attachMemoryCoverImage({
              memoryId: reg.memoryId.toString(),
              creator: walletAddress,
              imageUrl: published.coverImageUrl,
            })
          } catch {
            /* Pin still appears; thumbnail may fill in after indexer sync */
          }
        }
      }
      navigate('/map', { state: { mapRefreshEpoch: Date.now() } })
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
    <div className="mem-preview-page">
      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10 }}>
        <WalletProfileButton />
      </div>
      {!storageReady && (
        <div className="mem-banner" role="alert">
          <strong>IPFS storage not configured.</strong> Set{' '}
          <code>VITE_PINATA_JWT</code> (Pinata API key JWT) or <code>VITE_PINATA_API_KEY</code> +{' '}
          <code>VITE_PINATA_SECRET</code> (<a href="https://pinata.cloud">Pinata</a>
          ) at <strong>build time</strong>, or <code>VITE_NFT_STORAGE_API_KEY</code> as a fallback. For
          Vercel: Environment Variables → Redeploy with cache cleared. Locally: <code>.env</code> then
          restart dev.
        </div>
      )}
      <div className="mem-preview-visual">
        {staticMapUrl ? (
          <img src={staticMapUrl} alt="" className="mem-preview-map-thumb" decoding="async" />
        ) : (
          <div
            className="mem-preview-map-thumb mem-preview-map-thumb--placeholder"
            role="img"
            aria-label="Map preview loads when location is available"
          />
        )}
        <div className="mem-preview-photo-card">
          <img src={imageUrl} alt="Captured memory preview" className="mem-preview-photo" decoding="async" />
        </div>
      </div>
      <div
        style={{
          padding: 18,
          background: 'rgba(12, 10, 8, 0.95)',
          borderTop: '1px solid var(--mem-border)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      >
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
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
          <div>
            <label className="mem-label" style={{ display: 'block', marginBottom: 8 }}>
              Note
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="A short note (optional)"
              maxLength={240}
              rows={3}
              className="mem-textarea"
              style={{ width: '100%' }}
              disabled={publishing}
            />
          </div>
        </div>
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
          disabled={!ready || publishing || !storageReady || (authenticated && !walletsReady)}
          className="mem-btn mem-btn--primary"
          style={{ flex: '2 1 180px' }}
        >
          {!storageReady
            ? 'Set storage keys'
            : !authenticated
              ? 'Sign in to publish'
              : !walletsReady
                ? 'Preparing wallet…'
                : publishing
                  ? 'Publishing…'
                  : !signingWallet?.getEthereumProvider
                    ? 'Connect wallet to publish'
                    : 'Publish'}
        </button>
      </div>
    </div>
  )
}

