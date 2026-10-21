import { describe, expect, it } from "vitest";
import { eventSnapPoint, eventSnapDelta, eventSnapRotation } from "../eventSnap";
import { resolveLayoutMoveFromSnapshot } from "../eventLayoutGeometry";
describe("event Snap rules", () => {
 it("snaps label anchors and respects bounds, while off leaves free coordinates", () => {
  expect(eventSnapPoint({x:137,y:153},{width:500,height:420},20,true,14)).toEqual({x:140,y:160});
  expect(eventSnapPoint({x:137,y:153},{width:500,height:420},20,false,14)).toEqual({x:137,y:153});
  expect(eventSnapPoint({x:499,y:419},{width:500,height:420},20,true,14)).toEqual({x:500,y:406});
 });
 it("shares grid resize increments and 15-degree rotation across views", () => {
  expect(eventSnapDelta(27,20,true)).toBe(20);expect(eventSnapDelta(27,20,false)).toBe(27);
  expect(eventSnapRotation(37,true)).toBe(30);expect(eventSnapRotation(37,false)).toBe(37);expect(eventSnapRotation(359,true)).toBe(0);
 });
 it("snaps a moved group by its anchor without changing member spacing", () => {
  const anchor={id:"a",x:20,y:20,width:20,height:20}, other={...anchor,id:"b",x:60};
  const config={anchor,movingItems:[anchor,other],furnitureItems:[anchor,other],selectedIds:["a","b"],startPointer:{x:20,y:20},bounds:{width:500,height:420},grid:20,snapEnabled:true,snapGroupsToGrid:true};
  expect(resolveLayoutMoveFromSnapshot(config,{x:33,y:28}).delta).toEqual({x:20,y:0});
  expect(resolveLayoutMoveFromSnapshot({...config,snapEnabled:false},{x:33,y:28}).delta).toEqual({x:13,y:8});
 });
});
