import { useEffect, useState } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { usePublicClient } from 'wagmi'
import { formatEther } from 'viem'
import { pickEthereumSigningWallet } from '@/lib/privyWallet'
import { walletAvatarBackground } from '@/lib/walletAvatar'
import type { MemoryPin } from '@/lib/memoryPin'
import { loadOptimisticPins } from '@/lib/optimisticPinsStorage'
import { MemoryPinFull, MemoryPinPeek } from '@/components/MemoryInspect'

const indexerUrl = (import.meta.env.VITE_INDEXER_URL ?? 'http://localhost:8787').replace(/\/$/, '')

type BalanceMap = Record<string, string>

type Props = {
  open: boolean
  onClose: () => void
}

export function UserProfileModal({ open, onClose }: Props) {
  const { user } = usePrivy()
  const { wallets } = useWallets()
  const publicClient = usePublicClient()
  const signingWallet = pickEthereumSigningWallet(wallets)
  const [balances, setBalances] = useState<BalanceMap>({})
  const [myMemories, setMyMemories] = useState<MemoryPin[]>([])
  const [peekPin, setPeekPin] = useState<MemoryPin | null>(null)
  const [fullPin, setFullPin] = useState<MemoryPin | null>(null)
  const addr = signingWallet?.address ?? ''
  const myAddress = addr ? (addr as `0x${string}`) : null

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
    void load()
    return () => {
      cancelled = true
    }
  }, [open, publicClient, wallets])

  useEffect(() => {
    if (!open || !addr) {
      setMyMemories([])
      return
    }
    const optimistic = loadOptimisticPins().filter((p) => p.creator.toLowerCase() === addr.toLowerCase())
    const u = new URL('/memories', indexerUrl)
    u.searchParams.set('user', addr as `0x${string}`)
    fetch(u.toString())
      .then(async (r) => {
        if (!r.ok) return { memories: [] as MemoryPin[] }
        const j = (await r.json()) as { memories?: MemoryPin[] }
        return { memories: j.memories ?? [] }
      })
      .then((j) => {
        const seen = new Set(j.memories.map((p) => `${p.creator.toLowerCase()}-${p.memoryId}`))
        const merged = [...optimistic.filter((p) => !seen.has(`${p.creator.toLowerCase()}-${p.memoryId}`)), ...j.memories]
        setMyMemories(merged)
      })
      .catch(() => setMyMemories(optimistic))
  }, [open, addr])

  useEffect(() => {
    if (!open) {
      setPeekPin(null)
      setFullPin(null)
    }
  }, [open])

  if (!open) return null

  return (
    <>
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
                No memories yet. Mint one from the home screen.
              </p>
            ) : (
              <div className="mem-profile-memory-grid">
                {myMemories.map((m) => (
                  <button
                    key={`${m.creator}-${m.memoryId}`}
                    type="button"
                    onClick={() => {
                      setPeekPin(m)
                      setFullPin(null)
                    }}
                    className="mem-profile-memory-cell"
                  >
                    {m.imageUrl ? (
                      <img src={m.imageUrl} alt="" className="mem-profile-memory-thumb" decoding="async" />
                    ) : null}
                    <span className="mem-profile-memory-title">{m.title || 'Memory'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {peekPin && !fullPin ? (
        <div className="mem-profile-inspect-layer" role="presentation" onClick={() => setPeekPin(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <MemoryPinPeek
              pin={peekPin}
              myAddress={myAddress}
              onClose={() => setPeekPin(null)}
              onOpenDetail={() => setFullPin(peekPin)}
            />
          </div>
        </div>
      ) : null}
      {fullPin ? (
        <MemoryPinFull
          pin={fullPin}
          myAddress={myAddress}
          onClose={() => {
            setFullPin(null)
            setPeekPin(null)
          }}
        />
      ) : null}
    </>
  )
}
