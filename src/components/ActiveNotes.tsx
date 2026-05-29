import { useMidi } from '../store/MidiContext'

const CHANNEL_HUES = [188, 142, 38, 355, 270, 210, 25, 300, 160, 60, 195, 320, 85, 15, 240, 180]

export function ActiveNotes() {
  const { activeNotes } = useMidi()

  return (
    <div className="h-full flex flex-col">
      <div className="px-2 py-1.5 border-b border-[var(--border)]">
        <span className="text-[11px] font-semibold text-[var(--text-secondary)] tracking-wider uppercase">
          当前按下
        </span>
        <span className="ml-2 text-[10px] font-mono text-[var(--text-muted)]">
          {activeNotes.length} 键
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {activeNotes.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[var(--text-muted)] text-xs font-mono">
            无
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {activeNotes.map((note) => {
              const hue = CHANNEL_HUES[note.channel % 16]
              const l = 45 + (note.velocity / 127) * 30
              return (
                <div
                  key={`${note.channel}-${note.noteNumber}`}
                  className="flex flex-col items-center px-2 py-1.5 rounded-md text-center min-w-[52px]"
                  style={{
                    background: `hsl(${hue}, 60%, 15%)`,
                    border: `1px solid hsl(${hue}, 70%, ${l}%)`,
                    boxShadow: `0 0 8px hsl(${hue},80%,${l}%,0.3)`,
                  }}
                >
                  <span
                    className="text-base font-bold font-mono leading-none"
                    style={{ color: `hsl(${hue}, 85%, ${l + 10}%)` }}
                  >
                    {note.noteName}
                  </span>
                  <span className="text-[9px] font-mono mt-0.5" style={{ color: `hsl(${hue},60%,50%)` }}>
                    #{note.noteNumber}
                  </span>
                  <div
                    className="w-full h-0.5 rounded-full mt-1"
                    style={{
                      background: `hsl(${hue}, 80%, ${l}%)`,
                      width: `${(note.velocity / 127) * 100}%`,
                    }}
                  />
                  <span className="text-[9px] font-mono text-[var(--text-muted)]">
                    v{note.velocity}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
