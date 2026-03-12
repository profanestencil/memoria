import { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.19',
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    'base-sepolia': {
      url: process.env.BASE_SEPOLIA_RPC ?? 'https://sepolia.base.org',
      chainId: 84532,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    base: {
      url: process.env.BASE_RPC ?? 'https://mainnet.base.org',
      chainId: 8453,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  paths: {
    sources: './contracts',
  },
}

export default config
