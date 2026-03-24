import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { Decoder, Stream } from '@garmin/fitsdk'
import { mergeFitFiles, sortFilesByStartTime } from './fit-merger'

// Minimal valid FIT file bytes for testing (14-byte header + CRC)
function makeMinimalFitFile(name = 'test.fit'): File {
  return new File([new Uint8Array(20).fill(0)], name, { type: 'application/octet-stream' })
}

function loadTestFitFile(filename: string): File {
  const absPath = resolve(__dirname, '../docs/test-data', filename)
  const buf = readFileSync(absPath)
  return new File([buf], filename, { type: 'application/octet-stream' })
}

function decodeMergedStats(data: Uint8Array): { totalDistanceM: number; totalElapsedTimeS: number } {
  const stream = Stream.fromArrayBuffer(data.buffer as ArrayBuffer)
  const decoder = new Decoder(stream)
  const { messages } = decoder.read({
    convertDateTimesToDates: false,
    convertTypesToStrings: false,
    applyScaleAndOffset: true,
    expandSubFields: false,
    expandComponents: true,
    mergeHeartRates: true,
  })
  const sessions = (messages as Record<string, unknown[]>)['sessionMesgs'] ?? []
  const s = sessions[0] as Record<string, number> | undefined
  return {
    totalDistanceM: s?.totalDistance ?? NaN,
    totalElapsedTimeS: s?.totalElapsedTime ?? NaN,
  }
}

function decodeMergedSession(data: Uint8Array): Record<string, number> {
  const stream = Stream.fromArrayBuffer(data.buffer as ArrayBuffer)
  const decoder = new Decoder(stream)
  const { messages } = decoder.read({
    convertDateTimesToDates: false,
    convertTypesToStrings: false,
    applyScaleAndOffset: true,
    expandSubFields: false,
    expandComponents: true,
    mergeHeartRates: true,
  })
  const sessions = (messages as Record<string, unknown[]>)['sessionMesgs'] ?? []
  return (sessions[0] ?? {}) as Record<string, number>
}

function countMergedEvents(data: Uint8Array): number {
  const stream = Stream.fromArrayBuffer(data.buffer as ArrayBuffer)
  const decoder = new Decoder(stream)
  const { messages } = decoder.read({
    convertDateTimesToDates: false,
    convertTypesToStrings: false,
    applyScaleAndOffset: true,
    expandSubFields: false,
    expandComponents: true,
    mergeHeartRates: true,
  })
  return ((messages as Record<string, unknown[]>)['eventMesgs'] ?? []).length
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

  it('merges two real FIT files with correct distance and time', async () => {
    // File 1: ~30994.77m, ~6252s
    // File 2: ~44799.25m, ~8977s
    // Expected merged: ~75794m, ~15229s
    const f1 = loadTestFitFile('22254872498_ACTIVITY.fit')
    const f2 = loadTestFitFile('22277738392_ACTIVITY.fit')

    const result = await mergeFitFiles([f1, f2])

    // Verify stats returned by mergeFitFiles
    expect(result.totalDistanceM).toBeCloseTo(75794, -1)   // within ~10m
    // totalElapsedTime = wall-clock (startTime2 + elapsed2 - startTime1)
    // = (1143079094 + 8977.719) - 1143071581 = 16490.719s
    expect(result.totalDurationMs).toBeCloseTo(16490719, -3)

    // Verify by re-decoding the merged FIT output
    const stats = decodeMergedStats(result.data)
    expect(stats.totalDistanceM).toBeCloseTo(75794, -1)
    // totalElapsedTime: wall-clock = (startTime2 + elapsed2) - startTime1
    // = (1143079094 + 8977.719) - 1143071581 = 16490.719s
    expect(stats.totalElapsedTimeS).toBeCloseTo(16490.719, 0)
  })

  it('returns empty warnings array on a clean merge', async () => {
    const f1 = loadTestFitFile('22254872498_ACTIVITY.fit')
    const f2 = loadTestFitFile('22277738392_ACTIVITY.fit')
    const result = await mergeFitFiles([f1, f2])
    expect(result.warnings).toEqual([])
  })

  it('preserves all events from all files in merged output', async () => {
    const f1 = loadTestFitFile('22254872498_ACTIVITY.fit')
    const f2 = loadTestFitFile('22277738392_ACTIVITY.fit')
    const result = await mergeFitFiles([f1, f2])
    // File 1 has 105 events, File 2 has 124 events → merged = 229
    expect(countMergedEvents(result.data)).toBe(229)
  })

  it('merges session avg/max stats correctly', async () => {
    const f1 = loadTestFitFile('22254872498_ACTIVITY.fit')
    const f2 = loadTestFitFile('22277738392_ACTIVITY.fit')
    const result = await mergeFitFiles([f1, f2])
    const s = decodeMergedSession(result.data)

    // totalElapsedTime: wall-clock = (file2.startTime + file2.totalElapsedTime) - file1.startTime
    // = (1143079094 + 8977.719) - 1143071581 = 16490.719s
    expect(s.totalElapsedTime).toBeCloseTo(16490.719, 0)

    // max fields
    expect(s.maxHeartRate).toBe(181)   // max(181, 179)
    expect(s.maxPower).toBe(673)       // max(673, 432)

    // avg fields (see Key Numbers in plan for formula)
    expect(s.avgHeartRate).toBe(152)       // timer-weighted
    expect(s.avgPower).toBe(113)           // timer-weighted
    expect(s.avgCadence).toBe(70)          // distance-weighted
    expect(s.normalizedPower).toBe(140)    // 4th-power approximation
  })
})
