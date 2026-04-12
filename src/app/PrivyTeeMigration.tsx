import { useEffect, useRef } from 'react'
import { usePrivy, useMigrateWallets } from '@privy-io/react-auth'

/**
 * Privy native gas sponsorship requires TEE execution. This hook migrates on-device
 * embedded wallets when the dashboard is configured for TEEs — no-op otherwise.
 * @see https://docs.privy.io/wallets/gas-and-asset-management/gas/setup
 */
export const PrivyTeeMigration = () => {
  const { authenticated, ready } = usePrivy()
  const { migrate } = useMigrateWallets()
  const attempted = useRef(false)

  useEffect(() => {
    if (!ready || !authenticated || attempted.current) return
    attempted.current = true
    void migrate().catch(() => {
      /* not applicable or user dismissed; mint path may still use user-paid gas */
    })
  }, [ready, authenticated, migrate])

  return null
}
