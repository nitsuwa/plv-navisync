import { describe, expect, it } from "vitest";
import { estimateRoomLabelWidth, layoutRoomLabel, roomLabelLineCenterY, wrapRoomLabel } from "../roomLabel";

const adminLongName = "VP FOR ADMINISTRATION AND FINANCE";
const studentServicesLongName = "VP FOR STUDENT SERVICES, RESEARCH AND EXTENSION, PLANNING AND DEVELOPMENT";
const normalized = (value: string) => value.trim().split(/\s+/).join(" ");

describe("Room label layout", () => {
  it("keeps short Room names compact on one line", () => {
    const layout = layoutRoomLabel({ text: "ROOM 4", maxWidth: 120, fontSize: 10 });
    expect(layout.lines).toEqual(["ROOM 4"]);
    expect(layout.height).toBeLessThan(30);
  });

  it("wraps a medium Room name while preserving every word", () => {
    const name = "MEDICAL AND DENTAL CLINIC";
    const layout = layoutRoomLabel({ text: name, maxWidth: 100, fontSize: 10 });
    expect(layout.lines.length).toBeGreaterThan(1);
    expect(layout.lines.join(" ")).toBe(name);
  });

  it("shows FINANCE and every other word in a long Room name", () => {
    const layout = layoutRoomLabel({ text: adminLongName, maxWidth: 116, fontSize: 10 });
    expect(layout.lines.join(" ")).toBe(adminLongName);
    expect(layout.lines.at(-1)).toMatch(/FINANCE$/);
    expect(layout.lines.length).toBeGreaterThan(2);
  });

  it("shows the complete very long Room name over as many lines as needed", () => {
    const layout = layoutRoomLabel({ text: studentServicesLongName, maxWidth: 170, fontSize: 10 });
    expect(layout.lines.join(" ")).toBe(studentServicesLongName);
    expect(layout.lines.length).toBeGreaterThan(2);
    expect(layout.lines.join(" ")).not.toContain("…");
  });

  it("adds lines as the Room gets narrower and keeps the label width inside its allowance", () => {
    const narrow = layoutRoomLabel({ text: studentServicesLongName, maxWidth: 104, fontSize: 10 });
    const wide = layoutRoomLabel({ text: studentServicesLongName, maxWidth: 230, fontSize: 10 });
    expect(narrow.lines.length).toBeGreaterThan(wide.lines.length);
    expect(narrow.lines.join(" ")).toBe(studentServicesLongName);
    expect(wide.lines.join(" ")).toBe(studentServicesLongName);
    expect(narrow.width).toBeLessThanOrEqual(104);
    expect(wide.width).toBeLessThanOrEqual(230);
    expect(narrow.height).toBeGreaterThan(wide.height);
  });

  it("keeps all words intact, even if one word needs its own line", () => {
    const lines = wrapRoomLabel("INFORMATION TECHNOLOGY", 6);
    expect(lines).toEqual(["INFORMATION", "TECHNOLOGY"]);
  });

  it("centers all lines as one vertical text block", () => {
    const layout = layoutRoomLabel({ text: studentServicesLongName, maxWidth: 150, fontSize: 10 });
    expect(layout.height).toBe(layout.lines.length * layout.lineHeight + 7);
    expect(layout.textBlockHeight).toBe(layout.lines.length * layout.lineHeight);
    const centerY = 50;
    const lineCenters = layout.lines.map((_, index) => roomLabelLineCenterY(centerY, index, layout.lines.length, layout.lineHeight));
    expect((lineCenters[0] + lineCenters.at(-1)!) / 2).toBeCloseTo(centerY);
  });

  it("uses modest font reduction while wrapping before shrinking", () => {
    const layout = layoutRoomLabel({
      text: adminLongName,
      maxWidth: 90,
      fontSize: 10,
      minFontSize: 8,
    });
    expect(layout.fontSize).toBeGreaterThanOrEqual(8);
    expect(layout.lines.join(" ")).toBe(adminLongName);
    expect(layout.lines.some((line) => estimateRoomLabelWidth(line, layout.fontSize) <= 80)).toBe(true);
  });

  it("does not change the saved Room name while creating dynamic display lines", () => {
    const savedName = studentServicesLongName;
    const layout = layoutRoomLabel({ text: savedName, maxWidth: 150, fontSize: 10 });
    expect(savedName).toBe(studentServicesLongName);
    expect(normalized(layout.lines.join(" "))).toBe(normalized(savedName));
  });
});
