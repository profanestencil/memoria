import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  encodeFunctionData,
  http,
  type WalletClient,
} from 'viem'
import { writeContract } from 'viem/actions'
import { MEMORY_REGISTRY_ABI } from '@/lib/abi/memory-registry'
import { appChain } from '@/lib/chain'
import {
  privySendTransactionMaybeSponsored,
  type EvmMintSigner,
} from '@/lib/evmMintBridge'

const contractAddress = import.meta.env.VITE_MEMORY_REGISTRY_CONTRACT_ADDRESS as `0x${string}`

const registryRpcUrl = () =>
  appChain.id === 84532
    ? (import.meta.env.VITE_BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org')
    : (import.meta.env.VITE_BASE_RPC_URL ?? 'https://mainnet.base.org')

async function parseMemoryIdFromReceipt(hash: `0x${string}`): Promise<bigint | undefined> {
  const client = createPublicClient({
    chain: appChain,
    transport: http(registryRpcUrl()),
  })
  const receipt = await client.waitForTransactionReceipt({ hash })
  const target = contractAddress.toLowerCase()
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== target) continue
    try {
      const decoded = decodeEventLog({
        abi: MEMORY_REGISTRY_ABI,
        data: log.data,
        topics: log.topics,
      })
      if (decoded.eventName === 'MemoryMinted') {
        return decoded.args.memoryId as bigint
      }
    } catch {
      /* not this log */
    }
  }
  return undefined
}

export async function mintMemoryRegistry(
  signer: EvmMintSigner,
  walletAddress: `0x${string}`,
  args: {
    title: string
    note: string
    latitudeE7: number
    longitudeE7: number
    isPublic: boolean
  },
  options?: {
    /** Fires as soon as the tx hash is available (before waiting for confirmations). */
    onHash?: (hash: `0x${string}`) => void
  }
): Promise<{ hash: `0x${string}`; memoryId?: bigint }> {
  if (!contractAddress) {
    throw new Error(
      'Memory Registry is not configured. Deploy the MemoryRegistry contract, set VITE_MEMORY_REGISTRY_CONTRACT_ADDRESS in your env, and redeploy — or use Camera → Publish to mint an NFT instead.'
    )
  }
  const chain = appChain
  const viemArgs = [
    args.title,
    args.note,
    BigInt(args.latitudeE7),
    BigInt(args.longitudeE7),
    args.isPublic,
  ] as const

  let hash: `0x${string}`

  if (signer.type === 'privy') {
    const data = encodeFunctionData({
      abi: MEMORY_REGISTRY_ABI,
      functionName: 'mintMemory',
      args: viemArgs,
    })
    const sent = await privySendTransactionMaybeSponsored(
      signer.sendTransaction,
      { to: contractAddress, data, chainId: chain.id, from: walletAddress },
      { uiOptions: { description: 'Register this memory on-chain' } },
      signer.sponsor !== false
    )
    hash = sent.hash
  } else {
    const provider = await signer.getEthereumProvider()
    const client = createWalletClient({
      account: walletAddress,
      chain,
      transport: custom(provider as import('viem').EIP1193Provider),
    }) as WalletClient
    hash = await writeContract(client, {
      account: walletAddress,
      address: contractAddress,
      abi: MEMORY_REGISTRY_ABI,
      functionName: 'mintMemory',
      args: viemArgs,
      chain,
    })
  }

  options?.onHash?.(hash)
  const memoryId = await parseMemoryIdFromReceipt(hash)
  return { hash, memoryId }
}
