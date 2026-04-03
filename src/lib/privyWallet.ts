import {
  getEmbeddedConnectedWallet,
  type ConnectedWallet,
  type ConnectWalletModalOptions,
} from '@privy-io/react-auth'

/**
 * Open Privy connect with Rainbow only (mobile deep link / in-app browser),
 * avoiding the WalletConnect QR flow as the first step.
 */
export const connectRainbowWallet = (
  connectWallet: (options?: ConnectWalletModalOptions) => void
) => {
  connectWallet({ walletList: ['rainbow'] })
}

const canEthereumSign = (w: ConnectedWallet) => typeof w.getEthereumProvider === 'function'

/**
 * Wallet used for EIP-1193 signing (embedded Privy or external e.g. Rainbow / WalletConnect).
 * Prefer Privy’s embedded helper so email/social users get a signer as soon as it exists in the list.
 */
export function pickEthereumSigningWallet(
  wallets: ConnectedWallet[] | undefined
): ConnectedWallet | undefined {
  if (!wallets?.length) return undefined

  const embedded = getEmbeddedConnectedWallet(wallets)
  if (embedded && canEthereumSign(embedded)) return embedded

  const privyTagged = wallets.find((w) => w.walletClientType === 'privy' && canEthereumSign(w))
  if (privyTagged) return privyTagged

  return wallets.find(canEthereumSign)
}
