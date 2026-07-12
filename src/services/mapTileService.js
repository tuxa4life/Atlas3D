import { lonLatToWorld, worldToTile, tileToWorld } from '../utils/mercator'
import { TILE_SIZE, MIN_TILE_ZOOM, MAX_TILE_ZOOM, MAX_TILES, TILE_CONCURRENCY, TILE_TIMEOUT } from '../constants/dataConstants'

const tileUrl = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`

// Tile grid covering geoBounds at zoom z.
const tileRange = (geoBounds, z) => {
    const [nwWx, nwWy] = lonLatToWorld(geoBounds.minLon, geoBounds.maxLat)
    const [seWx, seWy] = lonLatToWorld(geoBounds.maxLon, geoBounds.minLat)
    const [xMinF, yMinF] = worldToTile(nwWx, nwWy, z)
    const [xMaxF, yMaxF] = worldToTile(seWx, seWy, z)

    const n = 2 ** z
    const clamp = (v) => Math.min(n - 1, Math.max(0, Math.floor(v)))
    const xMin = clamp(xMinF)
    const yMin = clamp(yMinF)
    const xMax = clamp(xMaxF)
    const yMax = clamp(yMaxF)

    return { xMin, yMin, xMax, yMax, tilesX: xMax - xMin + 1, tilesY: yMax - yMin + 1 }
}

// Highest zoom whose tile grid fits the budget: sharp for villages, capped
// (lower zoom, not a bigger texture) for whole cities.
const pickZoom = (geoBounds) => {
    for (let z = MAX_TILE_ZOOM; z > MIN_TILE_ZOOM; z--) {
        const range = tileRange(geoBounds, z)
        if (range.tilesX * range.tilesY <= MAX_TILES) return { zoom: z, range }
    }
    return { zoom: MIN_TILE_ZOOM, range: tileRange(geoBounds, MIN_TILE_ZOOM) }
}

// Load one tile image; resolves null on error/timeout (never rejects).
const loadTile = (z, x, y) =>
    new Promise((resolve) => {
        const img = new Image()
        img.crossOrigin = 'anonymous' // required: the canvas becomes a WebGL texture
        const timer = setTimeout(() => {
            img.src = ''
            resolve(null)
        }, TILE_TIMEOUT)
        img.onload = () => {
            clearTimeout(timer)
            resolve(img)
        }
        img.onerror = () => {
            clearTimeout(timer)
            resolve(null)
        }
        img.src = tileUrl(z, x, y)
    })

// Fetches and stitches OSM raster tiles covering geoBounds into a single
// canvas. Returns { canvas, zoom, tileWorldBounds } or null on failure.
export const fetchGroundTextureService = async (geoBounds, showError) => {
    if (!geoBounds) return null

    try {
        const { zoom, range } = pickZoom(geoBounds)
        const { xMin, yMin, xMax, yMax, tilesX, tilesY } = range

        const canvas = document.createElement('canvas')
        canvas.width = tilesX * TILE_SIZE
        canvas.height = tilesY * TILE_SIZE
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#e8e6e1' // OSM land tone for any tile that fails
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        const jobs = []
        for (let x = xMin; x <= xMax; x++) {
            for (let y = yMin; y <= yMax; y++) jobs.push({ x, y })
        }

        let failed = 0
        let next = 0
        const worker = async () => {
            while (next < jobs.length) {
                const job = jobs[next++]
                let img = await loadTile(zoom, job.x, job.y)
                if (!img) img = await loadTile(zoom, job.x, job.y) // one retry
                if (img) {
                    ctx.drawImage(img, (job.x - xMin) * TILE_SIZE, (job.y - yMin) * TILE_SIZE)
                } else {
                    failed++
                }
            }
        }
        await Promise.all(Array.from({ length: Math.min(TILE_CONCURRENCY, jobs.length) }, worker))

        if (failed > jobs.length / 2) {
            throw new Error(`${failed}/${jobs.length} map tiles failed to load`)
        }

        // Exact world-space edges of the stitched image (tile-grid edges, so
        // usually slightly larger than the building bounds).
        const [wxMin, wyMin] = tileToWorld(xMin, yMin, zoom)
        const [wxMax, wyMax] = tileToWorld(xMax + 1, yMax + 1, zoom)

        return { canvas, zoom, tileWorldBounds: { wxMin, wyMin, wxMax, wyMax } }
    } catch (err) {
        showError(`Map ground unavailable: ${err.message}`)
        return null
    }
}
