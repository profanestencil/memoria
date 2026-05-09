/** Small preview map (Mapbox Static Images API). */
export const buildMapboxStaticPreviewUrl = (
  accessToken: string,
  lat: number,
  lng: number,
  width = 360,
  height = 140
) => {
  const zoom = 14
  const overlay = `pin-s+e8c547(${lng},${lat})`
  const center = `${lng},${lat},${zoom},0`
  return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${overlay}/${center}/${width}x${height}@2x?access_token=${encodeURIComponent(accessToken)}`
}
