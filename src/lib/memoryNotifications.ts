export type MemoryActivityKind =
  | 'minted'
  | 'collected'
  | 'engaged'
  | 'purchased'
  | 'reworked'
  | 'dueted'

export type MemoryActivityNotice = {
  id: string
  kind: MemoryActivityKind
  userLabel: string
  locationLabel: string
  thumbUrl?: string
  lat: number
  lng: number
  at: number
  /** Lower = higher priority (proximity-weighted). */
  priority: number
}

const listeners = new Set<(items: MemoryActivityNotice[]) => void>()
let queue: MemoryActivityNotice[] = []

const emit = () => {
  const sorted = [...queue].sort((a, b) => a.priority - b.priority || b.at - a.at)
  listeners.forEach((fn) => fn(sorted))
}

export const subscribeMemoryActivity = (fn: (items: MemoryActivityNotice[]) => void) => {
  listeners.add(fn)
  fn([...queue].sort((a, b) => a.priority - b.priority || b.at - a.at))
  return () => {
    listeners.delete(fn)
  }
}

export const dismissMemoryActivity = (id: string) => {
  queue = queue.filter((n) => n.id !== id)
  emit()
}

const activityCopy = (kind: MemoryActivityKind): string => {
  switch (kind) {
    case 'minted':
      return 'minted a memory'
    case 'collected':
      return 'collected a memory'
    case 'engaged':
      return 'engaged with a memory'
    case 'purchased':
      return 'purchased a drop'
    case 'reworked':
      return 're-worked a memory'
    case 'dueted':
      return 'dueted a memory'
    default:
      return 'added a memory'
  }
}

export const formatMemoryActivityLine = (n: MemoryActivityNotice): string => {
  const verb = activityCopy(n.kind)
  const where = n.locationLabel ? ` in ${n.locationLabel}` : ''
  return `${n.userLabel} ${verb}${where}`
}

export const pushMemoryActivityNotice = (
  notice: Omit<MemoryActivityNotice, 'id' | 'at' | 'priority'> & {
    id?: string
    at?: number
    priority?: number
    distanceM?: number | null
  }
) => {
  const id = notice.id ?? `${notice.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const at = notice.at ?? Date.now()
  const dist = notice.distanceM
  const priority =
    notice.priority ??
    (dist != null && Number.isFinite(dist) ? Math.max(0, Math.round(dist)) : 500)

  const entry: MemoryActivityNotice = {
    id,
    kind: notice.kind,
    userLabel: notice.userLabel,
    locationLabel: notice.locationLabel,
    thumbUrl: notice.thumbUrl,
    lat: notice.lat,
    lng: notice.lng,
    at,
    priority,
  }

  queue = [entry, ...queue.filter((q) => q.id !== id)].slice(0, 6)
  emit()

  window.setTimeout(() => {
    queue = queue.filter((q) => q.id !== id)
    emit()
  }, 5200)
}

export const activityKindForPin = (pin: {
  mintStatus?: string
}): MemoryActivityKind => (pin.mintStatus === 'draft' ? 'collected' : 'minted')
