import { createConfig, http, WagmiProvider } from 'wagmi'
import { base } from 'wagmi/chains'
import { ReactNode } from 'react'

const rpcUrl = import.meta.env.VITE_BASE_RPC_URL ?? 'https://mainnet.base.org'

const config = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(rpcUrl),
  },
})

export function AppProvider({ children }: { children: ReactNode }) {
  return <WagmiProvider config={config}>{children}</WagmiProvider>
}
