export {}

declare global {
  // Minimal globals used by the app. Use `any` because 8th Wall ships runtime globals.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const XR8: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Window {
    XR8?: any
  }
}

