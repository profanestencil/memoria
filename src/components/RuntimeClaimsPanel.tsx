import { useCallback, useEffect, useState } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { formatUnits } from 'viem'
import { pickEthereumSigningWallet } from '@/lib/privyWallet'
import { getCurrentPosition } from '@/lib/geo'
import { fetchRuntimeActive, type RuntimeClaimCampaign } from '@/lib/runtimeActive'
import { runClaim } from '@/lib/claimFlow'

export const RuntimeClaimsPanel = () => {
  const { authenticated, login, ready } = usePrivy()
  const { wallets, ready: walletsReady } = useWallets()
  const signingWallet = pickEthereumSigningWallet(wallets)
  const [campaigns, setCampaigns] = useState<RuntimeClaimCampaign[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const c = await getCurrentPosition()
      const r = await fetchRuntimeActive(c.latitude, c.longitude)
      setCampaigns((r.claimCampaigns ?? []).filter((x) => x.inRange !== false))
    } catch {
      setCampaigns([])
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(), 60_000)
    return () => window.clearInterval(id)
  }, [refresh])

  const handleClaim = async (camp: RuntimeClaimCampaign) => {
    if (!authenticated) {
      login()
      return
    }
    if (!signingWallet?.address || !signingWallet.getEthereumProvider) {
      setMessage('Connect a wallet to claim.')
      return
    }
    const wallet = signingWallet.address as `0x${string}`
    setBusyId(camp.id)
    setMessage(null)
    try {
      const res = await runClaim({
        claimCampaignId: camp.id,
        wallet,
        getEthereumProvider: () => signingWallet.getEthereumProvider!(),
      })
      if (!res.ok) {
        setMessage(res.error ?? 'Claim failed')
        return
      }
      setMessage(
        res.enforcement === 'onchain'
          ? `Recorded. ${res.note ?? 'Complete onchain step with your wallet.'} Coupon: ${res.coupon?.slice(0, 12)}…`
          : `Claim recorded (${res.rewardType ?? 'reward'}). Coupon: ${res.coupon?.slice(0, 12)}…`
      )
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Claim failed')
    } finally {
      setBusyId(null)
    }
  }

  if (!campaigns.length) return null

  return (
    <div
      style={{
        position: 'absolute',
        right: 12,
        bottom: 100,
        zIndex: 7,
        maxWidth: 300,
        width: 'min(300px, calc(100vw - 24px))',
      }}
    >
      <button
        type="button"
        className="mem-btn mem-btn--secondary"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="mem-runtime-claims"
        style={{ width: '100%', marginBottom: open ? 8 : 0 }}
      >
        {open ? 'Hide rewards' : `Rewards (${campaigns.length})`}
      </button>
      {open ? (
        <div
          id="mem-runtime-claims"
          role="region"
          aria-label="Active reward campaigns"
          style={{
            padding: 12,
            borderRadius: 12,
            background: 'rgba(12, 10, 8, 0.94)',
            border: '1px solid var(--mem-border, rgba(255,248,235,0.15))',
            display: 'grid',
            gap: 10,
            maxHeight: 280,
            overflow: 'auto',
          }}
        >
          {campaigns.map((c) => {
            const rp = c.rewardPayload ?? {}
            const sym = typeof rp.tokenSymbol === 'string' ? rp.tokenSymbol : null
            const dec = typeof rp.tokenDecimals === 'number' ? rp.tokenDecimals : null
            const perRaw = typeof rp.perUserAmountRaw === 'string' ? rp.perUserAmountRaw : null
            let amountLine: string | null = null
            if (sym && dec != null && perRaw) {
              try {
                amountLine = `${formatUnits(BigInt(perRaw), dec)} ${sym} per wallet`
              } catch {
                amountLine = null
              }
            }
            return (
            <div key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 10 }}>
              <div style={{ fontWeight: 600, color: '#f5f0e8', fontSize: 14 }}>{c.name}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,248,235,0.65)', marginTop: 4 }}>
                {c.enforcement} · {c.rewardType}
                {amountLine ? ` · ${amountLine}` : ''}
              </div>
              <button
                type="button"
                className="mem-btn mem-btn--primary"
                style={{ marginTop: 8, width: '100%' }}
                disabled={!ready || busyId === c.id || (authenticated && !walletsReady)}
                onClick={() => void handleClaim(c)}
              >
                {busyId === c.id ? 'Signing…' : authenticated ? 'Claim' : 'Sign in to claim'}
              </button>
            </div>
            )
          })}
          {message ? (
            <p style={{ margin: 0, fontSize: 12, color: 'rgba(200,230,200,0.95)', lineHeight: 1.45 }}>{message}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
