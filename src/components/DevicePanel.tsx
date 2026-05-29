import { useMidi } from '../store/MidiContext'

export function DevicePanel() {
  const {
    devices,
    selectedDeviceId,
    permission,
    browserSupport,
    selectedChannel,
    selectDevice,
    requestAccess,
    setChannelFilter,
    isDemoMode,
  } = useMidi()

  const connectedDevices = devices.filter((d) => d.state === 'connected')

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Device selector */}
      <div>
        <label className="block text-[10px] font-semibold tracking-wider uppercase text-[var(--text-muted)] mb-1.5">
          输入设备
        </label>
        {browserSupport === 'unsupported' ? (
          <p className="text-[11px] text-[var(--accent-red)]">浏览器不支持 Web MIDI</p>
        ) : permission === 'denied' ? (
          <div>
            <p className="text-[11px] text-[var(--accent-amber)] mb-1">权限已拒绝</p>
            <button onClick={requestAccess} className="btn-secondary text-[11px]">
              重新请求权限
            </button>
          </div>
        ) : permission === 'requesting' ? (
          <p className="text-[11px] text-[var(--text-muted)] animate-pulse">正在请求权限…</p>
        ) : connectedDevices.length === 0 ? (
          <p className="text-[11px] text-[var(--text-muted)]">未检测到 MIDI 设备</p>
        ) : (
          <select
            value={selectedDeviceId ?? ''}
            onChange={(e) => selectDevice(e.target.value || null)}
            className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md px-2 py-1.5 text-[12px] font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)] cursor-pointer"
            disabled={isDemoMode}
          >
            <option value="">— 选择设备 —</option>
            {connectedDevices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Channel filter */}
      <div>
        <label className="block text-[10px] font-semibold tracking-wider uppercase text-[var(--text-muted)] mb-1.5">
          通道过滤
        </label>
        <select
          value={selectedChannel}
          onChange={(e) => setChannelFilter(Number(e.target.value))}
          className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md px-2 py-1.5 text-[12px] font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)] cursor-pointer"
        >
          <option value={-1}>全部通道</option>
          {Array.from({ length: 16 }, (_, i) => (
            <option key={i} value={i}>
              通道 {i + 1}
            </option>
          ))}
        </select>
      </div>

      {/* Selected device info */}
      {selectedDeviceId && !isDemoMode && (
        <div className="text-[10px] font-mono text-[var(--text-muted)] bg-[var(--bg-elevated)] rounded px-2 py-1.5 border border-[var(--border)]">
          <div className="flex justify-between">
            <span>设备</span>
            <span className="text-[var(--accent-green)]">已连接</span>
          </div>
          {devices.find((d) => d.id === selectedDeviceId)?.manufacturer && (
            <div className="text-[9px] text-[var(--text-muted)] truncate mt-0.5">
              {devices.find((d) => d.id === selectedDeviceId)?.manufacturer}
            </div>
          )}
        </div>
      )}

      {isDemoMode && (
        <div className="text-[10px] font-mono bg-[var(--accent-amber)]/10 border border-[var(--accent-amber)]/30 rounded px-2 py-1.5 text-[var(--accent-amber)]">
          演示模式运行中
        </div>
      )}
    </div>
  )
}
