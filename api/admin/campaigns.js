import { getBearerWallet } from '../_lib/adminAuth.js'
import { isSupabaseConfigured, getServiceSupabase } from '../_lib/supabase.js'
const requireAdmin = async (req, res, sb) => {
  const wallet = getBearerWallet(req)
  if (!wallet) {
    res.status(401).json({ error: 'Bearer admin token required' })
    return null
  }
  const { data, error } = await sb.from('admin_users').select('wallet_address').eq('wallet_address', wallet).maybeSingle()
  if (error || !data) {
    res.status(403).json({ error: 'Not an admin' })
    return null
  }
  return wallet
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.status(204).end()
    return
  }

  if (!isSupabaseConfigured()) {
    res.status(503).json({ error: 'Supabase not configured' })
    return
  }

  const sb = getServiceSupabase()
  const admin = await requireAdmin(req, res, sb)
  if (!admin) return

  try {
    if (req.method === 'GET') {
      const { data, error } = await sb.from('campaigns').select('*').order('priority', { ascending: false })
      if (error) throw error
      res.status(200).json({ campaigns: data ?? [] })
      return
    }

    let body = req.body
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body)
      } catch {
        res.status(400).json({ error: 'Invalid JSON' })
        return
      }
    }

    if (req.method === 'POST') {
      const {
        name,
        slug,
        starts_at: startsAt,
        ends_at: endsAt,
        tag = '',
        pin_color: pinColor = '#C9A227',
        priority = 0,
        is_active: isActive = true,
        geofences = [],
        overlays = [],
      } = body ?? {}

      if (!name || !slug || !startsAt || !endsAt) {
        res.status(400).json({ error: 'name, slug, starts_at, ends_at required' })
        return
      }

      const { data: camp, error: cErr } = await sb
        .from('campaigns')
        .insert({
          name,
          slug,
          starts_at: startsAt,
          ends_at: endsAt,
          tag,
          pin_color: pinColor,
          priority,
          is_active: isActive,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (cErr) throw cErr

      for (const g of geofences) {
        await sb.from('campaign_geofences').insert({
          campaign_id: camp.id,
          shape_type: 'circle',
          center_lat: g.center_lat,
          center_lng: g.center_lng,
          radius_m: g.radius_m,
        })
      }
      for (const o of overlays) {
        await sb.from('campaign_overlays').insert({
          campaign_id: camp.id,
          overlay_type: o.overlay_type ?? 'image',
          asset_url: o.asset_url,
          position: o.position ?? 'top_left',
          opacity: o.opacity ?? 0.85,
          scale: o.scale ?? 0.2,
        })
      }

      res.status(201).json({ campaign: camp })
      return
    }

    const id = typeof req.query.id === 'string' ? req.query.id : ''
    if (!id) {
      res.status(400).json({ error: 'Query id required for PATCH/DELETE' })
      return
    }

    if (req.method === 'PATCH') {
      const patch = { ...body, updated_at: new Date().toISOString() }
      delete patch.geofences
      delete patch.overlays
      const row = {
        ...(patch.name != null ? { name: patch.name } : {}),
        ...(patch.slug != null ? { slug: patch.slug } : {}),
        ...(patch.starts_at != null ? { starts_at: patch.starts_at } : {}),
        ...(patch.ends_at != null ? { ends_at: patch.ends_at } : {}),
        ...(patch.tag != null ? { tag: patch.tag } : {}),
        ...(patch.pin_color != null ? { pin_color: patch.pin_color } : {}),
        ...(patch.priority != null ? { priority: patch.priority } : {}),
        ...(patch.is_active != null ? { is_active: patch.is_active } : {}),
        updated_at: new Date().toISOString(),
      }

      const { data, error } = await sb.from('campaigns').update(row).eq('id', id).select().single()
      if (error) throw error

      if (Array.isArray(body?.geofences)) {
        await sb.from('campaign_geofences').delete().eq('campaign_id', id)
        for (const g of body.geofences) {
          await sb.from('campaign_geofences').insert({
            campaign_id: id,
            shape_type: 'circle',
            center_lat: g.center_lat,
            center_lng: g.center_lng,
            radius_m: g.radius_m,
          })
        }
      }
      if (Array.isArray(body?.overlays)) {
        await sb.from('campaign_overlays').delete().eq('campaign_id', id)
        for (const o of body.overlays) {
          await sb.from('campaign_overlays').insert({
            campaign_id: id,
            overlay_type: o.overlay_type ?? 'image',
            asset_url: o.asset_url,
            position: o.position ?? 'top_left',
            opacity: o.opacity ?? 0.85,
            scale: o.scale ?? 0.2,
          })
        }
      }

      res.status(200).json({ campaign: data })
      return
    }

    if (req.method === 'DELETE') {
      const { error } = await sb.from('campaigns').delete().eq('id', id)
      if (error) throw error
      res.status(200).json({ ok: true })
      return
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'campaigns_failed' })
  }
}
