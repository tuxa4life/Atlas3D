import { describe, it, expect } from 'vitest'
import { lonLatToWorld, worldToLonLat, worldToTile, tileToWorld } from './mercator'

describe('lonLatToWorld', () => {
    it('maps the null island to the center of the world', () => {
        const [wx, wy] = lonLatToWorld(0, 0)
        expect(wx).toBeCloseTo(0.5, 10)
        expect(wy).toBeCloseTo(0.5, 10)
    })

    it('grows wx eastward and wy southward', () => {
        const [wxE] = lonLatToWorld(10, 0)
        const [, wyN] = lonLatToWorld(0, 45)
        expect(wxE).toBeGreaterThan(0.5) // east of Greenwich
        expect(wyN).toBeLessThan(0.5) // north of the equator -> smaller wy
    })

    it('round-trips through worldToLonLat', () => {
        const [wx, wy] = lonLatToWorld(44.8271, 41.7151) // Tbilisi
        const [lon, lat] = worldToLonLat(wx, wy)
        expect(lon).toBeCloseTo(44.8271, 8)
        expect(lat).toBeCloseTo(41.7151, 8)
    })
})

describe('tile math', () => {
    it('puts the null island on the center tile corner (slippy scheme)', () => {
        const [wx, wy] = lonLatToWorld(0, 0)
        expect(worldToTile(wx, wy, 4)).toEqual([8, 8])
    })

    it('pins the mercator clip latitude to the top edge of the world', () => {
        const [, wy] = lonLatToWorld(0, 85.0511287798)
        expect(wy).toBeCloseTo(0, 8)
    })

    it('tileToWorld inverts worldToTile', () => {
        const [wx, wy] = tileToWorld(2558, 1524, 12)
        const [tx, ty] = worldToTile(wx, wy, 12)
        expect(tx).toBeCloseTo(2558, 10)
        expect(ty).toBeCloseTo(1524, 10)
    })
})
