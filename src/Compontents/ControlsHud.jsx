import { useEffect } from 'react'
import { useControls } from '../Context/ControlsContext'
import { useData } from '../Context/DataContext'

const isTypingTarget = (el) =>
    !!el &&
    (el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        el.tagName === 'SELECT' ||
        el.isContentEditable)

const KEY_HINTS = [
    ['WASD', 'move'],
    ['Space / Shift', 'up / down'],
    ['Mouse', 'look'],
    ['Scroll', 'speed'],
    ['/', 'search'],
    ['M', 'map'],
    ['E', 'elevation'],
    ['Esc', 'cursor'],
]

// The keyboard layer of the hybrid UI: single-key toggles and the search
// palette shortcut act without the mouse, plus an always-on legend and a
// fly/cursor status readout.
const ControlsHud = () => {
    const { locked, speed, paletteOpen, setPaletteOpen } = useControls()
    const { setElevated, setShowMap } = useData()

    useEffect(() => {
        const onKeyDown = (e) => {
            if (isTypingTarget(e.target)) return

            // Open the search palette (mouse-free). Ignore repeats/modifiers.
            if ((e.key === '/' || e.key === 'Enter') && !paletteOpen && !e.repeat) {
                e.preventDefault()
                setPaletteOpen(true)
                return
            }

            if (paletteOpen || e.repeat) return

            if (e.code === 'KeyM') setShowMap((v) => !v)
            else if (e.code === 'KeyE') setElevated((v) => !v)
        }

        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [paletteOpen, setPaletteOpen, setElevated, setShowMap])

    const chip = {
        display: 'inline-block',
        padding: '1px 6px',
        borderRadius: '4px',
        backgroundColor: 'rgba(0,0,0,0.55)',
        color: '#fff',
        fontSize: '11px',
        fontFamily: 'monospace',
    }

    return (
        <>
            {/* Legend, bottom-center */}
            <div
                style={{
                    position: 'fixed',
                    bottom: '16px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 2,
                    display: 'flex',
                    gap: '10px',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    maxWidth: '90vw',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(255,255,255,0.5)',
                    backdropFilter: 'blur(4px)',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                    pointerEvents: 'none',
                }}
            >
                {KEY_HINTS.map(([k, label]) => (
                    <span key={k} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#222' }}>
                        <span style={chip}>{k}</span>
                        {label}
                    </span>
                ))}
            </div>

            {/* Fly / cursor status + speed, top-center */}
            <div
                style={{
                    position: 'fixed',
                    top: '12px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 2,
                    padding: '6px 12px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    color: '#fff',
                    backgroundColor: locked ? 'rgba(40,120,60,0.75)' : 'rgba(0,0,0,0.55)',
                    backdropFilter: 'blur(4px)',
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                }}
            >
                {locked ? `Flying · speed ${speed}` : 'Cursor mode · click or press W to fly'}
            </div>
        </>
    )
}

export default ControlsHud
