import { useEffect } from 'react'
import { useControls } from '../Context/ControlsContext'
import { useData } from '../Context/DataContext'
import SearchBar from './UI/SearchBar'

// Keyboard-driven, centered search overlay. Opened with `/` or Enter (see
// ControlsHud), it lets you find and load a city without touching the mouse:
// type, arrow keys, Enter to pick, Esc to close.
const SearchPalette = () => {
    const { paletteOpen, setPaletteOpen } = useControls()
    const { setSelectedCity } = useData()

    useEffect(() => {
        if (!paletteOpen) return
        const onKeyDown = (e) => {
            if (e.key === 'Escape') setPaletteOpen(false)
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [paletteOpen, setPaletteOpen])

    if (!paletteOpen) return null

    const handleSelect = (place) => {
        if (place) setSelectedCity({ id: place.id, type: place.type })
        setPaletteOpen(false)
    }

    return (
        <div
            onMouseDown={(e) => {
                // Click on the dim backdrop (not the panel) closes the palette.
                if (e.target === e.currentTarget) setPaletteOpen(false)
            }}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 10,
                backgroundColor: 'rgba(0, 0, 0, 0.35)',
                backdropFilter: 'blur(2px)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                paddingTop: '18vh',
            }}
        >
            <div
                style={{
                    width: '480px',
                    maxWidth: '90vw',
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    borderRadius: '10px',
                    boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
                    padding: '16px',
                }}
            >
                <div style={{ fontSize: '12px', color: '#666', margin: '0 0 8px 2px' }}>
                    Search a city — ↑↓ to navigate, Enter to load, Esc to close
                </div>
                <SearchBar autoFocus onSelect={handleSelect} />
            </div>
        </div>
    )
}

export default SearchPalette
