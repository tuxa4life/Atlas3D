import { createContext, useContext, useState, useMemo } from 'react'

// Shared state between the 3D fly-controller (ThreeScene) and the React
// navigation overlays (search palette, HUD): whether the pointer is locked
// (fly mode), the current fly speed, and whether the search palette is open.
const ControlsContext = createContext()

const ControlsProvider = ({ children }) => {
    const [locked, setLocked] = useState(false)
    const [speed, setSpeed] = useState(0)
    const [paletteOpen, setPaletteOpen] = useState(false)

    const value = useMemo(
        () => ({ locked, setLocked, speed, setSpeed, paletteOpen, setPaletteOpen }),
        [locked, speed, paletteOpen]
    )

    return <ControlsContext.Provider value={value}>{children}</ControlsContext.Provider>
}

export const useControls = () => {
    const context = useContext(ControlsContext)
    if (!context) {
        throw new Error('useControls must be used within a ControlsProvider')
    }
    return context
}

export { ControlsProvider }
export default ControlsContext
