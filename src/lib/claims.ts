import { appApiUrl } from '@/lib/apiBase'

export const buildRuntimeClaimMessage = (claimCampaignId: string, wallet: string) =>
  `Memoria reward claim\nCampaign: ${claimCampaignId}\nWallet: ${wallet.toLowerCase()}`

export type RuntimeClaimResult = {
  ok: boolean
  enforcement?: string
  redemptionId?: string
  rewardType?: string
  rewardPayload?: Record<string, unknown>
  coupon?: string
  note?: string
  error?: string
}

export const submitRuntimeClaim = async (input: {
  claimCampaignId: string
  wallet: `0x${string}`
  message: string
  signature: `0x${string}`
  lat?: number
  lng?: number
}): Promise<RuntimeClaimResult> => {
  const res = await fetch(appApiUrl('/api/runtime/claim'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      claimCampaignId: input.claimCampaignId,
      wallet: input.wallet,
      message: input.message,
      signature: input.signature,
      ...(input.lat != null ? { lat: input.lat } : {}),
      ...(input.lng != null ? { lng: input.lng } : {}),
    }),
  })
  const j = (await res.json()) as RuntimeClaimResult & { error?: string }
  if (!res.ok) {
    return { ok: false, error: j.error ?? `HTTP ${res.status}` }
  }
  const { error: _e, ok: _ok, ...rest } = j
  return { ok: true, ...rest }
}
