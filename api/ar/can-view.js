import { distanceMeters } from '../_lib/geoRuntime.js'
import { getBearerWallet } from '../_lib/adminAuth.js'
import { getServiceSupabase, isSupabaseConfigured } from '../_lib/supabase.js'

export const AR_VIEW_RADIUS_M = 80

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

  const memoryLat = Number(req.query.lat)
  const memoryLng = Number(req.query.lng)
  const userLat = Number(req.query.userLat)
  const userLng = Number(req.query.userLng)

  if (![memoryLat, memoryLng, userLat, userLng].every(Number.isFinite)) {
    res.status(400).json({ error: 'lat, lng, userLat, userLng required' })
    return
  }

  let godMode = false
  const wallet = getBearerWallet(req)
  if (wallet && isSupabaseConfigured()) {
    try {
      const sb = getServiceSupabase()
      const { data } = await sb
        .from('admin_users')
        .select('god_mode')
        .eq('wallet_address', wallet)
        .maybeSingle()
      godMode = Boolean(data?.god_mode)
    } catch {
      godMode = false
    }
  }

  const distanceM = distanceMeters(userLat, userLng, memoryLat, memoryLng)
  const allowed = godMode || distanceM <= AR_VIEW_RADIUS_M

  res.status(200).json({
    allowed,
    distanceM,
    radiusM: AR_VIEW_RADIUS_M,
    godMode,
  })
}
