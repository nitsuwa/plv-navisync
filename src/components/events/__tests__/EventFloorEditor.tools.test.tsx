import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CampusEventOverlay, FloorPlan } from "../../map-builder/types";
import type { Event3DEditing } from "../../../lib/event3dEditing";
import { EventFloorEditor } from "../EventFloorEditor";
vi.mock("../EventLayout3DPreview", () => ({ EventLayout3DPreview: ({ editing, editorTools }: { editing?: Event3DEditing; editorTools?: React.ReactNode }) => <section>{editorTools}
  <button onClick={() => editing?.onSelect("chair")}>Select chair in scene</button><button onClick={() => editing?.onSelect("table")}>Select table in scene</button>
  <button onClick={() => editing?.onPlace?.({ x: 180, y: 140 })}>Place in scene</button>
  <button onClick={() => { editing?.onPlace?.({ x: 180, y: 140 }); editing?.onPlace?.({ x: 220, y: 140 }); }}>Place twice rapidly</button>
</section> }));
const floor: FloorPlan = { id:"floor", buildingId:"hall", number:1, label:"Hall", canvasW:500,canvasH:420,gridSize:20,rooms:[],walls:[],doors:[],windows:[],furniture:[],stairs:[],ramps:[],elevators:[],labels:[],paths:[] };
const overlay: CampusEventOverlay = { id:"tools-test", title:"Fair",description:"",organizer:"Council",status:"draft",isActive:true,markers:[],restrictedAreas:[],eventLabels:[],eventFurniture:[
  {id:"chair",type:"chair",name:"Chair",category:"event",x:40,y:40,width:32,height:12,rotation:0,color:"#0ea5e9"},
  {id:"table",type:"table",name:"Table",category:"event",x:280,y:260,width:50,height:30,rotation:0,color:"#6366f1"},
] };
beforeEach(()=>localStorage.clear());
function setup(map=floor, save=vi.fn().mockResolvedValue(true)) { render(<EventFloorEditor floorPlan={map} overlay={overlay} onSave={save} onSubmit={vi.fn()} onBack={vi.fn()}/>);fireEvent.click(screen.getByRole("button",{name:"3D layout"}));return save; }
describe("consistent organizer tools",()=>{
  it("disables chair stretching in 3D",()=>{setup();fireEvent.click(screen.getByText("Select chair in scene"));expect(screen.getByRole("button",{name:"Resize items in 3D"})).toBeDisabled();});
  it("uses the smaller outdoor reference for newly placed chairs",()=>{setup({...floor,id:"campus",buildingId:"campus"});fireEvent.click(screen.getByRole("button",{name:"Add item in 3D"}));fireEvent.click(screen.getByRole("button",{name:"Choose Chair"}));fireEvent.click(screen.getByText("Place in scene"));fireEvent.click(screen.getByRole("button",{name:"2D layout"}));const items=screen.getByLabelText("Event layout canvas").querySelectorAll<HTMLElement>("[data-event-item]");expect(items).toHaveLength(3);expect(items[2]).toHaveStyle({width:"6.4px",height:"6.4px"});expect(screen.getByTestId("event-furniture-chair")).toHaveStyle({width:"32px"});});
  it("keeps every rapid repeated placement and one undo entry per item",()=>{setup();fireEvent.click(screen.getByRole("button",{name:"Add item in 3D"}));fireEvent.click(screen.getByRole("button",{name:"Choose Chair"}));fireEvent.click(screen.getByRole("checkbox",{name:"Keep placing"}));fireEvent.click(screen.getByText("Place twice rapidly"));fireEvent.click(screen.getByRole("button",{name:"2D layout"}));expect(screen.getByLabelText("Event layout canvas").querySelectorAll("[data-event-item]")).toHaveLength(4);fireEvent.click(screen.getByRole("button",{name:"Undo"}));expect(screen.getByLabelText("Event layout canvas").querySelectorAll("[data-event-item]")).toHaveLength(3);});
  it("edits table dimensions through shared Details with proportional sizing",async()=>{const save=setup();fireEvent.click(screen.getByText("Select table in scene"));fireEvent.click(screen.getByRole("button",{name:"Item details in 3D"}));const width=screen.getByRole("spinbutton",{name:"Width in 3D"});fireEvent.focus(width);fireEvent.change(width,{target:{value:"60"}});fireEvent.blur(width);fireEvent.click(screen.getByRole("button",{name:"Close item details"}));fireEvent.click(screen.getByRole("button",{name:"2D layout"}));expect(screen.getByTestId("event-furniture-table")).toHaveStyle({width:"60px",height:"36px"});fireEvent.click(screen.getByRole("button",{name:"Save Draft"}));await waitFor(()=>expect(save).toHaveBeenCalled());expect(save.mock.calls[0][0][1]).toMatchObject({width:60,height:36});});
  it("retains a failed save and offers an explicit successful retry",async()=>{const save=vi.fn().mockRejectedValueOnce(new Error("Network unavailable")).mockResolvedValue(true);setup(floor,save);fireEvent.click(screen.getByRole("button",{name:"Save Draft"}));await screen.findByText(/Save failed/);fireEvent.click(screen.getByRole("button",{name:"Retry save"}));await waitFor(()=>expect(save).toHaveBeenCalledTimes(2));});
  it("clears manual failure after a new authoritative autosave acknowledgement",async()=>{
    const save=vi.fn().mockResolvedValue(false);
    const props={floorPlan:floor,overlay,onSave:save,onSubmit:vi.fn(),onBack:vi.fn()};
    const view=render(<EventFloorEditor {...props} saveStatus="Saved"/>);
    fireEvent.click(screen.getByRole("button",{name:"Save Draft"}));await screen.findByText(/Save failed/);
    view.rerender(<EventFloorEditor {...props} saveStatus="Saving…"/>);
    view.rerender(<EventFloorEditor {...props} saveStatus="Saved"/>);
    expect(screen.queryByRole("button",{name:"Retry save"})).not.toBeInTheDocument();
    expect(screen.getByText("Saved",{exact:true})).toBeInTheDocument();
  });
  it.each([true,false])("does not mark newer placement saved when an earlier request completes (%s)",async(result)=>{
    let finish!: (value:boolean)=>void; const save=vi.fn(()=>new Promise<boolean>(resolve=>{finish=resolve;}));
    setup(floor,save);fireEvent.click(screen.getByRole("button",{name:"Save Draft"}));
    fireEvent.click(screen.getByRole("button",{name:"Add item in 3D"}));fireEvent.click(screen.getByRole("button",{name:"Choose Chair"}));fireEvent.click(screen.getByText("Place in scene"));
    await act(async()=>finish(result));
    expect(screen.getByText("Unsaved changes",{exact:true})).toBeInTheDocument();
    expect(screen.queryByText("Saved",{exact:true})).not.toBeInTheDocument();
  });
});
