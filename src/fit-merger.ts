import { Decoder, Encoder, Stream, Profile } from '@garmin/fitsdk'
import type { FileEntry } from './state'

/**
 * Sort FileEntry array by startTime ascending.
 * Entries without a startTime retain their relative original order (stable sort).
 */
export function sortFilesByStartTime(entries: FileEntry[]): FileEntry[] {
  return [...entries].sort((a, b) => {
    if (a.startTime == null && b.startTime == null) return 0
    if (a.startTime == null) return 1
    if (b.startTime == null) return -1
    return a.startTime.getTime() - b.startTime.getTime()
  })
}

/**
 * Read a File object into a Uint8Array.
 */
async function readFileBytes(file: File): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer()
  return new Uint8Array(buffer)
}

/**
 * Decode a FIT file's bytes and return its messages object.
 * Uses convertDateTimesToDates=false so we work with raw FIT epoch numbers,
 * and convertTypesToStrings=false so we keep numeric enum values for re-encoding.
 * applyScaleAndOffset=true is required because the Encoder.onMesg expects
 * real-world values (meters, seconds) and internally unapplies scale/offset
 * before writing to the file. Passing raw values would cause double-scaling.
 */
function decodeFit(bytes: Uint8Array): Record<string, unknown[]> {
  const stream = Stream.fromArrayBuffer(bytes.buffer)
  const decoder = new Decoder(stream)
  const { messages, errors } = decoder.read({
    convertDateTimesToDates: false,
    convertTypesToStrings: false,
    applyScaleAndOffset: true,
    expandSubFields: false,
    expandComponents: true,   // FIXED: expand compressed_speed_distance for distance accuracy
    mergeHeartRates: true,    // FIXED: requires expandComponents=true (SDK requirement)
  })
  if (errors.length > 0) {
    throw new Error(`Failed to decode FIT file: ${errors[0]}`)
  }
  return messages as Record<string, unknown[]>
}

/**
 * Re-decode merged FIT data and verify key fields round-trip correctly.
 * Returns a list of warning strings (empty if all checks pass). Never throws.
 * On failure, also calls console.warn so issues appear in the browser console.
 */
function verifyMergedFit(
  data: Uint8Array,
  expected: { totalDistanceM: number; totalElapsedTimeS: number; recordCount: number }
): string[] {
  const warnings: string[] = []
  let messages: Record<string, unknown[]>
  try {
    messages = decodeFit(data)
  } catch {
    const msg = 'verifyMergedFit: failed to re-decode merged file'
    console.warn(msg)
    warnings.push(msg)
    return warnings
  }

  const sessions = (messages['sessionMesgs'] ?? []) as Record<string, number>[]
  const s = sessions[0]
  if (!s) {
    const msg = 'verifyMergedFit: no session message found in merged file'
    console.warn(msg)
    warnings.push(msg)
  } else {
    if (typeof s['totalDistance'] === 'number' &&
        Math.abs(s['totalDistance'] - expected.totalDistanceM) > 1.0) {
      const msg = `totalDistance mismatch: expected ${expected.totalDistanceM}, got ${s['totalDistance']}`
      console.warn(msg)
      warnings.push(msg)
    }
    if (typeof s['totalElapsedTime'] === 'number' &&
        Math.abs(s['totalElapsedTime'] - expected.totalElapsedTimeS) > 1.0) {
      const msg = `totalElapsedTime mismatch: expected ${expected.totalElapsedTimeS}, got ${s['totalElapsedTime']}`
      console.warn(msg)
      warnings.push(msg)
    }
  }

  const recordCount = (messages['recordMesgs'] ?? []).length
  if (recordCount !== expected.recordCount) {
    const msg = `record count mismatch: expected ${expected.recordCount}, got ${recordCount}`
    console.warn(msg)
    warnings.push(msg)
  }

  return warnings
}

/**
 * Collect all event messages from all decoded files, sorted by timestamp ascending.
 * This preserves intermediate stop/start events (e.g., rest breaks between files)
 * that would otherwise be discarded.
 */
function collectAllEvents(allMessages: Record<string, unknown[]>[]): unknown[] {
  const allEvents: unknown[] = []
  for (const msgs of allMessages) {
    const events = (msgs['eventMesgs'] as unknown[]) ?? []
    allEvents.push(...events)
  }
  return allEvents.sort((a, b) => {
    const aTs = (a as Record<string, number>)['timestamp'] ?? 0
    const bTs = (b as Record<string, number>)['timestamp'] ?? 0
    return aTs - bTs
  })
}

/**
 * Merge multiple FIT files (Activity type) into a single FIT file.
 *
 * Strategy:
 * - All record messages are concatenated in time order.
 * - All lap messages are concatenated and lap_message_index is renumbered.
 * - Session messages are merged into one:
 *   - start_time from the first session
 *   - timestamp from the last session
 *   - total_elapsed_time, total_timer_time, total_distance, total_calories: summed
 *   - num_laps: summed
 *   - Other fields: taken from the first session
 * - A single activity message is written.
 * - A file_id message is written at the top.
 *
 * @param files Array of File objects (must be >= 2)
 * @returns Merged FIT file as Uint8Array
 */
export interface FitMergeResult {
  data: Uint8Array
  totalDurationMs?: number
  totalDistanceM?: number
  warnings: string[]
}

export async function mergeFitFiles(files: File[]): Promise<FitMergeResult> {
  if (files.length < 2) {
    throw new Error('mergeFitFiles requires at least 2 files')
  }

  // Decode all files
  const allMessages = await Promise.all(
    files.map(async (f) => {
      const bytes = await readFileBytes(f)
      return decodeFit(bytes)
    })
  )

  // Collect all record messages (GPS points, HR, power, etc.)
  // The `distance` field in FIT records is cumulative from the start of each file.
  // We must add a per-file offset so that distance increases monotonically across
  // the merged file. Strava (unlike Garmin Connect) reads the record-level `distance`
  // field rather than session.totalDistance, and breaks on resets.
  const allRecords: unknown[] = []
  let distanceOffset = 0
  for (const msgs of allMessages) {
    const records = (msgs['recordMesgs'] as unknown[]) ?? []
    const adjusted = records.map((r) => {
      const rec = r as Record<string, unknown>
      if (typeof rec['distance'] === 'number') {
        return { ...rec, distance: rec['distance'] + distanceOffset }
      }
      return rec
    })
    allRecords.push(...adjusted)
    // The last record's distance is the total distance for this file
    const lastRec = records[records.length - 1] as Record<string, unknown> | undefined
    const lastDist = typeof lastRec?.['distance'] === 'number' ? lastRec['distance'] : 0
    distanceOffset += lastDist
  }

  // Sort records by timestamp (FIT epoch seconds, numeric)
  allRecords.sort((a, b) => {
    const aTs = (a as Record<string, number>)['timestamp'] ?? 0
    const bTs = (b as Record<string, number>)['timestamp'] ?? 0
    return aTs - bTs
  })

  // Collect and renumber lap messages
  const allLaps: unknown[] = []
  let lapIndex = 0
  for (const msgs of allMessages) {
    const laps = (msgs['lapMesgs'] as unknown[]) ?? []
    for (const lap of laps) {
      const lapCopy = { ...(lap as Record<string, unknown>) }
      lapCopy['messageIndex'] = lapIndex++
      allLaps.push(lapCopy)
    }
  }

  // Merge session messages into one
  const allSessions: Record<string, unknown>[] = []
  for (const msgs of allMessages) {
    const sessions = (msgs['sessionMesgs'] as unknown[]) ?? []
    for (const s of sessions) {
      allSessions.push(s as Record<string, unknown>)
    }
  }

  let mergedSession: Record<string, unknown> = {}
  if (allSessions.length > 0) {
    // Base on first session
    mergedSession = { ...allSessions[0] }

    // Sum numeric fields across all sessions
    const numericSumFields = [
      'totalElapsedTime',
      'totalTimerTime',
      'totalDistance',
      'totalCalories',
      'totalAscent',
      'totalDescent',
    ]
    for (const field of numericSumFields) {
      const total = allSessions.reduce((acc, s) => {
        const v = s[field]
        return acc + (typeof v === 'number' ? v : 0)
      }, 0)
      if (allSessions.some((s) => s[field] != null)) {
        mergedSession[field] = total
      }
    }

    // timestamp from last session
    const lastSession = allSessions[allSessions.length - 1]
    if (lastSession['timestamp'] != null) {
      mergedSession['timestamp'] = lastSession['timestamp']
    }

    // num_laps is total lap count
    mergedSession['numLaps'] = lapIndex

    // firstLapIndex = 0
    mergedSession['firstLapIndex'] = 0
  }

  // Collect activity message from first file (or synthesize)
  const allActivities: Record<string, unknown>[] = []
  for (const msgs of allMessages) {
    const acts = (msgs['activityMesgs'] as unknown[]) ?? []
    for (const a of acts) {
      allActivities.push(a as Record<string, unknown>)
    }
  }

  let mergedActivity: Record<string, unknown> = {}
  if (allActivities.length > 0) {
    mergedActivity = { ...allActivities[0] }
    // Update timestamp from last activity
    const lastAct = allActivities[allActivities.length - 1]
    if (lastAct['timestamp'] != null) {
      mergedActivity['timestamp'] = lastAct['timestamp']
    }
    mergedActivity['numSessions'] = 1
  }

  // Get file_id from first file
  const firstMsgs = allMessages[0]
  const fileIdMsgs = (firstMsgs['fileIdMesgs'] as unknown[]) ?? []
  const fileId: Record<string, unknown> =
    fileIdMsgs.length > 0
      ? { ...(fileIdMsgs[0] as Record<string, unknown>) }
      : { type: 4 /* activity */ }

  // Update timeCreated to merged start time
  if (mergedSession['startTime'] != null) {
    fileId['timeCreated'] = mergedSession['startTime']
  }

  // Encode the merged FIT file
  const encoder = new Encoder()

  // 1. file_id
  encoder.onMesg(Profile.MesgNum.FILE_ID, fileId)

  // 2. All events from all files (timestamp-sorted)
  // FIXED: previously only wrote start from file 1 and stop from last file,
  // discarding intermediate stop/start events (rest breaks). Now all events
  // from all files are collected and written in chronological order.
  const allEvents = collectAllEvents(allMessages)
  for (const ev of allEvents) {
    encoder.onMesg(Profile.MesgNum.EVENT, ev as object)
  }

  // 3. All record messages
  for (const record of allRecords) {
    encoder.onMesg(Profile.MesgNum.RECORD, record as object)
  }

  // 4. Lap messages
  for (const lap of allLaps) {
    encoder.onMesg(Profile.MesgNum.LAP, lap as object)
  }

  // 5. Merged session
  if (Object.keys(mergedSession).length > 0) {
    encoder.onMesg(Profile.MesgNum.SESSION, mergedSession)
  }

  // 6. Activity message
  if (Object.keys(mergedActivity).length > 0) {
    encoder.onMesg(Profile.MesgNum.ACTIVITY, mergedActivity)
  }

  // Extract stats from merged session
  // With applyScaleAndOffset=true: totalElapsedTime is in seconds, totalDistance in meters
  let totalDurationMs: number | undefined
  let totalDistanceM: number | undefined
  const rawDuration = mergedSession['totalElapsedTime']
  if (typeof rawDuration === 'number') totalDurationMs = rawDuration * 1000
  const rawDistance = mergedSession['totalDistance']
  if (typeof rawDistance === 'number') totalDistanceM = rawDistance

  const data = encoder.close()

  const warnings = verifyMergedFit(data, {
    totalDistanceM: totalDistanceM ?? 0,
    totalElapsedTimeS: totalDurationMs != null ? totalDurationMs / 1000 : 0,
    recordCount: allRecords.length,
  })

  return { data, totalDurationMs, totalDistanceM, warnings }
}
