import type { BuildingEntranceDirection, BuildingEntranceEdge, BuildingEntranceType } from "./types";
import { normalizeEntranceDirection, normalizeEntranceType } from "../../lib/buildingEntrances";

const EDGE_ANGLES: Record<BuildingEntranceEdge, number> = {
  top: 0,
  right: 90,
  bottom: 180,
  left: -90,
};

/** Return the world-space centre for the one direction badge owned by an entrance. */
export function entranceDirectionBadgePlacement(
  x: number,
  y: number,
  edge: BuildingEntranceEdge,
  rotation = 0,
  distance = 17,
): { x: number; y: number; angle: number } {
  const angle = EDGE_ANGLES[edge] + rotation;
  const radians = (angle * Math.PI) / 180;
  return {
    x: x + Math.sin(radians) * distance,
    y: y - Math.cos(radians) * distance,
    angle,
  };
}

/** Stable screen-space label dimensions used by both rendering and collision checks. */
export function studentDoorwayActionLabelSize(text: string) {
  return { width: Math.max(40, Math.min(132, text.length * 6 + 14)), height: 20 };
}

/** Place a horizontal label outside the door's authored outward normal. */
export function studentDoorwayActionLabelPlacement(angle: number, width: number, height = 20, iconRadius = 7.5, gap = 3) {
  const radians = angle * Math.PI / 180;
  const outwardX = Math.sin(radians);
  const outwardY = -Math.cos(radians);
  const sideFacing = Math.abs(outwardX) > Math.abs(outwardY);
  const screenX = sideFacing ? Math.sign(outwardX) * (iconRadius + gap + width / 2) : 0;
  const screenY = sideFacing ? 0 : Math.sign(outwardY) * (iconRadius + gap + height / 2);
  // The badge parent rotates with the authored doorway; convert the desired
  // screen-axis offset back into its local coordinates. Text is counter-rotated
  // separately so the label remains horizontal and readable.
  return {
    x: screenX * Math.cos(radians) + screenY * Math.sin(radians),
    y: -screenX * Math.sin(radians) + screenY * Math.cos(radians),
    screenX,
    screenY,
    sideFacing,
  };
}

export interface EntranceDirectionBadgeProps {
  x: number;
  y: number;
  edge: BuildingEntranceEdge;
  direction?: BuildingEntranceDirection;
  type?: BuildingEntranceType | "main" | "secondary" | "emergency";
  rotation?: number;
  /** Student-only emphasis for a route-relevant transition. */
  routeRelevant?: boolean;
  active?: boolean;
  /** Apply the normal pressable-direction emphasis only while hovered/focused. */
  emphasized?: boolean;
  /** Student context action. Only this half of a bidirectional badge is emphasized. */
  pressableDirection?: "entrance" | "exit";
  /** Route direction takes precedence over the normal context action. */
  activeDirection?: "entrance" | "exit";
  /** Preserve badge outlines and arrow strokes while a student map is zoomed. */
  screenConsistent?: boolean;
  /** Add a screen-sized invisible pointer target while keeping the visible glyph compact. */
  interactiveHitTarget?: boolean;
  /** Overview may condense nearby identical directions without moving either doorway. */
  overviewDuplicate?: boolean;
  /** Compact action text rendered beside the fixed screen-space doorway icon. */
  actionLabel?: string;
  /** More specific hover/focus or active-route text. */
  expandedActionLabel?: string;
  /** Hide lower-priority passive labels when they would collide or at overview. */
  showActionLabel?: boolean;
  reducedMotion?: boolean;
  /** Allows the badge to be identified in editor/public rendering tests. */
  testId?: string;
}

/**
 * The single semantic Entrance/Exit indicator.  The physical door keeps its
 * own door/exit styling; direction is shown once, in this blue badge outside
 * the object so it remains legible on both the editor and public maps.
 */
export function EntranceDirectionBadge({
  x,
  y,
  edge,
  direction,
  type,
  rotation = 0,
  routeRelevant = false,
  active = false,
  emphasized = false,
  pressableDirection,
  activeDirection,
  screenConsistent = false,
  interactiveHitTarget = false,
  overviewDuplicate = false,
  actionLabel,
  expandedActionLabel,
  showActionLabel = true,
  reducedMotion = false,
  testId = "entrance-direction-badge",
}: EntranceDirectionBadgeProps) {
  if (normalizeEntranceType(type) === "emergency_exit") return null;

  const normalizedDirection = normalizeEntranceDirection({ direction, type });
  const directionIsValid = (value: "entrance" | "exit") => normalizedDirection === "both"
    || (value === "entrance" ? normalizedDirection === "entrance_only" : normalizedDirection === "exit_only");
  const emphasizedDirection = activeDirection ?? (emphasized ? pressableDirection : undefined);
  const shouldEmphasizeDirection = Boolean(emphasizedDirection && directionIsValid(emphasizedDirection));
  const strokeVectorEffect = screenConsistent ? "non-scaling-stroke" as const : undefined;
  // Keep the student glyph the same visible size as the Admin authoring arrow.
  // Its camera compensation preserves this size; touchability lives on a
  // separate transparent screen-space circle below.
  const badgeRadius = 7.5;
  const emphasisX = emphasizedDirection === "entrance" ? 4.2 : -4.2;
  const emphasisRadius = activeDirection ? 11.5 : 9.5;
  // Keep Admin and Student badges on the same authored anchor math. Student
  // compensates glyph size around this placed point, never its position.
  const placement = entranceDirectionBadgePlacement(x, y, edge, rotation);
  const label = normalizedDirection === "entrance_only"
    ? "Entrance only"
    : normalizedDirection === "exit_only"
      ? "Exit only"
      : "Entrance and exit";
  // The badge is placed on the outside normal of the wall.  The physical
  // meaning of an Entrance-only arrow is the opposite direction (outside to
  // inside), while an Exit-only arrow follows the outside normal.  Applying
  // this local half-turn after the wall rotation keeps the semantics correct
  // for all four sides without changing the badge placement.
  const arrowRotation = normalizedDirection === "entrance_only" ? 180 : 0;

  return (
    <g
      data-testid={testId}
      data-screen-space={screenConsistent ? "true" : undefined}
      data-entrance-direction={normalizedDirection}
      data-entrance-edge={edge}
      data-route-relevant={routeRelevant ? "true" : undefined}
      data-active-transition={active ? "true" : undefined}
      data-emphasized-direction={shouldEmphasizeDirection ? emphasizedDirection : undefined}
      data-overview-duplicate={screenConsistent && overviewDuplicate ? "true" : undefined}
      className={screenConsistent
        ? `student-map-doorway-glyph${overviewDuplicate ? " student-overview-duplicate" : ""}`
        : undefined}
      aria-label={label}
      data-world-anchor-x={screenConsistent ? x : undefined}
      data-world-anchor-y={screenConsistent ? y : undefined}
      transform={`translate(${placement.x},${placement.y}) rotate(${placement.angle})`}
      pointerEvents={interactiveHitTarget ? "auto" : "none"}
    >
      <g className={screenConsistent ? "student-map-screen-marker" : undefined} data-testid={screenConsistent ? "student-screen-space-direction-marker" : undefined}>
      {interactiveHitTarget && <circle data-testid="entrance-direction-hit-target" cy={0} r="22" fill="transparent" pointerEvents="all" />}
      {screenConsistent && actionLabel && showActionLabel && (
        (() => {
          const text = activeDirection || emphasized ? expandedActionLabel ?? actionLabel : actionLabel;
          const { width, height } = studentDoorwayActionLabelSize(text);
          const labelPlacement = studentDoorwayActionLabelPlacement(placement.angle, width, height, badgeRadius);
          return <g
            data-testid="student-doorway-micro-label"
            data-label-priority={activeDirection ? "active" : emphasized ? "emphasized" : "passive"}
            data-label-side={labelPlacement.sideFacing ? (labelPlacement.screenX < 0 ? "left" : "right") : (labelPlacement.screenY < 0 ? "top" : "bottom")}
            className="student-doorway-micro-label"
            transform={`translate(${labelPlacement.x} ${labelPlacement.y}) rotate(${-placement.angle})`}
            pointerEvents="none"
            aria-hidden="true"
          >
            <rect data-testid="student-doorway-micro-label-bg" x={-width / 2} y={-height / 2} width={width} height={height} rx={height / 2}
              fill="#f8fbff" stroke={activeDirection ? "#1d4ed8" : emphasized ? "#3b82f6" : "#94a3b8"}
              strokeWidth={activeDirection ? 1.2 : 0.9} />
            <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fill="#173b70" fontSize={11.5}
              fontWeight={700} fontFamily="inherit" textRendering="geometricPrecision"
              data-testid="student-doorway-micro-label-text">{text}</text>
          </g>;
        })()
      )}
      <g data-testid={screenConsistent ? "student-direction-glyph" : undefined}>
      <g className={screenConsistent ? "student-transition-marker-lod" : undefined}>
      {routeRelevant && !active && <circle data-testid="entrance-direction-route-halo" r="10" fill="none" stroke="#60a5fa" strokeWidth={1.4} opacity={0.9} vectorEffect={strokeVectorEffect} />}
      {shouldEmphasizeDirection && reducedMotion && <circle data-testid="entrance-direction-static-emphasis" r="11.5" fill="none" stroke={activeDirection ? "#dbeafe" : "#bfdbfe"} strokeWidth={activeDirection ? 2 : 1.7} opacity={activeDirection ? 0.95 : 0.82} vectorEffect={strokeVectorEffect} />}
      {/* The active route has its own transition control and callout. Keep its
          ordinary doorway arrow quiet; only normal hover/focus pulses here. */}
      {shouldEmphasizeDirection && !activeDirection && !reducedMotion && <g className={screenConsistent ? "student-transition-normal-pulse" : undefined}><circle data-testid="entrance-direction-pressable-pulse" r={12} fill="none" stroke="#bfdbfe" strokeWidth={1.7} opacity={0.68} vectorEffect={strokeVectorEffect}>
        <animate attributeName="r" from="12" to="23" dur="2.8s" repeatCount="indefinite" />
        <animate attributeName="opacity" from="0.68" to="0.04" dur="2.8s" repeatCount="indefinite" />
      </circle></g>}
      {active && !activeDirection && !reducedMotion && (
        <g className={screenConsistent ? "student-transition-active-pulse" : undefined}><circle data-testid="entrance-direction-active-pulse" r={16} fill="none" stroke="#2563eb" strokeWidth={2} opacity={0.7} vectorEffect={strokeVectorEffect}>
          <animate attributeName="r" from="16" to="27" dur="1.8s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.7" to="0" dur="1.8s" repeatCount="indefinite" />
        </circle></g>
      )}
      {active && <circle data-testid="entrance-direction-active-ring" r={emphasisRadius} fill="none" stroke="#1d4ed8" strokeWidth={1.8} vectorEffect={strokeVectorEffect} />}
      <circle data-testid="entrance-direction-disc" r={badgeRadius} fill="#2563eb" stroke="white" strokeWidth={1.2} vectorEffect={strokeVectorEffect} />
      <g transform={`rotate(${arrowRotation})`} data-testid="entrance-direction-arrows" data-arrow-relative-rotation={arrowRotation}>
        {normalizedDirection === "both" ? (
          <>
            <g data-transition-arrow="exit" data-transition-emphasis={shouldEmphasizeDirection && emphasizedDirection === "exit" ? (activeDirection ? "active" : "pressable") : undefined}>
              {shouldEmphasizeDirection && emphasizedDirection === "exit" && <circle data-testid="entrance-direction-exit-emphasis" cx={-2.2} cy={0} r={reducedMotion ? 4 : 3.1} fill="none" stroke={activeDirection ? "#dbeafe" : "#bfdbfe"} strokeWidth={activeDirection ? 1.25 : 0.9} opacity={activeDirection ? 0.95 : 0.68} vectorEffect={strokeVectorEffect}>
                {!reducedMotion && <>
                  <animate attributeName="r" from={activeDirection ? "3.2" : "2.8"} to={activeDirection ? "5.8" : "4.8"} dur={activeDirection ? "2s" : "2.8s"} repeatCount="indefinite" />
                  <animate attributeName="opacity" from={activeDirection ? "0.78" : "0.5"} to="0.08" dur={activeDirection ? "2s" : "2.8s"} repeatCount="indefinite" />
                </>}
              </circle>}
              <path data-direction="exit" d="M-2.2,3 V-2.2 M-4,-0.4 L-2.2,-2.2 L-0.4,-0.4" fill="none" stroke="white" strokeWidth={1.05} strokeLinecap="round" strokeLinejoin="round" vectorEffect={strokeVectorEffect} />
            </g>
            <g data-transition-arrow="entrance" data-transition-emphasis={shouldEmphasizeDirection && emphasizedDirection === "entrance" ? (activeDirection ? "active" : "pressable") : undefined}>
              {shouldEmphasizeDirection && emphasizedDirection === "entrance" && <circle data-testid="entrance-direction-entrance-emphasis" cx={2.2} cy={0} r={reducedMotion ? 4 : 3.1} fill="none" stroke={activeDirection ? "#dbeafe" : "#bfdbfe"} strokeWidth={activeDirection ? 1.25 : 0.9} opacity={activeDirection ? 0.95 : 0.68} vectorEffect={strokeVectorEffect}>
                {!reducedMotion && <>
                  <animate attributeName="r" from={activeDirection ? "3.2" : "2.8"} to={activeDirection ? "5.8" : "4.8"} dur={activeDirection ? "2s" : "2.8s"} repeatCount="indefinite" />
                  <animate attributeName="opacity" from={activeDirection ? "0.78" : "0.5"} to="0.08" dur={activeDirection ? "2s" : "2.8s"} repeatCount="indefinite" />
                </>}
              </circle>}
              <path data-direction="entrance" d="M2.2,-3 V2.2 M0.4,0.4 L2.2,2.2 L4,0.4" fill="none" stroke="white" strokeWidth={1.05} strokeLinecap="round" strokeLinejoin="round" vectorEffect={strokeVectorEffect} />
            </g>
          </>
        ) : normalizedDirection === "entrance_only" ? (
          <g data-transition-arrow="entrance" data-transition-emphasis={shouldEmphasizeDirection && emphasizedDirection === "entrance" ? (activeDirection ? "active" : "pressable") : undefined}>
            {shouldEmphasizeDirection && emphasizedDirection === "entrance" && <circle data-testid="entrance-direction-entrance-emphasis" r={reducedMotion ? 4.1 : 3.1} fill="none" stroke={activeDirection ? "#dbeafe" : "#bfdbfe"} strokeWidth={activeDirection ? 1.25 : 0.9} opacity={activeDirection ? 0.95 : 0.68} vectorEffect={strokeVectorEffect}>
              {!reducedMotion && <>
                <animate attributeName="r" from={activeDirection ? "3.2" : "2.8"} to={activeDirection ? "5.8" : "4.8"} dur={activeDirection ? "2s" : "2.8s"} repeatCount="indefinite" />
                <animate attributeName="opacity" from={activeDirection ? "0.78" : "0.5"} to="0.08" dur={activeDirection ? "2s" : "2.8s"} repeatCount="indefinite" />
              </>}
            </circle>}
            <path data-direction="entrance" d="M0,3 V-2.5 M-2,-0.5 L0,-2.5 L2,-0.5" fill="none" stroke="white" strokeWidth={1.15} strokeLinecap="round" strokeLinejoin="round" vectorEffect={strokeVectorEffect} />
          </g>
        ) : (
          /* Exit-only follows the outside wall normal. The badge's local
             +Y axis is the building-facing direction, so an outward arrow
             uses the same upward glyph as the unrotated top-edge normal. */
          <g data-transition-arrow="exit" data-transition-emphasis={shouldEmphasizeDirection && emphasizedDirection === "exit" ? (activeDirection ? "active" : "pressable") : undefined}>
            {shouldEmphasizeDirection && emphasizedDirection === "exit" && <circle data-testid="entrance-direction-exit-emphasis" r={reducedMotion ? 4.1 : 3.1} fill="none" stroke={activeDirection ? "#dbeafe" : "#bfdbfe"} strokeWidth={activeDirection ? 1.25 : 0.9} opacity={activeDirection ? 0.95 : 0.68} vectorEffect={strokeVectorEffect}>
              {!reducedMotion && <>
                <animate attributeName="r" from={activeDirection ? "3.2" : "2.8"} to={activeDirection ? "5.8" : "4.8"} dur={activeDirection ? "2s" : "2.8s"} repeatCount="indefinite" />
                <animate attributeName="opacity" from={activeDirection ? "0.78" : "0.5"} to="0.08" dur={activeDirection ? "2s" : "2.8s"} repeatCount="indefinite" />
              </>}
            </circle>}
            <path data-direction="exit" d="M0,3 V-2.5 M-2,-0.5 L0,-2.5 L2,-0.5" fill="none" stroke="white" strokeWidth={1.15} strokeLinecap="round" strokeLinejoin="round" vectorEffect={strokeVectorEffect} />
          </g>
        )}
      </g>
      </g>
      </g>
      </g>
    </g>
  );
}
