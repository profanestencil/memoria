# Memoria

Photo and location-based memory archive: capture a photo, mint it as an NFT on Base with geo and EXIF metadata, view pins on a Mapbox map, and open a geo-anchored AR view to see the photo at its real-world location.

## Stack

- **Frontend:** React 18, Vite, TypeScript
- **Auth & wallet:** [Privy](https://privy.io) (embedded wallet, auto-created on login)
- **Chain:** [Base](https://base.org) (Ethereum L2)
- **Map:** Mapbox GL JS
- **AR:** WebXR + Three.js (geo-anchored plane)
- **Storage:** NFT.Storage (client-side IPFS) for images and metadata
- **Contract:** ERC-721 (OpenZeppelin) with per-token URI; minting on Base

## Setup

1. **Clone and install**

   ```bash
   git clone https://github.com/profanestencil/memoria.git
   cd memoria
   npm install
   ```

2. **Environment**

   Copy `.env.example` to `.env` and set:

   - `VITE_PRIVY_APP_ID` – [Privy dashboard](https://dashboard.privy.io)
   - `VITE_MAPBOX_ACCESS_TOKEN` – [Mapbox](https://account.mapbox.com)
   - `VITE_BASE_RPC_URL` – e.g. `https://mainnet.base.org` or `https://sepolia.base.org`
   - `VITE_MEMORY_ARCHIVE_CONTRACT_ADDRESS` – after deploying the contract
   - `VITE_NFT_STORAGE_API_KEY` – [NFT.Storage](https://nft.storage) (for uploads)

3. **Deploy the contract (Base Sepolia or Base mainnet)**

   ```bash
   cd contracts
   npm install
   # Set PRIVATE_KEY and optionally BASE_SEPOLIA_RPC or BASE_RPC
   npm run deploy:base-sepolia   # or deploy:base
   ```

   Put the printed contract address into `VITE_MEMORY_ARCHIVE_CONTRACT_ADDRESS`.

4. **Run the app**

   ```bash
   npm run dev
   ```

   Open the URL (e.g. `http://localhost:5173`) on a phone or use Chrome DevTools device mode. For AR, use an AR-capable device (e.g. Android Chrome, iOS Safari with WebXR).

## User flow

1. **Permissions** – Allow location and camera.
2. **Camera** – Take a photo (branded “Memoria”).
3. **Preview** – Sign in with Privy (creates embedded wallet if needed), then **Publish**.
4. **Publish** – Photo is watermarked, uploaded to IPFS, metadata (geo, EXIF, date, author) is stored, and an NFT is minted on Base to your wallet.
5. **Map** – Pins show your minted memories; tap a pin to open AR.
6. **AR** – Tap “Enter AR” to start WebXR; the photo appears on a plane at the real-world location (GPS/compass-based).

## Plan

See [docs/plans/2025-03-11-memory-archive-mobile-webapp.md](docs/plans/2025-03-11-memory-archive-mobile-webapp.md) for the full implementation plan.
