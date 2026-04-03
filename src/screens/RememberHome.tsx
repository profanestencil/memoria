import { useNavigate } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'
import { WalletProfileButton } from '@/components/WalletProfileButton'

export function RememberHome() {
  const navigate = useNavigate()
  const { ready, authenticated, login, logout, user } = usePrivy()

  return (
    <div className="mem-page mem-page--center">
      <header className="mem-header">
        <div className="mem-header-start">
          <WalletProfileButton />
          <span className="mem-brand">Memoria</span>
        </div>
        <div className="mem-header-end">
          <button type="button" onClick={() => navigate('/camera')} className="mem-btn mem-btn--ghost">
            Camera
          </button>
          <button type="button" onClick={() => navigate('/map')} className="mem-btn mem-btn--ghost">
            Map
          </button>
        </div>
      </header>

      <main className="mem-main">
        <p className="mem-display mem-subtitle" style={{ marginBottom: 8, fontSize: '0.82rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--mem-text-dim)' }}>
          Onchain memories
        </p>
        <h1 className="mem-title-xl mem-display">Keeping things whole.</h1>
        <p className="mem-subtitle">
          Mint a memory anchored in time and coordinates. Find it again on the map—or through the
          lens.
        </p>

        <div className="mem-actions">
          <button type="button" className="mem-btn mem-btn--primary" onClick={() => navigate('/remember')}>
            New memory
          </button>

          {!authenticated ? (
            <button
              type="button"
              className="mem-btn mem-btn--secondary"
              onClick={() => login()}
              disabled={!ready}
            >
              {ready ? 'Connect wallet / log in' : 'Loading…'}
            </button>
          ) : (
            <button type="button" className="mem-btn mem-btn--secondary" onClick={() => logout()}>
              Disconnect ({user?.wallet?.address?.slice(0, 6)}…{user?.wallet?.address?.slice(-4)})
            </button>
          )}
        </div>
      </main>
    </div>
  )
}
