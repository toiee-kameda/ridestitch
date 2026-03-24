# RideStitch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a frontend-only web app that merges split Garmin FIT and GPX activity files in the browser and downloads the result, deployed to Cloudflare Pages.

**Architecture:** Vanilla TypeScript bundled with Vite. Pure-function modules for merging (`fit-merger.ts`, `gpx-merger.ts`) are tested with Vitest. A single mutable `state` object drives all UI rendering via `ui.ts`. Events are wired in `main.ts`.

**Tech Stack:** TypeScript, Vite, Vitest, `@garmin/fitsdk` (FIT read/write), browser DOMParser (GPX), Cloudflare Pages

---

## File Map

| File | Responsibility |
|---|---|
| `index.html` | Shell HTML, imports `src/main.ts` |
| `src/main.ts` | Entry point — initialises state, wires all DOM events |
| `src/state.ts` | `AppState` type, `getState()`, `setState()` |
| `src/i18n.ts` | `t(key)` lookup, language detection, `setLang()` |
| `src/locales/ja.json` | All Japanese UI strings |
| `src/locales/en.json` | All English UI strings |
| `src/gpx-merger.ts` | `mergeGpxFiles(files: File[]): Promise<string>` |
| `src/fit-merger.ts` | `mergeFitFiles(files: File[]): Promise<Uint8Array>` |
| `src/ui.ts` | `render()` — reads state, writes DOM |
| `src/style.css` | Dark theme, layout, animation keyframes |
| `public/favicon.svg` | Gradient bike icon |
| `vite.config.ts` | Vite config |
| `tsconfig.json` | TypeScript config |
| `vitest.config.ts` | Vitest config with jsdom environment |

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `vitest.config.ts`, `index.html`

- [ ] **Step 1: Initialise the project**

```bash
cd /Users/takahiro/Workspace/merge-activities
npm create vite@latest . -- --template vanilla-ts
```

When prompted "Current directory is not empty. Remove existing files and continue?" — select **Yes, remove existing files and continue** (the only existing content is `docs/` and `.git` which are safe, but Vite may overwrite `index.html` — that is fine).

- [ ] **Step 2: Install dependencies**

```bash
npm install @garmin/fitsdk
npm install -D vitest @vitest/coverage-v8 jsdom @types/jsdom happy-dom
```

> **Note on `@garmin/fitsdk`:** Verify this package exists on npm before installing (`npm info @garmin/fitsdk`). If the package name differs, check the Garmin FIT SDK JavaScript release page. A common alternative is `fit-file-parser` for reading; if a write-capable package is unavailable, the FIT task (Task 5) will need a custom binary encoder — flag this before proceeding.

- [ ] **Step 3: Configure Vitest**

Replace the generated `vite.config.ts` with:

```typescript
// vite.config.ts
import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
  },
})
```

- [ ] **Step 4: Update `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Update `package.json` scripts**

Add `"test": "vitest run"` and `"test:watch": "vitest"` to the scripts section.

- [ ] **Step 6: Verify the dev server starts**

```bash
npm run dev
```

Expected: Vite dev server running at `http://localhost:5173` (or similar port). A blank/default Vite page is fine.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + TypeScript + Vitest project"
```

---

## Task 2: State Module

**Files:**
- Create: `src/state.ts`
- Create: `src/state.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/state.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { getState, setState, resetState } from './state'

describe('state', () => {
  beforeEach(() => resetState())

  it('has correct initial state', () => {
    const s = getState()
    expect(s.format).toBe('fit')
    expect(s.phase).toBe('idle')
    expect(s.files).toEqual([])
    expect(['ja', 'en']).toContain(s.lang)
  })

  it('setState merges partial updates', () => {
    setState({ format: 'gpx' })
    expect(getState().format).toBe('gpx')
    expect(getState().phase).toBe('idle') // unchanged
  })

  it('setState does not mutate previous state snapshot', () => {
    const before = getState()
    setState({ format: 'gpx' })
    expect(before.format).toBe('fit') // snapshot unchanged
  })
})
```

- [ ] **Step 2: Run tests — verify FAIL**

```bash
npm test
```

Expected: FAIL — `Cannot find module './state'`

- [ ] **Step 3: Implement `src/state.ts`**

```typescript
// src/state.ts

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
```

- [ ] **Step 4: Run tests — verify PASS**

```bash
npm test
```

Expected: All 3 state tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/state.ts src/state.test.ts
git commit -m "feat: add state module with getState/setState"
```

---

## Task 3: i18n Module

**Files:**
- Create: `src/locales/ja.json`
- Create: `src/locales/en.json`
- Create: `src/i18n.ts`
- Create: `src/i18n.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/i18n.test.ts
import { describe, it, expect } from 'vitest'
import { t, setLang } from './i18n'

describe('i18n', () => {
  it('returns Japanese string when lang is ja', () => {
    setLang('ja')
    expect(t('app.title')).toBe('RideStitch')
    expect(t('tabs.fit')).toBe('FIT')
    expect(t('merge.button')).toContain('結合')
  })

  it('returns English string when lang is en', () => {
    setLang('en')
    expect(t('app.title')).toBe('RideStitch')
    expect(t('merge.button')).toContain('Merge')
  })

  it('returns key as fallback for unknown keys', () => {
    setLang('en')
    expect(t('nonexistent.key')).toBe('nonexistent.key')
  })
})
```

- [ ] **Step 2: Run tests — verify FAIL**

```bash
npm test
```

Expected: FAIL — `Cannot find module './i18n'`

- [ ] **Step 3: Create locale files**

```json
// src/locales/ja.json
{
  "app.title": "RideStitch",
  "app.subtitle": "ライドログを結合してダウンロード",
  "lang.toggle": "EN",
  "tabs.fit": "FIT",
  "tabs.gpx": "GPX",
  "dropzone.idle": "FITファイルをドロップ",
  "dropzone.idle.gpx": "GPXファイルをドロップ",
  "dropzone.sub": "またはクリックして選択",
  "dropzone.add": "+ さらに追加",
  "merge.button": "結合してダウンロード",
  "merge.button.merging": "結合中...",
  "file.delete": "削除",
  "success.title": "結合完了！",
  "success.subtitle": "ダウンロードが自動で始まります",
  "success.files": "ファイル",
  "success.total": "合計時間",
  "success.distance": "距離",
  "success.warning.title": "アップロード前に元のログを削除してください",
  "success.warning.body": "Garmin Connect・Stravaでは重複するアクティビティがあるとアップロードが失敗します。分割されていた元のアクティビティを先に削除してからアップロードしてください。",
  "reset.button": "新しい結合を開始",
  "error.title": "エラーが発生しました",
  "error.reset": "やり直す"
}
```

```json
// src/locales/en.json
{
  "app.title": "RideStitch",
  "app.subtitle": "Merge and download your ride logs",
  "lang.toggle": "JP",
  "tabs.fit": "FIT",
  "tabs.gpx": "GPX",
  "dropzone.idle": "Drop FIT files here",
  "dropzone.idle.gpx": "Drop GPX files here",
  "dropzone.sub": "or click to select",
  "dropzone.add": "+ Add more files",
  "merge.button": "Merge & Download",
  "merge.button.merging": "Merging...",
  "file.delete": "Remove",
  "success.title": "Merge complete!",
  "success.subtitle": "Your download has started",
  "success.files": "files",
  "success.total": "total time",
  "success.distance": "distance",
  "success.warning.title": "Delete your original activities before uploading",
  "success.warning.body": "Garmin Connect and Strava will reject uploads if duplicate activities already exist. Delete the original split activities first, then upload the merged file.",
  "reset.button": "↺ Start a new merge",
  "error.title": "Something went wrong",
  "error.reset": "Try again"
}
```

- [ ] **Step 4: Implement `src/i18n.ts`**

```typescript
// src/i18n.ts
import ja from './locales/ja.json'
import en from './locales/en.json'

type Lang = 'ja' | 'en'
type Strings = Record<string, string>

const locales: Record<Lang, Strings> = { ja, en }
let currentLang: Lang = 'en'

export function setLang(lang: Lang): void {
  currentLang = lang
}

export function getLang(): Lang {
  return currentLang
}

export function t(key: string): string {
  return locales[currentLang][key] ?? key
}
```

- [ ] **Step 5: Run tests — verify PASS**

```bash
npm test
```

Expected: All i18n tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/i18n.ts src/i18n.test.ts src/locales/
git commit -m "feat: add i18n module with ja/en locales"
```

---

## Task 4: GPX Merger

**Files:**
- Create: `src/gpx-merger.ts`
- Create: `src/gpx-merger.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/gpx-merger.test.ts
import { describe, it, expect } from 'vitest'
import { mergeGpxFiles } from './gpx-merger'

function makeGpxFile(trkpts: Array<{ lat: number; lon: number; time: string }>, name = 'test.gpx'): File {
  const content = `<?xml version="1.0"?>
<gpx version="1.1" creator="test">
  <trk><trkseg>
    ${trkpts.map(p => `<trkpt lat="${p.lat}" lon="${p.lon}"><time>${p.time}</time></trkpt>`).join('\n    ')}
  </trkseg></trk>
</gpx>`
  return new File([content], name, { type: 'application/gpx+xml' })
}

describe('mergeGpxFiles', () => {
  it('rejects when fewer than 2 files given', async () => {
    const f = makeGpxFile([{ lat: 35.0, lon: 135.0, time: '2024-01-01T09:00:00Z' }])
    await expect(mergeGpxFiles([f])).rejects.toThrow('at least 2')
  })

  it('combines trackpoints from two files', async () => {
    const f1 = makeGpxFile([
      { lat: 35.0, lon: 135.0, time: '2024-01-01T09:00:00Z' },
      { lat: 35.1, lon: 135.1, time: '2024-01-01T09:01:00Z' },
    ])
    const f2 = makeGpxFile([
      { lat: 35.2, lon: 135.2, time: '2024-01-01T09:30:00Z' },
      { lat: 35.3, lon: 135.3, time: '2024-01-01T09:31:00Z' },
    ])
    const result = await mergeGpxFiles([f1, f2])
    const doc = new DOMParser().parseFromString(result, 'application/xml')
    const pts = doc.querySelectorAll('trkpt')
    expect(pts.length).toBe(4)
  })

  it('sorts trackpoints by time across files', async () => {
    const f1 = makeGpxFile([{ lat: 35.0, lon: 135.0, time: '2024-01-01T09:30:00Z' }])
    const f2 = makeGpxFile([{ lat: 35.1, lon: 135.1, time: '2024-01-01T09:00:00Z' }])
    const result = await mergeGpxFiles([f1, f2])
    const doc = new DOMParser().parseFromString(result, 'application/xml')
    const times = Array.from(doc.querySelectorAll('trkpt time')).map(el => el.textContent)
    expect(times[0]).toBe('2024-01-01T09:00:00Z')
    expect(times[1]).toBe('2024-01-01T09:30:00Z')
  })

  it('produces valid GPX with single trk/trkseg', async () => {
    const f1 = makeGpxFile([{ lat: 35.0, lon: 135.0, time: '2024-01-01T09:00:00Z' }])
    const f2 = makeGpxFile([{ lat: 35.1, lon: 135.1, time: '2024-01-01T09:01:00Z' }])
    const result = await mergeGpxFiles([f1, f2])
    const doc = new DOMParser().parseFromString(result, 'application/xml')
    expect(doc.querySelectorAll('trk').length).toBe(1)
    expect(doc.querySelectorAll('trkseg').length).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests — verify FAIL**

```bash
npm test
```

Expected: FAIL — `Cannot find module './gpx-merger'`

- [ ] **Step 3: Implement `src/gpx-merger.ts`**

```typescript
// src/gpx-merger.ts

export async function mergeGpxFiles(files: File[]): Promise<string> {
  if (files.length < 2) {
    throw new Error('Merge requires at least 2 files')
  }

  const parser = new DOMParser()
  const allTrkpts: Element[] = []
  let firstDoc: Document | null = null

  for (const file of files) {
    const text = await file.text()
    const doc = parser.parseFromString(text, 'application/xml')
    if (!firstDoc) firstDoc = doc
    doc.querySelectorAll('trkpt').forEach(pt => allTrkpts.push(pt))
  }

  // Sort by <time> content
  allTrkpts.sort((a, b) => {
    const ta = a.querySelector('time')?.textContent ?? ''
    const tb = b.querySelector('time')?.textContent ?? ''
    return ta < tb ? -1 : ta > tb ? 1 : 0
  })

  // Build output document
  const gpx = firstDoc!.createElement('gpx')
  gpx.setAttribute('version', '1.1')
  gpx.setAttribute('creator', 'RideStitch')
  gpx.setAttribute('xmlns', 'http://www.topografix.com/GPX/1/1')

  // Copy metadata from first file if present
  const meta = firstDoc!.querySelector('metadata')
  if (meta) gpx.appendChild(meta.cloneNode(true))

  const trk = firstDoc!.createElement('trk')
  const trkseg = firstDoc!.createElement('trkseg')

  for (const pt of allTrkpts) {
    trkseg.appendChild(pt.cloneNode(true))
  }

  trk.appendChild(trkseg)
  gpx.appendChild(trk)

  const outputDoc = document.implementation.createDocument(
    'http://www.topografix.com/GPX/1/1',
    null,
    null
  )
  outputDoc.appendChild(gpx)

  return new XMLSerializer().serializeToString(outputDoc)
}
```

- [ ] **Step 4: Run tests — verify PASS**

```bash
npm test
```

Expected: All 4 GPX merger tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/gpx-merger.ts src/gpx-merger.test.ts
git commit -m "feat: add GPX merger — parse, sort, combine trackpoints"
```

---

## Task 5: FIT Merger

**Files:**
- Create: `src/fit-merger.ts`
- Create: `src/fit-merger.test.ts`

> **Pre-task check:** Run `npm info @garmin/fitsdk` to confirm the package exists and has a write API. Read its README to understand the Reader and Writer class APIs before writing code. If a write-capable SDK is unavailable, implement a minimal FIT binary encoder following the FIT Protocol specification (the file format is documented at [https://developer.garmin.com/fit/protocol/](https://developer.garmin.com/fit/protocol/)).

- [ ] **Step 1: Write the failing tests**

```typescript
// src/fit-merger.test.ts
import { describe, it, expect } from 'vitest'
import { mergeFitFiles, sortFilesByStartTime } from './fit-merger'

// Minimal valid FIT file bytes for testing (14-byte header + CRC)
// These represent the absolute minimum valid FIT structure.
// Use real .fit files from Garmin for integration-level checks.
function makeMinimalFitFile(name = 'test.fit'): File {
  // Real FIT test data — use actual small .fit files if available.
  // For unit testing the sort logic, mock the parsed output instead.
  return new File([new Uint8Array(20).fill(0)], name, { type: 'application/octet-stream' })
}

describe('sortFilesByStartTime', () => {
  it('sorts file entries by startTime ascending', () => {
    const entries = [
      { id: 'b', file: makeMinimalFitFile('b.fit'), name: 'b.fit', size: 20, startTime: new Date('2024-01-01T10:00:00Z') },
      { id: 'a', file: makeMinimalFitFile('a.fit'), name: 'a.fit', size: 20, startTime: new Date('2024-01-01T09:00:00Z') },
    ]
    const sorted = sortFilesByStartTime(entries)
    expect(sorted[0].id).toBe('a')
    expect(sorted[1].id).toBe('b')
  })

  it('keeps original order for entries without startTime', () => {
    const entries = [
      { id: 'a', file: makeMinimalFitFile(), name: 'a.fit', size: 20 },
      { id: 'b', file: makeMinimalFitFile(), name: 'b.fit', size: 20 },
    ]
    const sorted = sortFilesByStartTime(entries)
    expect(sorted[0].id).toBe('a')
  })
})

describe('mergeFitFiles', () => {
  it('rejects when fewer than 2 files given', async () => {
    const f = makeMinimalFitFile()
    await expect(mergeFitFiles([f])).rejects.toThrow('at least 2')
  })
})
```

- [ ] **Step 2: Run tests — verify FAIL**

```bash
npm test
```

Expected: FAIL — `Cannot find module './fit-merger'`

- [ ] **Step 3: Implement `src/fit-merger.ts`**

Read the `@garmin/fitsdk` README for the exact import path and API. The implementation must:
1. Parse each FIT `File` using the SDK Reader
2. Merge `record`, `lap`, and `session` messages as described in the spec
3. Write the result using the SDK Writer
4. Return a `Uint8Array`

```typescript
// src/fit-merger.ts
import { Decoder, Stream, Encoder } from '@garmin/fitsdk'
// NOTE: import paths may differ — check the installed package's exports.
// Common alternatives: import FitParser from 'fit-file-parser'

import type { FileEntry } from './state'

export function sortFilesByStartTime(entries: FileEntry[]): FileEntry[] {
  return [...entries].sort((a, b) => {
    if (!a.startTime || !b.startTime) return 0
    return a.startTime.getTime() - b.startTime.getTime()
  })
}

export async function mergeFitFiles(files: File[]): Promise<Uint8Array> {
  if (files.length < 2) {
    throw new Error('Merge requires at least 2 files')
  }

  // Parse all files
  const parsed = await Promise.all(files.map(async (file) => {
    const buffer = await file.arrayBuffer()
    const stream = Stream.fromArrayBuffer(buffer)
    const decoder = new Decoder(stream)
    const { messages } = decoder.read()
    return messages
  }))

  // Collect and merge messages
  const allRecords = parsed.flatMap(m => m.recordMesgs ?? [])
  const allLaps = parsed.flatMap(m => m.lapMesgs ?? []).map((lap, i) => ({ ...lap, messageIndex: i }))

  // Merge sessions into one
  const sessions = parsed.flatMap(m => m.sessionMesgs ?? [])
  const firstSession = sessions[0]
  const lastSession = sessions[sessions.length - 1]
  const mergedSession = {
    ...firstSession,
    timestamp: lastSession?.timestamp,
    totalElapsedTime: sessions.reduce((sum, s) => sum + (s.totalElapsedTime ?? 0), 0),
    totalTimerTime: sessions.reduce((sum, s) => sum + (s.totalTimerTime ?? 0), 0),
    totalDistance: sessions.reduce((sum, s) => sum + (s.totalDistance ?? 0), 0),
    totalCalories: sessions.reduce((sum, s) => sum + (s.totalCalories ?? 0), 0),
    numLaps: allLaps.length,
  }

  // Write merged FIT
  const encoder = new Encoder()
  // Write file_id from first file if present
  const fileId = parsed[0].fileIdMesgs?.[0]
  if (fileId) encoder.write(fileId)

  for (const record of allRecords) encoder.write(record)
  for (const lap of allLaps) encoder.write(lap)
  encoder.write(mergedSession)

  return encoder.close()
}
```

> **Important:** The exact Encoder/Decoder API depends on the installed `@garmin/fitsdk` version. If the API differs, adjust accordingly. The logic (collect records → merge sessions → encode) must remain the same.

- [ ] **Step 4: Run tests — verify PASS**

```bash
npm test
```

Expected: The sort tests and the reject-on-single-file test pass.

- [ ] **Step 5: Commit**

```bash
git add src/fit-merger.ts src/fit-merger.test.ts
git commit -m "feat: add FIT merger — parse, merge records/laps/sessions, encode"
```

---

## Task 6: CSS — Dark Theme, Layout, Animations

**Files:**
- Create: `src/style.css`

- [ ] **Step 1: Replace the generated `src/style.css` with the app styles**

```css
/* src/style.css */
:root {
  --bg: #0f1117;
  --surface: #1a1d27;
  --surface2: #2a2d3a;
  --accent1: #e74c3c;
  --accent2: #e67e22;
  --success: #27ae60;
  --warning: #e67e22;
  --text: #e8e8e8;
  --text-muted: #666;
  --text-dim: #444;
  --radius: 10px;
  --radius-sm: 6px;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 16px 48px;
}

/* Header */
header {
  width: 100%;
  max-width: 480px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 32px;
}
.logo { display: flex; align-items: center; gap: 10px; }
.logo-icon {
  width: 32px; height: 32px;
  background: linear-gradient(135deg, var(--accent1), var(--accent2));
  border-radius: 8px;
}
.logo-text { font-size: 1.1rem; font-weight: 700; letter-spacing: -0.3px; }
.lang-btn {
  background: var(--surface);
  border: 1px solid var(--surface2);
  color: var(--text-muted);
  border-radius: var(--radius-sm);
  padding: 4px 10px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: color 0.15s;
}
.lang-btn:hover { color: var(--text); }

/* Main card */
main { width: 100%; max-width: 480px; }
.hero { text-align: center; margin-bottom: 28px; }
.hero h1 { font-size: 1.4rem; font-weight: 700; margin-bottom: 4px; }
.hero p { color: var(--text-muted); font-size: 0.85rem; }

/* Format tabs */
.tabs {
  display: flex;
  background: var(--surface);
  border-radius: var(--radius);
  padding: 4px;
  margin-bottom: 16px;
  gap: 4px;
}
.tab {
  flex: 1; text-align: center; padding: 8px;
  border-radius: var(--radius-sm);
  font-size: 0.9rem; font-weight: 600;
  cursor: pointer;
  color: var(--text-muted);
  transition: color 0.2s;
  user-select: none;
}
.tab.active {
  background: linear-gradient(135deg, var(--accent1), var(--accent2));
  color: #fff;
}

/* Drop zone */
.dropzone {
  border: 2px dashed var(--surface2);
  border-radius: var(--radius);
  padding: 36px 24px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
  margin-bottom: 12px;
}
.dropzone:hover, .dropzone.drag-over {
  border-color: var(--accent1);
  background: rgba(231, 76, 60, 0.05);
}
.dropzone .icon { font-size: 2rem; margin-bottom: 8px; }
.dropzone .label { color: var(--text-muted); font-size: 0.9rem; }
.dropzone .sub { color: var(--text-dim); font-size: 0.8rem; margin-top: 4px; }
.dropzone.compact { padding: 10px 24px; }
.dropzone.compact .icon { display: none; }

/* File list */
.file-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.file-card {
  background: var(--surface);
  border: 1px solid var(--surface2);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  animation: slideIn 0.15s ease-out;
}
.file-card.dragging { opacity: 0.4; }
.file-card.drag-target { border-color: var(--accent1); }
.drag-handle { color: var(--accent1); cursor: grab; font-size: 1.1rem; flex-shrink: 0; }
.drag-handle:active { cursor: grabbing; }
.file-info { flex: 1; min-width: 0; }
.file-name { font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.file-meta { font-size: 0.75rem; color: var(--text-muted); margin-top: 2px; }
.delete-btn {
  background: none; border: none; color: var(--text-dim);
  cursor: pointer; font-size: 1rem; padding: 0 4px; flex-shrink: 0;
  transition: color 0.15s;
}
.delete-btn:hover { color: var(--accent1); }

/* Merge button */
.merge-btn {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: var(--radius);
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.2s, box-shadow 0.3s;
}
.merge-btn:disabled {
  background: var(--surface);
  color: var(--text-dim);
  border: 1px solid var(--surface2);
  cursor: not-allowed;
}
.merge-btn.ready {
  background: linear-gradient(135deg, var(--accent1), var(--accent2));
  color: #fff;
  box-shadow: 0 4px 20px rgba(231, 76, 60, 0.25);
}
.merge-btn.ready:hover {
  box-shadow: 0 6px 28px rgba(231, 76, 60, 0.45);
}
.merge-btn.merging {
  background: var(--surface);
  color: var(--text-muted);
  cursor: not-allowed;
}

/* Progress bar */
.progress-bar {
  height: 2px;
  background: var(--surface2);
  border-radius: 2px;
  margin-top: 8px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent1), var(--accent2));
  animation: progress 1.2s ease-in-out infinite;
  transform-origin: left;
}

/* Success screen */
.success-card {
  background: #0d2818;
  border: 1px solid rgba(39, 174, 96, 0.3);
  border-radius: var(--radius);
  padding: 24px;
  text-align: center;
  margin-bottom: 12px;
  animation: scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.success-icon { font-size: 2.5rem; margin-bottom: 10px; }
.success-title { color: var(--success); font-size: 1.1rem; font-weight: 700; margin-bottom: 4px; }
.success-sub { color: var(--text-muted); font-size: 0.8rem; margin-bottom: 12px; }
.success-file {
  display: inline-block;
  background: var(--surface);
  border-radius: var(--radius-sm);
  padding: 6px 12px;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-bottom: 12px;
}
.stat {
  background: var(--surface);
  border-radius: var(--radius-sm);
  padding: 10px;
  text-align: center;
  animation: fadeIn 0.3s ease-out both;
}
.stat:nth-child(1) { animation-delay: 0.1s; }
.stat:nth-child(2) { animation-delay: 0.2s; }
.stat:nth-child(3) { animation-delay: 0.3s; }
.stat-value { font-size: 1.1rem; font-weight: 700; }
.stat-label { font-size: 0.7rem; color: var(--text-muted); margin-top: 2px; }
.stat:nth-child(1) .stat-value { color: var(--accent1); }
.stat:nth-child(2) .stat-value { color: var(--accent2); }
.stat:nth-child(3) .stat-value { color: #f1c40f; }

/* Warning card */
.warning-card {
  background: #1c1500;
  border: 1px solid rgba(230, 126, 34, 0.35);
  border-radius: var(--radius);
  padding: 14px 16px;
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 12px;
  animation: fadeIn 0.4s ease-out 0.4s both;
}
.warning-icon { font-size: 1.2rem; flex-shrink: 0; }
.warning-title { color: var(--warning); font-size: 0.85rem; font-weight: 600; margin-bottom: 4px; }
.warning-body { color: var(--text-muted); font-size: 0.78rem; line-height: 1.5; }

/* Reset button */
.reset-btn {
  width: 100%;
  padding: 12px;
  background: var(--surface);
  border: 1px solid var(--surface2);
  border-radius: var(--radius);
  color: var(--text-muted);
  font-size: 0.9rem;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}
.reset-btn:hover { color: var(--text); border-color: var(--text-muted); }

/* Error state */
.error-card {
  background: #1c0808;
  border: 1px solid rgba(231, 76, 60, 0.3);
  border-radius: var(--radius);
  padding: 20px;
  text-align: center;
  margin-bottom: 12px;
}
.error-title { color: var(--accent1); font-weight: 600; margin-bottom: 8px; }
.error-msg { color: var(--text-muted); font-size: 0.85rem; }

/* Keyframes */
@keyframes slideIn {
  from { opacity: 0; transform: translateY(-8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.92); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes progress {
  0%   { transform: scaleX(0); }
  50%  { transform: scaleX(0.7); }
  100% { transform: scaleX(1); }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/style.css
git commit -m "feat: add dark theme CSS with layout and animation keyframes"
```

---

## Task 7: UI Rendering Module

**Files:**
- Modify: `index.html`
- Create: `src/ui.ts`

- [ ] **Step 1: Set up `index.html`**

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>RideStitch</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  </head>
  <body>
    <header>
      <div class="logo">
        <div class="logo-icon"></div>
        <span class="logo-text">RideStitch</span>
      </div>
      <button class="lang-btn" id="lang-btn">EN</button>
    </header>
    <main id="app"></main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Implement `src/ui.ts`**

```typescript
// src/ui.ts
import { getState, type FileEntry } from './state'
import { t } from './i18n'

// Utility: format bytes
function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Utility: format duration (ms → "2h 34m")
function fmtDuration(ms?: number): string {
  if (!ms) return '--'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// Utility: format distance (m → "87.3 km")
function fmtDistance(m?: number): string {
  if (!m) return '--'
  return `${(m / 1000).toFixed(1)} km`
}

export function render(): void {
  const state = getState()
  const app = document.getElementById('app')!
  const langBtn = document.getElementById('lang-btn')!

  langBtn.textContent = t('lang.toggle')
  document.documentElement.lang = state.lang

  if (state.phase === 'done' && state.result) {
    app.innerHTML = renderSuccess()
  } else if (state.phase === 'error') {
    app.innerHTML = renderError()
  } else {
    app.innerHTML = renderMerger()
  }
}

function renderMerger(): string {
  const state = getState()
  const hasFiles = state.files.length >= 2
  const isMerging = state.phase === 'merging'
  const dropKey = state.format === 'fit' ? 'dropzone.idle' : 'dropzone.idle.gpx'

  return `
    <div class="hero">
      <h1>${t('app.title')}</h1>
      <p>${t('app.subtitle')}</p>
    </div>

    <div class="tabs">
      <div class="tab ${state.format === 'fit' ? 'active' : ''}" data-format="fit">${t('tabs.fit')}</div>
      <div class="tab ${state.format === 'gpx' ? 'active' : ''}" data-format="gpx">${t('tabs.gpx')}</div>
    </div>

    <div class="dropzone ${state.files.length > 0 ? 'compact' : ''}" id="dropzone">
      <div class="icon">📁</div>
      <div class="label">${state.files.length > 0 ? t('dropzone.add') : t(dropKey)}</div>
      ${state.files.length === 0 ? `<div class="sub">${t('dropzone.sub')}</div>` : ''}
    </div>

    <div class="file-list" id="file-list">
      ${state.files.map(renderFileCard).join('')}
    </div>

    <button class="merge-btn ${isMerging ? 'merging' : hasFiles ? 'ready' : ''}"
            id="merge-btn"
            ${!hasFiles || isMerging ? 'disabled' : ''}>
      ${isMerging ? t('merge.button.merging') : t('merge.button')}
    </button>

    ${isMerging ? '<div class="progress-bar"><div class="progress-fill"></div></div>' : ''}
  `
}

function renderFileCard(entry: FileEntry): string {
  const time = entry.startTime
    ? entry.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : ''
  return `
    <div class="file-card" draggable="true" data-id="${entry.id}">
      <span class="drag-handle">⠿</span>
      <div class="file-info">
        <div class="file-name">${entry.name}</div>
        <div class="file-meta">${fmtSize(entry.size)}${time ? ` · ${time}` : ''}</div>
      </div>
      <button class="delete-btn" data-delete="${entry.id}" title="${t('file.delete')}">✕</button>
    </div>
  `
}

function renderSuccess(): string {
  const { result } = getState()
  if (!result) return ''
  return `
    <div class="success-card">
      <div class="success-icon">✅</div>
      <div class="success-title">${t('success.title')}</div>
      <div class="success-sub">${t('success.subtitle')}</div>
      <div class="success-file">📄 ${result.filename} · ${fmtSize(result.sizeBytes)}</div>
    </div>

    <div class="stats">
      <div class="stat">
        <div class="stat-value">${result.fileCount}</div>
        <div class="stat-label">${t('success.files')}</div>
      </div>
      <div class="stat">
        <div class="stat-value">${fmtDuration(result.totalDurationMs)}</div>
        <div class="stat-label">${t('success.total')}</div>
      </div>
      <div class="stat">
        <div class="stat-value">${fmtDistance(result.totalDistanceM)}</div>
        <div class="stat-label">${t('success.distance')}</div>
      </div>
    </div>

    <div class="warning-card">
      <span class="warning-icon">⚠️</span>
      <div>
        <div class="warning-title">${t('success.warning.title')}</div>
        <div class="warning-body">${t('success.warning.body')}</div>
      </div>
    </div>

    <button class="reset-btn" id="reset-btn">${t('reset.button')}</button>
  `
}

function renderError(): string {
  const { error } = getState()
  return `
    <div class="error-card">
      <div class="error-title">${t('error.title')}</div>
      <div class="error-msg">${error ?? ''}</div>
    </div>
    <button class="reset-btn" id="reset-btn">${t('error.reset')}</button>
  `
}
```

- [ ] **Step 3: Verify the page renders in the browser**

```bash
npm run dev
```

Open `http://localhost:5173`. Expected: Dark background, RideStitch header, hero text, FIT/GPX tabs, drop zone, and disabled merge button visible.

- [ ] **Step 4: Commit**

```bash
git add index.html src/ui.ts public/
git commit -m "feat: add UI render module and base HTML structure"
```

---

## Task 8: Main.ts — Event Wiring

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Implement `src/main.ts`**

```typescript
// src/main.ts
import './style.css'
import { getState, setState, resetState, type FileEntry } from './state'
import { setLang } from './i18n'
import { render } from './ui'
import { mergeFitFiles } from './fit-merger'
import { mergeGpxFiles } from './gpx-merger'

// --- Initialise ---
function init(): void {
  const state = getState()
  setLang(state.lang)
  render()
  bindStaticEvents()
}

// --- Static events (header, always present) ---
function bindStaticEvents(): void {
  document.getElementById('lang-btn')!.addEventListener('click', () => {
    const next = getState().lang === 'ja' ? 'en' : 'ja'
    setLang(next)
    setState({ lang: next })
    render()
    bindDynamicEvents()
  })
}

// --- Dynamic events (re-bound after each render) ---
export function bindDynamicEvents(): void {
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
    const rawFiles = files.map(f => f.file)
    let blob: Blob
    let filename: string

    if (format === 'fit') {
      const bytes = await mergeFitFiles(rawFiles)
      blob = new Blob([bytes], { type: 'application/octet-stream' })
      filename = 'merged_activity.fit'
    } else {
      const xml = await mergeGpxFiles(rawFiles)
      blob = new Blob([xml], { type: 'application/gpx+xml' })
      filename = 'merged_activity.gpx'
    }

    // Trigger download
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)

    setState({
      phase: 'done',
      result: {
        filename,
        sizeBytes: blob.size,
        fileCount: files.length,
      },
    })
  } catch (err) {
    setState({ phase: 'error', error: err instanceof Error ? err.message : String(err) })
  }

  render()
  bindDynamicEvents()
}

init()
```

- [ ] **Step 2: Run the full app and manually test the happy path**

```bash
npm run dev
```

Manual test checklist:
- [ ] Page loads with dark theme
- [ ] Language toggle switches JP ↔ EN
- [ ] FIT / GPX tabs switch correctly (drop zone label updates)
- [ ] Drag & drop a `.fit` file onto the drop zone → file card appears
- [ ] Add a second file → merge button becomes active (orange glow)
- [ ] Drag file cards to reorder
- [ ] Click ✕ to delete a file
- [ ] Click "Merge & Download" — merging state shows spinner/progress bar
- [ ] Success screen shows with stats and warning card
- [ ] Reset button returns to idle state

- [ ] **Step 3: Run all unit tests**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire all events in main.ts — drag-drop, merge, reset, i18n toggle"
```

---

## Task 9: Favicon

**Files:**
- Create: `public/favicon.svg`

- [ ] **Step 1: Create the favicon**

```svg
<!-- public/favicon.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#e74c3c"/>
      <stop offset="100%" stop-color="#e67e22"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" rx="7" fill="url(#g)"/>
  <text x="16" y="22" text-anchor="middle" font-size="18" fill="white" font-family="sans-serif" font-weight="bold">R</text>
</svg>
```

- [ ] **Step 2: Commit**

```bash
git add public/favicon.svg
git commit -m "chore: add gradient favicon"
```

---

## Task 10: Cloudflare Pages Deployment

**Files:**
- Create: `wrangler.toml` (optional — Pages can deploy without it)
- Modify: `package.json` (verify build script outputs to `dist/`)

- [ ] **Step 1: Verify the production build works**

```bash
npm run build
```

Expected: `dist/` directory created with `index.html`, `assets/`, etc. No build errors.

- [ ] **Step 2: Preview the production build locally**

```bash
npm run preview
```

Open the printed URL. Verify the app works identically to dev.

- [ ] **Step 3: Create a Cloudflare Pages project**

Option A — Cloudflare Dashboard (recommended for first-time):
1. Log in to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Pages → Create a project → Connect to Git or "Direct Upload"
3. If Direct Upload: upload the `dist/` folder
4. Build settings (if connecting Git):
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Node version: 18

Option B — Wrangler CLI:
```bash
npx wrangler pages deploy dist --project-name ridestitch
```

- [ ] **Step 4: Add `.gitignore`**

```
# .gitignore
node_modules/
dist/
.superpowers/
*.local
```

- [ ] **Step 5: Final commit**

```bash
git add .gitignore
git commit -m "chore: add gitignore, production build verified"
```

---

## Done

At this point:
- All unit tests pass (`npm test`)
- Production build succeeds (`npm run build`)
- App is deployed to Cloudflare Pages
- FIT and GPX files can be merged and downloaded entirely in the browser
