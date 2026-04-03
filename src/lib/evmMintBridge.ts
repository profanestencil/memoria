/**
 * Privy embedded-wallet sends that support native gas sponsorship
 * (Dashboard → Gas sponsorship + `sponsor: true` on `sendTransaction`).
 * External wallets (Rainbow, MetaMask) keep using EIP-1193 + viem.
 */
export type PrivyEmbeddedSendTransaction = (
  tx: {
    to: `0x${string}`
    data: `0x${string}`
    chainId: number
    from?: `0x${string}`
  },
  options?: {
    sponsor?: boolean
    uiOptions?: { description?: string; header?: string; buttonText?: string }
  }
) => Promise<{ hash: `0x${string}` }>

export type EvmMintSigner =
  | {
      type: 'eip1193'
      getEthereumProvider: () => Promise<unknown>
    }
  | {
      type: 'privy'
      sendTransaction: PrivyEmbeddedSendTransaction
      /** @default true when using type privy */
      sponsor?: boolean
    }
