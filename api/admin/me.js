import { getBearerWallet } from '../_lib/adminAuth.js'
import { getServiceSupabase, isSupabaseConfigured } from '../_lib/supabase.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.status(204).end()
    return
  }
  if (req.method !== 'GET') {
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

  try {
    const sb = getServiceSupabase()
    const { data, error } = await sb
      .from('admin_users')
      .select('wallet_address, role, god_mode')
      .eq('wallet_address', wallet)
      .maybeSingle()
    if (error) throw error
    if (!data) {
      res.status(403).json({ error: 'Not an admin' })
      return
    }
    res.status(200).json({
      wallet: data.wallet_address,
      role: data.role,
      godMode: Boolean(data.god_mode),
    })
  } catch (e) {
    console.error('[api/admin/me]', e)
    res.status(500).json({ error: e instanceof Error ? e.message : 'me_failed' })
  }
}
