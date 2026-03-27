import { useState } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { pickEthereumSigningWallet } from '@/lib/privyWallet'
import { walletAvatarBackground } from '@/lib/walletAvatar'
import { UserProfileModal } from '@/components/UserProfileModal'

type Props = {
  /** Extra left offset if header has other controls */
  style?: React.CSSProperties
}

export function WalletProfileButton({ style }: Props) {
  const { authenticated } = usePrivy()
  const { wallets } = useWallets()
  const signingWallet = pickEthereumSigningWallet(wallets)
  const addr = signingWallet?.address
  const [open, setOpen] = useState(false)

  if (!authenticated || !addr) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open profile and wallet"
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          border: '2px solid rgba(232, 197, 71, 0.45)',
          background: walletAvatarBackground(addr),
          cursor: 'pointer',
          flexShrink: 0,
          padding: 0,
          boxShadow: '0 2px 12px rgba(0,0,0,0.35)',
          ...style,
        }}
      />
      <UserProfileModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
