export async function mergeGpxFiles(files: File[]): Promise<string> {
  if (files.length < 2) {
    throw new Error('Merge requires at least 2 files')
  }

  const parser = new DOMParser()
  const allTrkpts: Element[] = []
  let firstDoc: Document | null = null
  let firstMeta: Element | null = null

  for (const file of files) {
    const text = await file.text()
    const doc = parser.parseFromString(text, 'application/xml')
    if (!firstDoc) {
      firstDoc = doc
      firstMeta = doc.querySelector('metadata')
    }
    doc.querySelectorAll('trkpt').forEach(pt => allTrkpts.push(pt))
  }

  // Sort by <time> content
  allTrkpts.sort((a, b) => {
    const ta = a.querySelector('time')?.textContent ?? ''
    const tb = b.querySelector('time')?.textContent ?? ''
    return ta < tb ? -1 : ta > tb ? 1 : 0
  })

  // Build output document using a template string and re-parse
  let trkptsXml = ''
  for (const pt of allTrkpts) {
    trkptsXml += new XMLSerializer().serializeToString(pt)
  }

  let metaXml = ''
  if (firstMeta) {
    metaXml = new XMLSerializer().serializeToString(firstMeta)
  }

  const gpxString = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RideStitch" xmlns="http://www.topografix.com/GPX/1/1">
${metaXml ? '  ' + metaXml : ''}
  <trk>
    <trkseg>
${trkptsXml.split('\n').map(line => line ? '      ' + line : '').join('\n')}
    </trkseg>
  </trk>
</gpx>`

  return gpxString
}
