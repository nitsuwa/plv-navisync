export interface EventFeedbackPin { id: string; x: number; y: number; comment: string }
export interface EventFeedbackResolution { feedback: string; addressedAt: string; addressedBy: string; note: string }
export type EventFeedbackResolutions = Record<string, Record<string, EventFeedbackResolution>>;
export function isFeedbackPinAddressed(feedback: string, resolution?: EventFeedbackResolution): boolean {
  return Boolean(resolution && resolution.feedback === feedback && Number.isFinite(Date.parse(resolution.addressedAt)) && resolution.addressedBy);
}
export function countOpenFeedbackPins(feedback: Record<string, string> = {}, resolutions: EventFeedbackResolutions = {}): number {
  return Object.entries(feedback ?? {}).reduce((count, [locationId, value]) => count + readEventFeedback(value).pins.filter(pin => !isFeedbackPinAddressed(value, resolutions?.[locationId]?.[pin.id])).length, 0);
}
export function feedbackPinsWithStatus(value?: string, resolutions?: Record<string, EventFeedbackResolution>): Array<EventFeedbackPin & { addressed: boolean }> {
  return readEventFeedback(value).pins.map(pin => ({ ...pin, addressed: isFeedbackPinAddressed(value ?? "", resolutions?.[pin.id]) }));
}
const PREFIX = "@event-feedback/v1:";
export function readEventFeedback(value?: string): { text: string; pins: EventFeedbackPin[] } {
  if (typeof value !== 'string') return { text: '', pins: [] };
  if (!value.startsWith(PREFIX)) return { text: value, pins: [] };
  try {
    const data = JSON.parse(value.slice(PREFIX.length));
    if (typeof data.text !== "string" || !Array.isArray(data.pins)) throw new Error("Invalid feedback");
    return { text: data.text, pins: data.pins.filter((pin: EventFeedbackPin) => pin && typeof pin === 'object' && typeof pin.id === "string" && Number.isFinite(pin.x) && Number.isFinite(pin.y) && pin.x >= 0 && pin.y >= 0 && typeof pin.comment === "string" && pin.comment.trim()).slice(0, 30) };
  } catch { return { text: value, pins: [] }; }
}
export function writeEventFeedback(text: string, pins: EventFeedbackPin[]): string {
  return pins.length ? PREFIX + JSON.stringify({ text, pins }) : text;
}
export function eventFeedbackText(value?: string): string {
  const feedback = readEventFeedback(value);
  return [feedback.text, ...feedback.pins.map((pin, index) => `Pin ${index + 1}: ${pin.comment}`)].filter(Boolean).join(" · ");
}
