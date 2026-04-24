import { useCallback, useEffect, useState, useMemo, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { MemoryPin } from '@/lib/memoryPin'
import { pinAudioPlaybackUrl, pinIsAudioMemory, pinIsDraftMemory } from '@/lib/memoryMedia'
import { requestArPermissions } from '@/lib/requestArPermissions'
import { incrementMemoryView } from '@/lib/tipNudge'

/** 8th Wall AR: image plane + audio reactive sphere */
const MEMORY_PIN_AR_ENTRY_ENABLED = true

const MemoryAudioBlock = ({ pin }: { pin: MemoryPin }) => {
  const src = pinAudioPlaybackUrl(pin)
  const [playbackErr, setPlaybackErr] = useState<string | null>(null)

  useEffect(() => {
    setPlaybackErr(null)
  }, [src])

  const audioKey = useMemo(() => `${pin.memoryId}:${src}`, [pin.memoryId, src])

  if (!src) return null
  return (
    <div className="mem-memory-audio-wrap">
      <audio
        key={audioKey}
        controls
        src={src}
        loop={Boolean(pin.audioLoop)}
        preload="metadata"
        className="mem-memory-audio"
        onError={() =>
          setPlaybackErr(
            'Playback failed — try again, or open the memory from Wi‑Fi (large files may time out).'
          )
        }
      />
      {playbackErr ? (
        <p className="mem-memory-audio-error" role="status">
          {playbackErr}{' '}
          <span className="mem-subtle">
            If this persists, the host may block playback; deployment uses a same-origin proxy for IPFS audio.
          </span>
        </p>
      ) : null}
    </div>
  )
}

type PeekProps = {
  pin: MemoryPin
  myAddress: string | null
  onClose: () => void
  onOpenDetail: () => void
  isFavourite: boolean
  onToggleFavourite: () => void
}

/** Floating card: thumbnail, top-left info, top-right close */
export const MemoryPinPeek = ({
  pin,
  myAddress,
  onClose,
  onOpenDetail,
  isFavourite,
  onToggleFavourite,
}: PeekProps) => {
  const handleInfoKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onOpenDetail()
      }
    },
    [onOpenDetail]
  )

  const handleCloseKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onClose()
      }
    },
    [onClose]
  )

  const handleFavouriteKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onToggleFavourite()
      }
    },
    [onToggleFavourite]
  )

  return (
    <div
      className="mem-memory-peek"
      role="dialog"
      aria-label="Memory preview"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="mem-memory-peek__info"
        aria-label="Open full details"
        tabIndex={0}
        onClick={onOpenDetail}
        onKeyDown={handleInfoKeyDown}
      >
        i
      </button>
      <button
        type="button"
        className={`mem-memory-peek__fav${isFavourite ? ' mem-memory-peek__fav--on' : ''}`}
        aria-label={isFavourite ? 'Remove from saved' : 'Save memory'}
        aria-pressed={isFavourite}
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation()
          onToggleFavourite()
        }}
        onKeyDown={handleFavouriteKeyDown}
      >
        {isFavourite ? '★' : '☆'}
      </button>
      <button
        type="button"
        className="mem-memory-peek__close"
        aria-label="Close preview"
        tabIndex={0}
        onClick={onClose}
        onKeyDown={handleCloseKeyDown}
      >
        ×
      </button>
      <div className="mem-memory-peek__thumb-wrap">
        {pinIsAudioMemory(pin) && pinAudioPlaybackUrl(pin) ? (
          <div className="mem-memory-peek__audio-block">
            <div className="mem-memory-peek__audio-label" aria-hidden>
              ♪ Audio
            </div>
            <MemoryAudioBlock pin={pin} />
            {pin.audioLoop ? (
              <p className="mem-subtle" style={{ margin: '6px 0 0', fontSize: 11 }}>
                Loops
              </p>
            ) : (
              <p className="mem-subtle" style={{ margin: '6px 0 0', fontSize: 11 }}>
                Plays once
              </p>
            )}
          </div>
        ) : pin.imageUrl ? (
          <img src={pin.imageUrl} alt="" className="mem-memory-peek__thumb" decoding="async" />
        ) : (
          <div className="mem-memory-peek__thumb mem-memory-peek__thumb--placeholder" aria-hidden />
        )}
      </div>
      <p className="mem-memory-peek__title">{pin.title || 'Memory'}</p>
      <p className="mem-memory-peek__meta">
        {myAddress && pin.creator.toLowerCase() === myAddress.toLowerCase()
          ? 'You'
          : shortAddr(pin.creator)}
        {pin.isPublic ? ' · Public' : ' · Private'}
      </p>
      {pin.campaignTag ? (
        <p className="mem-subtle" style={{ margin: '6px 0 0', fontSize: 12 }}>
          Event: {pin.campaignTag}
        </p>
      ) : null}
      {MEMORY_PIN_AR_ENTRY_ENABLED ? <MemoryArEntryActions pin={pin} variant="peek" /> : null}
    </div>
  )
}

const MemoryArEntryActions = ({ pin, variant }: { pin: MemoryPin; variant: 'peek' | 'full' }) => {
  const navigate = useNavigate()
  const [arUi, setArUi] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null })

  const playbackUrl = pinAudioPlaybackUrl(pin)
  const canViewInAr = Boolean(pin.imageUrl) || Boolean(playbackUrl)

  const handleViewInAr = useCallback(async () => {
    if (arUi.busy) return
    if (!canViewInAr) return
    setArUi({ busy: true, error: null })

    const perm = await requestArPermissions()
    if (!perm.ok) {
      setArUi({ busy: false, error: perm.message })
      return
    }

    const lat = pin.latitude
    const lng = pin.longitude
    if (lat == null || lng == null) {
      setArUi({ busy: false, error: 'This memory has no location for AR.' })
      return
    }

    if (pinIsAudioMemory(pin) && playbackUrl) {
      navigate('/ar', {
        state: {
          audioUrl: playbackUrl,
          audioLoop: Boolean(pin.audioLoop),
          latitude: lat,
          longitude: lng,
        },
      })
    } else if (pin.imageUrl) {
      navigate('/ar', {
        state: {
          imageUrl: pin.imageUrl,
          latitude: lat,
          longitude: lng,
        },
      })
    }

    setArUi({ busy: false, error: null })
  }, [navigate, pin, playbackUrl, canViewInAr, arUi.busy])

  const handleViewInArKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleViewInAr()
      }
    },
    [handleViewInAr]
  )

  const actionsClass =
    variant === 'peek' ? 'mem-memory-peek__actions' : 'mem-memory-full__ar-actions'
  const btnClass =
    variant === 'peek'
      ? 'mem-btn mem-btn--primary mem-memory-peek__ar'
      : 'mem-btn mem-btn--primary mem-memory-full__ar'
  const errClass = variant === 'peek' ? 'mem-memory-peek__ar-error' : 'mem-memory-full__ar-error'

  const missingLabel = pinIsAudioMemory(pin)
    ? 'AR needs a playable audio URL'
    : 'AR requires an attached memory image'

  return (
    <div className={actionsClass}>
      <button
        type="button"
        className={btnClass}
        onClick={handleViewInAr}
        onKeyDown={handleViewInArKeyDown}
        disabled={!canViewInAr || arUi.busy}
        aria-label={canViewInAr ? 'View this memory in AR' : missingLabel}
      >
        {arUi.busy ? 'Requesting…' : 'View in AR'}
      </button>
      {arUi.error ? (
        <p className={errClass} role="status" aria-live="polite">
          {arUi.error}
        </p>
      ) : null}
    </div>
  )
}

type FullProps = {
  pin: MemoryPin
  myAddress: string | null
  onClose: () => void
  isFavourite: boolean
  onToggleFavourite: () => void
}

export const MemoryPinFull = ({ pin, myAddress, onClose, isFavourite, onToggleFavourite }: FullProps) => {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    incrementMemoryView(`${pin.creator.toLowerCase()}-${pin.memoryId}`)
  }, [pin.creator, pin.memoryId])

  const when = pin.timestamp ? new Date(pin.timestamp * 1000).toLocaleString() : ''

  const handleFavFullKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onToggleFavourite()
      }
    },
    [onToggleFavourite]
  )

  return (
    <div
      className="mem-memory-full-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Memory details"
      onClick={onClose}
    >
      <div className="mem-memory-full" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={`mem-memory-full__fav${isFavourite ? ' mem-memory-full__fav--on' : ''}`}
          aria-label={isFavourite ? 'Remove from saved' : 'Save memory'}
          aria-pressed={isFavourite}
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation()
            onToggleFavourite()
          }}
          onKeyDown={handleFavFullKeyDown}
        >
          {isFavourite ? '★' : '☆'}
        </button>
        <button type="button" className="mem-memory-full__close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <div className="mem-memory-full__hero">
          {pinIsAudioMemory(pin) && pinAudioPlaybackUrl(pin) ? (
            <div className="mem-memory-full__audio-hero">
              <p className="mem-memory-full__audio-hero-label">Audio memory</p>
              <MemoryAudioBlock pin={pin} />
              <p className="mem-subtle" style={{ margin: '10px 0 0', fontSize: 13 }}>
                {pin.audioLoop ? 'Set to loop when listeners press play.' : 'Set to play once (no loop).'}
              </p>
              {MEMORY_PIN_AR_ENTRY_ENABLED ? <MemoryArEntryActions pin={pin} variant="full" /> : null}
            </div>
          ) : pin.imageUrl ? (
            <>
              <img src={pin.imageUrl} alt="" className="mem-memory-full__img" decoding="async" />
              {MEMORY_PIN_AR_ENTRY_ENABLED ? <MemoryArEntryActions pin={pin} variant="full" /> : null}
            </>
          ) : (
            <div className="mem-memory-full__img mem-memory-full__img--placeholder" aria-hidden />
          )}
        </div>
        <div className="mem-memory-full__body">
          <h2 className="mem-memory-full__title">{pin.title || 'Memory'}</h2>
          {pinIsDraftMemory(pin) ? (
            <div
              style={{
                margin: '0 0 14px',
                padding: '10px 12px',
                borderRadius: 12,
                border: '1px solid rgba(34, 211, 238, 0.22)',
                background: 'rgba(8, 22, 32, 0.35)',
                color: 'rgba(165, 243, 252, 0.92)',
                fontSize: 13,
                lineHeight: 1.45,
              }}
              role="status"
              aria-label="Draft memory"
            >
              Saved as a <strong>draft</strong>. Mint onchain later to make it permanent.
            </div>
          ) : null}
          {pin.note ? <p className="mem-memory-full__note">{pin.note}</p> : null}
          <dl className="mem-memory-full__owner">
            <dt>Owner</dt>
            <dd>
              {myAddress && pin.creator.toLowerCase() === myAddress.toLowerCase()
                ? 'You'
                : pin.creator}
            </dd>
            {when ? (
              <>
                <dt>When</dt>
                <dd>{when}</dd>
              </>
            ) : null}
            <dt>Visibility</dt>
            <dd>{pin.isPublic ? 'Public on map' : 'Private'}</dd>
          </dl>
        </div>
      </div>
    </div>
  )
}

function shortAddr(a: string) {
  if (!a || a.length < 10) return a
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}
