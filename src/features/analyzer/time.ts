/**
 * All analyzer times are shown in Pakistan time (PKT = UTC+5, no daylight saving).
 */
export const PKT_ZONE = 'Asia/Karachi'
export const PKT_OFFSET_MS = 5 * 3_600_000

/** "22 Oct, 7:45 pm PKT" */
export function formatPkt(ms: number, { withZone = true }: { withZone?: boolean } = {}): string {
  const text = new Date(ms).toLocaleString('en-GB', { timeZone: PKT_ZONE, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })
  return withZone ? `${text} PKT` : text
}

/** "7:45 pm" */
export function formatPktTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', { timeZone: PKT_ZONE, hour: 'numeric', minute: '2-digit' })
}
