import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import {
  createWalletClient,
  custom,
  createPublicClient,
  http,
  parseUnits,
  formatUnits,
  type Address,
  type PublicClient,
} from 'viem'
import { pickEthereumSigningWallet, connectRainbowWallet } from '@/lib/privyWallet'
import { appChain } from '@/lib/chain'
import { fetchErc20Info } from '@/lib/erc20Read'
import { adminCreateSession, adminDelete, adminGet, adminPost, adminRequestNonce } from '@/lib/adminApi'
import { AdminPreviewMap, type AdminMapExtraMarker } from '@/components/AdminPreviewMap'

const TOKEN_KEY = 'memoria:adminToken'

type Tab = 'campaigns' | 'pois' | 'scenes' | 'claims'

/** Far-future end time when "open-ended" is selected (DB requires ends_at). */
const OPEN_ENDS_ISO = '2099-12-31T23:59:59.999Z'

const CAMPAIGN_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'festival', label: 'Festival' },
  { value: 'conference', label: 'Conference' },
  { value: 'show', label: 'Show' },
  { value: 'exhibition', label: 'Exhibition' },
  { value: 'party', label: 'Party' },
  { value: 'scavenger_hunt', label: 'Scavenger hunt' },
  { value: 'challenge', label: 'Challenge' },
  { value: 'holiday_tour', label: 'Holiday tour' },
  { value: 'other', label: 'Other' },
]

type StartMode = 'now' | 'scheduled'
type EndMode = 'open' | 'scheduled'

const resolveSchedule = (
  startMode: StartMode,
  endMode: EndMode,
  startsLocal: string,
  endsLocal: string,
): { starts_at: string; ends_at: string } | { error: string } => {
  if (startMode === 'scheduled' && !startsLocal.trim()) return { error: 'Choose a scheduled start time or use Start now' }
  if (endMode === 'scheduled' && !endsLocal.trim()) return { error: 'Choose a scheduled end time or use Open-ended' }
  const starts_at = startMode === 'now' ? new Date().toISOString() : new Date(startsLocal).toISOString()
  const ends_at = endMode === 'open' ? OPEN_ENDS_ISO : new Date(endsLocal).toISOString()
  return { starts_at, ends_at }
}

const ScheduleFields = ({
  idPrefix,
  startMode,
  setStartMode,
  endMode,
  setEndMode,
  starts,
  setStarts,
  ends,
  setEnds,
}: {
  idPrefix: string
  startMode: StartMode
  setStartMode: (v: StartMode) => void
  endMode: EndMode
  setEndMode: (v: EndMode) => void
  starts: string
  setStarts: (v: string) => void
  ends: string
  setEnds: (v: string) => void
}) => (
  <div style={{ display: 'grid', gap: 8 }}>
    <span className="mem-label">Schedule</span>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          type="radio"
          name={`${idPrefix}-start`}
          checked={startMode === 'now'}
          onChange={() => setStartMode('now')}
        />
        Start now
      </label>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          type="radio"
          name={`${idPrefix}-start`}
          checked={startMode === 'scheduled'}
          onChange={() => setStartMode('scheduled')}
        />
        Scheduled start
      </label>
    </div>
    {startMode === 'scheduled' ? (
      <input
        className="mem-input"
        type="datetime-local"
        value={starts}
        onChange={(e) => setStarts(e.target.value)}
        aria-label="Scheduled start time"
      />
    ) : null}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input type="radio" name={`${idPrefix}-end`} checked={endMode === 'open'} onChange={() => setEndMode('open')} />
        Open-ended (no fixed end)
      </label>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          type="radio"
          name={`${idPrefix}-end`}
          checked={endMode === 'scheduled'}
          onChange={() => setEndMode('scheduled')}
        />
        Scheduled end
      </label>
    </div>
    {endMode === 'scheduled' ? (
      <input
        className="mem-input"
        type="datetime-local"
        value={ends}
        onChange={(e) => setEnds(e.target.value)}
        aria-label="Scheduled end time"
      />
    ) : null}
  </div>
)

const defaultPins: Record<Tab, { lat: string; lng: string }> = {
  campaigns: { lat: '', lng: '' },
  pois: { lat: '', lng: '' },
  scenes: { lat: '', lng: '' },
  claims: { lat: '', lng: '' },
}

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

  const [pins, setPins] = useState(defaultPins)
  const [fencePreview, setFencePreview] = useState<{ lat: number; lng: number; radiusM: number } | null>(null)

  const persistToken = useCallback((t: string) => {
    setToken(t)
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t)
      else localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  const setPinField = useCallback((t: Tab, field: 'lat' | 'lng', value: string) => {
    setPins((p) => ({ ...p, [t]: { ...p[t], [field]: value } }))
  }, [])

  const handleMapPick = useCallback((la: number, ln: number) => {
    setPins((p) => ({ ...p, [tab]: { lat: String(la), lng: String(ln) } }))
  }, [tab])

  useEffect(() => {
    if (tab !== 'campaigns') setFencePreview(null)
  }, [tab])

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

  const extraMarkers = useMemo((): AdminMapExtraMarker[] => {
    const out: AdminMapExtraMarker[] = []
    for (const raw of pois) {
      const row = raw as { id: string; lat?: number | null; lng?: number | null; name?: string | null }
      if (row.lat == null || row.lng == null) continue
      if (!Number.isFinite(row.lat) || !Number.isFinite(row.lng)) continue
      out.push({
        id: `poi-${row.id}`,
        lat: row.lat,
        lng: row.lng,
        color: 'rgba(107,156,255,0.95)',
        label: row.name ? `POI: ${row.name}` : 'POI',
      })
    }
    for (const raw of scenes) {
      const row = raw as { id: string; lat?: number | null; lng?: number | null; name?: string | null }
      if (row.lat == null || row.lng == null) continue
      if (!Number.isFinite(row.lat) || !Number.isFinite(row.lng)) continue
      out.push({
        id: `scene-${row.id}`,
        lat: row.lat,
        lng: row.lng,
        color: 'rgba(120,220,140,0.95)',
        label: row.name ? `AR: ${row.name}` : 'AR scene',
      })
    }
    for (const raw of claims) {
      const row = raw as { id: string; lat?: number | null; lng?: number | null; name?: string | null }
      if (row.lat == null || row.lng == null) continue
      if (!Number.isFinite(row.lat) || !Number.isFinite(row.lng)) continue
      out.push({
        id: `claim-${row.id}`,
        lat: row.lat,
        lng: row.lng,
        color: 'rgba(255,160,120,0.95)',
        label: row.name ? `Claim: ${row.name}` : 'Claim',
      })
    }
    return out
  }, [pois, scenes, claims])

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

  const pin = pins[tab]
  const previewCircle = tab === 'campaigns' ? fencePreview : null

  return (
    <div className="mem-page mem-admin-page" style={{ padding: '16px 16px 32px' }}>
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
              <CampaignsSection
                token={token}
                rows={campaigns}
                onRefresh={() => void loadAll()}
                lat={pins.campaigns.lat}
                lng={pins.campaigns.lng}
                setLat={(v) => setPinField('campaigns', 'lat', v)}
                setLng={(v) => setPinField('campaigns', 'lng', v)}
                onFencePreviewChange={setFencePreview}
              />
            ) : null}
            {tab === 'pois' ? (
              <PoisSection
                token={token}
                rows={pois}
                onRefresh={() => void loadAll()}
                lat={pins.pois.lat}
                lng={pins.pois.lng}
                setLat={(v) => setPinField('pois', 'lat', v)}
                setLng={(v) => setPinField('pois', 'lng', v)}
              />
            ) : null}
            {tab === 'scenes' ? (
              <ScenesSection
                token={token}
                rows={scenes}
                onRefresh={() => void loadAll()}
                lat={pins.scenes.lat}
                lng={pins.scenes.lng}
                setLat={(v) => setPinField('scenes', 'lat', v)}
                setLng={(v) => setPinField('scenes', 'lng', v)}
              />
            ) : null}
            {tab === 'claims' ? (
              <ClaimsSection
                token={token}
                rows={claims}
                onRefresh={() => void loadAll()}
                lat={pins.claims.lat}
                lng={pins.claims.lng}
                setLat={(v) => setPinField('claims', 'lat', v)}
                setLng={(v) => setPinField('claims', 'lng', v)}
              />
            ) : null}
          </div>

          <div style={{ marginTop: 28 }}>
            <h2 className="mem-label" style={{ margin: '0 0 10px', fontSize: 14 }}>
              Location preview
            </h2>
            <AdminPreviewMap
              lat={pin.lat}
              lng={pin.lng}
              onPick={handleMapPick}
              previewCircle={previewCircle}
              extraMarkers={extraMarkers}
              height={280}
            />
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
  lat,
  lng,
  setLat,
  setLng,
  onFencePreviewChange,
}: {
  token: string
  rows: unknown[]
  onRefresh: () => void
  lat: string
  lng: string
  setLat: (v: string) => void
  setLng: (v: string) => void
  onFencePreviewChange: (v: { lat: number; lng: number; radiusM: number } | null) => void
}) => {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [startMode, setStartMode] = useState<StartMode>('now')
  const [endMode, setEndMode] = useState<EndMode>('open')
  const [starts, setStarts] = useState('')
  const [ends, setEnds] = useState('')
  const [tag, setTag] = useState('')
  const [pinColor, setPinColor] = useState('#C9A227')
  const [campaignType, setCampaignType] = useState('other')
  const [brandingAssetUrl, setBrandingAssetUrl] = useState('')
  const [radius, setRadius] = useState('200')
  const [overlayUrl, setOverlayUrl] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const la = Number(lat)
    const ln = Number(lng)
    const r = Number(radius)
    if (Number.isFinite(la) && Number.isFinite(ln) && Number.isFinite(r) && r > 0) {
      onFencePreviewChange({ lat: la, lng: ln, radiusM: r })
    } else {
      onFencePreviewChange(null)
    }
  }, [lat, lng, radius, onFencePreviewChange])

  const handleCreate = async () => {
    const sched = resolveSchedule(startMode, endMode, starts, ends)
    if ('error' in sched) {
      alert(sched.error)
      return
    }
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
        starts_at: sched.starts_at,
        ends_at: sched.ends_at,
        tag,
        pin_color: pinColor,
        campaign_type: campaignType,
        branding_asset_url: brandingAssetUrl.trim() || null,
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
          <ScheduleFields
            idPrefix="campaign"
            startMode={startMode}
            setStartMode={setStartMode}
            endMode={endMode}
            setEndMode={setEndMode}
            starts={starts}
            setStarts={setStarts}
            ends={ends}
            setEnds={setEnds}
          />
          <input className="mem-input" placeholder="Tag" value={tag} onChange={(e) => setTag(e.target.value)} />
          <label className="mem-label" style={{ marginTop: 4 }}>
            Campaign type
          </label>
          <select className="mem-input" value={campaignType} onChange={(e) => setCampaignType(e.target.value)} aria-label="Campaign type">
            {CAMPAIGN_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input className="mem-input" placeholder="#pin color" value={pinColor} onChange={(e) => setPinColor(e.target.value)} />
          <p className="mem-subtitle" style={{ margin: 0, fontSize: 12, lineHeight: 1.45 }}>
            Branding logo URL (PNG/SVG hosted with CORS) is composited on the <strong>bottom-right</strong> of each memory
            image when users mint inside this campaign. Optional extra overlay below is separate (top-left).
          </p>
          <input
            className="mem-input"
            placeholder="Branding logo URL (bottom-right watermark, optional)"
            value={brandingAssetUrl}
            onChange={(e) => setBrandingAssetUrl(e.target.value)}
            spellCheck={false}
            aria-label="Branding artwork URL for memory watermark"
          />
          <input className="mem-input" placeholder="Fence lat" value={lat} onChange={(e) => setLat(e.target.value)} />
          <input className="mem-input" placeholder="Fence lng" value={lng} onChange={(e) => setLng(e.target.value)} />
          <input className="mem-input" placeholder="Radius m" value={radius} onChange={(e) => setRadius(e.target.value)} />
          <input
            className="mem-input"
            placeholder="Extra overlay image URL — top-left (optional)"
            value={overlayUrl}
            onChange={(e) => setOverlayUrl(e.target.value)}
          />
          <button type="button" className="mem-btn mem-btn--primary" disabled={busy} onClick={() => void handleCreate()}>
            Create
          </button>
        </div>
      </fieldset>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        {rows.map((r) => {
          const row = r as {
            id: string
            name?: string
            slug?: string
            campaign_type?: string
            branding_asset_url?: string | null
          }
          const typeLabel =
            CAMPAIGN_TYPE_OPTIONS.find((o) => o.value === (row.campaign_type ?? 'other'))?.label ?? row.campaign_type
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
                {row.name ?? row.id}{' '}
                <span style={{ opacity: 0.7 }}>
                  ({row.slug}) · {typeLabel}
                  {row.branding_asset_url ? ' · branding' : ''}
                </span>
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

const PoisSection = ({
  token,
  rows,
  onRefresh,
  lat,
  lng,
  setLat,
  setLng,
}: {
  token: string
  rows: unknown[]
  onRefresh: () => void
  lat: string
  lng: string
  setLat: (v: string) => void
  setLng: (v: string) => void
}) => {
  const [name, setName] = useState('')
  const [startMode, setStartMode] = useState<StartMode>('now')
  const [endMode, setEndMode] = useState<EndMode>('open')
  const [starts, setStarts] = useState('')
  const [ends, setEnds] = useState('')
  const [tap, setTap] = useState('open_ar_scene')
  const [iconUrl, setIconUrl] = useState('')
  const [iframeUrl, setIframeUrl] = useState('')
  const [busy, setBusy] = useState(false)

  const handleCreate = async () => {
    const sched = resolveSchedule(startMode, endMode, starts, ends)
    if ('error' in sched) {
      alert(sched.error)
      return
    }
    const la = Number(lat)
    const ln = Number(lng)
    if (!Number.isFinite(la) || !Number.isFinite(ln)) {
      alert('Enter valid latitude and longitude (or pick on the map below)')
      return
    }
    setBusy(true)
    try {
      await adminPost('/api/admin/pois', token, {
        name,
        starts_at: sched.starts_at,
        ends_at: sched.ends_at,
        lat: la,
        lng: ln,
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
          <ScheduleFields
            idPrefix="poi"
            startMode={startMode}
            setStartMode={setStartMode}
            endMode={endMode}
            setEndMode={setEndMode}
            starts={starts}
            setStarts={setStarts}
            ends={ends}
            setEnds={setEnds}
          />
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

const ScenesSection = ({
  token,
  rows,
  onRefresh,
  lat,
  lng,
  setLat,
  setLng,
}: {
  token: string
  rows: unknown[]
  onRefresh: () => void
  lat: string
  lng: string
  setLat: (v: string) => void
  setLng: (v: string) => void
}) => {
  const [name, setName] = useState('')
  const [startMode, setStartMode] = useState<StartMode>('now')
  const [endMode, setEndMode] = useState<EndMode>('open')
  const [starts, setStarts] = useState('')
  const [ends, setEnds] = useState('')
  const [rad, setRad] = useState('60')
  const [url, setUrl] = useState('')
  const [claimCampaignId, setClaimCampaignId] = useState('')
  const [busy, setBusy] = useState(false)

  const handleCreate = async () => {
    const sched = resolveSchedule(startMode, endMode, starts, ends)
    if ('error' in sched) {
      alert(sched.error)
      return
    }
    const la = Number(lat)
    const ln = Number(lng)
    if (!Number.isFinite(la) || !Number.isFinite(ln)) {
      alert('Enter valid latitude and longitude (or pick on the map below)')
      return
    }
    setBusy(true)
    try {
      await adminPost('/api/admin/ar-scenes', token, {
        name,
        starts_at: sched.starts_at,
        ends_at: sched.ends_at,
        lat: la,
        lng: ln,
        geo_radius_m: Number(rad),
        scene_type: 'iframe_url',
        scene_payload: {
          url,
          ...(claimCampaignId.trim() ? { claimCampaignId: claimCampaignId.trim() } : {}),
        },
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
          <ScheduleFields
            idPrefix="scene"
            startMode={startMode}
            setStartMode={setStartMode}
            endMode={endMode}
            setEndMode={setEndMode}
            starts={starts}
            setStarts={setStarts}
            ends={ends}
            setEnds={setEnds}
          />
          <input className="mem-input" placeholder="Lat" value={lat} onChange={(e) => setLat(e.target.value)} />
          <input className="mem-input" placeholder="Lng" value={lng} onChange={(e) => setLng(e.target.value)} />
          <input className="mem-input" placeholder="Geo radius m" value={rad} onChange={(e) => setRad(e.target.value)} />
          <input className="mem-input" placeholder="iframe URL" value={url} onChange={(e) => setUrl(e.target.value)} />
          <input
            className="mem-input"
            placeholder="Optional claim campaign id (loot box)"
            value={claimCampaignId}
            onChange={(e) => setClaimCampaignId(e.target.value)}
          />
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

const ClaimsSection = ({
  token,
  rows,
  onRefresh,
  lat,
  lng,
  setLat,
  setLng,
}: {
  token: string
  rows: unknown[]
  onRefresh: () => void
  lat: string
  lng: string
  setLat: (v: string) => void
  setLng: (v: string) => void
}) => {
  const { wallets, ready: walletsReady } = useWallets()
  const signingWallet = pickEthereumSigningWallet(wallets)
  const [name, setName] = useState('')
  const [startMode, setStartMode] = useState<StartMode>('now')
  const [endMode, setEndMode] = useState<EndMode>('open')
  const [starts, setStarts] = useState('')
  const [ends, setEnds] = useState('')
  const [enforcement, setEnforcement] = useState('offchain')
  const [rewardType, setRewardType] = useState('erc20')
  const [busy, setBusy] = useState(false)

  const [tokenAddrInput, setTokenAddrInput] = useState('')
  const [loaded, setLoaded] = useState<{ address: Address; symbol: string; decimals: number; balanceRaw: bigint } | null>(
    null,
  )
  const [loadBusy, setLoadBusy] = useState(false)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [totalDeposit, setTotalDeposit] = useState('')
  const [perUser, setPerUser] = useState('')
  const [geoRadiusM, setGeoRadiusM] = useState('120')

  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: appChain,
        transport: http(),
      }) as PublicClient,
    [],
  )

  const handleLoadToken = async () => {
    if (!signingWallet?.address) {
      alert('Connect a wallet in the header first so we can read token metadata and your balance')
      return
    }
    setLoadBusy(true)
    setLoadErr(null)
    try {
      const info = await fetchErc20Info(publicClient, tokenAddrInput, signingWallet.address as Address)
      setLoaded(info)
    } catch (e) {
      setLoaded(null)
      setLoadErr(e instanceof Error ? e.message : 'Could not read token')
    } finally {
      setLoadBusy(false)
    }
  }

  const handleCreate = async () => {
    const sched = resolveSchedule(startMode, endMode, starts, ends)
    if ('error' in sched) {
      alert(sched.error)
      return
    }
    const latN = lat.trim() ? Number(lat) : NaN
    const lngN = lng.trim() ? Number(lng) : NaN
    const hasCoords = Number.isFinite(latN) && Number.isFinite(lngN)
    const radiusParsed = Math.max(1, Math.floor(Number(geoRadiusM) || 120))

    let reward_payload: Record<string, unknown> = {}
    let eligibility: Record<string, unknown> = { mode: 'open' }

    if (rewardType === 'erc20') {
      if (!loaded) {
        alert('Load an ERC-20 token from your connected wallet first')
        return
      }
      const td = totalDeposit.trim()
      const pu = perUser.trim()
      if (!td || !pu) {
        alert('Enter total tokens for the pool and per-user amount')
        return
      }
      let totalRaw: bigint
      let perRaw: bigint
      try {
        totalRaw = parseUnits(td, loaded.decimals)
        perRaw = parseUnits(pu, loaded.decimals)
      } catch {
        alert('Invalid number format for amounts')
        return
      }
      if (perRaw <= 0n || totalRaw <= 0n) {
        alert('Amounts must be positive')
        return
      }
      if (totalRaw < perRaw) {
        alert('Total pool must be at least the per-user amount')
        return
      }
      const maxSlots = totalRaw / perRaw
      if (maxSlots <= 0n) {
        alert('Pool too small for even one claim')
        return
      }
      reward_payload = {
        chainId: appChain.id,
        tokenAddress: loaded.address,
        tokenSymbol: loaded.symbol,
        tokenDecimals: loaded.decimals,
        totalAmountRaw: totalRaw.toString(),
        perUserAmountRaw: perRaw.toString(),
      }
      eligibility = {
        mode: 'open',
        maxRedemptions: Number(maxSlots),
        ...(hasCoords ? { radiusM: radiusParsed } : {}),
      }
    }

    if (rewardType === 'nft') {
      eligibility = { mode: 'open', ...(hasCoords ? { radiusM: radiusParsed } : {}) }
    }

    setBusy(true)
    try {
      await adminPost('/api/admin/claims', token, {
        name,
        starts_at: sched.starts_at,
        ends_at: sched.ends_at,
        enforcement,
        reward_type: rewardType,
        eligibility,
        reward_payload,
        ...(hasCoords ? { lat: latN, lng: lngN } : {}),
      })
      onRefresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const balanceHint =
    loaded && signingWallet?.address
      ? `Your wallet balance: ${formatUnits(loaded.balanceRaw, loaded.decimals)} ${loaded.symbol} (deposit at least the pool total off-app)`
      : null

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <fieldset style={{ border: '1px solid var(--mem-border)', borderRadius: 10, padding: 12 }}>
        <legend className="mem-label">New claim campaign</legend>
        <div style={{ display: 'grid', gap: 8 }}>
          <input className="mem-input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <ScheduleFields
            idPrefix="claim"
            startMode={startMode}
            setStartMode={setStartMode}
            endMode={endMode}
            setEndMode={setEndMode}
            starts={starts}
            setStarts={setStarts}
            ends={ends}
            setEnds={setEnds}
          />
          <p className="mem-subtitle" style={{ margin: 0, fontSize: 12, lineHeight: 1.45 }}>
            Location: set lat/lng below or use the map. Users must be within the radius (meters) to see and claim. Leave coordinates empty for a global campaign (no geo gate).
          </p>
          <input className="mem-input" placeholder="Map pin lat (optional)" value={lat} onChange={(e) => setLat(e.target.value)} />
          <input className="mem-input" placeholder="Map pin lng (optional)" value={lng} onChange={(e) => setLng(e.target.value)} />
          <input
            className="mem-input"
            type="number"
            min={10}
            step={10}
            placeholder="Geo radius (meters)"
            value={geoRadiusM}
            onChange={(e) => setGeoRadiusM(e.target.value)}
            aria-label="Geo fence radius in meters"
          />
          <select className="mem-input" value={enforcement} onChange={(e) => setEnforcement(e.target.value)}>
            <option value="offchain">offchain</option>
            <option value="onchain">onchain</option>
          </select>
          <select className="mem-input" value={rewardType} onChange={(e) => setRewardType(e.target.value)}>
            <option value="erc20">erc20 (token pool)</option>
            <option value="nft">nft (no token pool)</option>
          </select>

          {rewardType === 'erc20' ? (
            <>
              <p className="mem-subtitle" style={{ margin: 0, fontSize: 12, lineHeight: 1.45 }}>
                Paste the ERC-20 contract on {appChain.name}, then load. Define how many tokens are in the pool and how much each wallet may claim once. The campaign closes when the pool is exhausted or the schedule ends.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  className="mem-input"
                  style={{ flex: 1, minWidth: 200 }}
                  placeholder="Token contract 0x…"
                  value={tokenAddrInput}
                  onChange={(e) => setTokenAddrInput(e.target.value)}
                  spellCheck={false}
                  autoCapitalize="off"
                  aria-label="ERC-20 token contract address"
                />
                <button
                  type="button"
                  className="mem-btn mem-btn--secondary"
                  disabled={loadBusy || !walletsReady}
                  onClick={() => void handleLoadToken()}
                >
                  {loadBusy ? 'Loading…' : 'Load token'}
                </button>
              </div>
              {loadErr ? <p className="mem-error" style={{ margin: 0, fontSize: 12 }}>{loadErr}</p> : null}
              {loaded ? (
                <p className="mem-subtitle" style={{ margin: 0, fontSize: 13, color: 'rgba(200,220,255,0.95)' }}>
                  Loaded <strong>{loaded.symbol}</strong> · {loaded.decimals} decimals · {loaded.address}
                </p>
              ) : null}
              {balanceHint ? <p className="mem-subtitle" style={{ margin: 0, fontSize: 12 }}>{balanceHint}</p> : null}
              <input
                className="mem-input"
                placeholder="Total tokens in pool (e.g. 1000)"
                value={totalDeposit}
                onChange={(e) => setTotalDeposit(e.target.value)}
                inputMode="decimal"
                aria-label="Total token amount for the campaign pool"
              />
              <input
                className="mem-input"
                placeholder="Per wallet (one-time claim amount, e.g. 10)"
                value={perUser}
                onChange={(e) => setPerUser(e.target.value)}
                inputMode="decimal"
                aria-label="Tokens per unique wallet"
              />
            </>
          ) : null}

          <button
            type="button"
            className="mem-btn mem-btn--primary"
            disabled={busy || (rewardType === 'erc20' && !loaded)}
            onClick={() => void handleCreate()}
          >
            Create
          </button>
        </div>
      </fieldset>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        {rows.map((r) => {
          const row = r as {
            id: string
            name?: string
            enforcement?: string
            lat?: number | null
            lng?: number | null
            reward_payload?: Record<string, unknown>
          }
          const rp = row.reward_payload ?? {}
          const sym = typeof rp.tokenSymbol === 'string' ? rp.tokenSymbol : null
          let pool: string | null = null
          try {
            if (
              typeof rp.totalAmountRaw === 'string' &&
              typeof rp.perUserAmountRaw === 'string' &&
              typeof rp.tokenDecimals === 'number'
            ) {
              pool = `${formatUnits(BigInt(rp.totalAmountRaw), rp.tokenDecimals)} total · ${formatUnits(BigInt(rp.perUserAmountRaw), rp.tokenDecimals)} each`
            }
          } catch {
            pool = null
          }
          return (
            <li key={row.id} style={{ padding: 8, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              {row.name} · {row.enforcement}
              {sym ? ` · ${sym}` : ''}
              {pool ? ` · pool ${pool}` : ''}
              {row.lat != null && row.lng != null ? ` · map ${row.lat.toFixed(4)}, ${row.lng.toFixed(4)}` : ''} ·{' '}
              <code style={{ fontSize: 11 }}>{row.id}</code>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
