import { BASE_RETRY_DELAY, ELEVATION_BATCH_SIZE, MAX_RETRIES } from '../constants/dataConstants'

const OSM_TYPE_MAP = { N: 'node', W: 'way', R: 'relation' }

export const fetchWithRetryService = async (fetchFn, maxRetries = MAX_RETRIES, baseDelay = BASE_RETRY_DELAY, showError) => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fetchFn()
        } catch (err) {
            const is504 = err.response?.status === 504 || err.status === 504
            const isLastAttempt = attempt === maxRetries

            if (is504 && !isLastAttempt) {
                const delay = baseDelay * Math.pow(2, attempt)
                showError(`Server timeout (504). Retrying in ${delay / 1000}s... `)
                await new Promise((resolve) => setTimeout(resolve, delay))
            } else {
                console.log('error')
                throw err
            }
        }
    }
}

export const fetchElevationsService = async (coordinates, showError) => {
    const url = 'https://api.open-elevation.com/api/v1/lookup'
    const results = []

    try {
        for (let i = 0; i < coordinates.length; i += ELEVATION_BATCH_SIZE) {
            const batch = coordinates.slice(i, i + ELEVATION_BATCH_SIZE)
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ locations: batch }),
            })

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`)
            }

            const data = await response.json()
            results.push(...data.results)

            if (i + ELEVATION_BATCH_SIZE < coordinates.length) {
                await new Promise((resolve) => setTimeout(resolve, 100))
            }
        }

        return results
    } catch (err) {
        showError(`Error ${err} while fetching elevations.`)
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
                    value: { id: p.osm_id, type: OSM_TYPE_MAP[p.osm_type] },
                }
            })
    } catch (err) {
        showError(`Error ${err.message} while searching places.`)
        return []
    }
}