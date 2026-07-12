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

export const returnQuery = (data, type) => {
    if (typeof data === 'object') {
        return `
                [out:json][timeout:60];
                (
                    way['building'](${data.bottomLeft.lat},${data.topLeft.lng},${data.topRight.lat},${data.bottomRight.lng});
                );
                out body geom;
            `
    }

    if (type === 'relation') {
        const areaId = 3600000000 + data
        return `
                [out:json][timeout:${OVERPASS_TIMEOUT}];
                (
                    way['building'](area:${areaId});
                );
                out body geom;
            `
    } else if (type === 'way') {
        return `
                [out:json][timeout:${OVERPASS_TIMEOUT}];
                way(${data});
                map_to_area->.searchArea;
                (
                    way['building'](area.searchArea);
                );
                out body geom;
            `
    } else if (type === 'node') {
        return `
                [out:json][timeout:${OVERPASS_TIMEOUT}];
                node(${data});
                (
                    way['building'](around:15000);
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

export const processBuildings = (elements) => {
    return elements.map((element) => ({
        nodes: element.geometry.map((e) => [e.lon, e.lat]),
        height: parseInt(element.tags?.['building:levels'], 10) || DEFAULT_BUILDING_LEVELS,
        center: calculateCenterCoordinates(element.geometry),
    }))
}

export const getCenters = (elements) => {
    return elements.map((e) => ({
        latitude: parseFloat(e.center.latitude),
        longitude: parseFloat(e.center.longitude),
    }))
}
