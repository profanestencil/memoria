import { useEffect, useMemo, useState } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { createWalletClient, custom, parseEther, type Address } from 'viem'
import { appChain } from '@/lib/chain'
import { pickEthereumSigningWallet } from '@/lib/privyWallet'
import { markTipDismissed } from '@/lib/tipNudge'

const TIP_WALLET: Address = '0x17985F4B04a3C3bA8378E225951B41DB1d687688'

type Props = {
  open: boolean
  onClose: () => void
}

const SUGGESTED: { label: string; eth: string }[] = [
  { label: '$0.50', eth: '0.0002' },
  { label: '$1', eth: '0.0004' },
  { label: '$5', eth: '0.002' },
  { label: '$10', eth: '0.004' },
  { label: '$25', eth: '0.01' },
  { label: '$50', eth: '0.02' },
  { label: '$100', eth: '0.04' },
]

export function TipModal({ open, onClose }: Props) {
  const { authenticated, login, ready } = usePrivy()
  const { wallets, ready: walletsReady } = useWallets()
  const signingWallet = pickEthereumSigningWallet(wallets)
  const [busyEth, setBusyEth] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setMessage(null)
    setBusyEth(null)
  }, [open])

  const canSend = Boolean(signingWallet?.address && signingWallet.getEthereumProvider)

  const copy = useMemo(
    () => ({
      title: 'Leave a tip',
      body:
        'If you were entertained, found this intriguing or maybe even useful, please drop a coin in the collection (only if you have the means). Memoria will remain free for as long as it is here, but contributions help the hosting, and cover some of the onchain costs of decentralised storage, any public API that is not free, etc. It also makes the developers feel like divine wizards instead of sleepless hacks.\n\nEither way, you have our gratitude. Keep remembering and keep the route free from contingencies.',
    }),
    []
  )

  const handleClose = () => {
    markTipDismissed()
    onClose()
  }

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(TIP_WALLET)
      setMessage('Tip wallet copied.')
    } catch {
      setMessage(TIP_WALLET)
    }
  }

  const handleTip = async (eth: string) => {
    if (!authenticated) {
      login()
      return
    }
    if (!walletsReady) {
      setMessage('Wallet is still loading. Try again in a moment.')
      return
    }
    if (!canSend || !signingWallet?.address || !signingWallet.getEthereumProvider) {
      setMessage('Connect a wallet that can send transactions to tip.')
      return
    }

    setBusyEth(eth)
    setMessage(null)
    try {
      const provider = await signingWallet.getEthereumProvider()
      const client = createWalletClient({ transport: custom(provider), chain: appChain })
      const hash = await client.sendTransaction({
        account: signingWallet.address as Address,
        to: TIP_WALLET,
        value: parseEther(eth),
      })
      setMessage(`Sent. Tx: ${hash.slice(0, 10)}…`)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Tip failed')
    } finally {
      setBusyEth(null)
    }
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tip the developers"
      className="mem-memory-full-backdrop"
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, calc(100vw - 24px))',
          margin: '0 auto',
          borderRadius: 14,
          border: '1px solid var(--mem-border)',
          background: 'rgba(12, 10, 8, 0.96)',
          boxShadow: 'var(--mem-shadow-float)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontWeight: 700, letterSpacing: '0.02em' }}>{copy.title}</div>
          <button type="button" className="mem-btn mem-btn--ghost" onClick={handleClose} aria-label="Close tip dialog">
            ×
          </button>
        </div>
        <div style={{ padding: '0 14px 14px' }}>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'rgba(255,248,235,0.78)', lineHeight: 1.55, fontSize: 13 }}>
            {copy.body}
          </p>

          <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <span className="mem-subtitle" style={{ margin: 0, fontSize: 12 }}>
                Tips are in <strong>Base ETH</strong> ({appChain.name})
              </span>
              <button type="button" className="mem-btn mem-btn--secondary" onClick={() => void handleCopyAddress()}>
                Copy wallet
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
              {SUGGESTED.map((s) => (
                <button
                  key={s.eth}
                  type="button"
                  className="mem-btn mem-btn--primary"
                  style={{ padding: '10px 10px', fontSize: 13 }}
                  disabled={!ready || busyEth === s.eth || (authenticated && !walletsReady)}
                  onClick={() => void handleTip(s.eth)}
                  aria-label={`Tip ${s.label} (${s.eth} ETH)`}
                >
                  {busyEth === s.eth ? 'Sending…' : s.label}
                </button>
              ))}
            </div>

            {!authenticated ? (
              <button type="button" className="mem-btn mem-btn--secondary" onClick={() => login()} disabled={!ready}>
                {ready ? 'Connect wallet to tip' : 'Loading…'}
              </button>
            ) : !canSend ? (
              <p className="mem-error" style={{ margin: 0, fontSize: 12 }}>
                Connected wallet can’t send transactions in this context. Try Rainbow / MetaMask / Coinbase.
              </p>
            ) : null}

            {message ? (
              <p style={{ margin: 0, fontSize: 12, color: 'rgba(200,230,200,0.95)', lineHeight: 1.45 }}>{message}</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

