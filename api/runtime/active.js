import { isSupabaseConfigured, getServiceSupabase } from '../_lib/supabase.js'
import { inCircle } from '../_lib/geoRuntime.js'

const parseTime = (q) => {
  if (q.now != null) {
    const n = Number(q.now)
    if (Number.isFinite(n)) return new Date(n)
  }
  return new Date()
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.status(204).end()
    return
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const lat = Number(req.query.lat)
  const lng = Number(req.query.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({ error: 'Query params lat and lng (numbers) are required' })
    return
  }

  if (!isSupabaseConfigured()) {
    res.status(200).json({
      ok: true,
      configured: false,
      campaigns: [],
      pois: [],
      arScenes: [],
      claimCampaigns: [],
      hint: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the deployment',
    })
    return
  }

  const now = parseTime(req.query)
  const iso = now.toISOString()

  try {
    const sb = getServiceSupabase()

    const { data: campaignRows, error: cErr } = await sb
      .from('campaigns')
      .select('*')
      .eq('is_active', true)
      .lte('starts_at', iso)
      .gte('ends_at', iso)
      .order('priority', { ascending: false })

    if (cErr) throw cErr

    const campaignsOut = []
    for (const c of campaignRows ?? []) {
      const { data: fences } = await sb.from('campaign_geofences').select('*').eq('campaign_id', c.id)
      const { data: overlays } = await sb.from('campaign_overlays').select('*').eq('campaign_id', c.id)

      const fenceList = fences ?? []
      let geoMatch = fenceList.length === 0
      for (const f of fenceList) {
        if (f.shape_type === 'circle' && inCircle(lat, lng, f.center_lat, f.center_lng, f.radius_m)) {
          geoMatch = true
          break
        }
      }
      if (!geoMatch) continue

      campaignsOut.push({
        id: c.id,
        name: c.name,
        slug: c.slug,
        tag: c.tag,
        pinColor: c.pin_color,
        priority: c.priority,
        startsAt: c.starts_at,
        endsAt: c.ends_at,
        overlays: (overlays ?? []).map((o) => ({
          id: o.id,
          overlayType: o.overlay_type,
          assetUrl: o.asset_url,
          position: o.position,
          opacity: Number(o.opacity),
          scale: Number(o.scale),
        })),
      })
    }

    const { data: poiRows, error: pErr } = await sb
      .from('map_pois')
      .select('*')
      .lte('starts_at', iso)
      .gte('ends_at', iso)
      .limit(300)

    if (pErr) throw pErr

    const pois = (poiRows ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      iconUrl: p.icon_url,
      tapAction: p.tap_action,
      payload: p.payload ?? {},
      startsAt: p.starts_at,
      endsAt: p.ends_at,
    }))

    const { data: sceneRows, error: sErr } = await sb
      .from('ar_scenes')
      .select('*')
      .lte('starts_at', iso)
      .gte('ends_at', iso)
      .limit(100)

    if (sErr) throw sErr

    // All scenes in the time window — map draws pins; geo_radius_m still gates AR entry on /ar.
    const arScenes = (sceneRows ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      geoRadiusM: s.geo_radius_m,
      sceneType: s.scene_type,
      scenePayload: s.scene_payload ?? {},
      startsAt: s.starts_at,
      endsAt: s.ends_at,
      inRange: inCircle(lat, lng, s.lat, s.lng, s.geo_radius_m),
    }))

    const { data: claimRows, error: clErr } = await sb
      .from('claim_campaigns')
      .select('*')
      .lte('starts_at', iso)
      .gte('ends_at', iso)
      .limit(50)

    if (clErr) throw clErr

    const claimCampaigns = (claimRows ?? []).map((x) => ({
      id: x.id,
      name: x.name,
      enforcement: x.enforcement,
      eligibility: x.eligibility ?? {},
      rewardType: x.reward_type,
      rewardPayload: x.reward_payload ?? {},
      startsAt: x.starts_at,
      endsAt: x.ends_at,
      lat: x.lat != null ? Number(x.lat) : null,
      lng: x.lng != null ? Number(x.lng) : null,
    }))

    res.status(200).json({
      ok: true,
      configured: true,
      now: iso,
      campaigns: campaignsOut,
      pois,
      arScenes,
      claimCampaigns,
    })
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e instanceof Error ? e.message : 'runtime_active_failed',
    })
  }
}
