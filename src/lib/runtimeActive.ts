import { appApiUrl } from '@/lib/apiBase'

export type CampaignOverlay = {
  id: string
  overlayType: string
  assetUrl: string
  position: string
  opacity: number
  scale: number
}

export type ActiveCampaign = {
  id: string
  name: string
  slug: string
  tag: string
  pinColor: string
  priority: number
  startsAt: string
  endsAt: string
  overlays: CampaignOverlay[]
}

export type RuntimePoi = {
  id: string
  name: string
  lat: number
  lng: number
  iconUrl: string | null
  tapAction: string
  payload: Record<string, unknown>
  startsAt: string
  endsAt: string
}

export type RuntimeArScene = {
  id: string
  name: string
  lat: number
  lng: number
  geoRadiusM: number
  sceneType: string
  scenePayload: Record<string, unknown>
  startsAt: string
  endsAt: string
}

export type RuntimeClaimCampaign = {
  id: string
  name: string
  enforcement: string
  eligibility: Record<string, unknown>
  rewardType: string
  rewardPayload: Record<string, unknown>
  startsAt: string
  endsAt: string
}

export type ActiveRuntimeResponse = {
  ok: boolean
  configured?: boolean
  now?: string
  campaigns: ActiveCampaign[]
  pois: RuntimePoi[]
  arScenes: RuntimeArScene[]
  claimCampaigns: RuntimeClaimCampaign[]
  hint?: string
}

export const fetchRuntimeActive = async (lat: number, lng: number, nowMs?: number): Promise<ActiveRuntimeResponse> => {
  const raw = appApiUrl('/api/runtime/active')
  const u = raw.startsWith('http') ? new URL(raw) : new URL(raw, window.location.origin)
  u.searchParams.set('lat', String(lat))
  u.searchParams.set('lng', String(lng))
  if (nowMs != null) u.searchParams.set('now', String(nowMs))
  const res = await fetch(u.toString())
  const j = (await res.json()) as ActiveRuntimeResponse
  if (!res.ok) {
    return {
      ok: false,
      configured: false,
      campaigns: [],
      pois: [],
      arScenes: [],
      claimCampaigns: [],
    }
  }
  return {
    ok: Boolean(j.ok),
    configured: j.configured,
    now: j.now,
    campaigns: j.campaigns ?? [],
    pois: j.pois ?? [],
    arScenes: j.arScenes ?? [],
    claimCampaigns: j.claimCampaigns ?? [],
    hint: j.hint,
  }
}
