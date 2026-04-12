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
   - `VITE_CHAIN` – `base` (mainnet, default in `.env.example`) or `base-sepolia` (testnet). **Vercel:** set `VITE_CHAIN=base` for mainnet and redeploy. Serverless `/api/*` uses `CHAIN` if set, otherwise the same value as `VITE_CHAIN`, so mainnet works with a single `VITE_CHAIN=base` if you prefer not to duplicate `CHAIN`.
   - `VITE_BASE_RPC_URL` – e.g. `https://mainnet.base.org`
   - `VITE_BASE_SEPOLIA_RPC_URL` – e.g. `https://sepolia.base.org` (when using testnet)
   - `VITE_MEMORY_ARCHIVE_CONTRACT_ADDRESS` – **MemoryArchive** (Camera → Preview publish flow and on-chain log reads)
   - `VITE_MEMORY_REGISTRY_CONTRACT_ADDRESS` – **MemoryRegistry** (Remember mint flow)
   - `VITE_INDEXER_URL` – base URL of the indexer HTTP API (default in dev: `http://localhost:8787`)
   - Pinata uploads: `VITE_PINATA_JWT` (single JWT from Pinata) **or** `VITE_PINATA_API_KEY` + `VITE_PINATA_SECRET` ([Pinata](https://pinata.cloud))
   - Optional: `VITE_NFT_STORAGE_API_KEY` – [NFT.Storage](https://nft.storage) (fallback)
   - **Admin / runtime API (Vercel):** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (from [Supabase](https://supabase.com) → Project Settings → API), and `ADMIN_SESSION_SECRET` (long random string, min 16 chars). Never expose the service role key to the browser.

   **Supabase CLI — link this repo to your hosted project**

   The repo includes `supabase/config.toml` and migrations under `supabase/migrations/`. To attach your local checkout to a remote project and apply SQL:

   1. Install CLI if needed: `npm i -g supabase` (or use `npx supabase@latest`).
   2. `supabase login` (opens the browser to authorize the CLI).
   3. In the [dashboard](https://supabase.com/dashboard), open your project → **Project Settings → General** and copy **Reference ID** (the subdomain in `https://<ref>.supabase.co`).
   4. From the app root:  
      `npx supabase@latest link --project-ref <YOUR_REF> --password '<DATABASE_PASSWORD>'`  
      Use the **database password** from **Project Settings → Database** (not the anon or service_role JWT). If you never saved it, reset it there first.
   5. Push pending migrations: `npx supabase@latest db push`  
      (Or run each file manually in **SQL Editor** if you prefer not to use the CLI.)

   **Privy dashboard (required for wallet login, especially on mobile):**

   - Enable **Wallet** (and any other login methods you use).
   - Under **Domains**, allow your production URL and `http://localhost:5173` (or your dev port) for local testing.
   - Enable **Base** (chain id `8453` mainnet, `84532` Sepolia) so external wallets match the app’s `supportedChains`.
   - For WalletConnect on mobile browsers, ensure external wallet / WalletConnect is not blocked by your app’s login-method settings.
   - **Gas sponsorship (embedded wallets):** In the [Privy dashboard](https://dashboard.privy.io/apps?page=gas_sponsorship), turn on gas sponsorship and add **Base** / **Base Sepolia** to the allowed chains. Allow **client-initiated** sponsored transactions if mints run in the browser. Native sponsorship [requires TEE wallets](https://docs.privy.io/wallets/gas-and-asset-management/gas/setup); the app runs Privy’s wallet migration on login when applicable. **Vercel:** set `VITE_PRIVY_GAS_SPONSORSHIP=true` (or leave unset; only `false` disables) and redeploy. Sponsored gas is billed in **Privy**, not Vercel. The app calls `sendTransaction` with `sponsor: true` for Privy embedded signers only (Rainbow / MetaMask still pay their own gas). Optional: set `VITE_PRIVY_GAS_SPONSORSHIP=false` to force user-paid gas for debugging.

   **Switching to a new Privy app** (new App ID): The client only reads `VITE_PRIVY_APP_ID` (build-time). Server routes use `PRIVY_APP_SECRET` (and may read `VITE_PRIVY_APP_ID` for the same app). In the **new** Privy app, mirror the old app’s settings so behavior matches: **Allowed domains** (production + localhost), **chains** (Base mainnet `8453` and/or Sepolia `84532` to match `VITE_CHAIN`), **login methods** (Wallet, email, etc.), **embedded wallets** / **gas sponsorship** as before. Generate a new **App secret** in the new app, set `PRIVY_APP_SECRET` on Vercel (and locally if you use `/api`), update `VITE_PRIVY_APP_ID` everywhere you build, then **redeploy** the frontend so the bundle picks up the new ID.

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
   export CHAIN=base   # or base-sepolia; same as app VITE_CHAIN (or set VITE_CHAIN instead of CHAIN)
   # optional: export BASE_RPC_URL=https://mainnet.base.org
   npm run dev
   ```

   Point `VITE_INDEXER_URL` in the app `.env` at this service (same host/port, no trailing slash).

   After publish, the app calls `POST /memories/:memoryId/image` with the cover image URL (creator address must match the on-chain owner) so map pins and the profile “memories” grid can show thumbnails.

   **Production on Vercel (same project as the SPA):** The repo includes serverless routes under `api/` plus `vercel.json` rewrites so the app can keep using `VITE_INDEXER_URL=https://your-deployment.vercel.app` (no `/api` prefix; `/memories` and `/health` are rewritten). Do this in the Vercel dashboard:

   1. **Storage → Create Redis** (Upstash). That injects `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (older KV stores may still expose `KV_REST_API_URL` / `KV_REST_API_TOKEN`; both work).
   2. **Environment variables:** `MEMORY_REGISTRY_ADDRESS`; **`CHAIN=base`** for mainnet (or `base-sepolia` for testnet), or omit `CHAIN` and rely on **`VITE_CHAIN`** (API resolves `CHAIN` → `VITE_CHAIN` → default `base`). Set **`VITE_CHAIN`** to the same network as production (baked in at build time). Optional `BASE_RPC_URL`, **`CRON_SECRET`** (any random string). Vercel Cron calls `/api/cron/sync` every minute and sends `Authorization: Bearer <CRON_SECRET>` when `CRON_SECRET` is set.
   3. Redeploy. Optional: open `https://your-app.vercel.app/api/cron/sync` once with the Bearer header to seed `lastBlock` immediately (or wait for the first cron tick).

   **Production elsewhere (long-running Node):** Use `indexer/Dockerfile` on Fly.io, Railway, Render, a VPS, etc. Set `MEMORY_REGISTRY_ADDRESS`, `CHAIN` or `VITE_CHAIN` (same resolution as the API), optional `BASE_RPC_URL`, and `PORT`. Mount a volume at `/data` (`DATA_DIR=/data`, see `indexer/src/store.js`).

5. **Run the app**

   ```bash
   npm run dev
   ```

   Open the URL (e.g. `http://localhost:5173`) on a phone or use Chrome DevTools device mode. For AR, use an AR-capable device (e.g. Android Chrome, iOS Safari with WebXR).

   **AR engine assets:** The app self-hosts the 8th Wall Engine Binary (`xr.js`) under `public/external/xr/`. `npm install` / `npm run dev` will copy these assets automatically via `scripts/copy-8thwall-assets.mjs`.

## User flow

1. **Permissions** – Allow location and camera.
2. **Camera** – Take a photo (branded “Memoria”).
3. **Preview** – Sign in with Privy (creates embedded wallet if needed), then **Publish**: watermarked upload to IPFS, metadata (geo, EXIF, date, author), and mint on Base via **MemoryArchive**.
4. **Remember** – Separate flow: create a memory minted through **MemoryRegistry**; with the indexer running, public memories appear on the world map.
5. **Map** – Indexer-backed pins (public in view + yours); circular thumbnails when a cover image was attached. Tap a pin for a preview card (**i** = full detail with owner + copy, **×** closes the card). After minting, the map refetches automatically.
6. **AR** – Tap **Enter AR** to start WebXR; the photo appears on a plane toward the real-world location (GPS/compass-based).

## Plan

See [docs/plans/2025-03-11-memory-archive-mobile-webapp.md](docs/plans/2025-03-11-memory-archive-mobile-webapp.md) for the full implementation plan.
