import { useMemo, useState, useEffect, useRef, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { WalletProfileButton } from '@/components/WalletProfileButton'
import { pickEthereumSigningWallet } from '@/lib/privyWallet'
import { mintMemoryRegistry } from '@/lib/mintMemoryRegistry'
import { publishMemoryNft } from '@/lib/publishMemoryNft'
import { isStorageConfigured } from '@/lib/storage'

type Visibility = 'public' | 'private'

const memoryRegistryConfigured = Boolean(import.meta.env.VITE_MEMORY_REGISTRY_CONTRACT_ADDRESS)
const archiveConfigured = Boolean(import.meta.env.VITE_MEMORY_ARCHIVE_CONTRACT_ADDRESS)

export function RememberNew() {
  const navigate = useNavigate()
  const { authenticated, login, user } = usePrivy()
  const { wallets } = useWallets()
  const signingWallet = pickEthereumSigningWallet(wallets)
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('public')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const hasPhoto = Boolean(photoFile)

  useEffect(() => {
    return () => {
      if (photoPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(photoPreviewUrl)
    }
  }, [photoPreviewUrl])

  const handlePhotoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (photoPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(photoPreviewUrl)
    setPhotoFile(f)
    setPhotoPreviewUrl(URL.createObjectURL(f))
  }

  const handleClearPhoto = () => {
    if (photoPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(photoPreviewUrl)
    setPhotoFile(null)
    setPhotoPreviewUrl(null)
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  const handlePickPhotoClick = () => {
    photoInputRef.current?.click()
  }

  const storageReady = isStorageConfigured()

  const canSubmit = useMemo(() => {
    if (!title.trim()) return false
    if (hasPhoto) return archiveConfigured && storageReady
    return memoryRegistryConfigured
  }, [title, hasPhoto, archiveConfigured, storageReady])

  const needsRegistryBanner = !hasPhoto && !memoryRegistryConfigured
  const photoNeedsArchive = hasPhoto && !archiveConfigured
  const photoNeedsStorage = hasPhoto && !storageReady

  return (
    <div className="mem-page">
      <header className="mem-header--grid">
        <div className="mem-header-start">
          <WalletProfileButton />
          <button type="button" onClick={() => navigate('/')} className="mem-btn mem-btn--ghost">
            Back
          </button>
        </div>
        <div className="mem-header-title mem-display">New memory</div>
        <div className="mem-header-end">
          <button type="button" onClick={() => navigate('/camera')} className="mem-btn mem-btn--ghost">
            Camera
          </button>
          <button type="button" onClick={() => navigate('/map')} className="mem-btn mem-btn--ghost">
            Map
          </button>
        </div>
      </header>

      <main className="mem-main-form">
        {needsRegistryBanner ? (
          <div className="mem-banner" role="status">
            <strong>Text-only memory needs the registry.</strong> Set{' '}
            <code>VITE_MEMORY_REGISTRY_CONTRACT_ADDRESS</code> after deploying{' '}
            <code>MemoryRegistry</code>, then redeploy. Or add a photo below to mint an NFT (
            <code>MemoryArchiveGeo</code>) without the registry.
          </div>
        ) : null}

        {photoNeedsStorage ? (
          <div className="mem-banner" role="alert">
            <strong>IPFS not configured.</strong> Set <code>VITE_PINATA_API_KEY</code> and{' '}
            <code>VITE_PINATA_SECRET</code>, then redeploy, to publish a photo on-chain.
          </div>
        ) : null}

        {photoNeedsArchive ? (
          <div className="mem-banner" role="alert">
            <strong>NFT contract not configured.</strong> Set{' '}
            <code>VITE_MEMORY_ARCHIVE_CONTRACT_ADDRESS</code> to your deployed{' '}
            <code>MemoryArchiveGeo</code> address, then redeploy.
          </div>
        ) : null}

        <label className="mem-field">
          <span className="mem-label">Name</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Give it a name"
            className="mem-input"
            maxLength={60}
            autoFocus
            aria-required
          />
        </label>

        <label className="mem-field">
          <span className="mem-label">Note</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="A short note (optional)"
            className="mem-textarea"
            maxLength={240}
            rows={5}
          />
        </label>

        <div className="mem-field">
          <span className="mem-label">Photo (optional)</span>
          <p className="mem-help">
            With a photo, this flow uploads to IPFS and mints the same geo NFT as Camera → Publish.
            {memoryRegistryConfigured
              ? ' A map pin is also saved via MemoryRegistry when possible.'
              : ''}
          </p>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoChange}
            aria-label="Choose or capture a photo for this memory"
            style={{ display: 'none' }}
          />
          <div className="mem-toggle-row">
            <button type="button" className="mem-btn mem-btn--secondary" onClick={handlePickPhotoClick}>
              {hasPhoto ? 'Change photo' : 'Add photo'}
            </button>
            {hasPhoto ? (
              <button type="button" className="mem-btn mem-btn--ghost" onClick={handleClearPhoto}>
                Remove photo
              </button>
            ) : null}
            <button type="button" className="mem-btn mem-btn--ghost" onClick={() => navigate('/camera')}>
              Open camera
            </button>
          </div>
          {photoPreviewUrl ? (
            <img
              src={photoPreviewUrl}
              alt="Selected memory photo preview"
              style={{
                marginTop: 12,
                maxHeight: 220,
                width: '100%',
                objectFit: 'contain',
                borderRadius: 8,
                border: '1px solid var(--mem-border)',
              }}
            />
          ) : null}
        </div>

        <div className="mem-field">
          <span className="mem-label">Visibility</span>
          <div className="mem-toggle-row" role="group" aria-label="Memory visibility">
            <button
              type="button"
              onClick={() => setVisibility('public')}
              className={`mem-toggle ${visibility === 'public' ? 'mem-toggle--on' : ''}`}
            >
              Public
            </button>
            <button
              type="button"
              onClick={() => setVisibility('private')}
              className={`mem-toggle ${visibility === 'private' ? 'mem-toggle--on' : ''}`}
            >
              Private
            </button>
          </div>
          <p className="mem-help">
            {visibility === 'public'
              ? 'Public memories appear on the world map (indexer).'
              : 'Private map pins are only shown to the wallet that created them.'}
          </p>
        </div>

        <button
          type="button"
          className="mem-btn mem-btn--primary"
          style={{ marginTop: 4, opacity: canSubmit ? 1 : 0.5 }}
          disabled={!canSubmit || submitting}
          onClick={async () => {
            setError(null)
            if (!authenticated) {
              login()
              return
            }
            if (!signingWallet?.address || !signingWallet.getEthereumProvider) {
              setError('No signing wallet available.')
              return
            }
            if (!navigator.geolocation) {
              setError('Geolocation not available in this browser.')
              return
            }

            setSubmitting(true)
            try {
              if (hasPhoto && photoFile) {
                const author = user?.id ?? signingWallet.address
                const published = await publishMemoryNft({
                  imageBlob: photoFile,
                  title: title.trim(),
                  note: note.trim(),
                  authorLabel: author,
                  getEthereumProvider: () => signingWallet.getEthereumProvider(),
                  walletAddress: signingWallet.address as `0x${string}`,
                })
                if (memoryRegistryConfigured) {
                  await mintMemoryRegistry(
                    () => signingWallet.getEthereumProvider(),
                    signingWallet.address as `0x${string}`,
                    {
                      title: published.title,
                      note: published.note,
                      latitudeE7: published.latitudeE7,
                      longitudeE7: published.longitudeE7,
                      isPublic: visibility === 'public',
                    }
                  )
                }
              } else {
                const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                  navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 12000,
                  })
                })
                const latitudeE7 = Math.round(pos.coords.latitude * 1e7)
                const longitudeE7 = Math.round(pos.coords.longitude * 1e7)

                await mintMemoryRegistry(
                  () => signingWallet.getEthereumProvider(),
                  signingWallet.address as `0x${string}`,
                  {
                    title: title.trim(),
                    note: note.trim(),
                    latitudeE7,
                    longitudeE7,
                    isPublic: visibility === 'public',
                  }
                )
              }

              navigate('/map')
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Mint failed'
              const friendly =
                msg.includes('denied') || msg.includes('timeout')
                  ? 'Location required. Enable location and try again.'
                  : msg
              setError(friendly)
            } finally {
              setSubmitting(false)
            }
          }}
        >
          {submitting ? 'Working…' : hasPhoto ? 'Mint photo memory' : 'Mint memory'}
        </button>

        {error ? <div className="mem-error">{error}</div> : null}
      </main>
    </div>
  )
}
