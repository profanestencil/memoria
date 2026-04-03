import { createWalletClient, custom, type WalletClient } from 'viem'
import { writeContract } from 'viem/actions'
import { MEMORY_REGISTRY_ABI } from '@/lib/abi/memory-registry'
import { appChain } from '@/lib/chain'

const contractAddress = import.meta.env.VITE_MEMORY_REGISTRY_CONTRACT_ADDRESS as `0x${string}`

export async function mintMemoryRegistry(
  getEthereumProvider: () => Promise<unknown>,
  walletAddress: `0x${string}`,
  args: {
    title: string
    note: string
    latitudeE7: number
    longitudeE7: number
    isPublic: boolean
  }
): Promise<{ hash: `0x${string}`; memoryId?: bigint }> {
  if (!contractAddress) {
    throw new Error(
      'Memory Registry is not configured. Deploy the MemoryRegistry contract, set VITE_MEMORY_REGISTRY_CONTRACT_ADDRESS in your env, and redeploy — or use Camera → Publish to mint an NFT instead.'
    )
  }
  const provider = await getEthereumProvider()
  const chain = appChain
  const client = createWalletClient({
    account: walletAddress,
    chain,
    transport: custom(provider as import('viem').EIP1193Provider),
  }) as WalletClient

  const hash = await writeContract(client, {
    account: walletAddress,
    address: contractAddress,
    abi: MEMORY_REGISTRY_ABI,
    functionName: 'mintMemory',
    args: [args.title, args.note, BigInt(args.latitudeE7), BigInt(args.longitudeE7), args.isPublic],
    chain,
  })

  return { hash }
}

