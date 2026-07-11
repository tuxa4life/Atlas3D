import Scroll from './Svgs/scroll.svg?react'
import LeftClick from './Svgs/left-click.svg?react'
import RightClick from './Svgs/right-click.svg?react'
import Times from './Svgs/times.svg?react'

const Welcome = ({ close }) => {
    return <div style={{zIndex: 3, backgroundColor: 'rgba(255, 255, 255, 0.7)', backdropFilter: 'blur(5px)', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', padding: '20px', borderRadius: '15px', boxShadow: '0 8px 20px rgba(0,0,0,0.3)', fontFamily: 'Arial, sans-serif', maxWidth: '90vw', maxHeight: '90vh', overflow: 'auto', width: '600px' }}>
        <h2 style={{ fontSize: 'clamp(24px, 5vw, 36px)', margin: '10px 0 15px 0', fontWeight: 'bold' }}>Welcome to OSM Map Builder</h2>
        <p style={{ fontSize: 'clamp(16px, 3.5vw, 20px)', margin: '0 0 10px 0' }}>Search for a city or select an area on the map to generate a 3D model.</p>
        <div style={{ marginTop: '20px' }}>
            <h2 style={{ paddingBottom: '5px', fontSize: 'clamp(20px, 4vw, 28px)' }}>Navigation</h2>
            <ul style={{ listStyle: 'none', padding: '0', margin: '0' }}>
                <li style={{ display: 'flex', alignItems: 'center', marginTop: '10px', width: '100%', fontSize: 'clamp(14px, 3vw, 18px)' }}>
                    <Scroll style={{ height: 'clamp(24px, 5vw, 30px)', width: 'clamp(24px, 5vw, 30px)', marginRight: '10px', flexShrink: 0 }} />
                    Scroll - zoom in/out
                </li>
                <li style={{ display: 'flex', alignItems: 'center', marginTop: '10px', width: '100%', fontSize: 'clamp(14px, 3vw, 18px)' }}>
                    <LeftClick style={{ height: 'clamp(24px, 5vw, 30px)', width: 'clamp(24px, 5vw, 30px)', marginRight: '10px', flexShrink: 0 }} />
                    Left click & hold - rotate
                </li>
                <li style={{ display: 'flex', alignItems: 'center', marginTop: '10px', width: '100%', fontSize: 'clamp(14px, 3vw, 18px)' }}>
                    <RightClick style={{ height: 'clamp(24px, 5vw, 30px)', width: 'clamp(24px, 5vw, 30px)', marginRight: '10px', flexShrink: 0 }} />
                    Right Click - Move
                </li>
            </ul>
        </div>
        <Times onClick={close} style={{ height: 'clamp(24px, 5vw, 30px)', width: 'clamp(24px, 5vw, 30px)', position: 'absolute', top: '1px', right: '5px', cursor: 'pointer' }} />
    </div>
}

export default Welcome;