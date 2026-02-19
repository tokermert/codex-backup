import MeshCanvas from './components/MeshCanvas'
import RightPanel from './components/RightPanel'
import Toolbar from './components/Toolbar'

export default function App() {
  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#141414',
      userSelect: 'none',
    }}>
      <Toolbar />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* ── Canvas viewport ─────────────────────────────────────────────── */}
        <div style={{
          flex: 1,
          background: '#1e1e1e',
          backgroundImage: `
            radial-gradient(circle at 20% 20%, rgba(108,99,255,0.04) 0%, transparent 60%),
            radial-gradient(circle at 80% 80%, rgba(255,100,130,0.03) 0%, transparent 60%)
          `,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          padding: 28,
          position: 'relative',
        }}>
          {/* Subtle dot grid bg */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }} />

          {/* Canvas wrapper */}
          <div style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            maxWidth: 960,
            maxHeight: 720,
            borderRadius: 10,
            overflow: 'hidden',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.06), 0 12px 48px rgba(0,0,0,0.7)',
          }}>
            <MeshCanvas />
          </div>
        </div>

        {/* ── Right panel ─────────────────────────────────────────────────── */}
        <RightPanel />
      </div>
    </div>
  )
}
