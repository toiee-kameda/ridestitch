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
 */
function decodeFit(bytes: Uint8Array): Record<string, unknown[]> {
  const stream = Stream.fromArrayBuffer(bytes.buffer)
  const decoder = new Decoder(stream)
  const { messages, errors } = decoder.read({
    convertDateTimesToDates: false,
    convertTypesToStrings: false,
    applyScaleAndOffset: false,
    expandSubFields: false,
    expandComponents: false,
    mergeHeartRates: false,
  })
  if (errors.length > 0) {
    throw new Error(`Failed to decode FIT file: ${errors[0]}`)
  }
  return messages as Record<string, unknown[]>
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
  const allRecords: unknown[] = []
  for (const msgs of allMessages) {
    const records = (msgs['record'] as unknown[]) ?? []
    allRecords.push(...records)
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
    const laps = (msgs['lap'] as unknown[]) ?? []
    for (const lap of laps) {
      const lapCopy = { ...(lap as Record<string, unknown>) }
      lapCopy['messageIndex'] = lapIndex++
      allLaps.push(lapCopy)
    }
  }

  // Merge session messages into one
  const allSessions: Record<string, unknown>[] = []
  for (const msgs of allMessages) {
    const sessions = (msgs['session'] as unknown[]) ?? []
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
    const acts = (msgs['activity'] as unknown[]) ?? []
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
  const fileIdMsgs = (firstMsgs['fileId'] as unknown[]) ?? []
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

  // 2. All event messages from first file (start event)
  const firstEvents = (firstMsgs['event'] as unknown[]) ?? []
  const startEvents = firstEvents.filter(
    (e) => (e as Record<string, unknown>)['event'] === 0 /* timer */ &&
            (e as Record<string, unknown>)['eventType'] === 0 /* start */
  )
  for (const ev of startEvents) {
    encoder.onMesg(Profile.MesgNum.EVENT, ev as object)
  }

  // 3. All record messages
  for (const record of allRecords) {
    encoder.onMesg(Profile.MesgNum.RECORD, record as object)
  }

  // 4. Stop event from last file
  const lastMsgs = allMessages[allMessages.length - 1]
  const lastEvents = (lastMsgs['event'] as unknown[]) ?? []
  const stopEvents = lastEvents.filter(
    (e) => (e as Record<string, unknown>)['event'] === 0 /* timer */ &&
            ((e as Record<string, unknown>)['eventType'] === 1 /* stop */ ||
             (e as Record<string, unknown>)['eventType'] === 4 /* stop_disable_all */)
  )
  for (const ev of stopEvents) {
    encoder.onMesg(Profile.MesgNum.EVENT, ev as object)
  }

  // 5. Lap messages
  for (const lap of allLaps) {
    encoder.onMesg(Profile.MesgNum.LAP, lap as object)
  }

  // 6. Merged session
  if (Object.keys(mergedSession).length > 0) {
    encoder.onMesg(Profile.MesgNum.SESSION, mergedSession)
  }

  // 7. Activity message
  if (Object.keys(mergedActivity).length > 0) {
    encoder.onMesg(Profile.MesgNum.ACTIVITY, mergedActivity)
  }

  // Extract stats from merged session
  // With applyScaleAndOffset=false: totalElapsedTime raw = ms (scale=1000, unit=s)
  //                                 totalDistance raw = cm (scale=100, unit=m)
  let totalDurationMs: number | undefined
  let totalDistanceM: number | undefined
  const rawDuration = mergedSession['totalElapsedTime']
  if (typeof rawDuration === 'number') totalDurationMs = rawDuration
  const rawDistance = mergedSession['totalDistance']
  if (typeof rawDistance === 'number') totalDistanceM = rawDistance / 100

  return { data: encoder.close(), totalDurationMs, totalDistanceM }
}
