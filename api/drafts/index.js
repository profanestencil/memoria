import { verifyMessage } from 'viem'
import { getStore, saveStore } from '../_lib/storeKv.js'

const toLowerAddr = (a) => (typeof a === 'string' ? a.toLowerCase() : '')

const buildDraftMessage = (draftId, wallet) =>
  `Memoria draft memory\nDraft: ${draftId}\nWallet: ${wallet.toLowerCase()}`

const endOfDayExpiryUtcSec = (clientTzOffsetMin, nowUtcMs) => {
  const off = Number(clientTzOffsetMin)
  const offsetMin = Number.isFinite(off) ? off : 0
  const nowLocalMs = nowUtcMs - offsetMin * 60_000
  const d = new Date(nowLocalMs)
  // Using UTC setters on a locally-shifted timestamp avoids locale deps.
  d.setUTCHours(24, 0, 0, 0) // next local midnight
  const bufferMs = 10 * 60_000
  const expiresUtcMs = d.getTime() + offsetMin * 60_000 + bufferMs
  return Math.floor(expiresUtcMs / 1000)
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

  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      res.status(400).json({ error: 'Invalid JSON body' })
      return
    }
  }

  const wallet =
    typeof body?.creator === 'string' && /^0x[a-fA-F0-9]{40}$/.test(body.creator)
      ? body.creator.toLowerCase()
      : ''
  const message = typeof body?.message === 'string' ? body.message : ''
  const signature = typeof body?.signature === 'string' ? body.signature : ''
  const draftId = typeof body?.draftId === 'string' ? body.draftId : ''

  const title = typeof body?.title === 'string' ? body.title.slice(0, 80) : ''
  const note = typeof body?.note === 'string' ? body.note.slice(0, 400) : ''
  const isPublic = Boolean(body?.isPublic)
  const lat = body?.lat != null ? Number(body.lat) : NaN
  const lng = body?.lng != null ? Number(body.lng) : NaN
  const mediaKind = body?.mediaKind === 'audio' ? 'audio' : 'image'
  const imageUrl = typeof body?.imageUrl === 'string' ? body.imageUrl : undefined
  const audioUrl = typeof body?.audioUrl === 'string' ? body.audioUrl : undefined
  const audioLoop = Boolean(body?.audioLoop)
  const campaignTag = typeof body?.campaignTag === 'string' ? body.campaignTag.slice(0, 120) : undefined
  const campaignId = typeof body?.campaignId === 'string' ? body.campaignId.slice(0, 80) : undefined
  const pinColor = typeof body?.pinColor === 'string' ? body.pinColor.slice(0, 32) : undefined

  const ttlMode =
    body?.ttlMode === 'CampaignEnd' || body?.ttlMode === 'NoExpiry' || body?.ttlMode === 'EndOfDay'
      ? body.ttlMode
      : 'EndOfDay'
  const clientTzOffsetMin = body?.clientTzOffsetMin
  const campaignEndsAtSec =
    body?.campaignEndsAtSec != null && Number.isFinite(Number(body.campaignEndsAtSec))
      ? Math.floor(Number(body.campaignEndsAtSec))
      : null

  if (!wallet || !message || !signature.startsWith('0x')) {
    res.status(400).json({ error: 'creator, message, signature required' })
    return
  }
  if (!draftId || !/^[0-9a-fA-F-]{16,64}$/.test(draftId)) {
    res.status(400).json({ error: 'draftId required (client-generated)' })
    return
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({ error: 'lat and lng required' })
    return
  }
  if (!title.trim()) {
    res.status(400).json({ error: 'title required' })
    return
  }
  if (mediaKind === 'audio' && !audioUrl) {
    res.status(400).json({ error: 'audioUrl required for audio drafts' })
    return
  }
  if (mediaKind === 'image' && !imageUrl) {
    res.status(400).json({ error: 'imageUrl required for photo drafts' })
    return
  }

  const expected = buildDraftMessage(draftId, wallet)
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

    const nowSec = Math.floor(Date.now() / 1000)
    let draftExpiresAt = null
    if (ttlMode === 'NoExpiry') {
      draftExpiresAt = null
    } else if (ttlMode === 'CampaignEnd' && campaignEndsAtSec && campaignEndsAtSec > nowSec) {
      draftExpiresAt = campaignEndsAtSec
    } else {
      draftExpiresAt = endOfDayExpiryUtcSec(clientTzOffsetMin, Date.now())
    }

    const store = await getStore()
    const existing = Array.isArray(store.drafts) ? store.drafts : []
    if (existing.some((d) => d?.draftId === draftId || d?.memoryId === `draft:${draftId}`)) {
      res.status(409).json({ error: 'draftId already exists' })
      return
    }
    const draft = {
      memoryId: `draft:${draftId}`,
      draftId,
      mintStatus: 'draft',
      ...(draftExpiresAt != null ? { draftExpiresAt } : {}),
      creator: wallet,
      creatorLower: toLowerAddr(wallet),
      timestamp: nowSec,
      latitude: lat,
      longitude: lng,
      isPublic,
      title: title.trim(),
      note: note.trim(),
      mediaKind,
      ...(mediaKind === 'audio' ? { audioUrl, audioLoop } : { imageUrl }),
      ...(campaignTag ? { campaignTag } : {}),
      ...(campaignId ? { campaignId } : {}),
      ...(pinColor ? { pinColor } : {}),
    }

    store.drafts = [draft, ...existing].slice(0, 4000)
    await saveStore(store)

    res.status(200).json({ ok: true, draft })
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : 'kv_unavailable' })
  }
}

