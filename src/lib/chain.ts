import { base, baseSepolia } from 'viem/chains'

const chainName = import.meta.env.VITE_CHAIN === 'base-sepolia' ? 'base-sepolia' : 'base'

export const appChain = chainName === 'base-sepolia' ? baseSepolia : base
