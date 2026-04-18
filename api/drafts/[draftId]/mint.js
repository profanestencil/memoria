import { verifyMessage } from 'viem'
import { getStore } from '../../_lib/storeKv.js'

const toLowerAddr = (a) => (typeof a === 'string' ? a.toLowerCase() : '')

const buildDraftMintMessage = (draftId, wallet) =>
  `Memoria mint draft\nDraft: ${draftId}\nWallet: ${wallet.toLowerCase()}`

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

  const draftId = typeof req.query.draftId === 'string' ? req.query.draftId : ''
  if (!draftId) {
    res.status(400).json({ error: 'draftId required' })
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
    typeof body?.wallet === 'string' && /^0x[a-fA-F0-9]{40}$/.test(body.wallet) ? body.wallet.toLowerCase() : ''
  const message = typeof body?.message === 'string' ? body.message : ''
  const signature = typeof body?.signature === 'string' ? body.signature : ''

  if (!wallet || !message || !signature.startsWith('0x')) {
    res.status(400).json({ error: 'wallet, message, signature required' })
    return
  }

  const expected = buildDraftMintMessage(draftId, wallet)
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

    const store = await getStore()
    const drafts = Array.isArray(store.drafts) ? store.drafts : []
    const draft =
      drafts.find((d) => d?.draftId === draftId || d?.memoryId === `draft:${draftId}`) ??
      null
    if (!draft) {
      res.status(404).json({ error: 'Draft not found (expired or never created)' })
      return
    }
    if (toLowerAddr(draft.creator) !== wallet) {
      res.status(403).json({ error: 'wallet does not own this draft' })
      return
    }

    // Client-driven mint for now: return the draft payload needed to call the onchain mint functions.
    // The client will mint and then the indexer cron will ingest the minted memoryId.
    res.status(200).json({ ok: true, draft, note: 'Mint client-side using wallet and then refresh map.' })
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : 'kv_unavailable' })
  }
}

