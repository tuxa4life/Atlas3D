import { describe, it, expect, vi, afterEach } from 'vitest'
import { searchPlacesService, reverseGeocodeService } from './apiService'

const mockFetchOnce = (body, ok = true) => {
    global.fetch = vi.fn().mockResolvedValue({
        ok,
        status: ok ? 200 : 500,
        json: async () => body,
    })
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('searchPlacesService', () => {
    it('maps Photon osm_type letters to names and keeps the place name', async () => {
        mockFetchOnce({
            features: [
                { properties: { osm_type: 'R', osm_id: 1, name: 'Delft', state: 'South Holland', country: 'Netherlands' } },
                { properties: { osm_type: 'N', osm_id: 2, name: 'Small Town', country: 'Nowhere' } },
            ],
        })

        const results = await searchPlacesService('delft', () => {})

        expect(results).toEqual([
            { text: 'Delft, South Holland, Netherlands', value: { id: 1, type: 'relation', name: 'Delft' } },
            { text: 'Small Town, Nowhere', value: { id: 2, type: 'node', name: 'Small Town' } },
        ])
    })

    it('drops features with an unmappable osm_type', async () => {
        mockFetchOnce({
            features: [
                { properties: { osm_type: 'X', osm_id: 9, name: 'Weird' } },
                { properties: { osm_type: 'W', osm_id: 3, name: 'Wayville' } },
            ],
        })

        const results = await searchPlacesService('x', () => {})
        expect(results).toHaveLength(1)
        expect(results[0].value).toEqual({ id: 3, type: 'way', name: 'Wayville' })
    })

    it('reports an error and returns an empty list on failure', async () => {
        mockFetchOnce({}, false)
        const showError = vi.fn()

        const results = await searchPlacesService('boom', showError)

        expect(results).toEqual([])
        expect(showError).toHaveBeenCalled()
    })
})

describe('reverseGeocodeService', () => {
    it('prefers an actual city/town/village over other features', async () => {
        mockFetchOnce({
            features: [
                { properties: { osm_type: 'N', osm_id: 10, osm_value: 'house', name: 'A House' } },
                { properties: { osm_type: 'R', osm_id: 11, osm_value: 'city', name: 'Metropolis' } },
            ],
        })

        const place = await reverseGeocodeService(1, 2, () => {})
        expect(place).toEqual({ id: 11, type: 'relation', name: 'Metropolis' })
    })

    it('returns null when nothing mappable is found', async () => {
        mockFetchOnce({ features: [{ properties: { osm_type: 'X', osm_id: 1 } }] })
        const place = await reverseGeocodeService(1, 2, () => {})
        expect(place).toBeNull()
    })
})
