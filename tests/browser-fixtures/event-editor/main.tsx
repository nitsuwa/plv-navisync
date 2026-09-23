import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { EventFloorEditor } from "../../../src/components/events/EventFloorEditor";
import type { FloorPlan, CampusEventOverlay } from "../../../src/components/map-builder/types";
import "../../../src/styles/index.css";

// Dedicated localhost origin and fixture-only IDs keep real recovery drafts untouched.
const floor: FloorPlan = {
  id: "qa-floor", buildingId: "qa-building", number: 1, label: "QA floor",
  canvasW: 1000, canvasH: 800, backgroundColor: "#f8f9fa", showGrid: true, gridSize: 20,
  rooms: [], paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
};
function Fixture() {
  const [mode, setMode] = useState("warnings");
  const [generation, setGeneration] = useState(0);
  const [saved, setSaved] = useState("");
  const count = mode === "warnings" ? 6 : 100;
  const overlay: CampusEventOverlay = {
    id: `disposable-qa-${mode}-${generation}`, title: "Disposable QA — no backend writes", description: "", organizer: "Local verification",
    markers: [], restrictedAreas: [], isActive: true, status: "pending",
    locationRef: { type: "building", buildingId: "qa-building", floorId: "qa-floor", label: "Local fixture" },
    eventLabels: [],
    eventFurniture: Array.from({ length: count }, (_, i) => ({
      id: `qa-${i}`, type: "chair", name: `QA chair ${i}`, category: "event", layer: "events",
      x: mode === "warnings" ? 100 + Math.floor(i / 2) * 300 : 50 + (i % 10) * 80,
      y: mode === "warnings" ? 100 + (i % 2) * 100 : 50 + Math.floor(i / 10) * 65,
      width: 20, height: 20, rotation: 0, color: "#0ea5e9",
    })),
  };
  return <div style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", padding: 8 }}>
      <label>Fixture <select value={mode} onChange={e => { setMode(e.target.value); setGeneration(v => v + 1); }}><option value="warnings">Six warning items</option><option value="hundred">100 items</option></select></label>
      <button onClick={() => setGeneration(v => v + 1)}>Fresh fixture</button>
      <button onClick={() => document.documentElement.classList.toggle("dark")}>Toggle theme</button>
      <output aria-label="Mock save result">{saved}</output>
    </div>
    <div style={{ flex: 1, minHeight: 0 }}><EventFloorEditor key={`${mode}-${generation}`} floorPlan={floor} overlay={overlay}
      onSave={async furniture => { setSaved(JSON.stringify(furniture.map(({ id, x, y }) => ({ id, x, y })))); return true; }}
      onSubmit={async () => false} onBack={() => setSaved("Back requested; stayed in fixture")} /></div>
  </div>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
