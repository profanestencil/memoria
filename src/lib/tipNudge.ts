const LS_VIEWS = 'memoria:tip:memoryViews'
const LS_MINTS = 'memoria:tip:mints'
const LS_DISMISSED = 'memoria:tip:dismissedAt'
const SS_LAST_VIEW_KEY = 'memoria:tip:lastViewedMemoryKey'

const safeGetInt = (key: string): number => {
  try {
    const raw = localStorage.getItem(key)
    const n = raw ? Number(raw) : 0
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
  } catch {
    return 0
  }
}

const safeSetInt = (key: string, value: number) => {
  try {
    localStorage.setItem(key, String(Math.max(0, Math.floor(value))))
  } catch {
    /* ignore */
  }
}

export const incrementMemoryView = (pinKey: string) => {
  try {
    const last = sessionStorage.getItem(SS_LAST_VIEW_KEY)
    if (last === pinKey) return
    sessionStorage.setItem(SS_LAST_VIEW_KEY, pinKey)
  } catch {
    /* ignore */
  }
  const next = safeGetInt(LS_VIEWS) + 1
  safeSetInt(LS_VIEWS, next)
}

export const incrementMintCount = () => {
  const next = safeGetInt(LS_MINTS) + 1
  safeSetInt(LS_MINTS, next)
}

export const markTipDismissed = () => {
  try {
    localStorage.setItem(LS_DISMISSED, new Date().toISOString())
  } catch {
    /* ignore */
  }
}

export const getTipNudgeState = (): { views: number; mints: number; dismissed: boolean } => {
  const views = safeGetInt(LS_VIEWS)
  const mints = safeGetInt(LS_MINTS)
  let dismissed = false
  try {
    dismissed = Boolean(localStorage.getItem(LS_DISMISSED))
  } catch {
    dismissed = false
  }
  return { views, mints, dismissed }
}

export const shouldAutoOpenTip = () => {
  const { views, mints, dismissed } = getTipNudgeState()
  if (dismissed) return false
  return views >= 3 || mints >= 2
}

