import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { mergeGpxFiles } from './gpx-merger'

function loadTestGpxFile(filename: string): File {
  const absPath = resolve(__dirname, '../docs/test-data', filename)
  const buf = readFileSync(absPath)
  return new File([buf], filename, { type: 'application/gpx+xml' })
}

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
    const { xml } = await mergeGpxFiles([f1, f2])
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    const pts = doc.querySelectorAll('trkpt')
    expect(pts.length).toBe(4)
  })

  it('sorts trackpoints by time across files', async () => {
    const f1 = makeGpxFile([{ lat: 35.0, lon: 135.0, time: '2024-01-01T09:30:00Z' }])
    const f2 = makeGpxFile([{ lat: 35.1, lon: 135.1, time: '2024-01-01T09:00:00Z' }])
    const { xml } = await mergeGpxFiles([f1, f2])
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    const times = Array.from(doc.querySelectorAll('trkpt time')).map(el => el.textContent)
    expect(times[0]).toBe('2024-01-01T09:00:00Z')
    expect(times[1]).toBe('2024-01-01T09:30:00Z')
  })

  it('produces valid GPX with single trk/trkseg', async () => {
    const f1 = makeGpxFile([{ lat: 35.0, lon: 135.0, time: '2024-01-01T09:00:00Z' }])
    const f2 = makeGpxFile([{ lat: 35.1, lon: 135.1, time: '2024-01-01T09:01:00Z' }])
    const { xml } = await mergeGpxFiles([f1, f2])
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    expect(doc.querySelectorAll('trk').length).toBe(1)
    expect(doc.querySelectorAll('trkseg').length).toBe(1)
  })

  it('computes totalDurationMs from first/last trackpoint times', async () => {
    const f1 = makeGpxFile([{ lat: 35.0, lon: 135.0, time: '2024-01-01T09:00:00Z' }])
    const f2 = makeGpxFile([{ lat: 35.1, lon: 135.1, time: '2024-01-01T10:00:00Z' }])
    const { totalDurationMs } = await mergeGpxFiles([f1, f2])
    expect(totalDurationMs).toBe(3600000) // 1 hour in ms
  })
})

describe('mergeGpxFiles — real test data', () => {
  // File 1: activity_22254872498.gpx  — 4613 trkpts, 2026-03-21T23:54:02Z → 2026-03-22T01:37:13Z
  // File 2: activity_22277738392.gpx  — 6523 trkpts, 2026-03-22T01:58:14Z → 2026-03-22T04:27:53Z
  // Expected: 11136 trkpts, duration = 16,431,000ms
  //
  // Avoid re-parsing the merged XML with DOMParser to prevent memory exhaustion.
  // Use string operations on the serialized XML instead.

  it('merges all trackpoints and computes correct duration', async () => {
    const f1 = loadTestGpxFile('activity_22254872498.gpx')
    const f2 = loadTestGpxFile('activity_22277738392.gpx')
    const { xml, totalDurationMs } = await mergeGpxFiles([f1, f2])

    // Count trkpt occurrences in the serialized XML (no DOM re-parse needed)
    const trkptCount = (xml.match(/<trkpt\b/g) ?? []).length
    expect(trkptCount).toBe(11136)

    // 2026-03-22T04:27:53.000Z − 2026-03-21T23:54:02.000Z = 16,431,000ms
    expect(totalDurationMs).toBe(16431000)
  })

  it('places first and last real trackpoints at correct positions', async () => {
    const f1 = loadTestGpxFile('activity_22254872498.gpx')
    const f2 = loadTestGpxFile('activity_22277738392.gpx')
    const { xml } = await mergeGpxFiles([f1, f2])

    // First trkpt time in the output
    const firstTimeMatch = xml.match(/<trkpt\b[^>]*>[\s\S]*?<time>(.*?)<\/time>/)
    expect(firstTimeMatch?.[1]).toBe('2026-03-21T23:54:02.000Z')

    // Last trkpt time: find the last occurrence
    const allTimes = [...xml.matchAll(/<time>(2026-[^<]+)<\/time>/g)].map(m => m[1])
    // Filter to trkpt times only (skip metadata/trk-level <time> tags)
    const trkptTimes = allTimes.filter(t => t.startsWith('2026-03-2'))
    expect(trkptTimes[trkptTimes.length - 1]).toBe('2026-03-22T04:27:53.000Z')
  })

  it('preserves lat/lon attribute precision from real data', async () => {
    const f1 = loadTestGpxFile('activity_22254872498.gpx')
    const f2 = loadTestGpxFile('activity_22277738392.gpx')
    const { xml } = await mergeGpxFiles([f1, f2])

    // Extract first trkpt lat/lon via regex to avoid large DOM re-parse
    // XMLSerializer inserts xmlns attribute, so allow arbitrary attrs between <trkpt and lat=
    const firstPtMatch = xml.match(/<trkpt\b[^>]*\blat="([^"]+)"[^>]*\blon="([^"]+)"/)
    expect(firstPtMatch).not.toBeNull()
    const lat = parseFloat(firstPtMatch![1])
    const lon = parseFloat(firstPtMatch![2])

    // First point of file 1: lat≈34.8164, lon≈135.5555
    expect(lat).toBeCloseTo(34.8164, 3)
    expect(lon).toBeCloseTo(135.5555, 3)
  })
})
