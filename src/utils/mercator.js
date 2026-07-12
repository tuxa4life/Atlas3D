// Web-Mercator (EPSG:3857) helpers, in normalized "world" coordinates:
// (wx, wy) ∈ [0, 1] spans the whole globe and is exactly slippy-tile space,
// so tile alignment is true by construction. wx grows east, wy grows SOUTH.

// Equatorial circumference in meters — converts normalized world units to
// ground meters at a given latitude: metersPerWorldUnit = C * cos(lat).
export const EARTH_CIRCUMFERENCE = 40075016.686

export const lonLatToWorld = (lon, lat) => {
    const latRad = (lat * Math.PI) / 180
    const wx = (lon + 180) / 360
    const wy = (1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2
    return [wx, wy]
}

export const worldToLonLat = (wx, wy) => {
    const lon = wx * 360 - 180
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * wy)))
    return [lon, (latRad * 180) / Math.PI]
}

// tile <-> world at zoom z (2**z tiles across the world)
export const worldToTile = (wx, wy, z) => [wx * 2 ** z, wy * 2 ** z]
export const tileToWorld = (tx, ty, z) => [tx / 2 ** z, ty / 2 ** z]
