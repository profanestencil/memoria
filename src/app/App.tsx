import { PrivyProvider } from '@privy-io/react-auth'
import { base, baseSepolia } from 'wagmi/chains'
import { IllustMark } from '@/components/IllustMark'
import { AppProvider } from './AppProvider'
import { Router } from './Router'

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID
const chainName = import.meta.env.VITE_CHAIN === 'base-sepolia' ? 'base-sepolia' : 'base'
const chain = chainName === 'base-sepolia' ? baseSepolia : base

export function App() {
  if (!privyAppId) {
    return (
      <div className="mem-config-error" style={{ position: 'relative', minHeight: '100dvh' }}>
        <IllustMark />
        <h1>Privy app ID missing</h1>
        <p style={{ margin: '0 0 16px', color: 'var(--mem-text-muted)' }}>
          <code>VITE_PRIVY_APP_ID</code> was not set when this app was built. Vite bakes env in at{' '}
          <strong>build time</strong>, so it must be set where you deploy.
        </p>
        <p style={{ margin: '0 0 12px', color: 'var(--mem-text-muted)' }}>
          <strong>Vercel:</strong> Project → Settings → Environment Variables → add{' '}
          <code>VITE_PRIVY_APP_ID</code> (value from{' '}
          <a href="https://dashboard.privy.io">Privy dashboard</a>) → Save → Redeploy (clear build cache
          if needed).
        </p>
        <p style={{ margin: 0, color: 'var(--mem-text-muted)' }}>
          <strong>Local:</strong> add it to <code>.env</code> then run <code>npm run dev</code> or{' '}
          <code>npm run build</code>.
        </p>
      </div>
    )
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        appearance: {
          /** Rainbow first (direct app open on mobile); MetaMask. No WalletConnect as default entry. */
          walletList: ['rainbow', 'metamask'],
        },
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
        defaultChain: chain,
        supportedChains: [chain],
      }}
    >
      <AppProvider>
        <Router />
      </AppProvider>
    </PrivyProvider>
  )
}
