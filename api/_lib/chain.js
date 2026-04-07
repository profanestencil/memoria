import { createPublicClient, http } from 'viem'
import { base, baseSepolia } from 'viem/chains'

/** Prefer CHAIN (server); fall back to VITE_CHAIN so Vercel can use one network var with the SPA build. */
const resolveChainName = () => {
  const raw = (process.env.CHAIN ?? process.env.VITE_CHAIN ?? '').toString().trim().toLowerCase()
  return raw === 'base-sepolia' ? 'base-sepolia' : 'base'
}

export const getIndexerEnv = () => {
  const chainName = resolveChainName()
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
