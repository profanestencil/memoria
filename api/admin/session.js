import { isSupabaseConfigured, getServiceSupabase } from '../_lib/supabase.js'
import { issueAdminToken, verifyWalletSignature } from '../_lib/adminAuth.js'

const normalizeAddr = (a) => {
  if (typeof a !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(a)) return null
  return a.toLowerCase()
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.status(204).end()
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  if (!isSupabaseConfigured()) {
    res.status(503).json({ error: 'Supabase not configured' })
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

  const address = normalizeAddr(body?.address ?? '')
  const message = typeof body?.message === 'string' ? body.message : ''
  const signature = typeof body?.signature === 'string' ? body.signature : ''

  if (!address || !message || !signature || !signature.startsWith('0x')) {
    res.status(400).json({ error: 'address, message, signature (0x…) required' })
    return
  }

  const nonceMatch = message.match(/Nonce:\s*([a-f0-9]+)/i)
  const nonce = nonceMatch ? nonceMatch[1] : null
  if (!nonce) {
    res.status(400).json({ error: 'message must contain Nonce: <hex>' })
    return
  }

  try {
    const sb = getServiceSupabase()
    const nowIso = new Date().toISOString()

    const { data: rows, error: nErr } = await sb
      .from('admin_nonces')
      .select('id')
      .eq('wallet_address', address)
      .eq('nonce', nonce)
      .gt('expires_at', nowIso)
      .limit(1)

    if (nErr) throw nErr
    if (!rows?.length) {
      res.status(401).json({ error: 'Invalid or expired nonce' })
      return
    }

    const ok = await verifyWalletSignature({
      address: /** @type {`0x${string}`} */ (address),
      message,
      signature: /** @type {`0x${string}`} */ (signature),
    })
    if (!ok) {
      res.status(401).json({ error: 'Signature verification failed' })
      return
    }

    const { data: adminRow, error: aErr } = await sb
      .from('admin_users')
      .select('wallet_address')
      .eq('wallet_address', address)
      .limit(1)
      .maybeSingle()

    if (aErr) throw aErr
    if (!adminRow) {
      res.status(403).json({ error: 'Wallet is not an admin' })
      return
    }

    await sb.from('admin_nonces').delete().eq('id', rows[0].id)

    const token = issueAdminToken(address)
    res.status(200).json({ ok: true, token })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'session_failed' })
  }
}
