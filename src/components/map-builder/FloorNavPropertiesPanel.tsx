import { useState, type ReactNode } from "react";
import { X, Trash2, Link2, Waypoints, MapPin, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { ObjectIssueSection, type ObjectIssueItem } from "./ObjectIssueSection";
import type { NavigationNode, NavigationEdge } from "./types";
import { linkedObjectRef } from "../../lib/indoorNavigationGraph";

const INACCESSIBLE_REASONS: { value: NonNullable<NavigationEdge["inaccessibleReason"]>; label: string }[] = [
  { value: "stairs", label: "Stairs" },
  { value: "narrow_path", label: "Narrow Path" },
  { value: "restricted_access", label: "Restricted Access" },
  { value: "uneven_surface", label: "Uneven Surface" },
  { value: "other", label: "Other" },
];

const EMERGENCY_REASONS: { value: NonNullable<NavigationEdge["emergencyReason"]>; label: string }[] = [
  { value: "hazard", label: "Hazard Area" },
  { value: "blocked", label: "Restricted During Emergency" },
  { value: "restricted", label: "Not an Evacuation Route" },
  { value: "construction", label: "Under Construction" },
  { value: "other", label: "Other" },
];

const LINKED_LABEL: Record<string, string> = {
  room: "Room",
  door: "Door",
  stair: "Stairs",
  elevator: "Elevator",
  ramp: "Ramp",
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground mb-1.5">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Seg2({ value, onValue, labels }: {
  value: boolean;
  onValue: (v: boolean) => void;
  labels: [string, string];
}) {
  return (
    <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg border border-border bg-muted/30">
      <button
        onClick={() => onValue(true)}
        className={cn("h-8 rounded-md text-[11px] font-bold transition-all",
          value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted")}
      >
        {labels[0]}
      </button>
      <button
        onClick={() => onValue(false)}
        className={cn("h-8 rounded-md text-[11px] font-bold transition-all",
          !value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted")}
      >
        {labels[1]}
      </button>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-bold text-foreground">{children}</div>;
}

function PopSelect({ value, options, onChange, disabled }: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <div className="relative">
      <button
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn("w-full h-8 rounded-lg border border-border bg-card text-[11px] font-bold text-foreground px-2 flex items-center justify-between transition-colors",
          open && "border-primary/50", disabled && "opacity-60 cursor-not-allowed")}
      >
        <span className="truncate">{current?.label ?? value}</span>
        <span className="text-[8px] text-muted-foreground">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-50 w-44 rounded-xl border border-border bg-card shadow-2xl p-1">
            {options.map((o) => (
              <button
                key={o.value}
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={cn("w-full text-left h-7 px-2 rounded-md text-[11px] font-bold transition-colors",
                  o.value === value ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted")}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function AdvancedRoutingSection({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-2 py-1.5 text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground hover:bg-muted/30 transition-colors"
      >
        <span>{title}</span>
        <span className={cn("text-[8px] transition-transform", open && "rotate-180")}>▾</span>
      </button>
      {open && <div className="px-2 pb-2 space-y-2 border-t border-border pt-2 pr-1">{children}</div>}
    </div>
  );
}

interface FloorNavPropertiesPanelProps {
  selected: { type: "node" | "edge"; id: string };
  /** B7 Phase 2: live validation issues for the currently selected nav object. */
  issueItems?: ObjectIssueItem[];
  nodes: NavigationNode[];
  edges: NavigationEdge[];
  onUpdateNode: (id: string, changes: Partial<NavigationNode>) => void;
  onUpdateEdge: (id: string, changes: Partial<NavigationEdge>) => void;
  onDelete: () => void;
  onClose: () => void;
  /** B5 Phase 2.6: segmented-path shape actions — ONE history gesture each. */
  onAddBend: (edgeId: string) => void;
  onRemoveBend: (edgeId: string) => void;
  onStraighten: (edgeId: string) => void;
  /** True when the direct A→B line would cross a wall — disables Straighten. */
  straightenBlocked: boolean;
  /** B5 Phase 2.11: the edge currently crosses/overlaps a wall (presentation only). */
  edgeBlocked: boolean;
  /** B5 Phase 3: floors this node's cross-floor transitions connect to. */
  transitionFloors: Array<{ id: string; label: string }>;
  /** B5 Phase 3: sharedId match state for this linked circulation node. */
  transitionState: "linked" | "no-shared-id" | "no-match";
  elevatorServedFloors?: Array<{ id: string; label: string; linked: boolean; isLocal: boolean }>;
}

export function FloorNavPropertiesPanel({
  selected, nodes, edges,
  onUpdateNode, onUpdateEdge, onDelete, onClose,
  onAddBend, onRemoveBend, onStraighten, straightenBlocked, edgeBlocked,
  transitionFloors, transitionState, elevatorServedFloors = [],
  issueItems = [],
}: FloorNavPropertiesPanelProps) {
  if (selected.type === "node") {
    const node = nodes.find((n) => n.id === selected.id);
    if (!node) return null;
    const ref = linkedObjectRef(node);
    const isLinked = !!ref;
    // B5 Phase 2.2: a free destination (room_access without a physical owner) is
    // a deliberately placed routable location — distinct from a technical Waypoint.
    const isDest = !isLinked && node.type === "room_access";
    const heading = isLinked
      ? `Linked ${LINKED_LABEL[ref.kind]}`
      : isDest ? "Destination" : "Walking Point";
    const connections = edges.filter((e) => e.startNodeId === node.id || e.endNodeId === node.id);
    return (
      <div data-testid="floor-nav-node-props" className="w-60 border-l border-border bg-card/80 backdrop-blur flex flex-col shrink-0">
        <div className="flex items-center justify-between px-3 h-9 border-b border-border">
          <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
            {isDest ? <MapPin className="h-3 w-3 text-primary" /> : <Waypoints className="h-3 w-3 text-primary" />} {heading}
          </span>
          <button onClick={onClose} aria-label="Close properties" className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3.5">
          {/* B7 Phase 2: contextual issue guidance for the selected waypoint */}
          <ObjectIssueSection items={issueItems} />
          <Section title="General">
            <FieldLabel>{isDest ? "Name (required)" : "Name"}</FieldLabel>
            <input
              value={node.name}
              onChange={(e) => onUpdateNode(node.id, { name: e.target.value })}
              placeholder={isDest ? "Destination name" : "Walking Point name"}
              aria-label={isDest ? "Destination name" : "Walking Point name"}
              className="w-full h-8 rounded-lg border border-border bg-card px-2 text-[11px] font-semibold text-foreground outline-none focus:border-primary/50"
            />
            {/* Type indicator only for linked/destination nodes — free walking points don't need type selection */}
            {isLinked && (
              <div>
                <div className="h-8 rounded-lg border border-emerald-200/80 bg-emerald-50/60 px-2 flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-900/10 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Linked to Navigation
                </div>
                <p className="text-[9px] text-muted-foreground mt-1 leading-relaxed">
                  {node.name || LINKED_LABEL[ref.kind]} follows the linked physical object and cannot be moved freely.
                </p>
              </div>
            )}
            {isDest && (
              <div>
                <div className="h-8 rounded-lg border border-border bg-muted/40 px-2 flex items-center text-[11px] font-bold text-foreground">
                  Destination
                </div>
                <p className="text-[9px] text-muted-foreground mt-1 leading-relaxed">
                  A deliberate routable location. Give it a name students will recognize.
                </p>
              </div>
            )}
          </Section>
          {/* Connections */}
          <Section title="Connections">
            <div className="text-[11px] font-bold text-foreground">
              {connections.length} path{connections.length !== 1 ? "s" : ""}
            </div>
            {connections.length === 0 && (
              <p className="text-[9px] text-amber-600 font-semibold leading-relaxed">
                Isolated — connect this walking point with Connect.
              </p>
            )}
          </Section>
          {/* Advanced Routing — collapsed section with accessibility for free nodes */}
          {!isLinked && !isDest && (
          <AdvancedRoutingSection title="Advanced Routing">
            <FieldLabel>Accessible</FieldLabel>
            <Seg2
              value={node.accessible !== false}
              onValue={(v) => onUpdateNode(node.id, { accessible: v })}
              labels={["Yes", "No"]}
            />
          </AdvancedRoutingSection>
          )}
          {/* B5 Phase 3: cross-floor transition status for linked Stair / Elevator
              / Ramp nodes — concise authoring feedback only (never a routing UI). */}
          {ref?.kind === "elevator" && (
            <Section title="Served Floors">
              {elevatorServedFloors.length > 0 ? (
                <>
                  <div className="text-[11px] font-bold text-foreground" data-testid="nav-elevator-served-status">
                    {elevatorServedFloors.filter((f) => f.linked).length} of {elevatorServedFloors.length} served floors added to navigation
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {elevatorServedFloors.map((floor) => (
                      <span key={floor.id} data-testid="nav-elevator-served-floor-chip"
                        className={cn(
                          "px-1.5 py-0.5 rounded border text-[9px] font-bold",
                          floor.linked
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-900/10 dark:text-emerald-400"
                            : "border-border bg-muted/40 text-muted-foreground"
                        )}>
                        {floor.linked ? "✓ " : "○ "}{floor.label}{floor.isLocal ? " — Current" : ""}{!floor.linked ? " — Not added to navigation" : ""}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <span className="text-[10px] text-muted-foreground">No served floors configured.</span>
              )}
            </Section>
          )}
          {ref?.kind === "stair" && (
            <Section title="Floor Transitions">
              {transitionState === "linked" ? (
                <>
                  <div className="text-[11px] font-bold text-foreground" data-testid="nav-transition-status-linked">
                    Connected floors{transitionFloors.length > 0 ? ` (${transitionFloors.length})` : ""}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {transitionFloors.length > 0 ? transitionFloors.map((floor) => (
                      <span key={floor.id} data-testid="nav-transition-floor-chip"
                        className="px-1.5 py-0.5 rounded border border-border bg-muted/50 text-[9px] font-bold text-foreground">
                        {floor.label}
                      </span>
                    )) : (
                      <span className="text-[10px] text-muted-foreground">No transition edges yet.</span>
                    )}
                  </div>
                </>
              ) : transitionState === "no-shared-id" ? (
                <p data-testid="nav-transition-no-shared" className="text-[9px] text-amber-600 font-semibold leading-relaxed">
                  Not linked to another floor. Assign the same {LINKED_LABEL[ref.kind].toLowerCase()} connection across floors to enable floor-to-floor navigation.
                </p>
              ) : (
                <p data-testid="nav-transition-no-match" className="text-[9px] text-muted-foreground leading-relaxed">
                  No matching {LINKED_LABEL[ref.kind].toLowerCase()} on another floor yet — link the same connection there to connect floors.
                </p>
              )}
            </Section>
          )}
          {ref?.kind === "ramp" && (
            <Section title="Accessibility">
              <p data-testid="nav-ramp-accessibility-status" className="text-[9px] text-muted-foreground leading-relaxed">
                Accessible path anchor for local walking routes.
              </p>
            </Section>
          )}
          <Section title="Position">
            <div className="grid grid-cols-2 gap-1.5">
              <div className="h-8 rounded-lg border border-border bg-muted/40 px-2 flex items-center text-[10px] font-semibold text-muted-foreground">
                X {Math.round(node.x)}
              </div>
              <div className="h-8 rounded-lg border border-border bg-muted/40 px-2 flex items-center text-[10px] font-semibold text-muted-foreground">
                Y {Math.round(node.y)}
              </div>
            </div>
            {isLinked && (
              <p className="text-[9px] text-muted-foreground leading-relaxed">Position is derived from the linked object.</p>
            )}
          </Section>
          <button
            onClick={onDelete}
            className="w-full h-8 rounded-lg border border-destructive/30 text-[11px] font-bold text-destructive hover:bg-destructive/10 transition-colors flex items-center justify-center gap-1.5"
          >
            <Trash2 className="h-3 w-3" /> Delete {isDest ? "Destination" : isLinked ? "Link" : "Walking Point"}
          </button>
        </div>
      </div>
    );
  }

  const edge = edges.find((e) => e.id === selected.id);
  if (!edge) return null;
  const from = nodes.find((n) => n.id === edge.startNodeId);
  const to = nodes.find((n) => n.id === edge.endNodeId);
  return (
    <div data-testid="floor-nav-edge-props" className="w-60 border-l border-border bg-card/80 backdrop-blur flex flex-col shrink-0">
      <div className="flex items-center justify-between px-3 h-9 border-b border-border">
        <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
          <Link2 className="h-3 w-3 text-primary" /> Walking Path
        </span>
        <button onClick={onClose} aria-label="Close properties" className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3.5">
        {/* B7 Phase 2: contextual issue guidance for the selected nav edge */}
        <ObjectIssueSection items={issueItems} />
        <Section title="Connection">
          <div className="text-[11px] font-bold text-foreground">
            {from?.name || "Walking Point"} <span className="text-muted-foreground font-semibold">→</span> {to?.name || "Walking Point"}
          </div>
          <div className="text-[10px] text-muted-foreground">
            Distance {Math.round(edge.distance)} world units
          </div>
        </Section>
        {/* B5 Phase 2.11: a selected edge that currently crosses/overlaps a wall
            shows a concise warning — presentation only; the edge stays fully
            editable (segment/bend drags + Remove Bend) so it can be repaired. */}
        {edgeBlocked && (
          <div data-testid="nav-edge-blocked-warning" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-2">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
            <p className="text-[10px] font-bold text-destructive leading-snug">
              Path blocked by wall. Move a segment, add/move a bend, or reposition a free walking point.
            </p>
          </div>
        )}
        {/* B5 Phase 2.5/2.6: segmented (orthogonal) path shape — Add Bend splits
            the hovered (or longest) segment, Remove Bend removes the SELECTED
            bend, Straighten removes all bends unless the direct line would cross
            a wall. Each action is ONE history gesture (handled in the editor). */}
        <Section title="Geometry">
          {(() => {
            const bends = edge.bendPoints ?? [];
            return (
              <>
                <div className="text-[11px] font-bold text-foreground">
                  {bends.length === 0 ? "Straight path" : `Segmented · ${bends.length} bend${bends.length !== 1 ? "s" : ""}`}
                </div>
                {/* B5 Phase 6.10: responsive layout — Add/Remove on row 1, Straighten on row 2 */}
                <div className="grid grid-cols-2 gap-1">
                  <button onClick={() => onAddBend(edge.id)} data-testid="nav-path-add-bend"
                    className="h-7 rounded-md text-[10px] font-bold border border-border text-foreground hover:bg-muted transition-colors min-w-0">
                    Add Bend
                  </button>
                  <button onClick={() => onRemoveBend(edge.id)} disabled={bends.length === 0} data-testid="nav-path-remove-bend"
                    className="h-7 rounded-md text-[10px] font-bold border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-w-0">
                    Remove Bend
                  </button>
                </div>
                <button onClick={() => onStraighten(edge.id)} disabled={bends.length === 0 || straightenBlocked} data-testid="nav-path-straighten"
                  className="w-full h-7 rounded-md text-[10px] font-bold border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  Straighten
                </button>
                <p className="text-[9px] text-muted-foreground leading-relaxed">
                  {straightenBlocked
                    ? "Can't straighten — the direct route would cross a wall."
                    : "Drag a bend handle to reshape (Shift keeps it axis-aligned). Remove Bend targets the selected bend; Add Bend splits the hovered segment."}
                </p>
              </>
            );
          })()}
        </Section>
        <Section title="Direction">
          <Seg2
            value={edge.bidirectional}
            onValue={(v) => onUpdateEdge(edge.id, { bidirectional: v })}
            labels={["Bidirectional", "One Way"]}
          />
        </Section>
        <AdvancedRoutingSection title="Advanced Routing">
          <FieldLabel>Accessible</FieldLabel>
          <Seg2
            value={edge.accessible !== false}
            onValue={(v) => onUpdateEdge(edge.id, { accessible: v, inaccessibleReason: v ? undefined : (edge.inaccessibleReason ?? "other") })}
            labels={["Yes", "No"]}
          />
          {edge.accessible === false && (
            <PopSelect
              value={edge.inaccessibleReason ?? "other"}
              options={INACCESSIBLE_REASONS}
              onChange={(v) => onUpdateEdge(edge.id, { inaccessibleReason: v as NonNullable<NavigationEdge["inaccessibleReason"]> })}
            />
          )}
          <FieldLabel>Emergency Safe</FieldLabel>
          <Seg2
            value={edge.emergencySafe !== false}
            onValue={(v) => onUpdateEdge(edge.id, { emergencySafe: v, emergencyReason: v ? undefined : (edge.emergencyReason ?? "other") })}
            labels={["Yes", "No"]}
          />
          {edge.emergencySafe === false && (
            <PopSelect
              value={edge.emergencyReason ?? "other"}
              options={EMERGENCY_REASONS}
              onChange={(v) => onUpdateEdge(edge.id, { emergencyReason: v as NonNullable<NavigationEdge["emergencyReason"]> })}
            />
          )}
          <FieldLabel>Closed</FieldLabel>
          <Seg2
            value={edge.closed !== true}
            onValue={(v) => onUpdateEdge(edge.id, { closed: !v })}
            labels={["Open", "Closed"]}
          />
          <p className="text-[9px] text-muted-foreground leading-relaxed">Closed paths are excluded from routing.</p>
        </AdvancedRoutingSection>
        <button
          onClick={onDelete}
          className="w-full h-8 rounded-lg border border-destructive/30 text-[11px] font-bold text-destructive hover:bg-destructive/10 transition-colors flex items-center justify-center gap-1.5"
        >
            <Trash2 className="h-3 w-3" /> Delete Walking Path
        </button>
      </div>
    </div>
  );
}
