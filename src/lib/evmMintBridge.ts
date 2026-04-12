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

/**
 * Native gas sponsorship from the browser does not use PRIVY_APP_SECRET (server-only).
 * Privy requires dashboard settings (client-initiated sponsorship + TEE wallets) — see
 * https://docs.privy.io/wallets/gas-and-asset-management/gas/setup
 * If sponsorship is misconfigured, Privy errors; we retry with user-paid gas.
 */
export const privySendTransactionMaybeSponsored = async (
  send: PrivyEmbeddedSendTransaction,
  tx: Parameters<PrivyEmbeddedSendTransaction>[0],
  ui: NonNullable<Parameters<PrivyEmbeddedSendTransaction>[1]>,
  wantSponsor: boolean
): Promise<{ hash: `0x${string}` }> => {
  if (!wantSponsor) {
    return send(tx, { ...ui, sponsor: false })
  }
  try {
    return await send(tx, { ...ui, sponsor: true })
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).toLowerCase()
    const looksLikeSponsorConfig =
      msg.includes('app secret') || msg.includes('gas transaction')
    if (looksLikeSponsorConfig) {
      return send(tx, { ...ui, sponsor: false })
    }
    throw e
  }
}
