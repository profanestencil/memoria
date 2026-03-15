import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { usePublicClient } from 'wagmi'
import { formatEther } from 'viem'

type BalanceMap = Record<string, string>

export function Profile() {
  const navigate = useNavigate()
  const { ready, authenticated, login, user } = usePrivy()
  const { wallets } = useWallets()
  const publicClient = usePublicClient()
  const [balances, setBalances] = useState<BalanceMap>({})
  const embeddedWallet = wallets?.find((w) => w.walletClientType === 'privy')

  useEffect(() => {
    if (!publicClient || !wallets?.length) return
    let cancelled = false
    async function load() {
      try {
        const entries = await Promise.all(
          wallets.map(async (w) => {
            try {
              const balance = await publicClient.getBalance({ address: w.address as `0x${string}` })
              const formatted = formatEther(balance)
              return [w.address, Number(formatted).toFixed(4)]
            } catch {
              return [w.address, '0.0000']
            }
          })
        )
        if (!cancelled) setBalances(Object.fromEntries(entries))
      } catch {
        if (!cancelled) setBalances({})
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [publicClient, wallets])

  const primaryAddress = embeddedWallet?.address ?? wallets?.[0]?.address

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: 24,
        boxSizing: 'border-box',
        background: '#050505',
        color: '#e5e5e5',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          style={{
            marginRight: 12,
            width: 32,
            height: 32,
            borderRadius: '999px',
            border: '1px solid #333',
            background: '#111',
            color: '#e5e5e5',
            cursor: 'pointer',
          }}
        >
          ←
        </button>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem' }}>Profile</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>Your Memoria & Privy wallet</p>
        </div>
      </div>

      {!authenticated ? (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            border: '1px solid #333',
            background: '#0b0b0b',
            marginBottom: 24,
          }}
        >
          <p style={{ margin: '0 0 12px', fontSize: 14 }}>
            You are not logged in. Log in to see your user ID and wallet holdings.
          </p>
          <button
            type="button"
            onClick={() => login()}
            disabled={!ready}
            style={{
              padding: '10px 18px',
              borderRadius: 999,
              border: 'none',
              background: '#3b82f6',
              color: 'white',
              fontSize: 14,
              cursor: ready ? 'pointer' : 'default',
              opacity: ready ? 1 : 0.6,
            }}
          >
            {ready ? 'Log in / create account' : 'Loading…'}
          </button>
        </div>
      ) : (
        <section
          style={{
            padding: 16,
            borderRadius: 12,
            border: '1px solid #333',
            background: '#0b0b0b',
            marginBottom: 24,
          }}
        >
          <h2 style={{ margin: '0 0 8px', fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.08 }}>
            User
          </h2>
          <p style={{ margin: '0 0 4px', fontSize: 13 }}>
            <span style={{ color: '#9ca3af' }}>User ID:</span> {user?.id ?? '—'}
          </p>
          {user?.wallet && (
            <p style={{ margin: '0 0 4px', fontSize: 13 }}>
              <span style={{ color: '#9ca3af' }}>Wallet (Privy):</span> {user.wallet.address}
            </p>
          )}
        </section>
      )}

      <section
        style={{
          padding: 16,
          borderRadius: 12,
          border: '1px solid #333',
          background: '#050505',
          marginBottom: 24,
        }}
      >
        <h2 style={{ margin: '0 0 8px', fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.08 }}>
          Wallet holdings
        </h2>
        {!wallets?.length ? (
          <p style={{ margin: 0, fontSize: 13, color: '#9ca3af' }}>
            No wallets found yet. Log in to create an embedded wallet.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {wallets.map((w) => {
              const isEmbedded = w.walletClientType === 'privy'
              const addr = w.address
              const short = `${addr.slice(0, 6)}…${addr.slice(-4)}`
              const balance = balances[addr]
              return (
                <li
                  key={addr}
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    border: '1px solid #1f2933',
                    background: addr === primaryAddress ? '#0b1120' : '#020617',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 6,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '999px',
                          background: isEmbedded ? '#22c55e' : '#818cf8',
                        }}
                      />
                      <span style={{ fontSize: 13 }}>
                        {short}{' '}
                        {isEmbedded && (
                          <span style={{ fontSize: 11, color: '#a5b4fc' }}>(embedded)</span>
                        )}
                      </span>
                    </div>
                    <span style={{ fontSize: 13, color: '#e5e5e5' }}>
                      {balance ?? '…'} <span style={{ color: '#9ca3af' }}>ETH</span>
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(addr)}
                      style={smallButtonStyle}
                    >
                      Copy address
                    </button>
                    <a
                      href={`https://basescan.org/address/${addr}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ ...smallButtonStyle, textDecoration: 'none', textAlign: 'center' }}
                    >
                      View on BaseScan
                    </a>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section
        style={{
          padding: 16,
          borderRadius: 12,
          border: '1px solid #333',
          background: '#050505',
        }}
      >
        <h2 style={{ margin: '0 0 8px', fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.08 }}>
          Actions
        </h2>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#9ca3af' }}>
          Use your Privy embedded wallet like any Base wallet: send ETH, receive funds, and buy more crypto.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <a
            href={primaryAddress ? `https://basescan.org/address/${primaryAddress}` : 'https://basescan.org'}
            target="_blank"
            rel="noreferrer"
            style={{ ...primaryActionStyle, textDecoration: 'none', textAlign: 'center' }}
          >
            Transfer & manage on BaseScan
          </a>
          <a
            href="https://www.coinbase.com/buy/ethereum"
            target="_blank"
            rel="noreferrer"
            style={{ ...secondaryActionStyle, textDecoration: 'none', textAlign: 'center' }}
          >
            Buy ETH (external on‑ramp)
          </a>
        </div>
      </section>
    </div>
  )
}

const smallButtonStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 999,
  border: '1px solid #374151',
  background: '#020617',
  color: '#e5e5e5',
  fontSize: 11,
  cursor: 'pointer',
}

const primaryActionStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderRadius: 999,
  border: 'none',
  background: '#3b82f6',
  color: 'white',
  fontSize: 14,
}

const secondaryActionStyle: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 999,
  border: '1px solid #374151',
  background: 'transparent',
  color: '#e5e5e5',
  fontSize: 13,
}

