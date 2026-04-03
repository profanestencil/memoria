/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRIVY_APP_ID: string
  readonly VITE_MAPBOX_ACCESS_TOKEN: string
  readonly VITE_BASE_RPC_URL: string
  readonly VITE_MEMORY_ARCHIVE_CONTRACT_ADDRESS: string
  readonly VITE_MEMORY_REGISTRY_CONTRACT_ADDRESS?: string
  readonly VITE_NFT_STORAGE_API_KEY?: string
  readonly VITE_PINATA_API_KEY?: string
  readonly VITE_PINATA_SECRET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
