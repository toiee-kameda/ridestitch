// src/main.ts
import './style.css'
import { getState, setState, resetState, type FileEntry } from './state'
import { setLang, applyStaticI18n } from './i18n'
import { render } from './ui'
import { mergeFitFiles, sortFilesByStartTime } from './fit-merger'
import { mergeGpxFiles } from './gpx-merger'

// --- Initialise ---
function init(): void {
  const state = getState()
  setLang(state.lang)
  render()
  bindStaticEvents()
  bindDynamicEvents()
  applyStaticI18n()
}

// --- Static events (header, always present — called once) ---
function bindStaticEvents(): void {
  const langBtn = document.getElementById('lang-btn')!
  langBtn.addEventListener('click', handleLangToggle)
}

function handleLangToggle(): void {
  const next = getState().lang === 'ja' ? 'en' : 'ja'
  setLang(next)
  setState({ lang: next })
  render()
  bindDynamicEvents()
  applyStaticI18n()
}

// --- Dynamic events (re-bound after each render) ---
function bindDynamicEvents(): void {
  // Format tabs
  document.querySelectorAll<HTMLElement>('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const format = tab.dataset.format as 'fit' | 'gpx'
      setState({ format, files: [], phase: 'idle' })
      render()
      bindDynamicEvents()
    })
  })

  // Drop zone
  const dropzone = document.getElementById('dropzone')
  if (dropzone) {
    dropzone.addEventListener('click', () => {
      const input = document.createElement('input')
      input.type = 'file'
      const fmt = getState().format
      input.accept = fmt === 'fit' ? '.fit' : '.gpx'
      input.multiple = true
      input.onchange = () => { if (input.files) addFiles(Array.from(input.files)) }
      input.click()
    })
    dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over') })
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'))
    dropzone.addEventListener('drop', e => {
      e.preventDefault()
      dropzone.classList.remove('drag-over')
      if (e.dataTransfer?.files) addFiles(Array.from(e.dataTransfer.files))
    })
  }

  // Delete buttons
  document.querySelectorAll<HTMLButtonElement>('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.delete!
      const files = getState().files.filter(f => f.id !== id)
      setState({ files, phase: files.length >= 2 ? 'ready' : 'idle' })
      render()
      bindDynamicEvents()
    })
  })

  // Drag-to-reorder
  setupDragReorder()

  // Merge button
  const mergeBtn = document.getElementById('merge-btn')
  if (mergeBtn) {
    mergeBtn.addEventListener('click', runMerge)
  }

  // Reset button
  const resetBtn = document.getElementById('reset-btn')
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      resetState()
      setLang(getState().lang)
      render()
      bindDynamicEvents()
    })
  }
}

// --- Add files ---
function addFiles(newFiles: File[]): void {
  const { format, files } = getState()
  const ext = format === 'fit' ? '.fit' : '.gpx'
  const filtered = newFiles.filter(f => f.name.toLowerCase().endsWith(ext))

  const entries: FileEntry[] = filtered.map(f => ({
    id: crypto.randomUUID(),
    file: f,
    name: f.name,
    size: f.size,
  }))

  // Sort new entries by file last-modified as a proxy for start time
  entries.sort((a, b) => (a.file.lastModified ?? 0) - (b.file.lastModified ?? 0))

  const merged = [...files, ...entries]
  setState({ files: merged, phase: merged.length >= 2 ? 'ready' : 'idle' })
  render()
  bindDynamicEvents()
}

// --- Drag-to-reorder ---
function setupDragReorder(): void {
  const list = document.getElementById('file-list')
  if (!list) return
  let dragId: string | null = null

  list.querySelectorAll<HTMLElement>('.file-card').forEach(card => {
    card.addEventListener('dragstart', () => { dragId = card.dataset.id!; card.classList.add('dragging') })
    card.addEventListener('dragend', () => { card.classList.remove('dragging'); dragId = null })
    card.addEventListener('dragover', e => { e.preventDefault(); card.classList.add('drag-target') })
    card.addEventListener('dragleave', () => card.classList.remove('drag-target'))
    card.addEventListener('drop', e => {
      e.preventDefault()
      card.classList.remove('drag-target')
      if (!dragId || dragId === card.dataset.id) return
      const files = [...getState().files]
      const fromIdx = files.findIndex(f => f.id === dragId)
      const toIdx = files.findIndex(f => f.id === card.dataset.id)
      const [moved] = files.splice(fromIdx, 1)
      files.splice(toIdx, 0, moved)
      setState({ files })
      render()
      bindDynamicEvents()
    })
  })
}

// --- Run merge ---
async function runMerge(): Promise<void> {
  const { format, files } = getState()
  setState({ phase: 'merging' })
  render()
  bindDynamicEvents()

  try {
    // Sort FIT files by session start time (defensive re-sort before merge)
    const sortedFiles = format === 'fit' ? sortFilesByStartTime(files) : files
    const rawFiles = sortedFiles.map(f => f.file)
    let blob: Blob
    let filename: string
    let totalDurationMs: number | undefined
    let totalDistanceM: number | undefined

    if (format === 'fit') {
      const result = await mergeFitFiles(rawFiles)
      blob = new Blob([result.data as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' })
      filename = 'merged_activity.fit'
      totalDurationMs = result.totalDurationMs
      totalDistanceM = result.totalDistanceM
    } else {
      const result = await mergeGpxFiles(rawFiles)
      blob = new Blob([result.xml], { type: 'application/gpx+xml' })
      filename = 'merged_activity.gpx'
      totalDurationMs = result.totalDurationMs
    }

    // Trigger download
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)

    setState({
      phase: 'done',
      result: {
        filename,
        sizeBytes: blob.size,
        fileCount: files.length,
        totalDurationMs,
        totalDistanceM,
      },
    })
  } catch (err) {
    setState({ phase: 'error', error: err instanceof Error ? err.message : String(err) })
  }

  render()
  bindDynamicEvents()
}

init()
