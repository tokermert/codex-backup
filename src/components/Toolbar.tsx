import { useState } from 'react'
import { store } from '../mesh/store'
import ExportModal from './ExportModal'

const toolBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  padding: '5px 10px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 5,
  color: 'rgba(255,255,255,0.65)',
  cursor: 'pointer',
  fontSize: 12,
  lineHeight: 1,
}

export default function Toolbar() {
  const [exportOpen, setExportOpen] = useState(false)

  return (
    <>
      <div style={{
        height: 44,
        background: '#1a1a1a',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
        gap: 8,
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginRight: 6 }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="1" y="1" width="7" height="7" rx="1.5" fill="#7c6fff" opacity="0.9"/>
            <rect x="10" y="1" width="7" height="7" rx="1.5" fill="#ff6b8a" opacity="0.9"/>
            <rect x="1" y="10" width="7" height="7" rx="1.5" fill="#43e8a0" opacity="0.9"/>
            <rect x="10" y="10" width="7" height="7" rx="1.5" fill="#f9a03c" opacity="0.9"/>
          </svg>
          <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em' }}>
            Mesh Editor
          </span>
        </div>

        <div style={{ flex: 1 }} />

        <button onClick={() => store.undo()} title="Undo (Cmd+Z)" style={toolBtn}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2.5 7C2.5 4.515 4.515 2.5 7 2.5c1.65 0 3.1.9 3.87 2.23" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            <path d="M2.5 3.5V7H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        <button onClick={() => store.redo()} title="Redo (Cmd+Shift+Z)" style={toolBtn}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M11.5 7C11.5 4.515 9.485 2.5 7 2.5c-1.65 0-3.1.9-3.87 2.23" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            <path d="M11.5 3.5V7H8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />

        <button
          onClick={() => setExportOpen(true)}
          style={{ ...toolBtn, color: 'rgba(255,255,255,0.85)', borderColor: 'rgba(132,125,255,0.45)', background: 'rgba(126,118,255,0.16)' }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M6.5 1v7M4 6l2.5 2.5L9 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M1 10v1.5a.5.5 0 00.5.5h10a.5.5 0 00.5-.5V10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          Export
        </button>
      </div>

      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} />
    </>
  )
}

