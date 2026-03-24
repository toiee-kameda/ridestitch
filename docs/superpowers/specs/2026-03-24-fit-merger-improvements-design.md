# FIT Merger Improvements — Design Spec

**Date:** 2026-03-24
**File:** `src/fit-merger.ts`
**Scope:** Improve merged FIT file quality for Garmin Edge "途中終了・再開" use case

---

## Background

When a Garmin Edge activity is stopped mid-ride and restarted (e.g., for a rest break), two separate FIT files are produced. The existing `mergeFitFiles` function concatenates them but has several correctness issues:

1. Avg/max session fields remain from the first file only
2. `totalElapsedTime` does not include the gap between files
3. Intermediate stop/start events are discarded, causing rest periods to be invisible in analysis tools
4. `expandComponents: false` may miss distance data on some devices
5. `mergeHeartRates: false` prevents HRM-belt heart rate from being merged into records

---

## Approach

**Functional helpers** — extract each concern into a private named function. `mergeFitFiles` becomes a thin orchestrator. No classes introduced; consistent with existing codebase style.

---

## Section 1: Session Statistics (`mergeSessionStats`)

### Signature
```typescript
function mergeSessionStats(
  sessions: Record<string, unknown>[],  // ordered oldest-first (file order)
  lapCount: number                       // total lap count across all files, written to numLaps
): Record<string, unknown>
```

`sessions` is always passed in file order (oldest-first). The formula for `totalElapsedTime` depends on this ordering.

### Rules

**Base:** spread `sessions[0]` as the starting point, then override specific fields as described below.

**Sum fields** (unchanged):
`totalTimerTime`, `totalDistance`, `totalCalories`, `totalAscent`, `totalDescent`

**`totalElapsedTime` (changed):**
```
mergedSession.totalElapsedTime = lastSession.startTime + lastSession.totalElapsedTime - firstSession.startTime
```
Includes the inter-file gap (rest break). `totalTimerTime` remains summed (timer-active time only).

⚠️ Note: Garmin Edge writes `session.timestamp = session.startTime` (not the session end time), so the end time must be computed as `startTime + totalElapsedTime` rather than using `timestamp` directly.

**`numLaps`:** set to `lapCount` parameter.
**`firstLapIndex`:** set to `0`.
**`timestamp`:** taken from `sessions[sessions.length - 1].timestamp` (last session's end time).

**Max fields** — `Math.max()` across sessions where the field is not null/undefined. Sessions missing the field are excluded from the comparison. If **all** sessions lack the field, omit it.
- `maxHeartRate` (bpm, integer — keep as-is since source values are integers)
- `maxSpeed` (m/s, float — keep as-is)
- `maxPower` (watts, integer — keep as-is)
- `maxAltitude` (meters, float — keep as-is)

**Avg fields — distance-weighted** (`avgSpeed`, `avgCadence`):
```
value = Σ(field_i × totalDistance_i) / Σ(totalDistance_i)
```
Only sessions where the field is not null/undefined contribute to numerator and denominator.
- `avgSpeed` (m/s): keep as float (no rounding)
- `avgCadence` (rpm): round to integer with `Math.round()`

**Avg fields — timer-weighted** (`avgHeartRate`, `avgPower`, `avgTemperature`):
```
value = Σ(field_i × totalTimerTime_i) / Σ(totalTimerTime_i)
```
Same exclusion rule.
- `avgHeartRate` (bpm): round to integer with `Math.round()`
- `avgPower` (watts): round to integer with `Math.round()`
- `avgTemperature` (°C): round to integer with `Math.round()`

If **all** sessions lack the field → omit field from merged session entirely.

**`normalizedPower`** — recalculate using 4th-power approximation:
```
NP = Math.round((Σ(NP_i^4 × T_i) / Σ(T_i))^(1/4))
```
where `T_i = totalTimerTime_i`. Result rounded to integer (watts).
**Only computed when ALL sessions have a non-null `normalizedPower`.** If any session is missing it, omit the field.

**"Other" fields** (all remaining fields not listed above): taken from `sessions[0]` via the initial spread. This includes `sport`, `subSport`, `trainingEffect`, `lactateThreshold`, etc. These are training-metadata fields that are not meaningfully aggregated and are taken from the first session as the canonical activity type descriptor.

**`totalDurationMs` in `FitMergeResult`:** reflects `mergedSession.totalElapsedTime` (wall-clock time, including rest breaks). This is the value shown in the app's result UI.

---

## Section 2: Event Messages (`collectAllEvents`)

### Signature
```typescript
function collectAllEvents(
  allMessages: Record<string, unknown[]>[]
): unknown[]
```

Returns all event messages from all files, sorted by `timestamp` ascending.

### Problem (current)
```
File 1: start → [records] → stop     ← stop discarded
File 2: start → [records] → stop     ← start discarded
Result: start → [all records] → stop
```
Rest break between files is invisible to analysis tools.

### Fix
```
File 1: start-event ... stop-event
File 2: start-event ... stop-event
Merged events (sorted): start → stop → start → stop
```

All events from all files are collected, sorted by `timestamp`, and written as a single block **before** record messages.

**On timestamp ordering:** for the target use case (Garmin Edge activities stopped and restarted), File 2 always starts after File 1 ends — there is no overlap. Block separation (events block, then records block) is therefore acceptable and simpler than full interleaving. Analysis tools use event timestamps, not file position, to detect pauses.

No deduplication is performed (each file produces exactly one start/stop pair).

### Encode order (updated)
```
1. file_id
2. All events (all files, timestamp-sorted)   ← changed
3. All records (timestamp-sorted)
4. All laps (renumbered)
5. Merged session
6. Activity message
```

---

## Section 3: Verification (`verifyMergedFit`)

### Signature
```typescript
function verifyMergedFit(
  data: Uint8Array,
  expected: { totalDistanceM: number; totalElapsedTimeS: number; recordCount: number }
): string[]
```

Re-decodes the generated `data` using the same options as `decodeFit` and checks:

| Field | Pass condition | Warning message on failure |
|---|---|---|
| `session.totalDistance` | `Math.abs(decoded - expected) <= 1.0` | `"totalDistance mismatch: expected X, got Y"` |
| `session.totalElapsedTime` | `Math.abs(decoded - expected) <= 1.0` | `"totalElapsedTime mismatch: expected X, got Y"` |
| `recordMesgs` count | `decoded === expected` (exact) | `"record count mismatch: expected X, got Y"` |

On failure: `console.warn(message)` and append to returned array. Never throws.

### `FitMergeResult` update
```typescript
export interface FitMergeResult {
  data: Uint8Array
  totalDurationMs?: number
  totalDistanceM?: number
  warnings: string[]   // added (empty array when no issues)
}
```

Adding `warnings` is additive — existing callers continue to compile without changes.

---

## Section 4: Decode Options

### `decodeFit` changes
```typescript
decoder.read({
  convertDateTimesToDates: false,  // unchanged
  convertTypesToStrings: false,    // unchanged
  applyScaleAndOffset: true,       // unchanged
  expandSubFields: false,          // unchanged
  expandComponents: true,          // FIXED: expand compressed_speed_distance for distance accuracy
  mergeHeartRates: true,           // FIXED: requires expandComponents=true (SDK requirement)
})
```

`expandComponents: false → true`: Some Garmin devices encode distance via `compressed_speed_distance` component. Without expansion, distance fields in records may be absent.

`mergeHeartRates: false → true`: The SDK requires `expandComponents: true` as a prerequisite. Enables HRM-belt heart rate to be merged into record messages, giving complete HR data.

---

## Test Updates

Existing test in `fit-merger.test.ts`:

- `totalElapsedTime` expectation changes from sum of both files' elapsed times (~15229s) to `lastSession.timestamp - firstSession.startTime` (wall-clock including inter-file gap). **Exact value must be read from the test FIT files during implementation** (decode both files, compute `file2.session.timestamp - file1.session.startTime`).
- `decodeMergedStats` helper inside the test must apply the same updated decode options (`expandComponents: true`, `mergeHeartRates: true`).
- Existing `result` shape assertions: add `warnings: []` check to the clean-merge test to confirm no warnings are emitted on valid input.
- Add a new test case: `warnings` is empty when merging the two real FIT test files.

---

## What Does NOT Change

- Function signature: `mergeFitFiles(files: File[]): Promise<FitMergeResult>`
- `sortFilesByStartTime` function
- `convertDateTimesToDates: false` and `convertTypesToStrings: false` in `decodeFit`
- `distanceOffset` logic (record-level cumulative distance fix, already implemented)
