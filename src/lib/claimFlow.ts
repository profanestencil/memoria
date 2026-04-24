import { createWalletClient, custom, type Address } from 'viem'
import { getCurrentPosition } from '@/lib/geo'
import { buildRuntimeClaimMessage, submitRuntimeClaim, type RuntimeClaimResult } from '@/lib/claims'

export async function runClaim(input: {
  claimCampaignId: string
  wallet: `0x${string}`
  getEthereumProvider: () => Promise<unknown>
}): Promise<RuntimeClaimResult> {
  const msg = buildRuntimeClaimMessage(input.claimCampaignId, input.wallet)
  const provider = await input.getEthereumProvider()
  const client = createWalletClient({ transport: custom(provider as any) })
  const signature = await client.signMessage({
    account: input.wallet as Address,
    message: msg,
  })
  const pos = await getCurrentPosition()
  return submitRuntimeClaim({
    claimCampaignId: input.claimCampaignId,
    wallet: input.wallet,
    message: msg,
    signature,
    lat: pos.latitude,
    lng: pos.longitude,
  })
}

