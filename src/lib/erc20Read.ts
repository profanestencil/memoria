import { type Address, type PublicClient, isAddress, getAddress, erc20Abi } from 'viem'

export type Erc20Info = {
  address: Address
  symbol: string
  decimals: number
  balanceRaw: bigint
}

/**
 * Read ERC-20 symbol, decimals, and wallet balance. Uses standard ABI; some tokens use legacy returns — falls back gracefully.
 */
export const fetchErc20Info = async (
  publicClient: PublicClient,
  tokenAddress: string,
  walletAddress: Address,
): Promise<Erc20Info> => {
  const trimmed = tokenAddress.trim()
  if (!isAddress(trimmed)) throw new Error('Invalid token address')
  const address = getAddress(trimmed)

  const [decimals, balanceRaw] = await Promise.all([
    publicClient.readContract({ address, abi: erc20Abi, functionName: 'decimals' }),
    publicClient.readContract({ address, abi: erc20Abi, functionName: 'balanceOf', args: [walletAddress] }),
  ])

  let symbol = 'TOKEN'
  try {
    const s = await publicClient.readContract({ address, abi: erc20Abi, functionName: 'symbol' })
    symbol = typeof s === 'string' ? s : String(s)
  } catch {
    symbol = `${address.slice(0, 6)}…${address.slice(-4)}`
  }

  return {
    address,
    symbol: symbol.slice(0, 32),
    decimals: Number(decimals),
    balanceRaw,
  }
}
