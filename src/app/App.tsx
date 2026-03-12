import { PrivyProvider } from '@privy-io/react-auth'
import { base } from 'wagmi/chains'
import { AppProvider } from './AppProvider'
import { Router } from './Router'

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID

export function App() {
  if (!privyAppId) {
    return (
      <div
        style={{
          padding: 24,
          maxWidth: 480,
          margin: '0 auto',
          color: '#fca5a5',
          lineHeight: 1.6,
        }}
      >
        <h1 style={{ fontSize: '1.125rem', marginBottom: 12 }}>Privy app ID missing</h1>
        <p style={{ marginBottom: 12 }}>
          <code style={{ color: '#e5e5e5' }}>VITE_PRIVY_APP_ID</code> was not set when this app was
          built. Vite bakes env in at <strong>build time</strong>, so it must be set where you
          deploy.
        </p>
        <p style={{ marginBottom: 8 }}>
          <strong>Vercel:</strong> Project → Settings → Environment Variables → add{' '}
          <code style={{ color: '#e5e5e5' }}>VITE_PRIVY_APP_ID</code> (value from{' '}
          <a href="https://dashboard.privy.io" style={{ color: '#93c5fd' }}>
            Privy dashboard
          </a>
          ) → Save → Deployments → Redeploy (clear build cache if needed).
        </p>
        <p>
          <strong>Local:</strong> put it in <code style={{ color: '#e5e5e5' }}>.env</code> then{' '}
          <code style={{ color: '#e5e5e5' }}>npm run dev</code> / <code style={{ color: '#e5e5e5' }}>npm run build</code>.
        </p>
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
