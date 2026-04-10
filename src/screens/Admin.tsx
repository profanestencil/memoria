import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { createWalletClient, custom, type Address } from 'viem'
import { pickEthereumSigningWallet, connectRainbowWallet } from '@/lib/privyWallet'
import { adminCreateSession, adminDelete, adminGet, adminPost, adminRequestNonce } from '@/lib/adminApi'

const TOKEN_KEY = 'memoria:adminToken'

type Tab = 'campaigns' | 'pois' | 'scenes' | 'claims'

export function Admin() {
  const navigate = useNavigate()
  const { authenticated, login, connectWallet, ready } = usePrivy()
  const { wallets, ready: walletsReady } = useWallets()
  const signingWallet = pickEthereumSigningWallet(wallets)
  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem(TOKEN_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [tab, setTab] = useState<Tab>('campaigns')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [campaigns, setCampaigns] = useState<unknown[]>([])
  const [pois, setPois] = useState<unknown[]>([])
  const [scenes, setScenes] = useState<unknown[]>([])
  const [claims, setClaims] = useState<unknown[]>([])

  const persistToken = useCallback((t: string) => {
    setToken(t)
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t)
      else localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  const loadAll = useCallback(async () => {
    if (!token) return
    setError(null)
    try {
      const [c, p, s, cl] = await Promise.all([
        adminGet('/api/admin/campaigns', token),
        adminGet('/api/admin/pois', token),
        adminGet('/api/admin/ar-scenes', token),
        adminGet('/api/admin/claims', token),
      ])
      setCampaigns((c as { campaigns?: unknown[] }).campaigns ?? [])
      setPois((p as { pois?: unknown[] }).pois ?? [])
      setScenes((s as { scenes?: unknown[] }).scenes ?? [])
      setClaims((cl as { claims?: unknown[] }).claims ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
      persistToken('')
    }
  }, [token, persistToken])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const handleAdminSignIn = async () => {
    if (!signingWallet?.address || !signingWallet.getEthereumProvider) {
      connectRainbowWallet(connectWallet)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const addr = signingWallet.address
      const n = await adminRequestNonce(addr)
      if (!n.message) throw new Error('No sign message from server')
      const provider = await signingWallet.getEthereumProvider()
      const client = createWalletClient({ transport: custom(provider) })
      const signature = await client.signMessage({
        account: addr as Address,
        message: n.message,
      })
      const t = await adminCreateSession(addr, n.message, signature)
      persistToken(t)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  const tabBtn = (id: Tab, label: string) => (
    <button
      key={id}
      type="button"
      className={`mem-btn mem-btn--secondary${tab === id ? ' mem-seg__btn--active' : ''}`}
      onClick={() => setTab(id)}
      style={{ flex: 1 }}
    >
      {label}
    </button>
  )

  return (
    <div className="mem-page" style={{ minHeight: '100vh', padding: '16px 16px 32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: '1.35rem' }}>Admin</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="mem-btn mem-btn--ghost" onClick={() => navigate('/')}>
            Home
          </button>
          {token ? (
            <button type="button" className="mem-btn mem-btn--secondary" onClick={() => persistToken('')}>
              Sign out
            </button>
          ) : null}
        </div>
      </div>

      {!token ? (
        <div style={{ marginTop: 24, maxWidth: 420 }}>
          <p className="mem-subtitle" style={{ lineHeight: 1.5 }}>
            Connect an admin wallet (allowlisted in Supabase <code>admin_users</code>), then sign the login message.
          </p>
          {!authenticated ? (
            <button type="button" className="mem-btn mem-btn--primary" onClick={() => login()} disabled={!ready}>
              Sign in
            </button>
          ) : !signingWallet?.getEthereumProvider ? (
            <button type="button" className="mem-btn mem-btn--primary" onClick={() => connectRainbowWallet(connectWallet)}>
              Connect wallet
            </button>
          ) : (
            <button type="button" className="mem-btn mem-btn--primary" onClick={() => void handleAdminSignIn()} disabled={busy || !walletsReady}>
              {busy ? 'Signing…' : 'Sign admin message'}
            </button>
          )}
        </div>
      ) : null}

      {error ? (
        <p className="mem-error" style={{ marginTop: 16 }}>
          {error}
        </p>
      ) : null}

      {token ? (
        <>
          <div className="mem-seg" role="tablist" style={{ marginTop: 20, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {tabBtn('campaigns', 'Campaigns')}
            {tabBtn('pois', 'POIs')}
            {tabBtn('scenes', 'AR scenes')}
            {tabBtn('claims', 'Claims')}
          </div>
          <div style={{ marginTop: 20 }}>
            {tab === 'campaigns' ? (
              <CampaignsSection token={token} rows={campaigns} onRefresh={() => void loadAll()} />
            ) : null}
            {tab === 'pois' ? <PoisSection token={token} rows={pois} onRefresh={() => void loadAll()} /> : null}
            {tab === 'scenes' ? <ScenesSection token={token} rows={scenes} onRefresh={() => void loadAll()} /> : null}
            {tab === 'claims' ? <ClaimsSection token={token} rows={claims} onRefresh={() => void loadAll()} /> : null}
          </div>
        </>
      ) : null}
    </div>
  )
}

const CampaignsSection = ({
  token,
  rows,
  onRefresh,
}: {
  token: string
  rows: unknown[]
  onRefresh: () => void
}) => {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [starts, setStarts] = useState('')
  const [ends, setEnds] = useState('')
  const [tag, setTag] = useState('')
  const [pinColor, setPinColor] = useState('#C9A227')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [radius, setRadius] = useState('200')
  const [overlayUrl, setOverlayUrl] = useState('')
  const [busy, setBusy] = useState(false)

  const handleCreate = async () => {
    setBusy(true)
    try {
      const geofences =
        lat && lng && radius
          ? [{ center_lat: Number(lat), center_lng: Number(lng), radius_m: Number(radius) }]
          : []
      const overlays = overlayUrl.trim()
        ? [
            {
              overlay_type: 'image',
              asset_url: overlayUrl.trim(),
              position: 'top_left',
              opacity: 0.9,
              scale: 0.22,
            },
          ]
        : []
      await adminPost('/api/admin/campaigns', token, {
        name,
        slug,
        starts_at: new Date(starts).toISOString(),
        ends_at: new Date(ends).toISOString(),
        tag,
        pin_color: pinColor,
        priority: 0,
        is_active: true,
        geofences,
        overlays,
      })
      onRefresh()
      setName('')
      setSlug('')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete campaign?')) return
    try {
      await adminDelete(`/api/admin/campaigns?id=${encodeURIComponent(id)}`, token)
      onRefresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <fieldset style={{ border: '1px solid var(--mem-border)', borderRadius: 10, padding: 12 }}>
        <legend className="mem-label">New campaign</legend>
        <div style={{ display: 'grid', gap: 8 }}>
          <input className="mem-input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="mem-input" placeholder="slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
          <input className="mem-input" type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
          <input className="mem-input" type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
          <input className="mem-input" placeholder="Tag" value={tag} onChange={(e) => setTag(e.target.value)} />
          <input className="mem-input" placeholder="#pin color" value={pinColor} onChange={(e) => setPinColor(e.target.value)} />
          <input className="mem-input" placeholder="Fence lat" value={lat} onChange={(e) => setLat(e.target.value)} />
          <input className="mem-input" placeholder="Fence lng" value={lng} onChange={(e) => setLng(e.target.value)} />
          <input className="mem-input" placeholder="Radius m" value={radius} onChange={(e) => setRadius(e.target.value)} />
          <input className="mem-input" placeholder="Overlay image URL (optional)" value={overlayUrl} onChange={(e) => setOverlayUrl(e.target.value)} />
          <button type="button" className="mem-btn mem-btn--primary" disabled={busy} onClick={() => void handleCreate()}>
            Create
          </button>
        </div>
      </fieldset>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        {rows.map((r) => {
          const row = r as { id: string; name?: string; slug?: string }
          return (
            <li
              key={row.id}
              style={{
                padding: 10,
                borderRadius: 8,
                border: '1px solid rgba(255,248,235,0.12)',
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <span>
                {row.name ?? row.id} <span style={{ opacity: 0.7 }}>({row.slug})</span>
              </span>
              <button type="button" className="mem-btn mem-btn--secondary" onClick={() => void handleDelete(row.id)}>
                Delete
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const PoisSection = ({ token, rows, onRefresh }: { token: string; rows: unknown[]; onRefresh: () => void }) => {
  const [name, setName] = useState('')
  const [starts, setStarts] = useState('')
  const [ends, setEnds] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [tap, setTap] = useState('open_ar_scene')
  const [iconUrl, setIconUrl] = useState('')
  const [iframeUrl, setIframeUrl] = useState('')
  const [busy, setBusy] = useState(false)

  const handleCreate = async () => {
    setBusy(true)
    try {
      await adminPost('/api/admin/pois', token, {
        name,
        starts_at: new Date(starts).toISOString(),
        ends_at: new Date(ends).toISOString(),
        lat: Number(lat),
        lng: Number(lng),
        tap_action: tap,
        icon_url: iconUrl || null,
        payload: iframeUrl
          ? tap === 'open_url'
            ? { url: iframeUrl }
            : { iframeUrl }
          : {},
      })
      onRefresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <fieldset style={{ border: '1px solid var(--mem-border)', borderRadius: 10, padding: 12 }}>
        <legend className="mem-label">New POI</legend>
        <div style={{ display: 'grid', gap: 8 }}>
          <input className="mem-input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="mem-input" type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
          <input className="mem-input" type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
          <input className="mem-input" placeholder="Lat" value={lat} onChange={(e) => setLat(e.target.value)} />
          <input className="mem-input" placeholder="Lng" value={lng} onChange={(e) => setLng(e.target.value)} />
          <select className="mem-input" value={tap} onChange={(e) => setTap(e.target.value)}>
            <option value="open_ar_scene">open_ar_scene</option>
            <option value="open_url">open_url</option>
            <option value="open_memory_list">open_memory_list</option>
          </select>
          <input className="mem-input" placeholder="Icon URL" value={iconUrl} onChange={(e) => setIconUrl(e.target.value)} />
          <input className="mem-input" placeholder="iframe / scene URL (payload)" value={iframeUrl} onChange={(e) => setIframeUrl(e.target.value)} />
          <button type="button" className="mem-btn mem-btn--primary" disabled={busy} onClick={() => void handleCreate()}>
            Create
          </button>
        </div>
      </fieldset>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        {rows.map((r) => {
          const row = r as { id: string; name?: string; tap_action?: string }
          return (
            <li key={row.id} style={{ padding: 8, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              {row.name} · {row.tap_action}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const ScenesSection = ({ token, rows, onRefresh }: { token: string; rows: unknown[]; onRefresh: () => void }) => {
  const [name, setName] = useState('')
  const [starts, setStarts] = useState('')
  const [ends, setEnds] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [rad, setRad] = useState('60')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)

  const handleCreate = async () => {
    setBusy(true)
    try {
      await adminPost('/api/admin/ar-scenes', token, {
        name,
        starts_at: new Date(starts).toISOString(),
        ends_at: new Date(ends).toISOString(),
        lat: Number(lat),
        lng: Number(lng),
        geo_radius_m: Number(rad),
        scene_type: 'iframe_url',
        scene_payload: { url },
      })
      onRefresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <fieldset style={{ border: '1px solid var(--mem-border)', borderRadius: 10, padding: 12 }}>
        <legend className="mem-label">New AR scene (iframe)</legend>
        <div style={{ display: 'grid', gap: 8 }}>
          <input className="mem-input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="mem-input" type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
          <input className="mem-input" type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
          <input className="mem-input" placeholder="Lat" value={lat} onChange={(e) => setLat(e.target.value)} />
          <input className="mem-input" placeholder="Lng" value={lng} onChange={(e) => setLng(e.target.value)} />
          <input className="mem-input" placeholder="Geo radius m" value={rad} onChange={(e) => setRad(e.target.value)} />
          <input className="mem-input" placeholder="iframe URL" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button type="button" className="mem-btn mem-btn--primary" disabled={busy} onClick={() => void handleCreate()}>
            Create
          </button>
        </div>
      </fieldset>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        {rows.map((r) => {
          const row = r as { id: string; name?: string; scene_type?: string }
          return (
            <li key={row.id} style={{ padding: 8, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              {row.name} · {row.scene_type}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const ClaimsSection = ({ token: _token, rows, onRefresh }: { token: string; rows: unknown[]; onRefresh: () => void }) => {
  const [name, setName] = useState('')
  const [starts, setStarts] = useState('')
  const [ends, setEnds] = useState('')
  const [enforcement, setEnforcement] = useState('offchain')
  const [rewardType, setRewardType] = useState('erc20')
  const [busy, setBusy] = useState(false)

  const handleCreate = async () => {
    setBusy(true)
    try {
      await adminPost('/api/admin/claims', _token, {
        name,
        starts_at: new Date(starts).toISOString(),
        ends_at: new Date(ends).toISOString(),
        enforcement,
        reward_type: rewardType,
        eligibility: { mode: 'open' },
        reward_payload: {},
      })
      onRefresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <fieldset style={{ border: '1px solid var(--mem-border)', borderRadius: 10, padding: 12 }}>
        <legend className="mem-label">New claim campaign</legend>
        <div style={{ display: 'grid', gap: 8 }}>
          <input className="mem-input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="mem-input" type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
          <input className="mem-input" type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
          <select className="mem-input" value={enforcement} onChange={(e) => setEnforcement(e.target.value)}>
            <option value="offchain">offchain</option>
            <option value="onchain">onchain</option>
          </select>
          <select className="mem-input" value={rewardType} onChange={(e) => setRewardType(e.target.value)}>
            <option value="erc20">erc20</option>
            <option value="nft">nft</option>
          </select>
          <button type="button" className="mem-btn mem-btn--primary" disabled={busy} onClick={() => void handleCreate()}>
            Create
          </button>
        </div>
      </fieldset>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        {rows.map((r) => {
          const row = r as { id: string; name?: string; enforcement?: string }
          return (
            <li key={row.id} style={{ padding: 8, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              {row.name} · {row.enforcement} · <code style={{ fontSize: 11 }}>{row.id}</code>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
