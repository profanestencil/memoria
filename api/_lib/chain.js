import { createPublicClient, http } from 'viem'
import { base, baseSepolia } from 'viem/chains'

export const getIndexerEnv = () => {
  const chainName = process.env.CHAIN === 'base-sepolia' ? 'base-sepolia' : 'base'
  const chain = chainName === 'base-sepolia' ? baseSepolia : base
  const rpcUrl =
    process.env.BASE_RPC_URL ??
    (chainName === 'base-sepolia' ? 'https://sepolia.base.org' : 'https://mainnet.base.org')
  const contractAddress = process.env.MEMORY_REGISTRY_ADDRESS
  return { chain, chainName, rpcUrl, contractAddress }
}

export const getPublicClient = () => {
  const { chain, rpcUrl } = getIndexerEnv()
  return createPublicClient({ chain, transport: http(rpcUrl) })
}
