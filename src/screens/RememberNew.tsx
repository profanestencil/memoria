import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { WalletProfileButton } from '@/components/WalletProfileButton'
import { pickEthereumSigningWallet } from '@/lib/privyWallet'
import { mintMemoryRegistry } from '@/lib/mintMemoryRegistry'

type Visibility = 'public' | 'private'

export function RememberNew() {
  const navigate = useNavigate()
  const { authenticated, login } = usePrivy()
  const { wallets } = useWallets()
  const signingWallet = pickEthereumSigningWallet(wallets)
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('public')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = useMemo(() => title.trim().length > 0, [title])

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
              ? 'Public memories appear on the world map.'
              : 'Private memories are only shown to the wallet that created them.'}
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

              navigate('/map')
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Mint failed'
              setError(msg)
            } finally {
              setSubmitting(false)
            }
          }}
        >
          {submitting ? 'Minting…' : 'Mint memory'}
        </button>

        {error ? <div className="mem-error">{error}</div> : null}
      </main>
    </div>
  )
}
