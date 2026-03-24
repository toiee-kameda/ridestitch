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
