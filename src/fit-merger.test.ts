import { describe, it, expect } from 'vitest'
import { mergeFitFiles, sortFilesByStartTime } from './fit-merger'

// Minimal valid FIT file bytes for testing (14-byte header + CRC)
function makeMinimalFitFile(name = 'test.fit'): File {
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
