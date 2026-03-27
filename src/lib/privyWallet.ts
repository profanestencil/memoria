import type { ConnectedWallet } from '@privy-io/react-auth'

/**
 * Wallet used for EIP-1193 signing (embedded Privy or external e.g. Rainbow / WalletConnect).
 * Prefer embedded when present so email/social users who also linked an external wallet keep prior behavior.
 */
export function pickEthereumSigningWallet(
  wallets: ConnectedWallet[] | undefined
): ConnectedWallet | undefined {
  if (!wallets?.length) return undefined
  const canSign = (w: ConnectedWallet) => typeof w.getEthereumProvider === 'function'
  const embedded = wallets.find((w) => w.walletClientType === 'privy' && canSign(w))
  if (embedded) return embedded
  return wallets.find(canSign)
}
