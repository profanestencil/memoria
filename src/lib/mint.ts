import { createWalletClient, custom, encodeFunctionData, type WalletClient } from 'viem'
import { writeContract } from 'viem/actions'
import { appChain } from './chain'
import { MEMORY_ARCHIVE_ABI } from './abi/memory-archive'
import { privySendTransactionMaybeSponsored, type EvmMintSigner } from './evmMintBridge'

const contractAddress = import.meta.env.VITE_MEMORY_ARCHIVE_CONTRACT_ADDRESS as `0x${string}`

export async function mintMemory(
  signer: EvmMintSigner,
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
  const chain = appChain
  const lat =
    typeof args.latitudeE7 === 'bigint' ? args.latitudeE7 : BigInt(args.latitudeE7)
  const lng =
    typeof args.longitudeE7 === 'bigint' ? args.longitudeE7 : BigInt(args.longitudeE7)
  const viemArgs = [args.metadataUri, args.title, args.note, lat, lng] as const

  if (signer.type === 'privy') {
    const data = encodeFunctionData({
      abi: MEMORY_ARCHIVE_ABI,
      functionName: 'mint',
      args: viemArgs,
    })
    const { hash } = await privySendTransactionMaybeSponsored(
      signer.sendTransaction,
      { to: contractAddress, data, chainId: chain.id, from: walletAddress },
      { uiOptions: { description: 'Mint your memory on Base' } },
      signer.sponsor !== false
    )
    return hash
  }

  const provider = await signer.getEthereumProvider()
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
    args: viemArgs,
    chain,
  })
  return hash
}
