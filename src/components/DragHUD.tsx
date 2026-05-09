'use client'

interface DragHUDProps {
  elapsedMs: number
  speed: number
  fouled: boolean
  reactionTimeMs: number | null
  splits: number[]
  topSpeed: number
}

function formatTime(ms: number): string {
  const seconds = ms / 1000
  return seconds.toFixed(2)
}

export function DragHUD({
  elapsedMs,
  speed,
  fouled,
  reactionTimeMs,
  splits,
  topSpeed,
}: DragHUDProps) {
  return (
    <div style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 56,
          fontWeight: 800,
          letterSpacing: 2,
          textShadow: '0 2px 6px rgba(0,0,0,0.5)',
        }}
      >
        {formatTime(elapsedMs)}s
      </div>

      <div
        style={{
          position: 'absolute',
          top: 90,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 10,
          alignItems: 'center',
        }}
      >
        {fouled && (
          <span
            style={{
              padding: '4px 8px',
              borderRadius: 4,
              background: '#991b1b',
              color: '#fff',
              fontWeight: 700,
              fontSize: 12,
            }}
          >
            JUMPED
          </span>
        )}
        <span style={{ fontSize: 12, opacity: 0.8 }}>
          Reaction:{' '}
          {reactionTimeMs === null
            ? '--'
            : `${(reactionTimeMs / 1000).toFixed(2)}s`}
        </span>
      </div>

      <div
        style={{
          position: 'absolute',
          right: 16,
          top: 16,
          padding: '6px 10px',
          background: 'rgba(0,0,0,0.55)',
          borderRadius: 6,
          fontSize: 14,
          minWidth: 120,
        }}
      >
        <div style={{ opacity: 0.7, fontSize: 11 }}>Speed</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>
          {speed.toFixed(1)}
        </div>
        <div style={{ opacity: 0.7, fontSize: 11, marginTop: 6 }}>Top speed</div>
        <div style={{ fontSize: 18 }}>{topSpeed.toFixed(1)}</div>
      </div>

      {splits.length > 0 && (
        <div
          style={{
            position: 'absolute',
            right: 16,
            top: 130,
            padding: '8px 10px',
            background: 'rgba(0,0,0,0.55)',
            borderRadius: 6,
            fontSize: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            minWidth: 120,
          }}
        >
          <div style={{ opacity: 0.7, fontSize: 11 }}>Splits</div>
          {splits.map((tMs, i) => (
            <div key={i}>
              <span style={{ opacity: 0.6, marginRight: 6 }}>cp{i + 1}</span>
              {formatTime(tMs)}s
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
