import { createWalletClient, custom, type WalletClient } from 'viem'
import { base } from 'viem/chains'
import { writeContract } from 'viem/actions'
import { MEMORY_ARCHIVE_ABI } from './abi/memory-archive'

const contractAddress = import.meta.env.VITE_MEMORY_ARCHIVE_CONTRACT_ADDRESS as `0x${string}`

export async function mintMemory(
  getEthereumProvider: () => Promise<unknown>,
  walletAddress: `0x${string}`,
  metadataUri: string
): Promise<`0x${string}`> {
  const provider = await getEthereumProvider()
  const client = createWalletClient({
    account: walletAddress,
    chain: base,
    transport: custom(provider as import('viem').EIP1193Provider),
  }) as WalletClient
  const hash = await writeContract(client, {
    account: walletAddress,
    address: contractAddress,
    abi: MEMORY_ARCHIVE_ABI,
    functionName: 'mint',
    args: [metadataUri],
    chain: base,
  })
  return hash
}
