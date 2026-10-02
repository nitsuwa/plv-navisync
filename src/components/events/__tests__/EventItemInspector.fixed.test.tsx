import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { EventItemInspector } from "../EventItemInspector";
it("preserves physical size and exposes only placement controls",()=>{
 render(<EventItemInspector isOpen furniture={{id:"a",type:"chair",name:"Chair",x:10,y:10,width:24,height:24,rotation:0,category:"event",color:"blue"}} label={null} canvasWidth={500} canvasHeight={500} onClose={vi.fn()} onUpdateFurniture={vi.fn()} onUpdateLabel={vi.fn()} onToggleFurnitureLock={vi.fn()} onToggleLabelLock={vi.fn()} onToggleVisibility={vi.fn()} onRotate={vi.fn()} onUpdateLayer={vi.fn()} onUngroup={vi.fn()}/>);
 expect(screen.queryByRole("spinbutton",{name:"Width"})).not.toBeInTheDocument();
 expect(screen.getByText(/Fixed size/)).toBeInTheDocument();
});
