import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { FloorPropertiesPanel } from "../../src/components/map-builder/FloorPropertiesPanel";
import type { Campus, FloorRoom } from "../../src/components/map-builder/types";

const seedRoom: FloorRoom = {
  id: "test-room-101",
  name: "TEST ONLY — Room 101",
  type: "classroom",
  x: 20,
  y: 20,
  w: 80,
  h: 50,
  floorId: "test-floor-1",
  buildingId: "test-building-1",
  accessDoorId: "test-door-1",
  accessDoorIds: ["test-door-1"],
};

function Preview() {
  const [room, setRoom] = useState(seedRoom);
  const [inspectedDoor, setInspectedDoor] = useState<string | null>(null);
  const wall = {
    id: "test-wall-1",
    x1: 100,
    y1: 20,
    x2: 100,
    y2: 70,
    thickness: 4,
    color: "#64748b",
    startAnchor: { targetType: "room", roomId: room.id, edge: "right", offset: 0.5 },
  };
  const door = { id: "test-door-1", label: "East Door", x: 100, y: 45, width: 10, direction: "right", color: "#d97706", wallId: wall.id, offset: 0.5 };
  const floor = { id: "test-floor-1", buildingId: "test-building-1", number: 1, label: "Ground Floor", rooms: [room], walls: [wall], doors: [door], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [], paths: [] };
  const campus = useMemo(() => ({
    id: "test-campus-only",
    name: "TEST ONLY — Emergency Routing QA",
    buildings: [{ id: "test-building-1", name: "TEST ONLY — Building A", code: "QA-A", category: "academic", description: "", x: 0, y: 0, width: 400, height: 300, color: "#e2e8f0", entrances: [], floors: [floor] }],
    navNodes: [
      { id: "test-room-node", name: "Room 101", type: "room_access", x: 60, y: 45, campusId: "test-campus-only", buildingId: "test-building-1", floorId: "test-floor-1", roomId: room.id },
      { id: "test-door-node", name: "East Door", type: "door", x: 100, y: 45, campusId: "test-campus-only", buildingId: "test-building-1", floorId: "test-floor-1", doorId: door.id },
    ],
    navEdges: [{ id: "test-room-door-transition", startNodeId: "test-room-node", endNodeId: "test-door-node", distance: 1, bidirectional: true, accessible: true, emergencySafe: true, type: "room_door_transition" }],
    markers: [],
  } as unknown as Campus), [room]);

  return <main className="flex min-h-screen w-full">
    <div className="hidden flex-1 items-center justify-center bg-muted/30 p-8 text-center text-sm text-muted-foreground sm:flex">
      TEST ONLY · Draft floor map preview<br />The selected Door is room-linked but has no authored Walking Network edge.
    </div>
    <div className="flex w-full justify-end sm:w-auto">
      <FloorPropertiesPanel
        campus={campus}
        selected={{ type: "room", id: room.id }}
        mode="structure"
        rooms={[room]}
        walls={[wall]}
        doors={[door]}
        windows={[]}
        furniture={[]}
        stairs={[]}
        ramps={[]}
        elevators={[]}
        labels={[]}
        issueItems={[]}
        onUpdateRoom={(id, changes) => setRoom((current) => id === current.id ? { ...current, ...changes } : current)}
        onUpdateWall={() => undefined}
        onUpdateDoor={() => undefined}
        onUpdateWindow={() => undefined}
        onUpdateFurniture={() => undefined}
        onUpdateStairs={() => undefined}
        onUpdateRamp={() => undefined}
        onUpdateElevator={() => undefined}
        onUpdateLabel={() => undefined}
        onToggleNavConnection={() => undefined}
        onAddPhysicalToNavigation={() => undefined}
        onViewPhysicalInNavigation={(type, id) => setInspectedDoor(type === "door" ? id : `${type}:${id}`)}
        onRemovePhysicalFromNavigation={() => undefined}
        onLinkRoomDoor={() => setInspectedDoor("Room door linking started")}
        onSelectRoomDoor={setInspectedDoor}
        onDeleteSelected={() => undefined}
        onDuplicateSelected={() => undefined}
        onSetSelectedState={() => undefined}
        onLayerAction={() => undefined}
        onClose={() => undefined}
        physicalNavStatus={{ kind: "room", linked: true, title: "Room navigation", detail: "Room node is linked." }}
        roomDoorStatus={{ state: "ready", connectionCount: 1, doorId: door.id, doorIds: [door.id], doorName: "East Door", doorNames: ["East Door"] }}
      />
    </div>
    <output className="fixed bottom-2 left-2 z-[200] w-[92px] break-words rounded-lg border border-border bg-card px-2 py-2 text-[8px] font-semibold text-foreground" data-testid="test-only-inspected-door">
      {inspectedDoor ? `TEST ONLY selected: ${inspectedDoor}` : "TEST ONLY — no connection selected"}
    </output>
  </main>;
}

createRoot(document.getElementById("root")!).render(<Preview />);
