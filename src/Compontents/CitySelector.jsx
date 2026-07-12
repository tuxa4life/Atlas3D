import { useData } from "../Context/DataContext"
import SearchBar from "./UI/SearchBar"
import Tab from './Svgs/tab.svg?react'
import { useEffect, useState } from "react"
import Button from "./UI/Button"
import Checkbox from "./UI/Checkbox"
import { useError } from "../Context/ErrorContext"
import { reverseGeocodeService } from "../services/apiService"

const CitySelector = ({ setMapOpen }) => {
    const { setSelectedCity, setElevated, setShowMap } = useData()
    const { showError, setLoaderMessage, setLoaderState } = useError()
    const [open, setOpen] = useState(true)

    useEffect(() => {
        const isTypingTarget = (el) => {
            if (!el) return false
            const tag = el.tagName
            return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
        }

        const handleKeyDown = (e) => {
            // Only toggle the panel when the user isn't typing, so Tab keeps
            // moving focus normally inside the search box and other fields.
            if (e.key !== 'Tab' || isTypingTarget(e.target)) return
            e.preventDefault()
            setOpen((prev) => !prev)
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [])

    const selectPlace = (place) => {
        if (!place) return
        setSelectedCity({ id: place.id, type: place.type })
    }

    const useMyLocation = () => {
        if (!navigator.geolocation) {
            showError('Geolocation is not supported by your browser.')
            return
        }

        setLoaderState(true)
        setLoaderMessage('Locating you...')

        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const place = await reverseGeocodeService(pos.coords.latitude, pos.coords.longitude, showError)
                setLoaderState(false)
                setLoaderMessage('')
                if (place) selectPlace(place)
                else showError('Could not find a city near your location.')
            },
            (err) => {
                setLoaderState(false)
                setLoaderMessage('')
                showError(`Location error: ${err.message}`)
            },
            { timeout: 10000 },
        )
    }

    return <div style={{ zIndex: 1, position: 'fixed', top: '10px', right: '10px', padding: '20px 20px', backgroundColor: 'rgba(255, 255, 255, 0.6)', backdropFilter: 'blur(5px)', borderRadius: '3px', maxWidth: '80vw', transform: `translateX(${open ? '0px' : '101%'})`, transition: '.3s all', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }}>
        <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-label={open ? 'Collapse panel' : 'Expand panel'}
            aria-expanded={open}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.8)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.6)'}
            style={{ boxShadow: '0 2px 3px rgba(0,0,0,0.2)', transition: '.5s all', width: '30px', height: '30px', left: '-35px', position: 'absolute', top: '0', backgroundColor: 'rgba(255, 255, 255, 0.6)', backdropFilter: 'blur(5px)', border: 'none', borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
            <Tab style={{ width: '20px', height: '20px', scale: open ? '1' : '-1', }} />
        </button>

        <div style={{ margin: '0 0 8px 0' }}>
            <h4>Search for a city</h4>
            <SearchBar placeholder="Search for a city..." onSelect={selectPlace} />
            <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: '#666' }}>
                Map tiles &amp; data &copy; OpenStreetMap contributors &middot; Search by Photon
            </p>
        </div>

        <Button label='Use my location' onClick={useMyLocation} />

        <div style={{ margin: '16px 0 0 0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <Checkbox label='Ignore elevation' onChange={(checked) => setElevated(!checked)} />
            <Checkbox label='Show map ground' defaultChecked onChange={(checked) => setShowMap(checked)} />
        </div>

        <Button type="primary" label='Select from the map' onClick={() => setMapOpen(true)} />
    </div>
}

export default CitySelector
