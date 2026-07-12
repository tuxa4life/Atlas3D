import { describe, it, expect } from 'vitest'
import {
    calculateCenterCoordinates,
    returnQuery,
    processBuildings,
    scaleCoordinates,
} from './dataFunctions'
import { DEFAULT_BUILDING_LEVELS } from '../constants/dataConstants'

describe('calculateCenterCoordinates', () => {
    it('returns null for empty input', () => {
        expect(calculateCenterCoordinates([])).toBeNull()
    })

    it('averages the coordinates', () => {
        const center = calculateCenterCoordinates([
            { lat: 0, lon: 0 },
            { lat: 2, lon: 4 },
        ])
        expect(center).toEqual({ latitude: 1, longitude: 2 })
    })
})

describe('returnQuery', () => {
    it('builds a bbox query from an area object', () => {
        const q = returnQuery(
            {
                topLeft: { lat: 1, lng: 2 },
                topRight: { lat: 1, lng: 4 },
                bottomLeft: { lat: 0, lng: 2 },
                bottomRight: { lat: 0, lng: 4 },
            },
            'custom',
        )
        expect(q).toContain("way['building']")
        expect(q).toContain("relation['building']")
        expect(q).toContain("way['building:part']")
        expect(q).toContain("node['building']")
    })

    it('fetches ways, relations, building:part and nodes for every area type', () => {
        for (const [id, type] of [[123, 'relation'], [55, 'way'], [77, 'node']]) {
            const q = returnQuery(id, type)
            expect(q).toContain("way['building']")
            expect(q).toContain("relation['building']")
            expect(q).toContain("way['building:part']")
            expect(q).toContain("relation['building:part']")
            expect(q).toContain("node['building']")
        }
    })

    it('offsets relation ids into the Overpass area space', () => {
        expect(returnQuery(123, 'relation')).toContain('area:3600000123')
    })

    it('converts a way into a search area', () => {
        const q = returnQuery(55, 'way')
        expect(q).toContain('way(55)')
        expect(q).toContain('map_to_area')
    })

    it('searches around a node', () => {
        const q = returnQuery(77, 'node')
        expect(q).toContain('node(77)')
        expect(q).toContain('around:15000')
    })

    it('throws on an unknown type', () => {
        expect(() => returnQuery(1, 'bogus')).toThrow()
    })
})

describe('processBuildings', () => {
    const element = (tags) => ({
        geometry: [
            { lon: 0, lat: 0 },
            { lon: 2, lat: 2 },
            { lon: 0, lat: 2 },
        ],
        tags,
    })

    it('parses building:levels as a number', () => {
        const [b] = processBuildings([element({ 'building:levels': '5' })])
        expect(b.height).toBe(5)
        expect(b.nodes).toEqual([[0, 0], [2, 2], [0, 2]])
    })

    it('falls back to the default when levels are missing', () => {
        const [b] = processBuildings([element(undefined)])
        expect(b.height).toBe(DEFAULT_BUILDING_LEVELS)
    })

    it('falls back to the default when levels are non-numeric', () => {
        const [b] = processBuildings([element({ 'building:levels': 'abc' })])
        expect(b.height).toBe(DEFAULT_BUILDING_LEVELS)
    })

    it('extracts outer rings from a multipolygon relation and skips inner ones', () => {
        const relation = {
            type: 'relation',
            tags: { building: 'yes', 'building:levels': '4' },
            members: [
                {
                    type: 'way',
                    role: 'outer',
                    geometry: [
                        { lon: 0, lat: 0 },
                        { lon: 4, lat: 0 },
                        { lon: 4, lat: 4 },
                        { lon: 0, lat: 4 },
                    ],
                },
                {
                    type: 'way',
                    role: 'inner',
                    geometry: [
                        { lon: 1, lat: 1 },
                        { lon: 2, lat: 1 },
                        { lon: 2, lat: 2 },
                    ],
                },
            ],
        }

        const result = processBuildings([relation])
        expect(result).toHaveLength(1)
        expect(result[0].height).toBe(4)
        expect(result[0].nodes).toEqual([[0, 0], [4, 0], [4, 4], [0, 4]])
    })

    it('drops geometry with fewer than three real points and null gaps', () => {
        const clipped = {
            geometry: [{ lon: 0, lat: 0 }, null, { lon: 1, lat: 1 }],
            tags: { building: 'yes' },
        }
        expect(processBuildings([clipped])).toHaveLength(0)
    })

    it('synthesizes a square footprint for a node building', () => {
        const node = { type: 'node', lat: 10, lon: 20, tags: { building: 'yes' } }
        const [b] = processBuildings([node])
        expect(b.nodes).toHaveLength(4)
        // Square is centred on the node point.
        expect(b.center.latitude).toBeCloseTo(10, 6)
        expect(b.center.longitude).toBeCloseTo(20, 6)
        // Non-degenerate: opposite corners differ.
        expect(b.nodes[0]).not.toEqual(b.nodes[2])
    })

    it('processes building:part ways like any other footprint', () => {
        const part = {
            type: 'way',
            geometry: [{ lon: 0, lat: 0 }, { lon: 1, lat: 0 }, { lon: 1, lat: 1 }],
            tags: { 'building:part': 'yes', 'building:levels': '10' },
        }
        const [b] = processBuildings([part])
        expect(b.height).toBe(10)
        expect(b.nodes).toEqual([[0, 0], [1, 0], [1, 1]])
    })
})

describe('scaleCoordinates', () => {
    it('returns an empty result for no buildings', () => {
        expect(scaleCoordinates([])).toEqual({ buildings: [], transform: null, geoBounds: null })
    })

    it('produces scaled buildings plus a transform and geoBounds', () => {
        const { buildings, transform, geoBounds } = scaleCoordinates([
            { nodes: [[0, 0], [0.01, 0.01], [0, 0.01]], height: 3, elevation: 100 },
        ])
        expect(buildings[0]).toHaveProperty('nodes')
        expect(buildings[0]).toHaveProperty('height')
        expect(buildings[0]).toHaveProperty('elevation')
        expect(transform).toMatchObject({
            centerWx: expect.any(Number),
            centerWy: expect.any(Number),
            scale: expect.any(Number),
            verticalScale: expect.any(Number),
        })
        expect(geoBounds).toEqual({ minLon: 0, maxLon: 0.01, minLat: 0, maxLat: 0.01 })
    })

    it('keeps the renderer axis conventions: east -> +x, north -> +second coord', () => {
        const { buildings } = scaleCoordinates([
            { nodes: [[0, 0], [0.01, 0], [0, 0.01]], height: 3, elevation: 0 },
        ])
        const [origin, east, north] = buildings[0].nodes
        expect(east[0]).toBeGreaterThan(origin[0]) // east of origin -> larger x
        expect(north[1]).toBeGreaterThan(origin[1]) // north of origin -> larger z
    })

    it('scales heights against real meters (verticalScale), not world units', () => {
        // ~1.1km-wide area at the equator with targetSize 3000 -> roughly
        // 2.7 scene units per meter; a 1-level building (24m) lands near 65.
        const { buildings, transform } = scaleCoordinates([
            { nodes: [[0, 0], [0.01, 0.01], [0, 0.01]], height: 1, elevation: 0 },
        ])
        expect(buildings[0].height).toBeCloseTo(24 * transform.verticalScale, 6)
        expect(buildings[0].height).toBeGreaterThan(30)
        expect(buildings[0].height).toBeLessThan(120)
    })
})
