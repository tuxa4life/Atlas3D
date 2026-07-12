import { DEFAULT_BUILDING_LEVELS, OVERPASS_TIMEOUT } from '../constants/dataConstants'
import { lonLatToWorld, EARTH_CIRCUMFERENCE } from './mercator'

export const calculateCenterCoordinates = (coords) => {
    if (!coords.length) return null

    const total = coords.reduce(
        (acc, { lat, lon }) => {
            acc.lat += lat
            acc.lon += lon
            return acc
        },
        { lat: 0, lon: 0 }
    )

    return {
        latitude: parseFloat((total.lat / coords.length).toFixed(4)),
        longitude: parseFloat((total.lon / coords.length).toFixed(4)),
    }
}

// The set of building geometries selected within a given Overpass filter
// (bbox / area / around). Kept in one place so every query branch stays in
// sync. Covers: simple way footprints, multipolygon relations (courtyards /
// complex footprints), `building:part` (Simple 3D Buildings — used for
// landmarks like cathedrals and monuments), and standalone building nodes.
// `out geom` attaches geometry to ways directly and to each relation member.
const buildingSelectors = (filter) => `
                    way['building'](${filter});
                    relation['building'](${filter});
                    way['building:part'](${filter});
                    relation['building:part'](${filter});
                    node['building'](${filter});`

export const returnQuery = (data, type) => {
    if (typeof data === 'object') {
        const bbox = `${data.bottomLeft.lat},${data.topLeft.lng},${data.topRight.lat},${data.bottomRight.lng}`
        return `
                [out:json][timeout:60];
                (${buildingSelectors(bbox)}
                );
                out body geom;
            `
    }

    if (type === 'relation') {
        const areaId = 3600000000 + data
        return `
                [out:json][timeout:${OVERPASS_TIMEOUT}];
                (${buildingSelectors(`area:${areaId}`)}
                );
                out body geom;
            `
    } else if (type === 'way') {
        return `
                [out:json][timeout:${OVERPASS_TIMEOUT}];
                way(${data});
                map_to_area->.searchArea;
                (${buildingSelectors('area.searchArea')}
                );
                out body geom;
            `
    } else if (type === 'node') {
        return `
                [out:json][timeout:${OVERPASS_TIMEOUT}];
                node(${data});
                (${buildingSelectors('around:15000')}
                );
                out body geom;
            `
    } else {
        throw new Error(`Invalid type: ${type}. Must be 'relation', 'way', or 'node'`)
    }
}

// lon/lat bounds of a set of processed buildings (pre-scaling). Used both by
// scaleCoordinates and to kick off the map-tile fetch in parallel with the
// elevation fetch.
export const getGeoBounds = (buildings) => {
    if (!buildings?.length) return null

    return buildings.reduce(
        (acc, building) => {
            building.nodes.forEach(([lon, lat]) => {
                acc.minLon = Math.min(acc.minLon, lon)
                acc.maxLon = Math.max(acc.maxLon, lon)
                acc.minLat = Math.min(acc.minLat, lat)
                acc.maxLat = Math.max(acc.maxLat, lat)
            })
            return acc
        },
        { minLon: Infinity, maxLon: -Infinity, minLat: Infinity, maxLat: -Infinity }
    )
}

// Projects buildings into normalized Web-Mercator world space (the same
// projection map tiles use, so the ground raster aligns pixel-perfectly),
// then scales into scene units. Returns the transform so other layers (the
// map ground) can be placed in the identical scene frame.
export const scaleCoordinates = (buildings, options = {}) => {
    const { targetSize = 3000, metersPerLevel = 24 } = options

    if (!buildings?.length) {
        return { buildings: [], transform: null, geoBounds: null }
    }

    const geoBounds = getGeoBounds(buildings)
    const minElevation = buildings.reduce(
        (min, b) => (b.elevation != null ? Math.min(min, b.elevation) : min),
        Infinity
    )

    const [wxMin, wyMin] = lonLatToWorld(geoBounds.minLon, geoBounds.maxLat) // NW corner
    const [wxMax, wyMax] = lonLatToWorld(geoBounds.maxLon, geoBounds.minLat) // SE corner

    const centerWx = (wxMin + wxMax) / 2
    const centerWy = (wyMin + wyMax) / 2
    const maxSpanWorld = Math.max(wxMax - wxMin, wyMax - wyMin)
    const scale = targetSize / maxSpanWorld // scene units per world unit

    // Mercator world units -> ground meters shrink with latitude; heights and
    // elevations are real meters, so they get their own scale to keep the
    // buildings' proportions correct.
    const centerLat = (geoBounds.minLat + geoBounds.maxLat) / 2
    const metersPerWorldUnit = EARTH_CIRCUMFERENCE * Math.cos((centerLat * Math.PI) / 180)
    const verticalScale = scale / metersPerWorldUnit // scene units per real meter

    const scaledBuildings = buildings.map((building) => {
        const scaledNodes = building.nodes.map(([lon, lat]) => {
            const [wx, wy] = lonLatToWorld(lon, lat)
            // Same axis conventions the renderer already uses: x behaves like
            // longitude (east+), the second component like latitude (north+),
            // hence the sign flip on wy (which grows south).
            const x = (wx - centerWx) * scale
            const z = -(wy - centerWy) * scale
            return [x, z]
        })

        const y = building.elevation != null ? (building.elevation - minElevation) * verticalScale : 0

        const levelsToMeters = (building.height || DEFAULT_BUILDING_LEVELS) * metersPerLevel
        const scaledHeight = levelsToMeters * verticalScale

        return {
            nodes: scaledNodes,
            height: scaledHeight,
            elevation: y,
        }
    })

    return {
        buildings: scaledBuildings,
        transform: { centerWx, centerWy, scale, verticalScale, minElevation },
        geoBounds,
    }
}

// Turns a raw Overpass geometry list ({lat,lon}[]) into one processed building.
// Overpass can emit null entries where a way is clipped at the query bounds, so
// they're filtered out; rings with fewer than 3 real points are unrenderable.
const buildingFromGeometry = (geometry, levels) => {
    const points = (geometry || []).filter(Boolean)
    if (points.length < 3) return null

    return {
        nodes: points.map((e) => [e.lon, e.lat]),
        height: levels,
        center: calculateCenterCoordinates(points),
    }
}

// A node tagged as a building carries no footprint, so synthesize a small
// square around it. Half-extent in metres, converted to degrees (longitude is
// scaled by latitude); this is a placeholder shape, not the real outline.
const NODE_BUILDING_HALF_METRES = 8
const METRES_PER_DEGREE_LAT = 111320

const squareAroundPoint = (lat, lon) => {
    const dLat = NODE_BUILDING_HALF_METRES / METRES_PER_DEGREE_LAT
    const dLon = NODE_BUILDING_HALF_METRES / (METRES_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180) || 1)
    return [
        { lon: lon - dLon, lat: lat - dLat },
        { lon: lon + dLon, lat: lat - dLat },
        { lon: lon + dLon, lat: lat + dLat },
        { lon: lon - dLon, lat: lat + dLat },
    ]
}

export const processBuildings = (elements) => {
    const buildings = []

    for (const element of elements) {
        const levels = parseInt(element.tags?.['building:levels'], 10) || DEFAULT_BUILDING_LEVELS

        if (element.type === 'relation') {
            // Multipolygon building (incl. building:part): each 'outer' member
            // way is a footprint ring. Inner rings (courtyards/holes) are
            // skipped — the renderer extrudes solid footprints, so holes can't
            // be represented anyway.
            for (const member of element.members || []) {
                if (member.type !== 'way' || member.role !== 'outer') continue
                const building = buildingFromGeometry(member.geometry, levels)
                if (building) buildings.push(building)
            }
        } else if (element.type === 'node') {
            // Point-only building: render a small default square placeholder.
            if (element.lat == null || element.lon == null) continue
            const building = buildingFromGeometry(squareAroundPoint(element.lat, element.lon), levels)
            if (building) buildings.push(building)
        } else {
            // Simple way footprint (building or building:part).
            const building = buildingFromGeometry(element.geometry, levels)
            if (building) buildings.push(building)
        }
    }

    return buildings
}

export const getCenters = (elements) => {
    return elements.map((e) => ({
        latitude: parseFloat(e.center.latitude),
        longitude: parseFloat(e.center.longitude),
    }))
}
