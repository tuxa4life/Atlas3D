import { MapContainer, TileLayer } from 'react-leaflet'
import { useState } from 'react'
import 'leaflet/dist/leaflet.css'
import Button from './UI/Button'
import AreaSelector from './AreaSelector'
import { useData } from '../Context/DataContext'

const OSMap = ({ setMapOpen }) => {
    const [isSelecting, setIsSelecting] = useState(false)
    const [selectedArea, setSelectedArea] = useState(null)

    const { fetchBuildings, setModelName } = useData()

    const handleAreaSelected = (bounds) => setSelectedArea(bounds)

    const handleSubmit = () => {
        if (!selectedArea) return
        const [a, b] = selectedArea
        const coordinates = {
            topLeft: { lat: Math.max(a[0], b[0]), lng: Math.min(a[1], b[1]) },
            topRight: { lat: Math.max(a[0], b[0]), lng: Math.max(a[1], b[1]) },
            bottomLeft: { lat: Math.min(a[0], b[0]), lng: Math.min(a[1], b[1]) },
            bottomRight: { lat: Math.min(a[0], b[0]), lng: Math.max(a[1], b[1]) }
        }

        setModelName('custom-area')
        fetchBuildings(coordinates, 'custom')
        setMapOpen(false)
    }

    return (
        <div style={{ zIndex: 5, minWidth: '80%', minHeight: '80vh', position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', padding: '20px 20px', backgroundColor: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(5px)', borderRadius: '7px', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }}>
            <div style={{ border: '2px rgba(115,115,115,.5) solid', position: 'relative' }}>
                <MapContainer center={[41.7151, 44.8271]} zoom={2} style={{ height: '80vh', width: '100%', cursor: isSelecting ? 'crosshair' : 'grab' }}>
                    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <AreaSelector setIsSelecting={setIsSelecting} isSelecting={isSelecting} onAreaSelected={handleAreaSelected} selectedArea={selectedArea} setSelectedArea={setSelectedArea} />
                </MapContainer>

                <Button label={isSelecting ? 'Cancel Selection' : 'Select Area'} onClick={() => setIsSelecting(!isSelecting)} styles={{ position: 'absolute', top: '5px', right: '15px', zIndex: 1000, padding: '8px 16px', fontSize: '18px', width: 'fit-content' }} type={isSelecting ? 'basic' : 'primary'} />

                {selectedArea && <Button label='Remove' onClick={() => setSelectedArea(null)} styles={{ position: 'absolute', top: '50px', right: '15px', zIndex: 1000, padding: '8px 16px', fontSize: '18px', width: 'fit-content', color: 'red' }} />}
            </div>

            <div style={{ display: 'flex', justifyContent: 'right' }}>
                <Button label='Submit' onClick={handleSubmit} styles={{ width: '40%', margin: '20px 10px 5px 10px' }} type='primary' disabled={!selectedArea} />
                <Button label='Close' onClick={() => setMapOpen(false)} styles={{ width: '40%', margin: '20px 0 5px 10px' }} />
            </div>
        </div>
    )
}

export default OSMap