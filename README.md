# Memoria

Photo and location-based memory archive: capture a photo, mint it as an NFT on Base with geo and EXIF metadata, view pins on a Mapbox map, and open a geo-anchored AR view to see the photo at its real-world location.

## Stack

- **Frontend:** React 18, Vite, TypeScript
- **Auth & wallet:** [Privy](https://privy.io) (embedded wallet for email/social users; Rainbow, MetaMask, WalletConnect on mobile)
- **Chain:** [Base](https://base.org) (Ethereum L2)
- **Map:** Mapbox GL JS
- **AR:** WebXR + Three.js (geo-anchored plane)
- **Storage:** [Pinata](https://pinata.cloud) (client-side IPFS) for images and metadata; optional NFT.Storage fallback
- **Contracts:** `MemoryArchive` and `MemoryRegistry` (ERC-721 style minting with per-token URI or registry events, depending on the flow)
- **Indexer:** optional `indexer/` service that follows `MemoryRegistry` mints and serves `/memories` for the world map

## Setup

1. **Clone and install**

   ```bash
   git clone https://github.com/profanestencil/memoria.git
   cd memoria
   npm install
   ```

2. **Environment (app root)**

   Copy `.env.example` to `.env` and set:

   - `VITE_PRIVY_APP_ID` – [Privy dashboard](https://dashboard.privy.io)
   - `VITE_MAPBOX_ACCESS_TOKEN` – [Mapbox](https://account.mapbox.com) **public** default token (`pk.…`), not a secret token (`sk.…`)
   - `VITE_CHAIN` – `base` or `base-sepolia` (must match the network where your contracts are deployed)
   - `VITE_BASE_RPC_URL` – e.g. `https://mainnet.base.org`
   - `VITE_BASE_SEPOLIA_RPC_URL` – e.g. `https://sepolia.base.org` (when using testnet)
   - `VITE_MEMORY_ARCHIVE_CONTRACT_ADDRESS` – **MemoryArchive** (Camera → Preview publish flow and on-chain log reads)
   - `VITE_MEMORY_REGISTRY_CONTRACT_ADDRESS` – **MemoryRegistry** (Remember mint flow)
   - `VITE_INDEXER_URL` – base URL of the indexer HTTP API (default in dev: `http://localhost:8787`)
   - Pinata uploads: `VITE_PINATA_JWT` (single JWT from Pinata) **or** `VITE_PINATA_API_KEY` + `VITE_PINATA_SECRET` ([Pinata](https://pinata.cloud))
   - Optional: `VITE_NFT_STORAGE_API_KEY` – [NFT.Storage](https://nft.storage) (fallback)

   **Privy dashboard (required for wallet login, especially on mobile):**

   - Enable **Wallet** (and any other login methods you use).
   - Under **Domains**, allow your production URL and `http://localhost:5173` (or your dev port) for local testing.
   - Enable **Base** (chain id `8453` mainnet, `84532` Sepolia) so external wallets match the app’s `supportedChains`.
   - For WalletConnect on mobile browsers, ensure external wallet / WalletConnect is not blocked by your app’s login-method settings.
   - **Gas sponsorship (embedded wallets):** In the [Privy dashboard](https://dashboard.privy.io/apps?page=gas_sponsorship), turn on gas sponsorship and add **Base** / **Base Sepolia** to the allowed chains. Allow **client-initiated** sponsored transactions if mints run in the browser. The app calls `sendTransaction` with `sponsor: true` for Privy embedded signers only (Rainbow / MetaMask still pay their own gas). Optional: set `VITE_PRIVY_GAS_SPONSORSHIP=false` to disable the sponsor flag for debugging.

3. **Contracts (Base Sepolia or Base mainnet)**

   From `contracts/`:

   ```bash
   cd contracts
   npm install
   ```

   Set `PRIVATE_KEY` (deployer). Optional: `BASE_SEPOLIA_RPC` or `BASE_RPC` to override default RPC URLs in `hardhat.config.ts`.

   **MemoryArchive** (classic archive):

   ```bash
   npm run deploy:base-sepolia   # or deploy:base
   ```

   Put the printed address in `VITE_MEMORY_ARCHIVE_CONTRACT_ADDRESS`.

   **MemoryRegistry** (Remember flow + indexer):

   ```bash
   npm run deploy:memory-registry:base-sepolia   # or deploy:memory-registry:base
   ```

   Put the printed address in `VITE_MEMORY_REGISTRY_CONTRACT_ADDRESS`.

4. **Indexer (optional, for Remember / world map pins)**

   The map loads public and user memories from the indexer, which tracks **MemoryRegistry** mint events.

   ```bash
   cd indexer
   npm install
   export MEMORY_REGISTRY_ADDRESS=0xYourMemoryRegistry
   export CHAIN=base-sepolia   # or base
   # optional: export BASE_RPC_URL=https://sepolia.base.org
   npm run dev
   ```

   Point `VITE_INDEXER_URL` in the app `.env` at this service (same host/port, no trailing slash).

   After publish, the app calls `POST /memories/:memoryId/image` with the cover image URL (creator address must match the on-chain owner) so map pins and the profile “memories” grid can show thumbnails.

   **Production deploy:** This process must stay running (not Vercel static/serverless as-is). Use `indexer/Dockerfile` on Fly.io, Railway, Render, a VPS, etc. Set `MEMORY_REGISTRY_ADDRESS`, `CHAIN` (`base` or `base-sepolia`), optional `BASE_RPC_URL`, and `PORT` if the platform assigns one. Persist state with a volume: the image uses `DATA_DIR=/data` (see `indexer/src/store.js`).

5. **Run the app**

   ```bash
   npm run dev
   ```

   Open the URL (e.g. `http://localhost:5173`) on a phone or use Chrome DevTools device mode. For AR, use an AR-capable device (e.g. Android Chrome, iOS Safari with WebXR).

## User flow

1. **Permissions** – Allow location and camera.
2. **Camera** – Take a photo (branded “Memoria”).
3. **Preview** – Sign in with Privy (creates embedded wallet if needed), then **Publish**: watermarked upload to IPFS, metadata (geo, EXIF, date, author), and mint on Base via **MemoryArchive**.
4. **Remember** – Separate flow: create a memory minted through **MemoryRegistry**; with the indexer running, public memories appear on the world map.
5. **Map** – Indexer-backed pins (public in view + yours); circular thumbnails when a cover image was attached. Tap a pin for a preview card (**i** = full detail with owner + copy, **×** closes the card). After minting, the map refetches automatically.
6. **AR** – Tap **Enter AR** to start WebXR; the photo appears on a plane toward the real-world location (GPS/compass-based).

## Plan

See [docs/plans/2025-03-11-memory-archive-mobile-webapp.md](docs/plans/2025-03-11-memory-archive-mobile-webapp.md) for the full implementation plan.
