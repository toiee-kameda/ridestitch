# RideStitch — Design Spec

**Date:** 2026-03-24
**Status:** Approved

---

## Overview

RideStitch is a frontend-only web application that merges split cycling activity logs (FIT and GPX formats). Users occasionally stop and restart recording on their Garmin devices, resulting in fragmented logs. RideStitch lets them merge those fragments into a single file locally in the browser, with no server required.

**Deployment target:** Cloudflare Pages (static hosting)

---

## User Flow

1. User downloads split activity files from Garmin Connect or similar
2. User opens RideStitch, drops files into the app, and clicks "Merge & Download"
3. Merged file downloads automatically
4. User deletes the original split activities from Garmin Connect / Strava
5. User uploads the merged file

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript | Type safety for binary data handling |
| Bundler | Vite | Fast builds, easy static output for Cloudflare Pages |
| FIT parsing/writing | `@garmin/fitsdk` | Official Garmin JS SDK — handles both read and write |
| GPX parsing | Browser `DOMParser` | Built-in, zero dependency |
| GPX serialization | `XMLSerializer` | Built-in |
| Framework | None (Vanilla JS) | App is simple enough; avoids React overhead |
| Hosting | Cloudflare Pages | Free tier, global CDN, deploys from `dist/` |

---

## File Structure

```
ridestitch/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── src/
│   ├── main.ts           # Entry point, state management, event wiring
│   ├── state.ts          # App state object and setState() pattern
│   ├── fit-merger.ts     # FIT parse → merge → encode
│   ├── gpx-merger.ts     # GPX parse → merge → serialize
│   ├── ui.ts             # DOM rendering, drag & drop, animations
│   ├── i18n.ts           # Language switching logic
│   └── locales/
│       ├── ja.json       # Japanese strings
│       └── en.json       # English strings
└── public/
    └── favicon.svg
```

---

## Architecture

### State Management

No framework. A single mutable `state` object holds all app state. UI is re-rendered via `setState(patch)` which merges the patch and calls `render()`.

```typescript
interface AppState {
  format: 'fit' | 'gpx';
  files: FileEntry[];        // ordered list of loaded files
  phase: 'idle' | 'ready' | 'merging' | 'done' | 'error';
  lang: 'ja' | 'en';
  result?: MergeResult;
  error?: string;
}
```

### Component Boundaries

Each module has one clear responsibility and communicates through the state object:

- **`state.ts`** — owns the state object, exposes `getState()` and `setState()`
- **`fit-merger.ts`** — pure function: `mergeFitFiles(files: File[]): Promise<Uint8Array>`
- **`gpx-merger.ts`** — pure function: `mergeGpxFiles(files: File[]): Promise<string>`
- **`ui.ts`** — reads state, writes DOM; never calls mergers directly
- **`main.ts`** — wires events: user action → merger → setState → render
- **`i18n.ts`** — `t(key: string): string` lookup with current lang

---

## UI Layout

Single centered column, max-width ~480px, vertically scrollable on mobile.

### Header
- Logo (gradient icon) + "RideStitch" wordmark
- Language toggle button: `JP / EN` (top-right)

### Main Card
1. **Format tabs** — `FIT` | `GPX` (pill tabs, active tab has gradient fill)
2. **Drop zone** — dashed border, icon, instructional text. Shrinks to a smaller "add more" strip once files are loaded.
3. **File list** — one card per file, showing filename, size, and detected start time. Drag handle (⠿) on the left for reordering. Delete button (✕) on the right.
4. **Merge button** — disabled (gray) when < 2 files loaded; active (orange/red gradient with glow) when ready.

### Success Screen (replaces main card)
- Green success card: checkmark, "結合完了！" / "Merge complete!", filename + size
- Stats row: file count · total duration · total distance
- Warning card (orange border): "アップロード前に元のログを削除してください" / "Delete your original activities before uploading" with one-line explanation about Garmin Connect / Strava rejecting duplicates
- Reset button: "↺ 新しい結合を開始" / "↺ Start a new merge"

---

## Merge Logic

### FIT Merge (`fit-merger.ts`)

1. Parse each `File` with `@garmin/fitsdk` Reader
2. Auto-sort files by session start timestamp (defensive — user may have reordered)
3. Collect all `record` messages from all files (GPS points, heart rate, power, cadence, etc.)
4. Collect all `lap` messages; renumber `message_index` sequentially
5. Merge `session` messages into one: sum `total_elapsed_time`, `total_distance`, `total_calories`; keep `start_time` from first file, `timestamp` from last
6. Write a single FIT file with `@garmin/fitsdk` Writer
7. Return as `Uint8Array`; trigger browser download as `merged_activity.fit`

### GPX Merge (`gpx-merger.ts`)

1. Parse each `File` string with `DOMParser`
2. Extract all `<trkpt>` elements across all files
3. Sort trackpoints by `<time>` element value (ISO 8601)
4. Build a new GPX document: single `<trk>` with single `<trkseg>` containing all sorted trackpoints; merge `<metadata>` from first file
5. Serialize with `XMLSerializer`
6. Trigger browser download as `merged_activity.gpx`

---

## Animations

| Trigger | Animation |
|---|---|
| File card appears | Fade-in + slide-down (150ms ease-out) |
| File card removed | Fade-out + slide-up (100ms) |
| Drag reorder | Dragging card becomes semi-transparent; drop target shows insertion line |
| Merge button hover | Glow pulse on `box-shadow` |
| Merging in progress | Button collapses to spinner; thin progress bar appears below the card |
| Success screen appears | Checkmark scales in (300ms spring); stats cards stagger-fade-in |

All animations use CSS transitions/keyframes; no animation library needed.

---

## Internationalization (i18n)

- All UI strings stored in `locales/ja.json` and `locales/en.json`
- `t(key)` function in `i18n.ts` returns the string for the current language
- Default language detected from `navigator.language` (starts with `ja` → JP, else EN)
- Language toggle in header switches instantly without page reload

---

## Constraints & Assumptions

- **Frontend-only**: no server, no upload, no cookies, no analytics. Files never leave the user's device.
- **Same-format merges only**: FIT+FIT→FIT, GPX+GPX→GPX. Cross-format is out of scope.
- **Minimum 2 files required** to enable the merge button.
- **No upper limit** on file count, but browser memory is the practical constraint.
- **Garmin FIT specifics**: `@garmin/fitsdk` handles the binary protocol. Edge cases (e.g., missing GPS, indoor rides) are passed through as-is.
- **No map preview**: out of scope for v1. The focus is fast, reliable merging.
