import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useError } from './ErrorContext'
import { getCenters, getGeoBounds, processBuildings, returnQuery, scaleCoordinates } from '../utils/dataFunctions'
import { fetchElevationsService, fetchWithRetryService, postOverpassService } from '../services/apiService'
import { fetchGroundTextureService } from '../services/mapTileService'
import { MAX_BUILDINGS } from '../constants/dataConstants'

const DataContext = createContext()

const DataProvider = ({ children }) => {
    const { showError, setLoaderState, setLoaderMessage } = useError()

    const [buildings, setBuildings] = useState([])
    const [selectedCity, setSelectedCity] = useState(-1)
    const [elevated, setElevated] = useState(true)
    // Map ground: stitched OSM raster + the scene transform to place it under
    // the buildings, and a visibility toggle.
    const [ground, setGround] = useState(null)
    const [transform, setTransform] = useState(null)
    const [showMap, setShowMap] = useState(true)

    // Monotonic id so a slower earlier request can't overwrite a newer selection.
    const requestIdRef = useRef(0)

    const fetchWithRetry = useCallback(async (fetchFn, maxRetries, baseDelay) => await fetchWithRetryService(fetchFn, maxRetries, baseDelay, showError), [showError])

    const fetchElevations = useCallback(
        async (coordinates) => {
            setLoaderState(true)
            setLoaderMessage('Fetching building elevation data...')
            const result = await fetchElevationsService(coordinates, showError)
            return result
        },
        [setLoaderMessage, setLoaderState, showError]
    )

    const scaleOSMCoordinates = useCallback(
        (buildings, options) => {
            setLoaderState(true)
            setLoaderMessage('Scaling models to target size...')
            return scaleCoordinates(buildings, options)
        },
        [setLoaderMessage, setLoaderState]
    )

    const fetchBuildings = useCallback(async (cityId, type) => {
            const requestId = ++requestIdRef.current
            const isStale = () => requestId !== requestIdRef.current

            setLoaderState(true)
            setLoaderMessage('Fetching building nodes...')

            const query = returnQuery(cityId, type)

            try {
                const elements = await fetchWithRetry(() => postOverpassService(query))
                if (isStale()) return

                let processedBuildings = processBuildings(elements)
                if (processedBuildings.length > MAX_BUILDINGS) {
                    showError(`Large area: showing the first ${MAX_BUILDINGS.toLocaleString()} of ${processedBuildings.length.toLocaleString()} buildings.`, 5000)
                    processedBuildings = processedBuildings.slice(0, MAX_BUILDINGS)
                }

                // Tile stitching only needs lon/lat bounds, so it runs in
                // parallel with the elevation fetch. A tile failure degrades to
                // no ground rather than failing the model.
                const geoBounds = getGeoBounds(processedBuildings)
                const centers = getCenters(processedBuildings)
                const [elevations, groundData] = await Promise.all([
                    fetchElevations(centers),
                    fetchGroundTextureService(geoBounds, showError),
                ])
                if (isStale()) return

                const processedElevatedBuildings = processedBuildings.map((b, i) => ({ ...b, elevation: elevations[i]?.elevation }))
                const scaled = scaleOSMCoordinates(processedElevatedBuildings)

                if (isStale()) return
                setTransform(scaled.transform)
                setGround(groundData)
                setBuildings(scaled.buildings)
            } catch (err) {
                if (isStale()) return
                setLoaderState(false)
                const detail = err.isOverpassBusy ? err.message : `Error ${err.response?.status || err.status || err.message} while fetching buildings.`
                showError(detail)
                return -1
            }
        },
        [fetchWithRetry, fetchElevations, scaleOSMCoordinates, setLoaderMessage, setLoaderState, showError]
    )

    useEffect(() => {
        if (selectedCity !== -1) {
            fetchBuildings(selectedCity.id, selectedCity.type)
        }
    }, [selectedCity, fetchBuildings])

    const contextValue = useMemo(
        () => ({
            buildings,
            setSelectedCity,
            elevated,
            setElevated,
            fetchBuildings,
            ground,
            transform,
            showMap,
            setShowMap,
        }),
        [buildings, elevated, fetchBuildings, ground, transform, showMap]
    )

    return <DataContext.Provider value={contextValue}>{children}</DataContext.Provider>
}

export const useData = () => {
    const context = useContext(DataContext)
    if (!context) {
        throw new Error('useData must be used within a DataProvider')
    }
    return context
}

export { DataProvider }
export default DataContext
