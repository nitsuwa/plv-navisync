import { describe, expect, it } from "vitest";
import { readEventFeedback, writeEventFeedback, eventFeedbackText, isFeedbackPinAddressed, countOpenFeedbackPins } from "../eventFeedbackPins";
describe("event feedback pins", () => {
  it("skips malformed entries without discarding valid neighboring pins", () => {
    const raw = '@event-feedback/v1:' + JSON.stringify({ text: '', pins: [null, 2, { id: 'valid', x: 10, y: 20, comment: 'Clear the gate' }] });
    expect(readEventFeedback(raw).pins.map(pin => pin.id)).toEqual(['valid']);
    expect(readEventFeedback(null as never)).toEqual({ text: '', pins: [] });
    expect(readEventFeedback({} as never)).toEqual({ text: '', pins: [] });
  });
  it("does not consider an invalid resolution timestamp addressed", () => {
    expect(isFeedbackPinAddressed('feedback', { feedback: 'feedback', addressedAt: 'bad date', addressedBy: 'owner', note: '' })).toBe(false);
  });
  it("only counts resolutions for the current feedback, and ignores stale acknowledgements", () => {
    const feedback = writeEventFeedback("", [{ id: "pin", x: 2, y: 3, comment: "Move booth" }]);
    const resolutions = { campus: { pin: { feedback, addressedAt: "2026-10-03T00:00:00Z", addressedBy: "org", note: "Moved" } } };
    expect(countOpenFeedbackPins({ campus: feedback }, resolutions)).toBe(0);
    expect(isFeedbackPinAddressed(feedback, resolutions.campus.pin)).toBe(true);
    expect(countOpenFeedbackPins({ campus: writeEventFeedback("New instruction", readEventFeedback(feedback).pins) }, resolutions)).toBe(1);
    expect(countOpenFeedbackPins({ campus: feedback }, {})).toBe(1);
  });
  it("preserves legacy location comments", () => expect(readEventFeedback("Keep entrance clear")).toEqual({ text: "Keep entrance clear", pins: [] }));
  it("round trips coordinates and comments without exposing encoding in text", () => {
    const pins = [{ id: "pin", x: 120, y: 50, comment: "Move booth" }];
    const stored = writeEventFeedback("Check walking space", pins);
    expect(readEventFeedback(stored)).toEqual({ text: "Check walking space", pins });
    expect(eventFeedbackText(stored)).toBe("Check walking space · Pin 1: Move booth");
  });
  it("rejects invalid pin coordinates and preserves malformed legacy text", () => {
    expect(readEventFeedback(writeEventFeedback("", [{ id: "bad", x: -1, y: 0, comment: "Bad" }])).pins).toEqual([]);
    expect(readEventFeedback("@event-feedback/v1:broken").text).toBe("@event-feedback/v1:broken");
  });
});
