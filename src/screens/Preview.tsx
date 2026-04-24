import { useNavigate, useLocation } from 'react-router-dom'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useEffect, useState } from 'react'
import { getCurrentPosition } from '@/lib/geo'
import { isStorageConfigured, ipfsToHttp, uploadMediaBlob } from '@/lib/storage'
import { publishMemoryNft } from '@/lib/publishMemoryNft'
import { mintMemoryRegistry } from '@/lib/mintMemoryRegistry'
import { attachMemoryCoverImage } from '@/lib/indexerAttachImage'
import { buildMapboxStaticPreviewUrl } from '@/lib/mapboxStatic'
import { getMapboxClientTokenState } from '@/lib/mapboxClientToken'
import { connectRainbowWallet, isPrivyEmbeddedWallet, pickEthereumSigningWallet } from '@/lib/privyWallet'
import { WalletProfileButton } from '@/components/WalletProfileButton'
import type { MemoryPin } from '@/lib/memoryPin'
import { loadOptimisticPins, saveOptimisticPins } from '@/lib/optimisticPinsStorage'
import { seedMemoryInIndexer } from '@/lib/indexerSeed'
import { applyCampaignOverlaysToBlob } from '@/lib/campaignOverlay'
import type { ActiveCampaign } from '@/lib/runtimeActive'
import { incrementMintCount } from '@/lib/tipNudge'
import { createWalletClient, custom, type Address } from 'viem'
import { watermarkImage } from '@/lib/watermark'
import { buildDraftMessage, createDraftMemory } from '@/lib/drafts'
import { resolveMediaPlaybackUrl } from '@/lib/memoryMedia'

const memoryRegistryConfigured = Boolean(import.meta.env.VITE_MEMORY_REGISTRY_CONTRACT_ADDRESS)

type LocationState = {
  imageBlob?: Blob
  imageUrl?: string
  audioBlob?: Blob
  audioUrl?: string
  audioFileName?: string
  activeCampaign?: ActiveCampaign | null
}

const indexerBaseUrl = (import.meta.env.VITE_INDEXER_URL ?? 'http://localhost:8787').replace(/\/$/, '')

export function Preview() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state ?? {}) as LocationState
  const { ready, authenticated, login, user, connectWallet, sendTransaction } = usePrivy()
  const { wallets, ready: walletsReady } = useWallets()
  const [publishing, setPublishing] = useState(false)
  const [mintingOverlay, setMintingOverlay] = useState<
    | null
    | {
        title: string
        detail?: string
        txHash?: `0x${string}`
      }
  >(null)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [previewCoords, setPreviewCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [audioLoop, setAudioLoop] = useState(false)

  const imageUrl = state.imageUrl
  const imageBlob = state.imageBlob
  const audioBlob = state.audioBlob
  const audioUrl = state.audioUrl
  const audioFileName = state.audioFileName
  const activeCampaign = state.activeCampaign ?? null
  const signingWallet = pickEthereumSigningWallet(wallets)

  const isPhotoSession = Boolean(imageBlob && imageUrl)
  const isAudioSession = Boolean(audioBlob && audioUrl)
  const hasValidSession = isPhotoSession || isAudioSession

  useEffect(() => {
    return () => {
      if (imageUrl?.startsWith('blob:')) URL.revokeObjectURL(imageUrl)
      if (audioUrl?.startsWith('blob:')) URL.revokeObjectURL(audioUrl)
    }
  }, [imageUrl, audioUrl])

  useEffect(() => {
    if (!hasValidSession || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (p) => setPreviewCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setPreviewCoords(null),
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 12_000 }
    )
  }, [hasValidSession])

  if (!hasValidSession) {
    return (
      <div className="mem-page mem-page--center">
        <main className="mem-main">
          <p className="mem-subtitle" style={{ marginBottom: 20 }}>
            Nothing to preview. Capture a photo or record audio from the camera screen.
          </p>
          <button type="button" className="mem-btn mem-btn--primary" onClick={() => navigate('/camera')}>
            Back to camera
          </button>
        </main>
      </div>
    )
  }

  const mapboxState = getMapboxClientTokenState()
  const staticMapUrl =
    previewCoords && mapboxState.ok
      ? buildMapboxStaticPreviewUrl(mapboxState.token, previewCoords.lat, previewCoords.lng)
      : null

  const storageReady = isStorageConfigured()

  const handleSaveDraft = async () => {
    if (!authenticated) {
      login()
      return
    }
    if (!walletsReady) {
      setError('Wallet is still loading. Wait a moment and try again.')
      return
    }
    if (!signingWallet?.address || !signingWallet.getEthereumProvider) {
      connectRainbowWallet(connectWallet)
      return
    }
    if (!storageReady) {
      setError('Configure Pinata or NFT.Storage to save drafts, then redeploy.')
      return
    }

    setError(null)
    setPublishing(true)
    setMintingOverlay({ title: 'Saving draft…', detail: 'Uploading media and saving your pin.' })

    try {
      const walletAddress = signingWallet.address as `0x${string}`
      const provider = await signingWallet.getEthereumProvider()
      const client = createWalletClient({ transport: custom(provider) })
      const coords = await getCurrentPosition()

      const draftId = crypto.randomUUID()
      const msg = buildDraftMessage(draftId, walletAddress)
      const signature = await client.signMessage({ account: walletAddress as Address, message: msg })

      if (isAudioSession) {
        if (!audioBlob) return
        const fname = (audioFileName && audioFileName.trim()) || 'memory.webm'
        const ipfsUri = await uploadMediaBlob(audioBlob, fname)
        const playUrl = ipfsToHttp(ipfsUri)
        const name = title.trim() || `Voice ${new Date().toISOString().slice(0, 10)}`
        const noteText = note.trim()

        const res = await createDraftMemory({
          draftId,
          creator: walletAddress,
          message: msg,
          signature,
          title: name,
          note: noteText,
          isPublic,
          lat: coords.latitude,
          lng: coords.longitude,
          mediaKind: 'audio',
          audioUrl: playUrl,
          audioLoop,
          ttlMode: 'EndOfDay',
          clientTzOffsetMin: new Date().getTimezoneOffset(),
          ...(activeCampaign?.tag ? { campaignTag: activeCampaign.tag } : {}),
          ...(activeCampaign?.id ? { campaignId: activeCampaign.id } : {}),
          ...(activeCampaign?.pinColor ? { pinColor: activeCampaign.pinColor } : {}),
        })
        if (!res.ok) {
          setError(res.error)
          return
        }
        const draft = res.draft
        const existing = loadOptimisticPins()
        const key = `${draft.creator.toLowerCase()}-${draft.memoryId}`
        const merged = [draft, ...existing.filter((p) => `${p.creator.toLowerCase()}-${p.memoryId}` !== key)]
        saveOptimisticPins(merged)
        navigate(`/map?lat=${encodeURIComponent(String(coords.latitude))}&lng=${encodeURIComponent(String(coords.longitude))}`, {
          state: { mapRefreshEpoch: Date.now() },
        })
        return
      }

      if (!imageBlob) return
      let photoBlob = imageBlob
      if (activeCampaign?.overlays?.length) {
        try {
          photoBlob = await applyCampaignOverlaysToBlob(photoBlob, activeCampaign.overlays)
        } catch {
          /* ignore */
        }
      }
      const watermarked = await watermarkImage(photoBlob)
      const ipfsUri = await uploadMediaBlob(watermarked, 'memory.jpg')
      const coverUrl = ipfsToHttp(ipfsUri)

      const name = title.trim() || `Memory ${new Date().toISOString().slice(0, 10)}`
      const noteText = note.trim()

      const res = await createDraftMemory({
        draftId,
        creator: walletAddress,
        message: msg,
        signature,
        title: name,
        note: noteText,
        isPublic,
        lat: coords.latitude,
        lng: coords.longitude,
        mediaKind: 'image',
        imageUrl: coverUrl,
        ttlMode: 'EndOfDay',
        clientTzOffsetMin: new Date().getTimezoneOffset(),
        ...(activeCampaign?.tag ? { campaignTag: activeCampaign.tag } : {}),
        ...(activeCampaign?.id ? { campaignId: activeCampaign.id } : {}),
        ...(activeCampaign?.pinColor ? { pinColor: activeCampaign.pinColor } : {}),
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      const draft = res.draft
      const existing = loadOptimisticPins()
      const key = `${draft.creator.toLowerCase()}-${draft.memoryId}`
      const merged = [draft, ...existing.filter((p) => `${p.creator.toLowerCase()}-${p.memoryId}` !== key)]
      saveOptimisticPins(merged)
      navigate(`/map?lat=${encodeURIComponent(String(coords.latitude))}&lng=${encodeURIComponent(String(coords.longitude))}`, {
        state: { mapRefreshEpoch: Date.now() },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save draft failed')
    } finally {
      setPublishing(false)
      setMintingOverlay(null)
    }
  }

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
    setMintingOverlay(null)
    try {
      if (isAudioSession) {
        if (!memoryRegistryConfigured) {
          setError(
            'Audio memories use the Memory Registry on-chain. Set VITE_MEMORY_REGISTRY_CONTRACT_ADDRESS and redeploy.'
          )
          return
        }
        if (!storageReady) {
          setError('Configure Pinata or NFT.Storage to upload audio, then redeploy.')
          return
        }
        if (!audioBlob) return
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
        const coords = await getCurrentPosition()
        const fname = (audioFileName && audioFileName.trim()) || 'memory.webm'
        const ipfsUri = await uploadMediaBlob(audioBlob, fname)
        const playUrl = ipfsToHttp(ipfsUri)
        const name = title.trim() || `Voice ${new Date().toISOString().slice(0, 10)}`
        const noteText = note.trim()

        setMintingOverlay({
          title: 'Minting audio memory…',
          detail: 'Waiting for confirmations. Your pin will appear on the map when minting is complete.',
        })
        const reg = await mintMemoryRegistry(
          evmSigner,
          walletAddress,
          {
            title: name,
            note: noteText,
            latitudeE7: Math.round(coords.latitude * 1e7),
            longitudeE7: Math.round(coords.longitude * 1e7),
            isPublic,
          },
          {
            onHash: (txHash) =>
              setMintingOverlay((prev) =>
                prev
                  ? {
                      ...prev,
                      txHash,
                      detail: 'Transaction sent. Waiting for confirmations…',
                    }
                  : {
                      title: 'Minting audio memory…',
                      detail: 'Transaction sent. Waiting for confirmations…',
                      txHash,
                    }
              ),
          }
        )
        if (reg.memoryId != null) {
          incrementMintCount()
          try {
            await seedMemoryInIndexer(reg.memoryId.toString(), indexerBaseUrl)
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'indexer seed failed'
            setMintingOverlay((prev) =>
              prev
                ? {
                    ...prev,
                    detail: `Pin minted, but saving to the shared map index failed (${msg}). Check VITE_INDEXER_URL / redeploy; cron may still pick it up.`,
                  }
                : {
                    title: 'Indexing warning',
                    detail: msg,
                  }
            )
          }

          const optimistic: MemoryPin = {
            memoryId: reg.memoryId.toString(),
            creator: walletAddress,
            timestamp: Math.floor(Date.now() / 1000),
            latitude: coords.latitude,
            longitude: coords.longitude,
            isPublic,
            title: name,
            note: noteText,
            mediaKind: 'audio',
            audioUrl: playUrl,
            audioLoop,
            ...(activeCampaign?.tag ? { campaignTag: activeCampaign.tag } : {}),
            ...(activeCampaign?.id ? { campaignId: activeCampaign.id } : {}),
            ...(activeCampaign?.pinColor ? { pinColor: activeCampaign.pinColor } : {}),
          }
          const existing = loadOptimisticPins()
          const key = `${optimistic.creator.toLowerCase()}-${optimistic.memoryId}`
          const merged = [optimistic, ...existing.filter((p) => `${p.creator.toLowerCase()}-${p.memoryId}` !== key)]
          saveOptimisticPins(merged)

          setMintingOverlay((prev) =>
            prev
              ? { ...prev, title: 'Indexing pin…', detail: 'Attaching audio so listeners can play it from the map.' }
              : { title: 'Indexing pin…', detail: 'Attaching audio so listeners can play it from the map.' }
          )
          try {
            await attachMemoryCoverImage({
              memoryId: reg.memoryId.toString(),
              creator: walletAddress,
              audioUrl: playUrl,
              mediaKind: 'audio',
              audioLoop,
              ...(activeCampaign?.tag ? { campaignTag: activeCampaign.tag } : {}),
              ...(activeCampaign?.id ? { campaignId: activeCampaign.id } : {}),
              ...(activeCampaign?.pinColor ? { pinColor: activeCampaign.pinColor } : {}),
            })
          } catch {
            /* Pin still appears; audio URL may sync after indexer catches up */
          }
        }
        setMintingOverlay((prev) => (prev ? { ...prev, title: 'Done', detail: 'Opening the map…' } : prev))
        const lat = coords.latitude
        const lng = coords.longitude
        const nextUrl = `/map?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`
        navigate(nextUrl, { state: { mapRefreshEpoch: Date.now() } })
        return
      }

      if (!imageBlob || !imageUrl) {
        setError('Missing photo data. Return to the camera and capture again.')
        return
      }

      let blob = imageBlob
      if (activeCampaign?.overlays?.length) {
        try {
          blob = await applyCampaignOverlaysToBlob(blob, activeCampaign.overlays)
        } catch {
          /* use pre-overlay blob */
        }
      }
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
        ...(activeCampaign?.tag ? { campaignTag: activeCampaign.tag } : {}),
        ...(activeCampaign?.id ? { campaignId: activeCampaign.id } : {}),
        ...(activeCampaign?.pinColor ? { pinColor: activeCampaign.pinColor } : {}),
      })
      if (memoryRegistryConfigured) {
        setMintingOverlay({
          title: 'Minting onchain — please be patient…',
          detail: 'Waiting for confirmations. Your pin will appear on the map when minting is complete.',
        })
        const reg = await mintMemoryRegistry(evmSigner, walletAddress, {
          title: published.title,
          note: published.note,
          latitudeE7: published.latitudeE7,
          longitudeE7: published.longitudeE7,
          isPublic,
        }, {
          onHash: (txHash) =>
            setMintingOverlay((prev) =>
              prev
                ? {
                    ...prev,
                    txHash,
                    detail: 'Transaction sent. Waiting for confirmations…',
                  }
                : {
                    title: 'Minting onchain — please be patient…',
                    detail: 'Transaction sent. Waiting for confirmations…',
                    txHash,
                  }
            ),
        })
        if (reg.memoryId != null) {
          incrementMintCount()
          try {
            await seedMemoryInIndexer(reg.memoryId.toString(), indexerBaseUrl)
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'indexer seed failed'
            setMintingOverlay((prev) =>
              prev
                ? {
                    ...prev,
                    detail: `Pin minted, but saving to the shared map index failed (${msg}). Check VITE_INDEXER_URL / redeploy; cron may still pick it up.`,
                  }
                : {
                    title: 'Indexing warning',
                    detail: msg,
                  }
            )
          }

          const optimistic: MemoryPin = {
            memoryId: reg.memoryId.toString(),
            creator: walletAddress,
            timestamp: Math.floor(Date.now() / 1000),
            latitude: published.latitudeE7 / 1e7,
            longitude: published.longitudeE7 / 1e7,
            isPublic,
            title: published.title,
            note: published.note,
            imageUrl: published.coverImageUrl,
            ...(activeCampaign?.tag ? { campaignTag: activeCampaign.tag } : {}),
            ...(activeCampaign?.id ? { campaignId: activeCampaign.id } : {}),
            ...(activeCampaign?.pinColor ? { pinColor: activeCampaign.pinColor } : {}),
          }
          const existing = loadOptimisticPins()
          const key = `${optimistic.creator.toLowerCase()}-${optimistic.memoryId}`
          const merged = [optimistic, ...existing.filter((p) => `${p.creator.toLowerCase()}-${p.memoryId}` !== key)]
          saveOptimisticPins(merged)

          setMintingOverlay((prev) =>
            prev
              ? { ...prev, title: 'Indexing pin…', detail: 'Attaching cover image so the map can show thumbnails.' }
              : { title: 'Indexing pin…', detail: 'Attaching cover image so the map can show thumbnails.' }
          )
          try {
            await attachMemoryCoverImage({
              memoryId: reg.memoryId.toString(),
              creator: walletAddress,
              imageUrl: published.coverImageUrl,
              ...(activeCampaign?.tag ? { campaignTag: activeCampaign.tag } : {}),
              ...(activeCampaign?.id ? { campaignId: activeCampaign.id } : {}),
              ...(activeCampaign?.pinColor ? { pinColor: activeCampaign.pinColor } : {}),
            })
          } catch {
            /* Pin still appears; thumbnail may fill in after indexer sync */
          }
        }
      }
      setMintingOverlay((prev) => (prev ? { ...prev, title: 'Done', detail: 'Opening the map…' } : prev))
      const lat = published.latitudeE7 / 1e7
      const lng = published.longitudeE7 / 1e7
      const nextUrl = `/map?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`
      navigate(nextUrl, { state: { mapRefreshEpoch: Date.now() } })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Publish failed'
      setError(msg.includes('denied') || msg.includes('timeout') ? 'Location required. Enable location and try again.' : msg)
    } finally {
      setPublishing(false)
      setMintingOverlay(null)
    }
  }

  const handleSavePhoto = () => {
    if (isAudioSession && audioBlob) {
      const url = URL.createObjectURL(audioBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = audioFileName?.trim() || 'memoria-audio.webm'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      return
    }
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
      {mintingOverlay ? (
        <div className="mem-mint-overlay" role="status" aria-live="polite" aria-label="Minting in progress">
          <div className="mem-mint-overlay__card">
            <div className="mem-spinner" aria-hidden="true" />
            <div style={{ display: 'grid', gap: 6 }}>
              <div className="mem-mint-overlay__title">{mintingOverlay.title}</div>
              {mintingOverlay.detail ? (
                <div className="mem-mint-overlay__detail">{mintingOverlay.detail}</div>
              ) : null}
              {mintingOverlay.txHash ? (
                <div className="mem-mint-overlay__hash">
                  <span style={{ opacity: 0.8 }}>Tx</span> <code>{mintingOverlay.txHash}</code>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
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
          {isAudioSession && audioUrl ? (
            <div
              style={{
                padding: 20,
                display: 'grid',
                gap: 10,
                justifyItems: 'stretch',
                width: '100%',
                boxSizing: 'border-box',
              }}
            >
              <p style={{ margin: 0, fontSize: 13, color: 'var(--mem-text-muted)' }}>Audio preview</p>
              <audio
                controls
                src={audioUrl.startsWith('blob:') ? audioUrl : resolveMediaPlaybackUrl(audioUrl)}
                loop={audioLoop}
                style={{ width: '100%', height: 40 }}
              />
            </div>
          ) : imageUrl ? (
            <img src={imageUrl} alt="Captured memory preview" className="mem-preview-photo" decoding="async" />
          ) : null}
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
          {isAudioSession ? (
            <div>
              <label className="mem-label" style={{ display: 'block', marginBottom: 8 }}>
                Playback on map
              </label>
              <div className="mem-seg" role="group" aria-label="Audio playback mode">
                <button
                  type="button"
                  className={`mem-seg__btn ${!audioLoop ? 'mem-seg__btn--active' : ''}`}
                  onClick={() => setAudioLoop(false)}
                  disabled={publishing}
                  aria-pressed={!audioLoop}
                >
                  Play once
                </button>
                <button
                  type="button"
                  className={`mem-seg__btn ${audioLoop ? 'mem-seg__btn--active' : ''}`}
                  onClick={() => setAudioLoop(true)}
                  disabled={publishing}
                  aria-pressed={audioLoop}
                >
                  Loop
                </button>
              </div>
              <p className="mem-subtle" style={{ margin: '10px 0 0', lineHeight: 1.5 }}>
                Finders open the pin and use the built-in player. Loop keeps repeating until they pause.
              </p>
            </div>
          ) : null}
          {memoryRegistryConfigured ? (
            <div>
              <label className="mem-label" style={{ display: 'block', marginBottom: 8 }}>
                Visibility
              </label>
              <div className="mem-seg" role="group" aria-label="Memory pin visibility">
                <button
                  type="button"
                  className={`mem-seg__btn ${isPublic ? 'mem-seg__btn--active' : ''}`}
                  onClick={() => setIsPublic(true)}
                  disabled={publishing}
                  aria-pressed={isPublic}
                >
                  Public
                </button>
                <button
                  type="button"
                  className={`mem-seg__btn ${!isPublic ? 'mem-seg__btn--active' : ''}`}
                  onClick={() => setIsPublic(false)}
                  disabled={publishing}
                  aria-pressed={!isPublic}
                >
                  Private
                </button>
              </div>
              <p className="mem-subtle" style={{ margin: '10px 0 0', lineHeight: 1.5 }}>
                {isPublic
                  ? 'Public memories show as pins for everyone.'
                  : 'Private memories only show as pins for your wallet.'}
              </p>
            </div>
          ) : null}
        </div>
      </div>
      {error ? <p className="mem-error" style={{ padding: '12px 18px', margin: 0, fontSize: 14, background: 'rgba(12,10,8,0.9)' }}>{error}</p> : null}
      <div style={{ padding: '18px 18px max(18px, env(safe-area-inset-bottom))', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={handleSavePhoto} className="mem-btn mem-btn--secondary" style={{ flex: 1, minWidth: 100 }} disabled={publishing}>
          {isAudioSession ? 'Save audio file' : 'Save photo'}
        </button>
        <button type="button" onClick={() => navigate('/camera')} className="mem-btn mem-btn--secondary" style={{ flex: 1, minWidth: 100 }} disabled={publishing}>
          Retake
        </button>
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={!ready || publishing || !storageReady || (authenticated && !walletsReady)}
          className="mem-btn mem-btn--primary"
          style={{ flex: '2 1 180px' }}
        >
          Save now (draft)
        </button>
        <button
          type="button"
          onClick={handlePublish}
          disabled={
            !ready ||
            publishing ||
            !storageReady ||
            (authenticated && !walletsReady) ||
            (isAudioSession && !memoryRegistryConfigured)
          }
          className="mem-btn mem-btn--primary"
          style={{ flex: '2 1 180px' }}
        >
          {!storageReady
            ? 'Set storage keys'
            : isAudioSession && !memoryRegistryConfigured
              ? 'Registry required for audio'
              : !authenticated
                ? 'Sign in to publish'
                : !walletsReady
                  ? 'Preparing wallet…'
                  : publishing
                    ? 'Publishing…'
                    : !signingWallet?.getEthereumProvider
                      ? 'Connect wallet to publish'
                      : 'Mint onchain now'}
        </button>
      </div>
    </div>
  )
}

