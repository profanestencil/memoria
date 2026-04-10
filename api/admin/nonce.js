import { isSupabaseConfigured, getServiceSupabase } from '../_lib/supabase.js'
import crypto from 'crypto'

const normalizeAddr = (a) => {
  if (typeof a !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(a)) return null
  return a.toLowerCase()
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

  const address = normalizeAddr(typeof req.query.address === 'string' ? req.query.address : '')
  if (!address) {
    res.status(400).json({ error: 'Query address (0x…) required' })
    return
  }

  if (!isSupabaseConfigured()) {
    res.status(503).json({ error: 'Supabase not configured' })
    return
  }

  try {
    const sb = getServiceSupabase()
    const nonce = crypto.randomBytes(24).toString('hex')
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    const { error } = await sb.from('admin_nonces').insert({
      wallet_address: address,
      nonce,
      expires_at: expiresAt,
    })
    if (error) throw error

    const message = `Memoria Admin Login\nWallet: ${address}\nNonce: ${nonce}\nExpires: ${expiresAt}`

    res.status(200).json({ nonce, message, expiresAt })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'nonce_failed' })
  }
}
