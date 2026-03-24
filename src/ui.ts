// src/ui.ts
import { getState, type FileEntry } from './state'
import { t } from './i18n'

// Utility: escape HTML to prevent XSS when interpolating user data
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Utility: format bytes
function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Utility: format duration (ms → "2h 34m")
function fmtDuration(ms?: number): string {
  if (ms == null) return '--'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// Utility: format distance (m → "87.3 km")
function fmtDistance(m?: number): string {
  if (m == null) return '--'
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
        <div class="file-name">${esc(entry.name)}</div>
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
      <div class="success-file">📄 ${esc(result.filename)} · ${fmtSize(result.sizeBytes)}</div>
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
      <div class="error-msg">${esc(error ?? '')}</div>
    </div>
    <button class="reset-btn" id="reset-btn">${t('error.reset')}</button>
  `
}
