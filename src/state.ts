export interface FileEntry {
  id: string
  file: File
  name: string
  size: number
  startTime?: Date
}

export interface MergeResult {
  filename: string
  sizeBytes: number
  fileCount: number
  totalDurationMs?: number
  totalDistanceM?: number
}

export interface AppState {
  format: 'fit' | 'gpx'
  files: FileEntry[]
  phase: 'idle' | 'ready' | 'merging' | 'done' | 'error'
  lang: 'ja' | 'en'
  result?: MergeResult
  error?: string
}

function detectLang(): 'ja' | 'en' {
  return navigator.language.startsWith('ja') ? 'ja' : 'en'
}

function makeInitial(): AppState {
  return {
    format: 'fit',
    files: [],
    phase: 'idle',
    lang: detectLang(),
  }
}

let state: AppState = makeInitial()

export function getState(): AppState {
  return { ...state, files: [...state.files] }
}

export function setState(patch: Partial<AppState>): void {
  state = { ...state, ...patch }
}

export function resetState(): void {
  state = makeInitial()
}
