import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { EventItemInspector } from "../EventItemInspector";
it("preserves physical size and exposes only placement controls",()=>{
 render(<EventItemInspector isOpen furniture={{id:"a",type:"chair",name:"Chair",x:10,y:10,width:24,height:24,rotation:0,category:"event",color:"blue"}} label={null} canvasWidth={500} canvasHeight={500} onClose={vi.fn()} onUpdateFurniture={vi.fn()} onUpdateLabel={vi.fn()} onToggleFurnitureLock={vi.fn()} onToggleLabelLock={vi.fn()} onToggleVisibility={vi.fn()} onRotate={vi.fn()} onUpdateLayer={vi.fn()} onUngroup={vi.fn()}/>);
 expect(screen.queryByRole("spinbutton",{name:"Width"})).not.toBeInTheDocument();
 expect(screen.getByText(/Fixed size/)).toBeInTheDocument();
});

it("keeps the primary furniture details compact and reveals geometry and layer controls in Advanced", () => {
  render(<EventItemInspector isOpen furniture={{id:"a",type:"chair",name:"Chair",x:10,y:10,width:24,height:24,rotation:45,category:"event",color:"blue"}} label={null} canvasWidth={500} canvasHeight={500} onClose={vi.fn()} onUpdateFurniture={vi.fn()} onUpdateLabel={vi.fn()} onToggleFurnitureLock={vi.fn()} onToggleLabelLock={vi.fn()} onToggleVisibility={vi.fn()} onRotate={vi.fn()} onUpdateLayer={vi.fn()} onUngroup={vi.fn()} />);

  expect(screen.getByText("Chair")).toBeInTheDocument();
  expect(screen.getByText(/Fixed size: 24 × 24 map units/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Rotate selected item" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Lock selected item" })).toBeInTheDocument();
  expect(screen.queryByRole("spinbutton", { name: "X" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Hide selected item" })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
  expect(screen.getByRole("spinbutton", { name: "X" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Hide selected item" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Bring selected item to front" })).toBeInTheDocument();
});

it("uses themed label color swatches and only applies a valid six-digit hex value", () => {
  const onUpdateLabel = vi.fn();
  render(<EventItemInspector isOpen furniture={null} label={{id:"label-a",text:"Welcome",x:10,y:10,fontSize:16,rotation:0,color:"#112233"}} canvasWidth={500} canvasHeight={500} onClose={vi.fn()} onUpdateFurniture={vi.fn()} onUpdateLabel={onUpdateLabel} onToggleFurnitureLock={vi.fn()} onToggleLabelLock={vi.fn()} onToggleVisibility={vi.fn()} onRotate={vi.fn()} onUpdateLayer={vi.fn()} onUngroup={vi.fn()} />);

  expect(document.querySelector('input[type="color"]')).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Set label color #1E3A8A" })).toBeInTheDocument();
  const hex = screen.getByRole("textbox", { name: "Label color hex" });
  fireEvent.change(hex, { target: { value: "#ABC" } });
  expect(onUpdateLabel).not.toHaveBeenCalledWith({ color: "#ABC" });
  fireEvent.change(hex, { target: { value: "#ABCDEF" } });
  expect(onUpdateLabel).toHaveBeenCalledWith({ color: "#ABCDEF" });
});
