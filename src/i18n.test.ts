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
