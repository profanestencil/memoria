import { getContract, type GetContractReturnType } from 'viem'
import { base } from 'wagmi/chains'
import { MEMORY_ARCHIVE_ABI } from './abi/memory-archive'

const address = import.meta.env.VITE_MEMORY_ARCHIVE_CONTRACT_ADDRESS as `0x${string}`

export const memoryArchiveAddress = address
export const memoryArchiveChainId = base.id

export function getMemoryArchiveContract(
  client: { address?: unknown; chain?: { id: number } } & { read?: unknown; write?: unknown }
): GetContractReturnType<typeof MEMORY_ARCHIVE_ABI> {
  if (!address) throw new Error('VITE_MEMORY_ARCHIVE_CONTRACT_ADDRESS not set')
  return getContract({
    address,
    abi: MEMORY_ARCHIVE_ABI,
    client: client as never,
  })
}
