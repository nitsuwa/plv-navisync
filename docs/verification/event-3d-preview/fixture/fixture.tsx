import { useState } from "react";
import { createRoot } from "react-dom/client";
import "/src/styles/index.css";
import { EventFloorEditor } from "/src/components/events/EventFloorEditor";
import { EVENT_FURNITURE_TEMPLATES, eventFurnitureFromTemplate } from "/src/components/events/eventAssets";
import { CAMPUS_GROUNDS_ID, resolveFloorPlanForEvent } from "/src/lib/eventLocationData";
import { setThemePreference } from "/src/hooks/useTheme";

const floor = { id: "fixture-f1", buildingId: "hall", number: 1, label: "Activity Hall", canvasW: 900, canvasH: 680, gridSize: 20, backgroundColor: "#f1f5f9", rooms: [{ id: "hall-room", name: "Activity Hall", type: "auditorium", x: 40, y: 80, w: 820, h: 550, color: "#e2e8f0", floorId: "fixture-f1", buildingId: "hall" }], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [], paths: [] };
const campus = { id: "local-fixture", name: "Local Campus", canvasW: 900, canvasH: 680, gridSize: 20, buildings: [{ id: "hall", name: "Activity Hall", x: 80, y: 20, width: 200, height: 110, rotation: 0, color: "#94a3b8", visible: true, floors: [floor] }, { id: "library", name: "Library", x: 650, y: 20, width: 150, height: 110, rotation: 0, color: "#f0cfa0", visible: true, floors: [] }], paths: [], markers: [], decorAssets: [] };
const focusCase = new URLSearchParams(location.search).get("case");
if (focusCase) campus.buildings = [{ ...campus.buildings[0], x: 100, y: 100, width: 100, height: 100 }];
const furniture = focusCase ? [{ ...eventFurnitureFromTemplate(EVENT_FURNITURE_TEMPLATES.find(item => item.type === (focusCase === "tent" ? "tent" : "stage"))!, 700, 500, "focus-item") }] : EVENT_FURNITURE_TEMPLATES.map((template, index) => ({ ...eventFurnitureFromTemplate(template, 100 + index % 4 * 180, 160 + Math.floor(index / 4) * 110, template.type), rotation: template.type === "stage" ? 17 : 0 }));
const overlay = { id: "isolated-event-3d-fixture", title: "Student Organization Fair", description: "Local fixture; no database writes", organizer: "Demo Council", status: "draft", isActive: true, markers: [], restrictedAreas: [], eventFurniture: furniture, eventLabels: focusCase ? [] : [{ id: "welcome", x: 400, y: 610, text: "Welcome area", fontSize: 14, color: "#1e3a8a", rotation: 0, align: "left" }] };
function Fixture() {
  const [outdoor, setOutdoor] = useState(focusCase === "remote-stage"), [review, setReview] = useState(false), [pins, setPins] = useState(false), [dark, setDark] = useState(false);
  const locationRef = outdoor ? { type: "campus", label: "Campus Grounds" } : { type: "building", buildingId: "hall", floorId: "fixture-f1", label: "Activity Hall" };
  return <div className="flex h-[100dvh] flex-col bg-background text-foreground">
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b p-2 text-xs"><strong>Disposable local fixture</strong><button onClick={() => { setOutdoor(false); setPins(false); }}>Indoor fixture</button><button onClick={() => { setOutdoor(true); setPins(false); }}>Outdoor fixture</button><button onClick={() => { setReview(v => !v); setPins(false); }}>Toggle admin review</button><button onClick={() => setPins(v => !v)} disabled={!review}>Toggle feedback placement</button><button onClick={() => { setDark(v => !v); setThemePreference(dark ? "light" : "dark"); }}>Toggle theme</button></div>
    <div className="min-h-0 flex-1"><EventFloorEditor key={`${outdoor}:${review}`} floorPlan={outdoor ? resolveFloorPlanForEvent(CAMPUS_GROUNDS_ID, undefined, campus)! : floor} activeCampus={campus} overlay={{ ...overlay, locationRef, status: review ? "pending" : "draft" }} readOnly={review} compactPreview={review} onFeedbackPoint={review && pins ? () => {} : undefined} onSave={async (items, labels) => { window.previewSavedLayout = { items, labels }; }} onSubmit={async () => { throw new Error("Submission is disabled in this fixture"); }} onBack={() => {}} /></div>
  </div>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
