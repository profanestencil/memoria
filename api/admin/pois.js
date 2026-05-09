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

  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      body = {}
    }
  }

  try {
    if (req.method === 'GET') {
      const { data, error } = await sb.from('map_pois').select('*').order('starts_at', { ascending: false })
      if (error) throw error
      res.status(200).json({ pois: data ?? [] })
      return
    }

    if (req.method === 'POST') {
      const { name, starts_at, ends_at, lat, lng, icon_url, tap_action, payload = {} } = body ?? {}
      if (!name || !starts_at || !ends_at || lat == null || lng == null || !tap_action) {
        res.status(400).json({ error: 'name, starts_at, ends_at, lat, lng, tap_action required' })
        return
      }
      const { data, error } = await sb
        .from('map_pois')
        .insert({
          name,
          starts_at,
          ends_at,
          lat,
          lng,
          icon_url: icon_url ?? null,
          tap_action,
          payload,
        })
        .select()
        .single()
      if (error) throw error
      res.status(201).json({ poi: data })
      return
    }

    const id = typeof req.query.id === 'string' ? req.query.id : ''
    if (!id) {
      res.status(400).json({ error: 'Query id required' })
      return
    }

    if (req.method === 'PATCH') {
      const row = {
        ...(body.name != null ? { name: body.name } : {}),
        ...(body.starts_at != null ? { starts_at: body.starts_at } : {}),
        ...(body.ends_at != null ? { ends_at: body.ends_at } : {}),
        ...(body.lat != null ? { lat: body.lat } : {}),
        ...(body.lng != null ? { lng: body.lng } : {}),
        ...(body.icon_url !== undefined ? { icon_url: body.icon_url } : {}),
        ...(body.tap_action != null ? { tap_action: body.tap_action } : {}),
        ...(body.payload != null ? { payload: body.payload } : {}),
      }
      const { data, error } = await sb.from('map_pois').update(row).eq('id', id).select().single()
      if (error) throw error
      res.status(200).json({ poi: data })
      return
    }

    if (req.method === 'DELETE') {
      const { error } = await sb.from('map_pois').delete().eq('id', id)
      if (error) throw error
      res.status(200).json({ ok: true })
      return
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'pois_failed' })
  }
}
