import { BASE_RETRY_DELAY, ELEVATION_BATCH_SIZE, MAX_RETRIES } from '../constants/dataConstants'
import COUNTRIES from '../constants/countries'
import axios from 'axios'

const getEnglishName = (tags) => tags['name:en'] || tags['int_name'] || tags['name:latin'] || tags['official_name:en'] || tags['name']

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

export const fetchCountriesService = () => {
    // Country name -> ISO code is static data, bundled locally.
    // (The former RestCountries v3.1 API is deprecated; v5 requires an API key.)
    return COUNTRIES
}

export const fetchCitiesService = async (countryCode, showError) => {
    const query = `
            [out:json][timeout:60];
            area["ISO3166-1"="${countryCode}"]->.country;
                (
                    relation["place"~"city|town"]["population"](area.country);
                    way["place"~"city|town"]["population"](area.country);
                    node["place"~"city|town"]["population"](area.country);
                );
            out tags center;
        `

    try {
        const elements = await fetchWithRetryService(
            () => postOverpassService(query),
            MAX_RETRIES,
            BASE_RETRY_DELAY,
            showError
        )

        const typeOrder = { relation: 0, way: 1, node: 2 }
        const cityMap = elements
            .sort((a, b) => {
                const typeComparison = typeOrder[a.type] - typeOrder[b.type]
                if (typeComparison !== 0) return typeComparison

                const popA = parseInt(a.tags?.population) || 0
                const popB = parseInt(b.tags?.population) || 0
                return popB - popA
            })
            .reduce((acc, e) => {
                const name = getEnglishName(e.tags)
                if (!acc[name]) {
                    acc[name] = {
                        id: e.id,
                        type: e.type,
                    }
                }
                return acc
            }, {})

        return cityMap
    } catch (err) {
        const detail = err.isOverpassBusy ? err.message : `Error ${err.response?.status || err.status || err.message} while loading cities.`
        showError(detail)
        return -1
    }
}