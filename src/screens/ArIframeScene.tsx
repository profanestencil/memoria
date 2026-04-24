import { useNavigate } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { pickEthereumSigningWallet } from '@/lib/privyWallet'
import { runClaim } from '@/lib/claimFlow'
import { distanceMeters } from '@/lib/geoAr'

type Props = {
  iframeUrl: string
  latitude: number
  longitude: number
  geoRadiusM?: number
  sceneName?: string
}

/**
 * Permissions Policy tokens delegated to the third-party AR scene.
 * Without these, the browser blocks camera, motion sensors, and geo *inside* the iframe
 * even if the embedded page calls getUserMedia / DeviceOrientation / geolocation.
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Permissions-Policy
 */
const AR_SCENE_IFRAME_ALLOW =
  'accelerometer; autoplay; camera; fullscreen; geolocation; gyroscope; magnetometer; microphone; screen-wake-lock; xr-spatial-tracking'

export const ArIframeScene = ({ iframeUrl, latitude, longitude, geoRadiusM = 50, sceneName }: Props) => {
  const navigate = useNavigate()
  const { authenticated, login } = usePrivy()
  const { wallets } = useWallets()
  const signingWallet = pickEthereumSigningWallet(wallets)
  const [dist, setDist] = useState<number | null>(null)
  const [allowed, setAllowed] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [loot, setLoot] = useState<{
    phase: 'idle' | 'opening' | 'claiming' | 'claimed' | 'error'
    message: string | null
    fade: boolean
  }>({ phase: 'idle', message: null, fade: false })

  const allowedOrigins = useMemo(() => {
    const raw = (import.meta.env.VITE_AR_CLAIM_ORIGINS ?? '').toString().trim()
    if (!raw) return []
    return raw
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean)
  }, [])

  const originAllowed = useCallback(
    (origin: string) => {
      if (!allowedOrigins.length) return false
      return allowedOrigins.includes(origin)
    },
    [allowedOrigins]
  )

  const handleRunClaim = useCallback(
    async (claimCampaignId: string) => {
      if (!authenticated) {
        login()
        setLoot({ phase: 'error', message: 'Sign in to claim.', fade: false })
        return
      }
      if (!signingWallet?.address || !signingWallet.getEthereumProvider) {
        setLoot({ phase: 'error', message: 'Connect a wallet to claim.', fade: false })
        return
      }
      const wallet = signingWallet.address as `0x${string}`
      setLoot({ phase: 'opening', message: null, fade: false })
      await new Promise((r) => setTimeout(r, 700))
      setLoot({ phase: 'claiming', message: 'Claiming…', fade: false })
      const res = await runClaim({
        claimCampaignId,
        wallet,
        getEthereumProvider: () => signingWallet.getEthereumProvider!(),
      })
      if (!res.ok) {
        setLoot({ phase: 'error', message: res.error ?? 'Claim failed', fade: false })
        return
      }
      setLoot({ phase: 'claimed', message: 'Claimed', fade: true })
      window.setTimeout(() => setLoot({ phase: 'idle', message: null, fade: false }), 1400)
    },
    [authenticated, login, signingWallet]
  )

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError('Location not supported')
      return
    }
    const watchId = navigator.geolocation.watchPosition(
      (p) => {
        const d = distanceMeters(p.coords.latitude, p.coords.longitude, latitude, longitude)
        setDist(d)
        setAllowed(d <= geoRadiusM)
        setGeoError(null)
      },
      (e) => {
        if (e.code === e.PERMISSION_DENIED) setGeoError('Enable location to unlock this scene.')
        else setGeoError('Could not read location.')
      },
      { enableHighAccuracy: true, maximumAge: 2000 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [latitude, longitude, geoRadiusM])

  useEffect(() => {
    const onMsg = (event: MessageEvent) => {
      if (!allowed) return
      if (!originAllowed(event.origin)) return
      const data = event.data as any
      if (!data || typeof data !== 'object') return
      if (data.type !== 'memoria:claim') return
      const claimCampaignId = typeof data.claimCampaignId === 'string' ? data.claimCampaignId : ''
      if (!claimCampaignId) return
      if (loot.phase === 'opening' || loot.phase === 'claiming') return
      void handleRunClaim(claimCampaignId)
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [allowed, originAllowed, handleRunClaim, loot.phase])

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#080706', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, flexShrink: 0 }}>
        <button
          type="button"
          className="mem-btn mem-btn--ghost"
          onClick={() => navigate('/map')}
          aria-label="Back to map"
          style={{ background: 'rgba(10, 9, 8, 0.88)' }}
        >
          Back to map
        </button>
        {dist != null ? (
          <span style={{ color: 'rgba(255,248,235,0.75)', fontSize: 13 }}>
            {Math.round(dist)}m · {allowed ? 'unlocked' : `within ${geoRadiusM}m`}
          </span>
        ) : null}
      </div>
      {geoError ? (
        <p style={{ padding: 16, color: 'var(--mem-danger)', margin: 0 }}>{geoError}</p>
      ) : null}
      {!allowed && !geoError ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            color: '#f5f0e8',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          <p style={{ margin: 0, maxWidth: 360 }}>
            Move closer to unlock this scene.
            {dist != null ? ` You are about ${Math.round(dist)}m away (limit ${geoRadiusM}m).` : null}
          </p>
        </div>
      ) : null}
      {allowed ? (
        <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
          <iframe
            title={sceneName ?? 'AR scene'}
            src={iframeUrl}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
            allow={AR_SCENE_IFRAME_ALLOW}
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
          />
          {loot.phase !== 'idle' ? (
            <div
              role="dialog"
              aria-label="Loot box claim"
              style={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                background: 'rgba(6, 8, 12, 0.35)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
                transition: 'opacity 900ms ease',
                opacity: loot.fade ? 0 : 1,
                pointerEvents: 'auto',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  width: 'min(340px, calc(100vw - 32px))',
                  borderRadius: 16,
                  border: '1px solid rgba(34, 211, 238, 0.22)',
                  background: 'linear-gradient(165deg, rgba(12, 55, 68, 0.6), rgba(8, 10, 14, 0.92))',
                  boxShadow: '0 18px 50px rgba(0,0,0,0.55)',
                  padding: 18,
                  textAlign: 'center',
                  color: 'var(--mem-text, #eae6e1)',
                }}
              >
                <div
                  aria-hidden
                  style={{
                    fontSize: 46,
                    marginBottom: 10,
                    transform: loot.phase === 'opening' ? 'scale(1.06)' : 'scale(1)',
                    transition: 'transform 700ms ease',
                    textShadow: '0 0 18px rgba(34, 211, 238, 0.35)',
                  }}
                >
                  🧰
                </div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  {loot.phase === 'opening'
                    ? 'Opening…'
                    : loot.phase === 'claiming'
                      ? 'Claiming…'
                      : loot.phase === 'claimed'
                        ? 'Unlocked'
                        : 'Claim failed'}
                </div>
                {loot.message ? (
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: 'rgba(165, 243, 252, 0.9)' }}>
                    {loot.message}
                  </p>
                ) : (
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: 'rgba(255,248,235,0.75)' }}>
                    Completing your reward…
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
