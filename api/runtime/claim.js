import crypto from 'crypto'
import { verifyMessage } from 'viem'
import { isSupabaseConfigured, getServiceSupabase } from '../_lib/supabase.js'
import { inCircle } from '../_lib/geoRuntime.js'

const couponSecret = () =>
  process.env.CLAIM_COUPON_SECRET || process.env.ADMIN_SESSION_SECRET || 'dev-insecure'

const buildClaimMessage = (campaignId, wallet) =>
  `Memoria reward claim\nCampaign: ${campaignId}\nWallet: ${wallet.toLowerCase()}`

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

  const campaignId = typeof body?.claimCampaignId === 'string' ? body.claimCampaignId : ''
  const wallet =
    typeof body?.wallet === 'string' && /^0x[a-fA-F0-9]{40}$/.test(body.wallet)
      ? body.wallet.toLowerCase()
      : ''
  const message = typeof body?.message === 'string' ? body.message : ''
  const signature = typeof body?.signature === 'string' ? body.signature : ''
  const lat = body?.lat != null ? Number(body.lat) : null
  const lng = body?.lng != null ? Number(body.lng) : null

  if (!campaignId || !wallet || !message || !signature.startsWith('0x')) {
    res.status(400).json({ error: 'claimCampaignId, wallet, message, signature required' })
    return
  }

  const expected = buildClaimMessage(campaignId, wallet)
  if (message !== expected) {
    res.status(400).json({ error: 'message mismatch — sign the exact template from the client' })
    return
  }

  try {
    const okSig = await verifyMessage({
      address: /** @type {`0x${string}`} */ (wallet),
      message,
      signature: /** @type {`0x${string}`} */ (signature),
    })
    if (!okSig) {
      res.status(401).json({ error: 'Invalid signature' })
      return
    }

    const sb = getServiceSupabase()
    const nowIso = new Date().toISOString()

    const { data: camp, error: cErr } = await sb
      .from('claim_campaigns')
      .select('*')
      .eq('id', campaignId)
      .lte('starts_at', nowIso)
      .gte('ends_at', nowIso)
      .maybeSingle()

    if (cErr) throw cErr
    if (!camp) {
      res.status(404).json({ error: 'Claim campaign not found or not active' })
      return
    }

    const { data: existing } = await sb
      .from('claim_redemptions')
      .select('id')
      .eq('claim_campaign_id', campaignId)
      .eq('wallet_address', wallet)
      .maybeSingle()

    if (existing) {
      res.status(409).json({ error: 'Already claimed for this wallet' })
      return
    }

    const elig = camp.eligibility && typeof camp.eligibility === 'object' ? camp.eligibility : {}
    const mode = elig.mode ?? 'open'

    if (mode === 'in_campaign') {
      const cid = elig.campaignId
      if (!cid || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        res.status(400).json({ error: 'lat and lng required for this campaign' })
        return
      }
      const { data: fences, error: fErr } = await sb
        .from('campaign_geofences')
        .select('*')
        .eq('campaign_id', cid)
      if (fErr) throw fErr
      let inside = false
      for (const f of fences ?? []) {
        if (f.shape_type === 'circle' && inCircle(lat, lng, f.center_lat, f.center_lng, f.radius_m)) {
          inside = true
          break
        }
      }
      if (!inside) {
        res.status(403).json({ error: 'Not inside required campaign area' })
        return
      }
    }

    if (elig.maxRedemptions != null) {
      const max = Number(elig.maxRedemptions)
      if (Number.isFinite(max)) {
        const { count, error: cntErr } = await sb
          .from('claim_redemptions')
          .select('id', { count: 'exact', head: true })
          .eq('claim_campaign_id', campaignId)
        if (cntErr) throw cntErr
        if ((count ?? 0) >= max) {
          res.status(403).json({ error: 'Campaign fully redeemed' })
          return
        }
      }
    }

    const { data: red, error: rErr } = await sb
      .from('claim_redemptions')
      .insert({
        claim_campaign_id: campaignId,
        wallet_address: wallet,
      })
      .select()
      .single()

    if (rErr) throw rErr

    const coupon = crypto.createHmac('sha256', couponSecret()).update(red.id).digest('hex')

    if (camp.enforcement === 'onchain') {
      res.status(200).json({
        ok: true,
        enforcement: 'onchain',
        redemptionId: red.id,
        rewardType: camp.reward_type,
        rewardPayload: camp.reward_payload ?? {},
        coupon,
        note: 'Complete the claim using the reward contract with coupon proof when deployed',
      })
      return
    }

    res.status(200).json({
      ok: true,
      enforcement: 'offchain',
      redemptionId: red.id,
      rewardType: camp.reward_type,
      rewardPayload: camp.reward_payload ?? {},
      coupon,
    })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'claim_failed' })
  }
}
