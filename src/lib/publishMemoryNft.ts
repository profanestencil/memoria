import { readExif } from '@/lib/exif'
import { watermarkImage } from '@/lib/watermark'
import {
  uploadImage,
  uploadMetadata,
  ipfsToHttp,
  type MemoryMetadata,
} from '@/lib/storage'
import { mintMemory } from '@/lib/mint'
import { getCurrentPosition } from '@/lib/geo'
import type { EvmMintSigner } from '@/lib/evmMintBridge'

export type PublishMemoryNftInput = {
  imageBlob: Blob
  /** Display title; if empty after trim, a dated fallback is used */
  title: string
  note: string
  authorLabel: string
  walletAddress: `0x${string}`
  /** Embedded wallet: Privy `sendTransaction` + sponsorship; external wallet: EIP-1193. */
  evmSigner: EvmMintSigner
  /** Active special-event campaign (metadata + indexer) */
  campaignTag?: string
  campaignId?: string
  pinColor?: string
}

export type PublishMemoryNftResult = {
  latitudeE7: number
  longitudeE7: number
  title: string
  note: string
  /** Gateway URL for the watermarked image (for indexer / map thumbnails). */
  coverImageUrl: string
}

/** Upload watermarked image + metadata to IPFS, then mint MemoryArchive (geo NFT). */
export const publishMemoryNft = async (input: PublishMemoryNftInput): Promise<PublishMemoryNftResult> => {
  const { imageBlob, title, note, authorLabel, evmSigner, walletAddress, campaignTag, campaignId, pinColor } = input

  const [coords, exif] = await Promise.all([getCurrentPosition(), readExif(imageBlob)])
  const watermarked = await watermarkImage(imageBlob)
  const imageUri = await uploadImage(watermarked)
  const captureTime = exif.date ?? new Date().toISOString()
  const name = title.trim() ? title.trim() : `Memory ${captureTime.slice(0, 10)}`
  const noteText = note.trim()

  const metadata: MemoryMetadata = {
    name,
    description: 'A memory minted on Memoria',
    image: ipfsToHttp(imageUri),
    attributes: [
      { trait_type: 'title', value: name },
      ...(noteText ? [{ trait_type: 'note', value: noteText }] : []),
      { trait_type: 'latitude', value: coords.latitude },
      { trait_type: 'longitude', value: coords.longitude },
      { trait_type: 'captureTime', value: captureTime },
      { trait_type: 'author', value: authorLabel },
      ...(exif.device ? [{ trait_type: 'device', value: exif.device }] : []),
      ...(campaignTag ? [{ trait_type: 'campaignTag', value: campaignTag }] : []),
      ...(campaignId ? [{ trait_type: 'campaignId', value: campaignId }] : []),
      ...(pinColor ? [{ trait_type: 'pinColor', value: pinColor }] : []),
    ],
  }

  const metadataUri = await uploadMetadata(metadata)
  await mintMemory(evmSigner, walletAddress, {
    metadataUri,
    title: name,
    note: noteText,
    latitudeE7: Math.round(coords.latitude * 1e7),
    longitudeE7: Math.round(coords.longitude * 1e7),
  })

  return {
    latitudeE7: Math.round(coords.latitude * 1e7),
    longitudeE7: Math.round(coords.longitude * 1e7),
    title: name,
    note: noteText,
    coverImageUrl: ipfsToHttp(imageUri),
  }
}
