export type TrimMode = 'both' | 'leading' | 'trailing'

export function applyTrimMode(line: string, mode: TrimMode): string {
  switch (mode) {
    case 'leading':
      return line.trimStart()
    case 'trailing':
      return line.trimEnd()
    case 'both':
    default:
      return line.trim()
  }
}

