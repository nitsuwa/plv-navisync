import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { eventPreviewFixture } from "../../../test/eventFullPackFixtures";
import { EventMapPanel, type EventMapPanelProps } from "../EventMapPanel";

function props(overrides: Partial<EventMapPanelProps> = {}): EventMapPanelProps {
  return {
    open: true, loading: false, error: null, events: [eventPreviewFixture()], nowMs: Date.parse("2026-10-08T02:00:00Z"),
    filter: "all", selectedEventId: null, selectedLocationId: null, onClose: vi.fn(), onRetry: vi.fn(),
    onFilterChange: vi.fn(), onSelectEvent: vi.fn(), onViewLocation: vi.fn(), onBackToEvents: vi.fn(), ...overrides,
  };
}

describe("EventMapPanel", () => {
  it('keeps the selected event name visible when an inspected venue is collapsed',()=>{
    render(<EventMapPanel {...props({selectedEventId:'event-a',inspectedVenue:{id:'campus',type:'campus',label:'Campus Grounds',x:10,y:10,eventIds:['event-a'],locations:[{eventId:'event-a',locationId:'grounds'}]}})}/>);
    fireEvent.click(screen.getByRole('button',{name:'Hide event details'}));
    expect(screen.getByRole('heading',{name:'College Week'})).toBeInTheDocument();
  });
  it('uses the displayed floor rather than an earlier location selection', async () => {
    render(<EventMapPanel {...props({selectedEventId:'event-a', selectedLocationId:'grounds', currentMap:{label:'Library · Second Floor', locationId:null,isFloor:true}})}/>);
    await waitFor(()=>expect(screen.getByText(/Map shown: Library · Second Floor/)).toBeVisible());
    expect(screen.getByText(/No event layout on this floor/)).toBeVisible();
    fireEvent.click(screen.getByRole('button',{name:'Show event details'}));
    expect(screen.queryByText('Currently viewing')).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:/View campus layout.*Campus Grounds/})).toBeVisible();
  });

  it('keeps event and current map context visible when details are collapsed', async () => {
    render(<EventMapPanel {...props({selectedEventId:'event-a',selectedLocationId:'grounds',currentMap:{label:'Campus Grounds',locationId:'grounds'}})}/>);
    await waitFor(()=>expect(screen.getByRole('heading',{name:'College Week'})).toBeVisible());
    expect(screen.getByText('Ongoing',{exact:true})).toBeVisible();
    expect(screen.getByText('Event layout',{exact:true})).toBeVisible();
    const details=screen.getByRole('button',{name:'Show event details'});
    expect(details).toHaveAttribute('aria-expanded','false');
    fireEvent.click(details);
    expect(details).toHaveAttribute('aria-expanded','true');
    expect(screen.getByRole('button',{name:/Currently viewing.*Campus Grounds/})).toBeVisible();
    fireEvent.click(screen.getByRole('button',{name:'Hide event details'}));
    expect(screen.queryByRole('button',{name:/Currently viewing.*Campus Grounds/})).not.toBeInTheDocument();
  });

  it('offers an explicit fit action without changing event selection', () => {
    const onFitMap=vi.fn(),onViewLocation=vi.fn();
    render(<EventMapPanel {...props({selectedEventId:'event-a',onFitMap,onViewLocation})}/>);
    fireEvent.click(screen.getByRole('button',{name:'Fit map'}));
    expect(onFitMap).toHaveBeenCalledOnce();
    expect(onViewLocation).not.toHaveBeenCalled();
  });
  it('keeps selected event details usable and exposes retry for a failed background refresh',()=>{
    const onRetry=vi.fn();
    render(<EventMapPanel {...props({selectedEventId:'event-a',error:'Refresh failed',onRetry})}/>);
    expect(screen.getByRole('alert')).toHaveTextContent(/Refresh failed/);
    expect(screen.getByText('Campus Grounds')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:/^Retry$/}));
    expect(onRetry).toHaveBeenCalledOnce();
  });
  it("keeps event details in the same nonmodal panel and lists all requested locations", () => {
    const event = eventPreviewFixture({ locations: [
      { id: "grounds", locationRef: { type: "campus", label: "Campus Grounds" }, eventFurniture: [], eventLabels: [] },
      { id: "floor-1", locationRef: { type: "building", buildingId: "b1", floorId: "b1-f1", label: "Library — Floor 1" }, eventFurniture: [], eventLabels: [] },
      { id: "floor-2", locationRef: { type: "building", buildingId: "b2", floorId: "b2-f2", label: "Gym — Floor 2" }, eventFurniture: [], eventLabels: [] },
    ] });
    const onSelectEvent = vi.fn();
    const view = render(<EventMapPanel {...props({ events: [event], onSelectEvent })} />);
    fireEvent.click(screen.getByRole("button", { name: /College Week/i }));
    expect(onSelectEvent).toHaveBeenCalledWith("event-a");
    view.rerender(<EventMapPanel {...props({ events: [event], selectedEventId: "event-a" })} />);
    fireEvent.click(screen.getByRole('button',{name:'Show event details'}));
    expect(screen.getByRole("region", { name: /Campus events/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Back to events/i })).toHaveLength(1);
    expect(screen.getByText("Campus Grounds")).toBeInTheDocument();
    expect(screen.getByText("Library — Floor 1")).toBeInTheDocument();
    expect(screen.getByText("Gym — Floor 2")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Campus Grounds/i })).toHaveClass("min-h-12");
  });

  it("supports keyboard-operable filters and explicit empty states", () => {
    const onFilterChange = vi.fn();
    render(<EventMapPanel {...props({ events: [], onFilterChange })} />);
    fireEvent.click(screen.getByRole("button", { name: "Upcoming" }));
    expect(onFilterChange).toHaveBeenCalledWith("upcoming");
    expect(screen.getByText(/No published events/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Close campus events/i })).toBeInTheDocument();
  });

  it("shows retry after a feed error and does not expose a modal scrim", () => {
    const onRetry = vi.fn();
    render(<EventMapPanel {...props({ error: "Network unavailable", onRetry })} />);
    fireEvent.click(screen.getByRole("button", { name: /Retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent("Network unavailable");
    expect(screen.getByRole("region", { name: /Campus events/i })).not.toHaveAttribute("aria-modal");
  });

  it('lets the user choose either requested floor of one event when inspecting its building pin', () => {
    const event = eventPreviewFixture({ locations: [
      { id: 'floor-1', locationRef: { type: 'building', buildingId: 'library', floorId: 'library-f1', label: 'Library — Floor 1' }, eventFurniture: [], eventLabels: [] },
      { id: 'floor-2', locationRef: { type: 'building', buildingId: 'library', floorId: 'library-f2', label: 'Library — Floor 2' }, eventFurniture: [], eventLabels: [] },
    ] });
    const onViewLocation = vi.fn();
    render(<EventMapPanel {...props({ events: [event], selectedEventId: event.id, inspectedVenue: { id: 'building:library', type: 'building', x: 10, y: 10, label: 'Library', eventIds: [event.id], locations: [{ eventId: event.id, locationId: 'floor-1' }, { eventId: event.id, locationId: 'floor-2' }] }, onViewLocation })} />);
    expect(screen.getByText('Library', { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/Organized by/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /View map.*Library — Floor 2/i }));
    expect(onViewLocation).toHaveBeenCalledWith('event-a', 'floor-2');
  });
});
