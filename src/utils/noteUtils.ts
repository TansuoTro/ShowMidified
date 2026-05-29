const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const WHITE_KEY_PATTERN = [true, false, true, false, true, true, false, true, false, true, false, true]

export function getNoteName(noteNumber: number): string {
  const octave = Math.floor(noteNumber / 12) - 1
  return `${NOTE_NAMES[noteNumber % 12]}${octave}`
}

export function isWhiteKey(noteNumber: number): boolean {
  return WHITE_KEY_PATTERN[noteNumber % 12]
}

export const PIANO_MIN = 21  // A0
export const PIANO_MAX = 108 // C8

export function getWhiteKeyIndex(noteNumber: number): number {
  let count = 0
  for (let n = PIANO_MIN; n <= noteNumber; n++) {
    if (isWhiteKey(n)) count++
  }
  return count - 1
}

export function countWhiteKeys(from: number, to: number): number {
  let count = 0
  for (let n = from; n <= to; n++) {
    if (isWhiteKey(n)) count++
  }
  return count
}

export const TOTAL_WHITE_KEYS = countWhiteKeys(PIANO_MIN, PIANO_MAX) // 52

export const CC_NAMES: Record<number, string> = {
  0: 'Bank Select',
  1: 'Mod Wheel',
  2: 'Breath',
  4: 'Foot',
  5: 'Portamento Time',
  6: 'Data Entry',
  7: 'Volume',
  8: 'Balance',
  10: 'Pan',
  11: 'Expression',
  12: 'Effect 1',
  13: 'Effect 2',
  64: 'Sustain',
  65: 'Portamento',
  66: 'Sostenuto',
  67: 'Soft Pedal',
  68: 'Legato',
  71: 'Resonance',
  72: 'Release',
  73: 'Attack',
  74: 'Brightness',
  91: 'Reverb',
  93: 'Chorus',
  95: 'Phaser',
}

export function getCcName(ccNumber: number): string {
  return CC_NAMES[ccNumber] ?? `CC ${ccNumber}`
}

export const FEATURED_CC = [1, 7, 10, 11, 64, 91, 93]
