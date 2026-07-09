import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { useError } from './ErrorContext'
import { getCenters, processBuildings, returnQuery, scaleCoordinates } from '../utils/dataFunctions'
import { fetchCitiesService, fetchCountriesService, fetchElevationsService, fetchWithRetryService, postOverpassService } from '../services/apiService'

const DataContext = createContext()

const DataProvider = ({ children }) => {
    const { showError, setLoaderState, setLoaderMessage } = useError()

    const [fetching, setFetching] = useState(false)
    const [buildings, setBuildings] = useState([])
    const [countries, setCountries] = useState({})
    const [selectedCountry, setSelectedCountry] = useState('')
    const [cities, setCities] = useState({})
    const [selectedCity, setSelectedCity] = useState(-1)
    const [mesh, setMesh] = useState(null)
    const [elevated, setElevated] = useState(true)

    const fetchWithRetry = useCallback(async (fetchFn, maxRetries, baseDelay) => await fetchWithRetryService(fetchFn, maxRetries, baseDelay, showError), [showError])

    const fetchCountries = useCallback(() => {
        setCountries(fetchCountriesService())
    }, [])

    const fetchCities = useCallback(
        async (countryCode) => {
            const result = await fetchCitiesService(countryCode, showError)
            setCities(result)
        },
        [showError]
    )

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
            setLoaderState(true)
            setLoaderMessage('Fetching building nodes...')

            const query = returnQuery(cityId, type)

            try {
                const elements = await fetchWithRetry(() => postOverpassService(query))

                const processedBuildings = processBuildings(elements)
                const centers = getCenters(processedBuildings)
                const elevations = await fetchElevations(centers)
                const processedElevatedBuildings = processedBuildings.map((b, i) => ({ ...b, elevation: elevations[i]?.elevation }))
                const scaledBuildings = scaleOSMCoordinates(processedElevatedBuildings)

                setBuildings(scaledBuildings)
            } catch (err) {
                setLoaderState(false)
                const detail = err.isOverpassBusy ? err.message : `Error ${err.response?.status || err.status || err.message} while fetching buildings.`
                showError(detail)
                return -1
            }
        },
        [fetchWithRetry, fetchElevations, scaleOSMCoordinates, setLoaderMessage, setLoaderState, showError]
    )

    const selectCountry = useCallback((country) => {
        setCities({})
        setSelectedCountry(country)
    }, [])

    useEffect(() => {
        fetchCountries()
    }, [fetchCountries])

    useEffect(() => {
        if (selectedCountry) {
            setFetching(true)
            fetchCities(selectedCountry).finally(() => setFetching(false))
        }
    }, [selectedCountry, fetchCities])

    useEffect(() => {
        if (selectedCity !== -1) {
            fetchBuildings(selectedCity.id, selectedCity.type)
        }
    }, [selectedCity, fetchBuildings])

    const contextValue = useMemo(
        () => ({
            mesh,
            setMesh,
            fetching,
            buildings,
            countries,
            cities,
            setSelectedCity,
            selectCountry,
            elevated,
            setElevated,
            fetchBuildings,
        }),
        [mesh, fetching, buildings, countries, cities, elevated, selectCountry, fetchBuildings]
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
