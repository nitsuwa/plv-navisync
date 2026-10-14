import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Event3DItemPicker } from "../Event3DItemPicker";
const furniture = [{ id: "chair", type: "chair", name: "Chair 1", category: "event" as const, x: 0, y: 0, width: 16, height: 16, rotation: 0, color: "blue", locked: true }, { id: "table", type: "table", name: "Table 2", category: "event" as const, x: 40, y: 40, width: 50, height: 30, rotation: 0, color: "blue" }];
describe("3D object picker", () => {
 it("searches existing items in a contained dialog and selects without a native dropdown", () => {
  const select = vi.fn(); render(<Event3DItemPicker furniture={furniture} labels={[]} selectedIds={[]} onSelect={select} disabled={false}/>);
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument(); fireEvent.click(screen.getByRole("button", {name:"Selected 3D item"}));
  fireEvent.change(screen.getByRole("searchbox", {name:"Search event items"}), {target:{value:"table"}});
  expect(screen.queryByRole("button", {name:"Select Chair 1"})).not.toBeInTheDocument();fireEvent.click(screen.getByRole("button",{name:"Select Table 2"}));
  expect(select).toHaveBeenCalledWith("table");expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
 });
 it("shows locked/hidden state and a helpful search empty state", () => {
  render(<Event3DItemPicker furniture={furniture} labels={[{id:"label",text:"Welcome",x:10,y:10,fontSize:14,color:"blue",rotation:0,visible:false}]} selectedIds={[]} onSelect={vi.fn()} disabled={false}/>);
  fireEvent.click(screen.getByRole("button",{name:"Selected 3D item"}));expect(screen.getByText("Locked")).toBeInTheDocument();expect(screen.getByText("Hidden")).toBeInTheDocument();
  fireEvent.change(screen.getByRole("searchbox",{name:"Search event items"}),{target:{value:"zzzzz"}});expect(screen.getByText("No matching items. Try another name.")).toBeInTheDocument();
 });
});
