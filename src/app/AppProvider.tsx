import { createConfig, http, WagmiProvider } from 'wagmi'
import { base, baseSepolia } from 'wagmi/chains'
import { ReactNode } from 'react'

const baseRpcUrl = import.meta.env.VITE_BASE_RPC_URL ?? 'https://mainnet.base.org'
const baseSepoliaRpcUrl = import.meta.env.VITE_BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org'

const config = createConfig({
  chains: [base, baseSepolia],
  transports: {
    [base.id]: http(baseRpcUrl),
    [baseSepolia.id]: http(baseSepoliaRpcUrl),
  },
})

export function AppProvider({ children }: { children: ReactNode }) {
  return <WagmiProvider config={config}>{children}</WagmiProvider>
}
