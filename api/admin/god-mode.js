import { getBearerWallet } from '../_lib/adminAuth.js'
import { getServiceSupabase, isSupabaseConfigured } from '../_lib/supabase.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.status(204).end()
    return
  }
  if (req.method !== 'PATCH') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  if (!isSupabaseConfigured()) {
    res.status(503).json({ error: 'Supabase not configured' })
    return
  }

  const wallet = getBearerWallet(req)
  if (!wallet) {
    res.status(401).json({ error: 'Bearer admin token required' })
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

  const enabled = Boolean(body?.enabled)

  try {
    const sb = getServiceSupabase()
    const { data: adminRow, error: aErr } = await sb
      .from('admin_users')
      .select('wallet_address')
      .eq('wallet_address', wallet)
      .maybeSingle()
    if (aErr) throw aErr
    if (!adminRow) {
      res.status(403).json({ error: 'Not an admin' })
      return
    }

    const { error } = await sb.from('admin_users').update({ god_mode: enabled }).eq('wallet_address', wallet)
    if (error) throw error

    res.status(200).json({ ok: true, godMode: enabled })
  } catch (e) {
    console.error('[api/admin/god-mode]', e)
    res.status(500).json({ error: e instanceof Error ? e.message : 'god_mode_failed' })
  }
}
