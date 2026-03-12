import { PrivyProvider } from '@privy-io/react-auth'
import { base } from 'wagmi/chains'
import { AppProvider } from './AppProvider'
import { Router } from './Router'

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID

export function App() {
  if (!privyAppId) {
    return (
      <div style={{ padding: 24, color: '#f87171' }}>
        Set VITE_PRIVY_APP_ID in .env
      </div>
    )
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
        defaultChain: base,
        supportedChains: [base],
      }}
    >
      <AppProvider>
        <Router />
      </AppProvider>
    </PrivyProvider>
  )
}
