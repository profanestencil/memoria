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
      const { data, error } = await sb.from('claim_campaigns').select('*').order('starts_at', { ascending: false })
      if (error) throw error
      res.status(200).json({ claims: data ?? [] })
      return
    }

    if (req.method === 'POST') {
      const {
        name,
        starts_at,
        ends_at,
        enforcement,
        eligibility = {},
        reward_type,
        reward_payload = {},
        lat: latRaw,
        lng: lngRaw,
      } = body ?? {}
      if (!name || !starts_at || !ends_at || !enforcement || !reward_type) {
        res.status(400).json({ error: 'name, starts_at, ends_at, enforcement, reward_type required' })
        return
      }
      const lat = latRaw != null && latRaw !== '' ? Number(latRaw) : null
      const lng = lngRaw != null && lngRaw !== '' ? Number(lngRaw) : null
      const row = {
        name,
        starts_at,
        ends_at,
        enforcement,
        eligibility,
        reward_type,
        reward_payload,
        ...(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : { lat: null, lng: null }),
      }
      const { data, error } = await sb
        .from('claim_campaigns')
        .insert(row)
        .select()
        .single()
      if (error) throw error
      res.status(201).json({ claim: data })
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
        ...(body.enforcement != null ? { enforcement: body.enforcement } : {}),
        ...(body.eligibility != null ? { eligibility: body.eligibility } : {}),
        ...(body.reward_type != null ? { reward_type: body.reward_type } : {}),
        ...(body.reward_payload != null ? { reward_payload: body.reward_payload } : {}),
        ...(body.lat !== undefined
          ? {
              lat:
                body.lat != null && body.lat !== ''
                  ? Number(body.lat)
                  : null,
            }
          : {}),
        ...(body.lng !== undefined
          ? {
              lng:
                body.lng != null && body.lng !== ''
                  ? Number(body.lng)
                  : null,
            }
          : {}),
      }
      const { data, error } = await sb.from('claim_campaigns').update(row).eq('id', id).select().single()
      if (error) throw error
      res.status(200).json({ claim: data })
      return
    }

    if (req.method === 'DELETE') {
      const { error } = await sb.from('claim_campaigns').delete().eq('id', id)
      if (error) throw error
      res.status(200).json({ ok: true })
      return
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'claims_failed' })
  }
}
