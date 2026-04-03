import { createWalletClient, custom, type WalletClient } from 'viem'
import { writeContract } from 'viem/actions'
import { appChain } from './chain'
import { MEMORY_ARCHIVE_ABI } from './abi/memory-archive'

const contractAddress = import.meta.env.VITE_MEMORY_ARCHIVE_CONTRACT_ADDRESS as `0x${string}`

export async function mintMemory(
  getEthereumProvider: () => Promise<unknown>,
  walletAddress: `0x${string}`,
  args: {
    metadataUri: string
    title: string
    note: string
    latitudeE7: number | bigint
    longitudeE7: number | bigint
  }
): Promise<`0x${string}`> {
  if (!contractAddress) {
    throw new Error('VITE_MEMORY_ARCHIVE_CONTRACT_ADDRESS not set')
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
    abi: MEMORY_ARCHIVE_ABI,
    functionName: 'mint',
    args: [
      args.metadataUri,
      args.title,
      args.note,
      typeof args.latitudeE7 === 'bigint' ? args.latitudeE7 : BigInt(args.latitudeE7),
      typeof args.longitudeE7 === 'bigint' ? args.longitudeE7 : BigInt(args.longitudeE7),
    ],
    chain,
  })
  return hash
}
