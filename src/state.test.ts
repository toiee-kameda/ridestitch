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
