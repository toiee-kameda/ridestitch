export interface GpxMergeResult {
  xml: string
  totalDurationMs?: number
}

export async function mergeGpxFiles(files: File[]): Promise<GpxMergeResult> {
  if (files.length < 2) {
    throw new Error('Merge requires at least 2 files')
  }

  const parser = new DOMParser()
  const allTrkpts: Element[] = []
  let firstDoc: Document | null = null

  for (const file of files) {
    const text = await file.text()
    const doc = parser.parseFromString(text, 'application/xml')
    if (doc.querySelector('parsererror')) {
      throw new Error(`Failed to parse GPX file: ${file.name}`)
    }
    if (!firstDoc) firstDoc = doc
    doc.querySelectorAll('trkpt').forEach(pt => allTrkpts.push(pt))
  }

  // Sort by <time> content
  allTrkpts.sort((a, b) => {
    const ta = a.querySelector('time')?.textContent ?? ''
    const tb = b.querySelector('time')?.textContent ?? ''
    return ta < tb ? -1 : ta > tb ? 1 : 0
  })

  // Compute duration from first/last trackpoint times
  let totalDurationMs: number | undefined
  if (allTrkpts.length >= 2) {
    const firstTime = allTrkpts[0].querySelector('time')?.textContent
    const lastTime = allTrkpts[allTrkpts.length - 1].querySelector('time')?.textContent
    if (firstTime && lastTime) {
      const diff = new Date(lastTime).getTime() - new Date(firstTime).getTime()
      if (!isNaN(diff) && diff >= 0) totalDurationMs = diff
    }
  }

  // Build output document
  const gpx = firstDoc!.createElement('gpx')
  gpx.setAttribute('version', '1.1')
  gpx.setAttribute('creator', 'RideStitch')
  gpx.setAttribute('xmlns', 'http://www.topografix.com/GPX/1/1')

  // Copy metadata from first file if present
  const meta = firstDoc!.querySelector('metadata')
  if (meta) gpx.appendChild(meta.cloneNode(true))

  const trk = firstDoc!.createElement('trk')
  const trkseg = firstDoc!.createElement('trkseg')

  for (const pt of allTrkpts) {
    trkseg.appendChild(pt.cloneNode(true))
  }

  trk.appendChild(trkseg)
  gpx.appendChild(trk)

  return { xml: new XMLSerializer().serializeToString(gpx), totalDurationMs }
}
