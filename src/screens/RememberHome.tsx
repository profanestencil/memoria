import type { KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'
import { WalletProfileButton } from '@/components/WalletProfileButton'

const POETRY_KEEPING_WHOLE_URL = 'https://poetrysociety.org/poetry-in-motion/keeping-things-whole'
const ILLUST_HOME_URL = 'https://illust.space'

export function RememberHome() {
  const navigate = useNavigate()
  const { ready, authenticated, login, logout, user } = usePrivy()

  const handlePoetryLinkKeyDown = (e: KeyboardEvent<HTMLAnchorElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.currentTarget.click()
    }
  }

  const handleIllustLinkKeyDown = (e: KeyboardEvent<HTMLAnchorElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.currentTarget.click()
    }
  }

  return (
    <div className="mem-page mem-page--center">
      <header className="mem-header">
        <div className="mem-header-start">
          <WalletProfileButton />
          <span className="mem-brand">Memoria</span>
        </div>
        <div className="mem-header-end">
          <button type="button" onClick={() => navigate('/map')} className="mem-btn mem-btn--ghost">
            Map
          </button>
        </div>
      </header>

      <main className="mem-main">
        <div className="mem-main__center-block">
          <img
            src="/branding/web3-unlocked.png"
            alt="Web3 Unlocked"
            className="mem-web3-unlocked-logo"
            width={180}
            height={72}
            decoding="async"
          />
          <p
            className="mem-display mem-subtitle"
            style={{
              marginBottom: 8,
              fontSize: '0.82rem',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--mem-text-dim)',
            }}
          >
            Onchain memories
          </p>
          <h1 className="mem-title-xl mem-display">Keeping things whole.</h1>
          <p className="mem-home-body">
            Mint a memory, leave a message, plant a seed, sow a reminder anchored in time and space. Find
            it again with the map, or keep it private. Preserve it for pretty much eternity. Onchain, owned
            by you and always evolving. Why keeping things{' '}
            <a
              href={POETRY_KEEPING_WHOLE_URL}
              target="_blank"
              rel="noopener noreferrer"
              tabIndex={0}
              aria-label="Keeping Things Whole, poem by Mark Strand on Poetry Society"
              onKeyDown={handlePoetryLinkKeyDown}
            >
              whole
            </a>
            ?
          </p>

          <div className="mem-actions">
            <button type="button" className="mem-btn mem-btn--primary" onClick={() => navigate('/camera')}>
              Mint memory
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
        </div>

        <footer className="mem-home-footer">
          <p className="mem-home-footer__tagline">an illust pathfinder project</p>
          <a
            href={ILLUST_HOME_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mem-home-footer__logo-link"
            aria-label="illust — visit illust.space"
            tabIndex={0}
            onKeyDown={handleIllustLinkKeyDown}
          >
            <img
              src="/Illust_Base_LogoWhite.png"
              alt="illust."
              className="mem-home-footer__logo"
              width={120}
              height={30}
              decoding="async"
            />
          </a>
        </footer>
      </main>
    </div>
  )
}
