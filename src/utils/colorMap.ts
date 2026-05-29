// Channel color palette — 16 channels, distinct hues
const CHANNEL_HUES = [188, 142, 38, 355, 270, 210, 25, 300, 160, 60, 195, 320, 85, 15, 240, 180]

export function getChannelColor(channel: number, alpha = 1): string {
  const hue = CHANNEL_HUES[channel % 16]
  return `hsla(${hue}, 80%, 62%, ${alpha})`
}

export function getChannelColorDim(channel: number, alpha = 1): string {
  const hue = CHANNEL_HUES[channel % 16]
  return `hsla(${hue}, 60%, 35%, ${alpha})`
}

export function velocityToAlpha(velocity: number): number {
  return 0.35 + (velocity / 127) * 0.65
}

export function velocityToLightness(velocity: number): number {
  return 30 + (velocity / 127) * 45
}

export function getNoteColor(channel: number, velocity: number, alpha?: number): string {
  const hue = CHANNEL_HUES[channel % 16]
  const l = velocityToLightness(velocity)
  const a = alpha ?? velocityToAlpha(velocity)
  return `hsla(${hue}, 85%, ${l}%, ${a})`
}

export function getNoteGlowColor(channel: number): string {
  const hue = CHANNEL_HUES[channel % 16]
  return `hsla(${hue}, 100%, 70%, 0.6)`
}

export const ACCENT_CYAN = '#00c8e8'
export const ACCENT_AMBER = '#f0a020'
export const ACCENT_GREEN = '#20c870'
export const ACCENT_RED = '#e83050'
export const ACCENT_PURPLE = '#8060e0'
