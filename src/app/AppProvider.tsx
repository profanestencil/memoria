import { createConfig, http, WagmiProvider } from 'wagmi'
import { base, baseSepolia } from 'wagmi/chains'
import { ReactNode } from 'react'
import { IllustMark } from '@/components/IllustMark'
import { appChain } from '@/lib/chain'

const baseRpcUrl = import.meta.env.VITE_BASE_RPC_URL ?? 'https://mainnet.base.org'
const baseSepoliaRpcUrl = import.meta.env.VITE_BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org'

const config =
  appChain.id === baseSepolia.id
    ? createConfig({
        chains: [baseSepolia],
        transports: {
          [baseSepolia.id]: http(baseSepoliaRpcUrl),
        },
      })
    : createConfig({
        chains: [base],
        transports: {
          [base.id]: http(baseRpcUrl),
        },
      })

export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      {children}
      <IllustMark />
    </WagmiProvider>
  )
}
