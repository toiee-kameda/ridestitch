# RideStitch — merge-activities

Browser-side FIT/GPX activity file merger. Vanilla TypeScript, no framework.

## Commands

```bash
npm run dev      # Dev server (Vite)
npm run build    # Type-check (tsc --noEmit) + bundle (vite build)
npm test         # Run tests once (Vitest)
npm run preview  # Serve dist/
```

## Architecture

```
src/
  main.ts        # Entry point — init, static/dynamic event binding
  state.ts       # App state (format, files, phase, lang, mergeResult)
  ui.ts          # Renders entire DOM from state (called after every state change)
  fit-merger.ts  # FIT file merge + sort logic (@garmin/fitsdk)
  gpx-merger.ts  # GPX file merge logic
  i18n.ts        # Language switching (ja/en)
  locales/       # en.json, ja.json
  types/         # garmin.d.ts — hand-written types for fitsdk
  style.css
```

App phases: `idle → ready → merging → done | error`

## Key Patterns

- `render()` is a full re-render — called after every state mutation
- `bindDynamicEvents()` must be called after each render (dynamic DOM rebuilt)
- `bindStaticEvents()` is called once at init (header elements always present)
- State is plain object in memory; no persistence

## Gotchas

- `tsconfig.json` has `noEmit: true` — `tsc` is type-check only; actual bundling is done by Vite
- Two config file pairs exist (`vite.config.js`/`.ts`, `vitest.config.js`/`.ts`) — `.ts` versions take precedence
- Tests use `happy-dom` environment (configured in `vitest.config.ts`)
- `@garmin/fitsdk` types are incomplete — `src/types/garmin.d.ts` fills the gaps

## i18n

Language toggled via `#lang-btn` in header. Default: `ja`. Locales in `src/locales/`.
