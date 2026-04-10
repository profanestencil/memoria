import { useCallback, useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { MemoryPin } from '@/lib/memoryPin'
import { requestArPermissions } from '@/lib/requestArPermissions'

/** Flip to `true` when the 8th Wall AR flow is stable for production */
const MEMORY_PIN_AR_ENTRY_ENABLED = false

type PeekProps = {
  pin: MemoryPin
  myAddress: string | null
  onClose: () => void
  onOpenDetail: () => void
}

/** Floating card: thumbnail, top-left info, top-right close */
export const MemoryPinPeek = ({ pin, myAddress, onClose, onOpenDetail }: PeekProps) => {
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
        className="mem-memory-peek__close"
        aria-label="Close preview"
        tabIndex={0}
        onClick={onClose}
        onKeyDown={handleCloseKeyDown}
      >
        ×
      </button>
      <div className="mem-memory-peek__thumb-wrap">
        {pin.imageUrl ? (
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
      {MEMORY_PIN_AR_ENTRY_ENABLED ? <MemoryPeekArActions pin={pin} /> : null}
    </div>
  )
}

const MemoryPeekArActions = ({ pin }: { pin: MemoryPin }) => {
  const navigate = useNavigate()
  const [arUi, setArUi] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null })

  const canViewInAr = Boolean(pin.imageUrl)

  const handleViewInAr = useCallback(async () => {
    if (!pin.imageUrl) return
    if (arUi.busy) return
    setArUi({ busy: true, error: null })

    const perm = await requestArPermissions()
    if (!perm.ok) {
      setArUi({ busy: false, error: perm.message })
      return
    }

    navigate('/ar', {
      state: {
        imageUrl: pin.imageUrl,
        latitude: pin.latitude,
        longitude: pin.longitude,
      },
    })
    setArUi({ busy: false, error: null })
  }, [navigate, pin.imageUrl, pin.latitude, pin.longitude, arUi.busy])

  const handleViewInArKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleViewInAr()
      }
    },
    [handleViewInAr]
  )

  return (
    <div className="mem-memory-peek__actions">
      <button
        type="button"
        className="mem-btn mem-btn--primary mem-memory-peek__ar"
        onClick={handleViewInAr}
        onKeyDown={handleViewInArKeyDown}
        disabled={!canViewInAr || arUi.busy}
        aria-label={canViewInAr ? 'View this memory in AR' : 'AR requires an attached memory image'}
      >
        {arUi.busy ? 'Requesting…' : 'View in AR'}
      </button>
      {arUi.error ? (
        <p className="mem-memory-peek__ar-error" role="status" aria-live="polite">
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
}

export const MemoryPinFull = ({ pin, myAddress, onClose }: FullProps) => {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const when = pin.timestamp ? new Date(pin.timestamp * 1000).toLocaleString() : ''

  return (
    <div
      className="mem-memory-full-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Memory details"
      onClick={onClose}
    >
      <div className="mem-memory-full" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="mem-memory-full__close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <div className="mem-memory-full__hero">
          {pin.imageUrl ? (
            <img src={pin.imageUrl} alt="" className="mem-memory-full__img" decoding="async" />
          ) : (
            <div className="mem-memory-full__img mem-memory-full__img--placeholder" aria-hidden />
          )}
        </div>
        <div className="mem-memory-full__body">
          <h2 className="mem-memory-full__title">{pin.title || 'Memory'}</h2>
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
