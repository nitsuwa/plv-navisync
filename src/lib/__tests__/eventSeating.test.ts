import { describe, expect, it } from "vitest";
import { buildEventPreset } from "../eventLayoutPresets";
import { getEventFurnitureTemplate } from "../../components/events/eventAssets";
describe("configurable event seating", () => {
 it("creates partial final rows without changing total", () => {
 let id=0;
 const seats=buildEventPreset("chair-row",{x:200,y:200},{count:12,chairsPerRow:5,spacing:34,rotation:0},()=>String(++id));
 expect(seats).toHaveLength(12);
 expect(new Set(seats.map(s=>s.y)).size).toBe(3);
 expect(seats.filter(s=>s.y===seats[0].y)).toHaveLength(5);
 });
 it("supports event seating totals beyond the old 30-item preset limit",()=>{
 let id=0;
 const seats=buildEventPreset("chair-row",{x:500,y:500},{count:100,chairsPerRow:5,spacing:34,rotation:0},()=>String(++id));
 expect(seats).toHaveLength(100);
 });
 it("uses smaller canonical chairs relative to tables",()=>{expect(getEventFurnitureTemplate("chair").width).toBeLessThan(20);});
});
