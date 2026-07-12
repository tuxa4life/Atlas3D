import { BASE_RETRY_DELAY, ELEVATION_BATCH_SIZE, MAX_RETRIES } from '../constants/dataConstants'
import axios from 'axios'

const OSM_TYPE_MAP = { N: 'node', W: 'way', R: 'relation' }

export const fetchWithRetryService = async (fetchFn, maxRetries = MAX_RETRIES, baseDelay = BASE_RETRY_DELAY, showError) => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fetchFn()
        } catch (err) {
            const status = err.response?.status || err.status
            // 504: gateway timeout. 429 / isOverpassBusy: Overpass rate limit
            // (it often replies 200 with an HTML/XML "too many requests" body).
            const isRetryable = status === 504 || status === 429 || err.isOverpassBusy
            const isLastAttempt = attempt === maxRetries

            if (isRetryable && !isLastAttempt) {
                const delay = baseDelay * Math.pow(2, attempt)
                const reason = status === 504 ? 'Server timeout (504)' : 'Overpass API is busy'
                showError(`${reason}. Retrying in ${delay / 1000}s... `)
                await new Promise((resolve) => setTimeout(resolve, delay))
            } else {
                throw err
            }
        }
    }
}

// Posts an Overpass QL query and returns the parsed elements. Overpass frequently
// answers rate limits with HTTP 200 and an HTML/XML body instead of JSON, which
// would otherwise surface as a confusing generic error, so validate the shape here.
export const postOverpassService = async (query) => {
    const response = await axios.post('https://overpass-api.de/api/interpreter', query, {
        headers: { 'Content-Type': 'text/plain' },
    })

    const elements = response.data?.elements
    if (!Array.isArray(elements)) {
        const err = new Error('Overpass API is busy (rate limited). Please wait a moment and try again.')
        err.isOverpassBusy = true
        throw err
    }

    return elements
}

// open-elevation accepts large batches but is frequently slow/down.
const OPEN_ELEVATION_URL = 'https://api.open-elevation.com/api/v1/lookup'
// open-meteo is more reliable but caps each request at 100 coordinates.
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/elevation'
const OPEN_METEO_MAX = 100

const fetchBatchFromOpenElevation = async (batch) => {
    const response = await fetch(OPEN_ELEVATION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations: batch }),
    })

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    return data.results.map((r) => ({ elevation: r.elevation }))
}

const fetchBatchFromOpenMeteo = async (batch) => {
    const results = []

    for (let i = 0; i < batch.length; i += OPEN_METEO_MAX) {
        const chunk = batch.slice(i, i + OPEN_METEO_MAX)
        const latitudes = chunk.map((c) => c.latitude).join(',')
        const longitudes = chunk.map((c) => c.longitude).join(',')

        const response = await fetch(`${OPEN_METEO_URL}?latitude=${latitudes}&longitude=${longitudes}`)

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()
        results.push(...data.elevation.map((e) => ({ elevation: e })))
    }

    return results
}

export const fetchElevationsService = async (coordinates, showError) => {
    const results = []
    let usedFallback = false

    try {
        for (let i = 0; i < coordinates.length; i += ELEVATION_BATCH_SIZE) {
            const batch = coordinates.slice(i, i + ELEVATION_BATCH_SIZE)

            let batchResults
            try {
                batchResults = await fetchBatchFromOpenElevation(batch)
            } catch {
                // open-elevation failed for this batch; fall back to open-meteo.
                usedFallback = true
                batchResults = await fetchBatchFromOpenMeteo(batch)
            }
            results.push(...batchResults)

            if (i + ELEVATION_BATCH_SIZE < coordinates.length) {
                await new Promise((resolve) => setTimeout(resolve, 100))
            }
        }

        if (usedFallback) {
            showError('Primary elevation service unavailable; used fallback provider.')
        }

        return results
    } catch (err) {
        showError(`Error ${err} while fetching elevations. Rendering without elevation.`)
        return []
    }
}

export const searchPlacesService = async (query, showError) => {
    const params = new URLSearchParams({ q: query, limit: '8', lang: 'en' })
    // Restrict results to populated places (cities, towns, villages).
    params.append('osm_tag', 'place:city')
    params.append('osm_tag', 'place:town')
    params.append('osm_tag', 'place:village')

    try {
        const response = await fetch(`https://photon.komoot.io/api?${params.toString()}`)

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()

        return (data.features || [])
            .filter((f) => OSM_TYPE_MAP[f.properties?.osm_type])
            .map((f) => {
                const p = f.properties
                const label = [p.name, p.state, p.country].filter(Boolean).join(', ')
                return {
                    text: label,
                    value: { id: p.osm_id, type: OSM_TYPE_MAP[p.osm_type], name: p.name },
                }
            })
    } catch (err) {
        showError(`Error ${err.message} while searching places.`)
        return []
    }
}

// Reverse-geocode a lat/lon to the nearest populated place (for "use my location").
export const reverseGeocodeService = async (lat, lon, showError) => {
    const params = new URLSearchParams({ lat, lon, limit: '10', lang: 'en' })

    try {
        const response = await fetch(`https://photon.komoot.io/reverse?${params.toString()}`)

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()

        // Prefer an actual city/town/village; fall back to the nearest mappable feature.
        const features = (data.features || []).filter((f) => OSM_TYPE_MAP[f.properties?.osm_type])
        const place =
            features.find((f) => ['city', 'town', 'village'].includes(f.properties?.osm_value)) ||
            features[0]

        if (!place) return null

        const p = place.properties
        return { id: p.osm_id, type: OSM_TYPE_MAP[p.osm_type], name: p.name }
    } catch (err) {
        showError(`Error ${err.message} while locating you.`)
        return null
    }
}