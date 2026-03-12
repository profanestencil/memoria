/**
 * Convert user position + heading and target lat/lng into a relative position
 * in a local ENU-like frame (meters) for placing the photo plane in AR.
 */
export interface UserPose {
  latitude: number
  longitude: number
  headingDeg: number // 0 = north, 90 = east
}

export interface TargetCoords {
  latitude: number
  longitude: number
}

const R = 6371000 // Earth radius in meters

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/**
 * Approximate distance in meters (Haversine).
 */
export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Bearing from point 1 to point 2 in degrees (0 = north, 90 = east).
 */
export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = toRad(lon2 - lon1)
  const y = Math.sin(dLon) * Math.cos(toRad(lat2))
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon)
  let b = (Math.atan2(y, x) * 180) / Math.PI
  if (b < 0) b += 360
  return b
}

/**
 * In a local tangent plane at (userLat, userLon), with X = East, Z = North (or -North for right-handed),
 * and user facing headingDeg (0 = North), return (x, z) in meters of the target relative to user.
 * Y is up. So we get (east, north) offset; then we rotate by -heading so that "forward" is where the user looks.
 * Three.js often uses Y-up, so we'll use: X = east, Z = -north (so north is -Z).
 * Position of target in user's view: forward = -Z in default Three.js camera. So we want (x, 0, z) where
 * x is right, z is forward (negative north). So east = x, north = -z.
 * Offset east = distance * sin(bearing), north = distance * cos(bearing).
 * In Three.js right-handed: X right, Y up, Z toward camera (negative). So "forward" in AR is -Z.
 * So we want: x = east, z = -north (so that north is in the -Z direction).
 * Then rotate by heading: user heading 0 = north = -Z. So we don't rotate the world; we place the plane
 * at (east, 0, -north) in world, and the camera is at origin looking at -Z. So the plane is at (dx, 0, dz)
 * where dx = east, dz = -north in a world where camera is at 0,0,0 and looks -Z. So we need to convert
 * (distance, bearing) to (x, z): x = distance * sin(bearing), z = -distance * cos(bearing).
 */
export function targetOffsetInLocalMeters(
  user: UserPose,
  target: TargetCoords
): { x: number; z: number; distance: number; bearing: number } {
  const dist = distanceMeters(user.latitude, user.longitude, target.latitude, target.longitude)
  const bear = bearingDeg(user.latitude, user.longitude, target.latitude, target.longitude)
  const bearRad = toRad(bear)
  const x = dist * Math.sin(bearRad)
  const z = -dist * Math.cos(bearRad)
  return { x, z, distance: dist, bearing: bear }
}
