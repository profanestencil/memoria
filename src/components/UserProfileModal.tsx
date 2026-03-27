import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { usePublicClient } from 'wagmi'
import { formatEther } from 'viem'
import { pickEthereumSigningWallet } from '@/lib/privyWallet'
import { walletAvatarBackground } from '@/lib/walletAvatar'
import type { MemoryPin } from '@/components/MemoriesMapCanvas'

const indexerUrl = import.meta.env.VITE_INDEXER_URL ?? 'http://localhost:8787'

type BalanceMap = Record<string, string>

type Props = {
  open: boolean
  onClose: () => void
}

export function UserProfileModal({ open, onClose }: Props) {
  const navigate = useNavigate()
  const { user } = usePrivy()
  const { wallets } = useWallets()
  const publicClient = usePublicClient()
  const signingWallet = pickEthereumSigningWallet(wallets)
  const [balances, setBalances] = useState<BalanceMap>({})
  const [myMemories, setMyMemories] = useState<MemoryPin[]>([])
  const addr = signingWallet?.address ?? ''

  useEffect(() => {
    if (!open || !publicClient || !wallets?.length) return
    const client = publicClient
    let cancelled = false
    const load = async () => {
      try {
        const entries = await Promise.all(
          wallets.map(async (w) => {
            try {
              const balance = await client.getBalance({ address: w.address as `0x${string}` })
              return [w.address, Number(formatEther(balance)).toFixed(4)]
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
  }, [open, publicClient, wallets])

  useEffect(() => {
    if (!open || !addr) {
      setMyMemories([])
      return
    }
    const u = new URL('/memories', indexerUrl)
    u.searchParams.set('user', addr as `0x${string}`)
    fetch(u.toString())
      .then((r) => r.json())
      .then((j: { memories?: MemoryPin[] }) => setMyMemories(j.memories ?? []))
      .catch(() => setMyMemories([]))
  }, [open, addr])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Your profile"
      className="mem-profile-backdrop"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div className="mem-profile-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="mem-profile-header">
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: addr ? walletAvatarBackground(addr) : '#334155',
              border: '2px solid rgba(232, 197, 71, 0.35)',
              flexShrink: 0,
            }}
            aria-hidden
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mem-display" style={{ fontWeight: 600, color: 'var(--mem-text)' }}>
              Wallet
            </div>
            <div style={{ fontSize: 12, color: 'var(--mem-text-muted)', wordBreak: 'break-all' }}>
              {addr ? `${addr.slice(0, 10)}…${addr.slice(-8)}` : '—'}
            </div>
            {user?.id ? (
              <div style={{ fontSize: 11, color: 'var(--mem-text-dim)', marginTop: 4 }}>ID: {user.id}</div>
            ) : null}
          </div>
          <button type="button" onClick={onClose} className="mem-btn mem-btn--icon" aria-label="Close profile">
            ✕
          </button>
        </div>

        <div className="mem-profile-body">
          <h3 className="mem-profile-section-title">Balances (ETH)</h3>
          <ul className="mem-profile-list">
            {wallets?.map((w) => (
              <li key={w.address} className="mem-profile-balance-row">
                <span style={{ color: 'var(--mem-text-muted)' }}>
                  {w.address.slice(0, 6)}…{w.address.slice(-4)}
                </span>
                <span>{balances[w.address] ?? '…'}</span>
              </li>
            ))}
          </ul>

          <h3 className="mem-profile-section-title">Your memories</h3>
          {myMemories.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--mem-text-dim)', fontSize: 14 }}>
              No memories yet. Mint one from Remember.
            </p>
          ) : (
            <div className="mem-profile-memory-grid">
              {myMemories.map((m) => (
                <button
                  key={`${m.creator}-${m.memoryId}`}
                  type="button"
                  onClick={() => {
                    onClose()
                    navigate(
                      `/map?lat=${encodeURIComponent(String(m.latitude))}&lng=${encodeURIComponent(String(m.longitude))}`
                    )
                  }}
                  className="mem-profile-memory-cell"
                >
                  <span className="mem-profile-memory-title">{m.title || 'Memory'}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
