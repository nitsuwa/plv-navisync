import { CanvasAssetVisual } from "../canvas/CanvasAssetVisual";
import { getCanvasAsset, resolveCanvasAssetKey } from "../canvas/canvasAssetCatalog";

/**
 * Canonical furniture artwork shared by the Admin floor editor and the
 * student read-only map. Keeping this renderer shared prevents published
 * furniture from degrading to generic rectangles on the student map.
 */
export function FloorFurnitureSymbol({ type, x, y, width, height, color, selected = false, assetKey }: {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  selected?: boolean;
  assetKey?: string;
}) {
  // Furniture is deliberately rendered as compact architectural-plan artwork
  // only.  It has no navigation meaning; all transforms continue to flow
  // through the existing FloorFurniture gesture/persistence lifecycle.
  const stroke = selected ? "var(--accent)" : "rgba(38,32,25,0.38)";
  const inset = Math.max(1, Math.min(width, height) * 0.1);
  const cx = x + width / 2;
  const cy = y + height / 2;
  const selStroke = selected ? 1.4 : 0.8;
  const sharedAssetKey = resolveCanvasAssetKey({ type, assetKey });
  const sharedAsset = sharedAssetKey ? getCanvasAsset(sharedAssetKey) : undefined;
  if (sharedAsset?.surfaces.includes("map")) {
    return (
      <>
        <CanvasAssetVisual
          assetKey={sharedAsset.key}
          label={sharedAsset.name}
          x={x}
          y={y}
          width={width}
          height={height}
          style={{ color }}
        />
        {selected && <rect x={x - 2} y={y - 2} width={width + 4} height={height + 4} rx={1.5} fill="none" stroke="var(--accent)" strokeWidth={1.5} />}
      </>
    );
  }
  const seatMark = (sx: number, sy: number, sw: number, sh = sw, key?: string) => (
    <g key={key} data-testid="furniture-seat">
      <rect x={sx - sw / 2} y={sy - sh / 2} width={sw} height={sh} rx={Math.min(sw, sh) * 0.22}
        fill={color} stroke={stroke} strokeWidth={selStroke * 0.8} />
      {/* A short backrest line keeps classroom and conference seating legible
          at plan scale without turning the symbol into a pictogram. */}
      <line x1={sx - sw * 0.28} y1={sy - sh * 0.28} x2={sx + sw * 0.28} y2={sy - sh * 0.28}
        stroke="rgba(255,255,255,0.7)" strokeWidth={Math.max(0.55, selStroke * 0.45)} strokeLinecap="round" />
    </g>
  );
  const rowMatch = type.match(/(?:lecture-row|workstation-row)-(4|6|8)$/);
  if (rowMatch) {
    const count = Number(rowMatch[1]);
    const gap = width / count;
    const workstationRow = type.includes("workstation-row");
    return (
      <>
        <rect x={x + 1} y={y + height * 0.27} width={width - 2} height={height * 0.42} rx={1.5}
          /* Placed lecture/workstation rows are intentionally opaque.  A
             translucent placement ghost is supplied by the outer editor
             preview; the committed symbol must remain readable over rooms. */
          fill={workstationRow ? "#e2e8f0" : "#dbe4ea"} stroke={stroke} strokeWidth={selStroke} />
        <rect data-testid="furniture-row-writing-rail" x={x + 2} y={y + height * 0.22} width={width - 4} height={Math.max(1.5, height * 0.09)}
          rx={0.7} fill={workstationRow ? "#cbd5e1" : "#c9d5dc"} stroke={stroke} strokeWidth={selStroke * 0.7} />
        {Array.from({ length: count }, (_, i) => {
          const px = x + gap * (i + 0.5);
          return <g key={`row-unit-${i}`}>
            {workstationRow && <rect x={px - Math.min(3.5, gap * 0.22)} y={y + height * 0.31} width={Math.min(7, gap * 0.44)} height={Math.min(3.5, height * 0.16)} rx={0.6} fill="#1f2937" />}
            {seatMark(px, y + height * 0.83, Math.max(4, gap * 0.52), height * 0.22, `row-seat-${i}`)}
            <line x1={px} y1={y + height * 0.26} x2={px} y2={y + height * 0.66}
              stroke="rgba(71,85,105,0.25)" strokeWidth={0.65} />
          </g>;
        })}
        <line x1={x + 2} y1={y + height * 0.24} x2={x + width - 2} y2={y + height * 0.24} stroke={color} strokeWidth={1.2} />
      </>
    );
  }
  if (type === "drafting-table-stool") {
    // A single, compact technical-studio symbol: drawing surface, parallel
    // drafting rail and one stool at the working edge.
    const railY = y + height * 0.28;
    return (
      <>
        <rect x={x + width * 0.08} y={y + height * 0.12} width={width * 0.84} height={height * 0.62}
          rx={Math.min(width, height) * 0.06} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <line x1={x + width * 0.14} y1={railY} x2={x + width * 0.86} y2={railY}
          stroke="rgba(255,255,255,0.58)" strokeWidth={1.1} />
        <line x1={x + width * 0.2} y1={y + height * 0.2} x2={x + width * 0.2} y2={y + height * 0.66}
          stroke="rgba(31,41,55,0.28)" strokeWidth={0.8} />
        {seatMark(cx, y + height * 0.88, Math.min(width * 0.22, 10), Math.min(height * 0.16, 7), "drafting-stool")}
      </>
    );
  }
  if (type === "computer-lab-table-4" || type === "computer-lab-table-6") {
    // Shared lab bench with aligned monitor/workstation cues and chairs.  The
    // composite intentionally remains one FloorFurniture record.
    const count = type.endsWith("-4") ? 4 : 6;
    const left = x + width * 0.08;
    const usable = width * 0.84;
    const step = usable / count;
    return (
      <>
        <rect data-testid="computer-lab-table" x={left} y={y + height * 0.27} width={usable} height={height * 0.38}
          rx={Math.min(width, height) * 0.06} fill={color} stroke={stroke} strokeWidth={selStroke} />
        {Array.from({ length: count }, (_, i) => {
          const px = left + step * (i + 0.5);
          return <g key={`computer-lab-${i}`}>
            <rect data-testid="computer-lab-monitor" x={px - Math.min(step * 0.26, 5)} y={y + height * 0.14} width={Math.min(step * 0.52, 10)} height={height * 0.15}
              rx={0.8} fill="#1f2937" stroke={stroke} strokeWidth={0.55} />
            <line x1={px} y1={y + height * 0.29} x2={px} y2={y + height * 0.35}
              stroke="#1f2937" strokeWidth={0.8} />
            <rect data-testid="computer-lab-keyboard" x={px - Math.min(step * 0.24, 4.5)} y={y + height * 0.42}
              width={Math.min(step * 0.48, 9)} height={Math.max(1, height * 0.07)} rx={0.5} fill="rgba(248,250,252,0.55)" />
            {seatMark(px, y + height * 0.84, Math.min(step * 0.52, 10), Math.min(height * 0.18, 8), `computer-lab-chair-${i}`)}
          </g>;
        })}
        <line x1={left + usable * 0.05} y1={y + height * 0.59} x2={left + usable * 0.95} y2={y + height * 0.59}
          stroke="rgba(255,255,255,0.35)" strokeWidth={0.8} />
      </>
    );
  }
  if (type === "table-tennis") {
    // Keep the default asset muted and distinct from selection/navigation blue,
    // while still honoring an administrator's explicit recolor. Older saved
    // records used the saturated #2563eb default, so normalize that legacy
    // default at render time without changing their persisted data.
    const tableColor = color.toLowerCase() === "#2563eb" ? "#3f7f73" : color;
    const tableX = x + width * 0.04;
    const tableY = y + height * 0.12;
    const tableW = width * 0.92;
    const tableH = height * 0.76;
    const tableRight = tableX + tableW;
    const tableBottom = tableY + tableH;
    const postRadius = Math.max(1.1, Math.min(width, height) * 0.055);
    return (
      <g data-testid="table-tennis-symbol">
        <rect data-testid="table-tennis-table" x={tableX} y={tableY} width={tableW} height={tableH}
          rx={Math.min(width, height) * 0.045} fill={tableColor} stroke={stroke} strokeWidth={selStroke} />
        <rect data-testid="table-tennis-boundary" x={tableX + width * 0.025} y={tableY + height * 0.045}
          width={tableW - width * 0.05} height={tableH - height * 0.09} rx={Math.min(width, height) * 0.025}
          fill="none" stroke="rgba(248,250,252,0.82)" strokeWidth={0.8} />
        {/* Service/doubles marking is intentionally light; the centre net is
            darker and thicker so it reads as a physical net, not a painted
            selection line. */}
        <line data-testid="table-tennis-service-line" x1={tableX + width * 0.055} y1={cy}
          x2={tableRight - width * 0.055} y2={cy}
          stroke="rgba(248,250,252,0.52)" strokeWidth={0.7} strokeDasharray="2 1.4" />
        <line data-testid="table-tennis-net" x1={cx} y1={tableY - height * 0.015} x2={cx} y2={tableBottom + height * 0.015}
          stroke="#263238" strokeWidth={Math.max(1.4, selStroke * 1.25)} />
        <line x1={cx} y1={tableY} x2={cx} y2={tableBottom}
          stroke="rgba(248,250,252,0.76)" strokeWidth={0.65} strokeDasharray="1.2 1" />
        <circle data-testid="table-tennis-net-post" cx={cx} cy={tableY - height * 0.005} r={postRadius} fill="#263238" />
        <circle data-testid="table-tennis-net-post" cx={cx} cy={tableBottom + height * 0.005} r={postRadius} fill="#263238" />
      </g>
    );
  }
  if (type === "student-desk-chair" || type === "faculty-desk-chair") {
    const faculty = type === "faculty-desk-chair";
    const deskX = x + width * 0.08;
    const deskY = y + height * 0.06;
    const deskW = width * 0.84;
    const deskH = height * 0.52;
    return (
      <>
        <rect data-testid={faculty ? "faculty-desk-surface" : "student-desk-surface"} x={deskX} y={deskY} width={deskW} height={deskH}
          rx={1.5} fill={color} stroke={stroke} strokeWidth={selStroke} />
        {faculty
          ? <path d={`M ${deskX + deskW * 0.1} ${deskY + deskH * 0.22} h${deskW * 0.5} v${deskH * 0.42} h-${deskW * 0.16}`}
            fill="none" stroke="rgba(31,41,55,0.35)" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" />
          : <rect x={cx - width * 0.16} y={y + height * 0.17} width={width * 0.32} height={height * 0.18} rx={1}
            fill="rgba(31,41,55,0.28)" />}
        <line x1={deskX + deskW * 0.1} y1={deskY + deskH * 0.78} x2={deskX + deskW * 0.9} y2={deskY + deskH * 0.78}
          stroke="rgba(255,255,255,0.36)" strokeWidth={0.75} />
        {seatMark(cx, y + height * 0.83, width * 0.36, height * 0.22, "desk-chair")}
      </>
    );
  }
  if (type.startsWith("study-table-") || type.startsWith("conference-table-") || type === "conference-table" || type === "library-study-table") {
    const isConference = type.startsWith("conference");
    const count = type.endsWith("-4") ? 4 : type.endsWith("-6") ? 6 : type.endsWith("-8") ? 8 : 6;
    const tableX = x + width * 0.18;
    const tableY = y + height * 0.25;
    const tableW = width * 0.64;
    const tableH = height * 0.5;
    const sideCount = Math.ceil(count / 2);
    return (
      <>
        <rect data-testid={isConference ? "conference-table" : "study-table"} x={tableX} y={tableY} width={tableW} height={tableH} rx={Math.min(tableW, tableH) * 0.12} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <line x1={tableX + tableW * 0.08} y1={tableY + tableH * 0.25} x2={tableX + tableW * 0.92} y2={tableY + tableH * 0.25} stroke="rgba(255,255,255,0.3)" strokeWidth={0.8} />
        <line x1={tableX + tableW * 0.08} y1={tableY + tableH * 0.75} x2={tableX + tableW * 0.92} y2={tableY + tableH * 0.75} stroke="rgba(255,255,255,0.3)" strokeWidth={0.8} />
        {isConference && <line data-testid="conference-table-centerline" x1={cx} y1={tableY + tableH * 0.12} x2={cx} y2={tableY + tableH * 0.88}
          stroke="rgba(255,255,255,0.28)" strokeWidth={0.7} strokeDasharray="2 1.5" />}
        {type === "library-study-table" && <line data-testid="library-table-centerline" x1={tableX + tableW * 0.16} y1={cy} x2={tableX + tableW * 0.84} y2={cy}
          stroke="rgba(255,255,255,0.4)" strokeWidth={0.75} />}
        {Array.from({ length: sideCount }, (_, i) => {
          const px = tableX + tableW * ((i + 0.5) / sideCount);
          return <g key={`table-seat-${i}`}>
            {seatMark(px, tableY - height * 0.09, Math.min(width * 0.14, 8), Math.min(height * 0.14, 7), `top-${i}`)}
            {seatMark(px, tableY + tableH + height * 0.09, Math.min(width * 0.14, 8), Math.min(height * 0.14, 7), `bottom-${i}`)}
          </g>;
        })}
        {!isConference && count === 4 && <circle cx={cx} cy={cy} r={Math.min(width, height) * 0.08} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={0.8} />}
      </>
    );
  }
  if (type === "lab-workbench" || type === "lab-workbench-stools") {
    const stools = type.endsWith("stools");
    const stoolCount = stools ? 4 : 0;
    return (
      <>
        <rect x={x + width * 0.05} y={y + height * 0.22} width={width * 0.9} height={height * 0.56} rx={1.5} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <line x1={x + width * 0.12} y1={cy} x2={x + width * 0.88} y2={cy} stroke="rgba(255,255,255,0.4)" strokeWidth={0.9} />
        <circle cx={x + width * 0.28} cy={cy} r={Math.min(width, height) * 0.12} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={0.8} />
        <circle cx={x + width * 0.72} cy={cy} r={Math.min(width, height) * 0.12} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={0.8} />
        {Array.from({ length: 3 }, (_, i) => <rect key={`workbench-drawer-${i}`} x={x + width * (0.38 + i * 0.12)} y={y + height * 0.34}
          width={width * 0.08} height={height * 0.3} rx={0.6} fill="rgba(31,41,55,0.18)" stroke="rgba(255,255,255,0.4)" strokeWidth={0.55} />)}
        {Array.from({ length: stoolCount }, (_, i) => seatMark(x + width * (0.2 + (i % 2) * 0.6), y + (i < 2 ? height * 0.08 : height * 0.92), Math.min(width * 0.13, 7), Math.min(height * 0.13, 7), `stool-${i}`))}
      </>
    );
  }
  if (type === "office-desk-visitors") {
    return (
      <>
        <rect x={x + width * 0.16} y={y + height * 0.06} width={width * 0.68} height={height * 0.36} rx={1.5} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <rect x={x + width * 0.25} y={y + height * 0.16} width={width * 0.5} height={height * 0.12} rx={1} fill="rgba(31,41,55,0.25)" />
        {seatMark(x + width * 0.32, y + height * 0.78, width * 0.2, height * 0.22, "visitor-1")}
        {seatMark(x + width * 0.68, y + height * 0.78, width * 0.2, height * 0.22, "visitor-2")}
      </>
    );
  }
  if (type === "whiteboard") {
    // Wall-oriented teaching board: a slim plan symbol with a small tray line.
    return (
      <>
        <rect x={x + 1} y={y + 1} width={Math.max(1, width - 2)} height={Math.max(1, height - 2)} rx={1}
          fill={color} stroke={stroke} strokeWidth={selStroke} />
        <line x1={x + width * 0.08} y1={y + height * 0.68} x2={x + width * 0.92} y2={y + height * 0.68}
          stroke="#94a3b8" strokeWidth={0.8} />
        <line x1={x + width * 0.16} y1={y + height * 0.86} x2={x + width * 0.84} y2={y + height * 0.86}
          stroke="#64748b" strokeWidth={0.7} />
      </>
    );
  }
  if (type === "lectern") {
    // Compact top-down podium: broad reading surface over a tapered stand.
    return (
      <>
        <path d={`M ${x + width * 0.16} ${y + height * 0.14} h${width * 0.68} l-${width * 0.1} ${height * 0.28} h-${width * 0.48} z`}
          fill={color} stroke={stroke} strokeWidth={selStroke} strokeLinejoin="round" />
        <path d={`M ${x + width * 0.3} ${y + height * 0.42} h${width * 0.4} l${width * 0.1} ${height * 0.4} h-${width * 0.6} z`}
          fill="rgba(0,0,0,0.12)" stroke={stroke} strokeWidth={0.8} strokeLinejoin="round" />
        <circle cx={cx} cy={y + height * 0.68} r={Math.min(width, height) * 0.07} fill="#475569" />
      </>
    );
  }
  if (type === "printer-copier") {
    return (
      <>
        <rect data-testid="printer-body" x={x + 1} y={y + height * 0.12} width={width - 2} height={height * 0.76} rx={1.5}
          fill={color} stroke={stroke} strokeWidth={selStroke} />
        <rect data-testid="printer-output" x={x + width * 0.16} y={y + height * 0.2} width={width * 0.68} height={height * 0.2} rx={0.8}
          fill="#e2e8f0" stroke="#475569" strokeWidth={0.7} />
        <path d={`M ${x + width * 0.26} ${y + height * 0.46} q${width * 0.24} -${height * 0.1} ${width * 0.48} 0`}
          fill="none" stroke="#f8fafc" strokeWidth={0.9} strokeLinecap="round" />
        <line x1={x + width * 0.2} y1={y + height * 0.62} x2={x + width * 0.8} y2={y + height * 0.62}
          stroke="#cbd5e1" strokeWidth={1} />
        <circle data-testid="printer-control" cx={x + width * 0.78} cy={y + height * 0.74} r={Math.min(width, height) * 0.06} fill="#22c55e" />
      </>
    );
  }
  if (type === "server-rack") {
    return (
      <>
        <rect data-testid="server-rack-body" x={x + 1} y={y + 1} width={Math.max(1, width - 2)} height={Math.max(1, height - 2)} rx={1.2}
          fill={color} stroke={stroke} strokeWidth={selStroke} />
        {[0.25, 0.5, 0.75].map((t) => (
          <line key={t} x1={x + width * 0.12} y1={y + height * t} x2={x + width * 0.88} y2={y + height * t}
            stroke="#94a3b8" strokeWidth={0.8} />
        ))}
        <circle cx={x + width * 0.2} cy={y + height * 0.14} r={Math.min(width, height) * 0.045} fill="#22c55e" />
        <circle cx={x + width * 0.8} cy={y + height * 0.14} r={Math.min(width, height) * 0.045} fill="#f59e0b" />
      </>
    );
  }
  if (type === "locker") {
    const bays = Math.max(2, Math.min(6, Math.round(width / 7)));
    return (
      <>
        <rect data-testid="locker-body" x={x + 1} y={y + 1} width={Math.max(1, width - 2)} height={Math.max(1, height - 2)} rx={1.2}
          fill={color} stroke={stroke} strokeWidth={selStroke} />
        {Array.from({ length: bays - 1 }, (_, i) => (
          <line key={`locker-${i}`} x1={x + width * ((i + 1) / bays)} y1={y + height * 0.1}
            x2={x + width * ((i + 1) / bays)} y2={y + height * 0.9} stroke="#cbd5e1" strokeWidth={0.8} />
        ))}
        {Array.from({ length: bays }, (_, i) => (
          <circle key={`locker-handle-${i}`} cx={x + width * ((i + 0.78) / bays)} cy={cy}
            r={Math.min(width, height) * 0.035} fill="#e2e8f0" />
        ))}
      </>
    );
  }
  if (type === "double-sided-library-shelf") {
    return (
      <g data-testid="double-sided-library-shelf-symbol">
        <rect x={x} y={y + height * 0.08} width={width} height={height * 0.84} rx={1} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <line x1={x + width * 0.04} y1={cy} x2={x + width * 0.96} y2={cy} stroke="rgba(255,255,255,0.55)" strokeWidth={1} />
        {Array.from({ length: Math.max(2, Math.floor(width / 16)) - 1 }, (_, i) => <line key={`shelf-${i}`} x1={x + width * ((i + 1) / Math.max(2, Math.floor(width / 16)))} y1={y + height * 0.14} x2={x + width * ((i + 1) / Math.max(2, Math.floor(width / 16)))} y2={y + height * 0.86} stroke="rgba(255,255,255,0.35)" strokeWidth={0.7} />)}
      </g>
    );
  }
  if (type === "equipment-cabinet") {
    return (
      <g data-testid="equipment-cabinet-symbol">
        <rect data-testid="equipment-cabinet-body" x={x} y={y} width={width} height={height} rx={1.3} fill={color} stroke={stroke} strokeWidth={selStroke} />
        {[0.25, 0.5, 0.75].map((t) => <line key={t} x1={x + width * 0.1} y1={y + height * t} x2={x + width * 0.9} y2={y + height * t}
          stroke="rgba(248,250,252,0.52)" strokeWidth={0.8} />)}
        <circle cx={x + width * 0.18} cy={y + height * 0.12} r={Math.max(0.7, Math.min(width, height) * 0.045)} fill="#22c55e" />
        <circle cx={x + width * 0.3} cy={y + height * 0.12} r={Math.max(0.7, Math.min(width, height) * 0.045)} fill="#f59e0b" />
      </g>
    );
  }
  if (type === "tall-storage-cabinet") {
    return (
      <>
        <rect x={x} y={y} width={width} height={height} rx={1.3} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <line x1={x + width * 0.08} y1={cy} x2={x + width * 0.92} y2={cy} stroke="rgba(255,255,255,0.4)" strokeWidth={0.8} />
        <line x1={cx} y1={y + height * 0.08} x2={cx} y2={y + height * 0.92} stroke="rgba(255,255,255,0.34)" strokeWidth={0.8} />
      </>
    );
  }
  if (type === "vending-machine") {
    return (
      <>
        <rect data-testid="vending-machine-body" x={x + width * 0.08} y={y + height * 0.04} width={width * 0.84} height={height * 0.92}
          rx={Math.min(width, height) * 0.08} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <rect x={x + width * 0.2} y={y + height * 0.14} width={width * 0.6} height={height * 0.45}
          rx={0.8} fill="#cbd5e1" stroke="#334155" strokeWidth={0.7} />
        <line x1={x + width * 0.24} y1={y + height * 0.27} x2={x + width * 0.76} y2={y + height * 0.27} stroke="#94a3b8" strokeWidth={0.65} />
        <line x1={x + width * 0.24} y1={y + height * 0.41} x2={x + width * 0.76} y2={y + height * 0.41} stroke="#94a3b8" strokeWidth={0.65} />
        <circle cx={x + width * 0.72} cy={y + height * 0.76} r={Math.min(width, height) * 0.07} fill="#22c55e" />
        <line x1={x + width * 0.24} y1={y + height * 0.78} x2={x + width * 0.58} y2={y + height * 0.78} stroke="#e2e8f0" strokeWidth={1} strokeLinecap="round" />
      </>
    );
  }
  if (type === "drinking-fountain") {
    return (
      <>
        <rect data-testid="drinking-fountain-body" x={x + width * 0.08} y={y + height * 0.2} width={width * 0.84} height={height * 0.62}
          rx={Math.min(width, height) * 0.12} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <ellipse data-testid="drinking-fountain-basin" cx={cx} cy={y + height * 0.56} rx={width * 0.28} ry={height * 0.2} fill="#e0f2fe" stroke="#2563eb" strokeWidth={0.75} />
        <path d={`M ${cx - width * 0.14} ${y + height * 0.29} q${width * 0.14} -${height * 0.16} ${width * 0.28} 0`} fill="none" stroke="#2563eb" strokeWidth={0.8} strokeLinecap="round" />
        <circle cx={cx} cy={y + height * 0.35} r={Math.min(width, height) * 0.045} fill="#2563eb" />
        <path data-testid="drinking-fountain-spout" d={`M ${cx - width * 0.06} ${y + height * 0.4} h${width * 0.12} v${height * 0.08}`}
          fill="none" stroke="#2563eb" strokeWidth={0.7} strokeLinecap="round" strokeLinejoin="round" />
      </>
    );
  }
  if (type === "reception-counter") {
    return (
      <>
        <rect data-testid="reception-counter-body" x={x + width * 0.05} y={y + height * 0.18} width={width * 0.9} height={height * 0.58}
          rx={Math.min(width, height) * 0.08} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <line x1={x + width * 0.12} y1={y + height * 0.34} x2={x + width * 0.88} y2={y + height * 0.34}
          stroke="rgba(255,255,255,0.48)" strokeWidth={0.8} />
        <rect data-testid="reception-workstation" x={x + width * 0.67} y={y + height * 0.42} width={width * 0.17} height={height * 0.23}
          rx={0.8} fill="#1f2937" stroke={stroke} strokeWidth={0.55} />
        <path data-testid="reception-service-side" d={`M ${x + width * 0.14} ${y + height * 0.58} h${width * 0.42}`}
          fill="none" stroke="rgba(248,250,252,0.8)" strokeWidth={1.2} strokeLinecap="round" />
        <circle cx={x + width * 0.24} cy={y + height * 0.47} r={Math.min(width, height) * 0.07} fill="#e2e8f0" />
      </>
    );
  }
  if (type === "computer-workstation-chair") {
    return (
      <>
        <rect data-testid="computer-workstation-desk" x={x + width * 0.08} y={y + height * 0.05} width={width * 0.84} height={height * 0.54} rx={1.3} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <rect data-testid="computer-workstation-monitor" x={cx - width * 0.18} y={y + height * 0.12} width={width * 0.36} height={height * 0.2} rx={1} fill="#1f2937" />
        <line x1={cx} y1={y + height * 0.32} x2={cx} y2={y + height * 0.39} stroke="#1f2937" strokeWidth={0.8} />
        <rect data-testid="computer-workstation-keyboard" x={cx - width * 0.22} y={y + height * 0.43} width={width * 0.44} height={Math.max(1, height * 0.08)} rx={0.5} fill="rgba(248,250,252,0.58)" />
        {seatMark(cx, y + height * 0.83, width * 0.34, height * 0.22, "computer-chair")}
      </>
    );
  }
  if (type === "projector") {
    return <g data-testid="projector-symbol">
      <rect data-testid="projector-body" x={x + width * 0.12} y={y + height * 0.2} width={width * 0.76} height={height * 0.6} rx={1.5} fill={color} stroke={stroke} strokeWidth={selStroke} />
      <circle data-testid="projector-lens" cx={x + width * 0.7} cy={cy} r={Math.min(width, height) * 0.12} fill="#e2e8f0" stroke="#334155" strokeWidth={0.7} />
      <line x1={x + width * 0.22} y1={y + height * 0.38} x2={x + width * 0.42} y2={y + height * 0.38} stroke="rgba(248,250,252,0.65)" strokeWidth={0.7} />
      <line x1={x + width * 0.22} y1={y + height * 0.62} x2={x + width * 0.42} y2={y + height * 0.62} stroke="rgba(248,250,252,0.65)" strokeWidth={0.7} />
    </g>;
  }
  if (type === "wall-display") {
    return <g data-testid="wall-display-symbol">
      <rect data-testid="wall-display-bezel" x={x} y={y + height * 0.16} width={width} height={height * 0.68} rx={1} fill={color} stroke={stroke} strokeWidth={selStroke} />
      <rect data-testid="wall-display-screen" x={x + width * 0.08} y={y + height * 0.25} width={width * 0.84} height={height * 0.5} rx={0.6} fill="#0f172a" stroke="rgba(248,250,252,0.55)" strokeWidth={0.65} />
      <line x1={cx} y1={y} x2={cx} y2={y + height * 0.16} stroke={stroke} strokeWidth={0.8} />
      <line x1={cx} y1={y + height * 0.84} x2={cx} y2={y + height} stroke={stroke} strokeWidth={0.8} />
    </g>;
  }
  if (type === "toilet" || type === "urinal") {
    const urinal = type === "urinal";
    return <>
      <rect x={x + width * 0.18} y={y + height * 0.06} width={width * 0.64} height={height * 0.22} rx={1} fill="#94a3b8" stroke={stroke} strokeWidth={0.7} />
      <ellipse data-testid={urinal ? "urinal-basin" : "toilet-bowl"} cx={cx} cy={y + height * 0.62}
        rx={width * (urinal ? 0.32 : 0.34)} ry={height * (urinal ? 0.28 : 0.32)} fill={color} stroke={stroke} strokeWidth={selStroke} />
      {!urinal && <>
        <ellipse cx={cx} cy={y + height * 0.62} rx={width * 0.2} ry={height * 0.18} fill="none" stroke="#94a3b8" strokeWidth={0.7} />
        <path d={`M ${x + width * 0.3} ${y + height * 0.58} Q ${cx} ${y + height * 0.9} ${x + width * 0.7} ${y + height * 0.58}`}
          fill="none" stroke="#94a3b8" strokeWidth={0.8} />
      </>}
      {urinal && <path d={`M ${cx - width * 0.16} ${y + height * 0.42} q${width * 0.16} -${height * 0.08} ${width * 0.32} 0`}
        fill="none" stroke="#64748b" strokeWidth={0.8} strokeLinecap="round" />}
    </>;
  }
  if (type === "laboratory-sink") {
    return (
      <>
        <rect x={x + 1} y={y + height * 0.12} width={Math.max(1, width - 2)} height={height * 0.76} rx={1.2}
          fill="#94a3b8" stroke={stroke} strokeWidth={selStroke} />
        <ellipse cx={cx} cy={cy + height * 0.06} rx={width * 0.28} ry={height * 0.26}
          fill={color} stroke="#475569" strokeWidth={0.8} />
        <circle cx={cx} cy={y + height * 0.23} r={Math.min(width, height) * 0.06} fill="#475569" />
        <path d={`M ${cx} ${y + height * 0.23} q${width * 0.14} 0 ${width * 0.14} ${height * 0.12}`}
          fill="none" stroke="#475569" strokeWidth={0.8} strokeLinecap="round" />
      </>
    );
  }
  if (type === "sink" || type === "double-sink") {
    const count = type === "double-sink" ? 2 : 1;
    return <g data-testid={count === 2 ? "double-sink-symbol" : "sink-symbol"}>{Array.from({ length: count }, (_, i) => { const sx = x + width * ((i + 0.5) / count); return <g key={`sink-${i}`}><ellipse data-testid="sink-basin" cx={sx} cy={cy} rx={width * (count === 1 ? 0.3 : 0.18)} ry={height * 0.34} fill={color} stroke={stroke} strokeWidth={selStroke} /><circle data-testid="sink-faucet" cx={sx} cy={cy - height * 0.23} r={Math.min(width, height) * 0.06} fill="#64748b" /><path d={`M ${sx} ${cy - height * 0.18} q${width * 0.08} -${height * 0.18} ${width * 0.16} 0`} fill="none" stroke="#475569" strokeWidth={0.7} strokeLinecap="round" /></g>; })}</g>;
  }
  if (type === "faucet") {
    return <>
      <circle cx={cx} cy={cy + height * 0.15} r={Math.min(width, height) * 0.22} fill={color} stroke={stroke} strokeWidth={selStroke} />
      <path d={`M ${cx} ${cy + height * 0.05} v-${height * 0.36} q0 -${height * 0.18} ${width * 0.24} -${height * 0.18} h${width * 0.2}`} fill="none" stroke="#475569" strokeWidth={Math.max(0.7, selStroke * 0.8)} strokeLinecap="round" />
    </>;
  }
  if (type === "toilet-stall" || type === "pwd-toilet-stall") {
    const pwd = type === "pwd-toilet-stall";
    const partition = "#64748b";
    const openingStart = x + width * 0.56;
    const openingEnd = x + width * 0.9;
    const toiletX = x + width * (pwd ? 0.62 : 0.58);
    const toiletY = y + height * 0.36;
    return <g data-testid={pwd ? "pwd-toilet-stall-symbol" : "toilet-stall-symbol"}>
      <rect x={x + 1} y={y + 1} width={width - 2} height={height - 2} rx={1}
        fill={pwd ? "rgba(219,234,254,0.36)" : "rgba(226,232,240,0.34)"}
        stroke={partition} strokeWidth={Math.max(0.9, selStroke * 0.85)} />
      <line x1={x + 1} y1={y + 1} x2={x + width - 1} y2={y + 1} stroke={partition} strokeWidth={1.2} />
      <line x1={x + 1} y1={y + 1} x2={x + 1} y2={y + height - 1} stroke={partition} strokeWidth={1.1} />
      <line x1={x + width - 1} y1={y + 1} x2={x + width - 1} y2={y + height - 1} stroke={partition} strokeWidth={1.1} />
      <line x1={x + 1} y1={y + height - 1} x2={openingStart} y2={y + height - 1} stroke={partition} strokeWidth={1.1} />
      <line x1={openingEnd} y1={y + height - 1} x2={x + width - 1} y2={y + height - 1} stroke={partition} strokeWidth={1.1} />
      <line x1={openingEnd} y1={y + height - 1} x2={openingEnd} y2={y + height * 0.62} stroke="#94a3b8" strokeWidth={0.9} />
      <path d={`M ${openingEnd} ${y + height * 0.62} A ${height * 0.34} ${height * 0.34} 0 0 0 ${openingStart} ${y + height - 1}`} fill="none" stroke="#94a3b8" strokeWidth={0.75} strokeDasharray="1.5 1.5" />
      <rect x={toiletX - width * 0.12} y={y + height * 0.12} width={width * 0.24} height={height * 0.12} rx={0.7} fill="#cbd5e1" stroke={partition} strokeWidth={0.7} />
      <ellipse cx={toiletX} cy={toiletY} rx={width * (pwd ? 0.15 : 0.13)} ry={height * (pwd ? 0.12 : 0.105)} fill="#f8fafc" stroke={partition} strokeWidth={0.8} />
      {pwd && <>
        <circle cx={x + width * 0.31} cy={y + height * 0.58} r={Math.min(width, height) * 0.16} fill="none" stroke="#2563eb" strokeWidth={0.8} strokeDasharray="1.5 1.5" />
        <line x1={x + width * 0.2} y1={y + height * 0.16} x2={x + width * 0.36} y2={y + height * 0.16} stroke="#2563eb" strokeWidth={0.8} />
        <line data-testid="pwd-grab-bar" x1={x + width * 0.2} y1={y + height * 0.72} x2={x + width * 0.37} y2={y + height * 0.72} stroke="#2563eb" strokeWidth={1} strokeLinecap="round" />
      </>}
    </g>;
  }
  if (type === "stall-partition") {
    return <>
      <rect x={x + 0.5} y={y + height * 0.2} width={width - 1} height={Math.max(1, height * 0.6)} rx={0.7} fill={color} fillOpacity={0.55} stroke={stroke} strokeWidth={selStroke} />
      <line x1={x + width * 0.12} y1={cy} x2={x + width * 0.88} y2={cy} stroke="#94a3b8" strokeWidth={0.6} strokeDasharray="1 1" />
    </>;
  }
  if (type === "mirror") {
    return <g data-testid="mirror-symbol"><rect x={x + width * 0.04} y={y + height * 0.2} width={width * 0.92} height={height * 0.6} rx={1} fill={color} fillOpacity={0.55} stroke="#2563eb" strokeWidth={selStroke} /><line x1={x + width * 0.18} y1={y + height * 0.32} x2={x + width * 0.82} y2={y + height * 0.68} stroke="rgba(255,255,255,0.7)" strokeWidth={0.7} /><line x1={x + width * 0.26} y1={y + height * 0.68} x2={x + width * 0.74} y2={y + height * 0.32} stroke="rgba(255,255,255,0.35)" strokeWidth={0.55} /></g>;
  }
  if (type === "soap-dispenser" || type === "tissue-dispenser" || type === "hand-dryer") {
    const dryer = type === "hand-dryer";
    const tissue = type === "tissue-dispenser";
    return <>
      <rect data-testid={dryer ? "hand-dryer-body" : tissue ? "tissue-dispenser-body" : "soap-dispenser-body"} x={x + width * 0.14} y={y + height * 0.12} width={width * 0.72} height={height * 0.76} rx={1.1} fill={color} stroke={stroke} strokeWidth={selStroke} />
      {dryer
        ? <><path d={`M ${x + width * 0.3} ${cy} h${width * 0.4}`} stroke="#e2e8f0" strokeWidth={1} strokeLinecap="round" /><path d={`M ${x + width * 0.34} ${cy - height * 0.18} q${width * 0.14} ${height * 0.18} 0 ${height * 0.36}`} fill="none" stroke="#e2e8f0" strokeWidth={0.7} /><line x1={x + width * 0.28} y1={y + height * 0.7} x2={x + width * 0.72} y2={y + height * 0.7} stroke="#cbd5e1" strokeWidth={0.55} strokeDasharray="1 1" /></>
        : <line x1={x + width * 0.3} y1={tissue ? cy : y + height * 0.3} x2={x + width * 0.7} y2={tissue ? cy : y + height * 0.7} stroke="#e2e8f0" strokeWidth={0.9} />}
    </>;
  }
  if (type === "floor-drain") {
    return <g data-testid="floor-drain-symbol"><rect x={x + width * 0.14} y={y + height * 0.14} width={width * 0.72} height={height * 0.72} rx={0.7} fill={color} stroke={stroke} strokeWidth={selStroke} /><line x1={x + width * 0.28} y1={cy} x2={x + width * 0.72} y2={cy} stroke="#475569" strokeWidth={0.65} /><line x1={cx} y1={y + height * 0.28} x2={cx} y2={y + height * 0.72} stroke="#475569" strokeWidth={0.65} /></g>;
  }
  if (type === "fire-extinguisher") {
    return <><rect x={x + width * 0.2} y={y + height * 0.2} width={width * 0.6} height={height * 0.7} rx={Math.min(width, height) * 0.18} fill="#dc2626" stroke={stroke} strokeWidth={selStroke} /><path d={`M ${cx} ${y + height * 0.2} v-${height * 0.12} h${width * 0.28}`} fill="none" stroke="#991b1b" strokeWidth={1} strokeLinecap="round" /><line x1={x + width * 0.28} y1={y + height * 0.48} x2={x + width * 0.72} y2={y + height * 0.48} stroke="rgba(255,255,255,0.7)" strokeWidth={0.8} /></>;
  }
  if (type === "exit-sign") {
    return <><rect x={x + 1} y={y + height * 0.16} width={width - 2} height={height * 0.68} rx={1} fill="#16a34a" stroke={stroke} strokeWidth={selStroke} /><path d={`M ${x + width * 0.22} ${cy} h${width * 0.44} m-${width * 0.12} -${height * 0.18} l${width * 0.12} ${height * 0.18} l-${width * 0.12} ${height * 0.18}`} fill="none" stroke="white" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" /></>;
  }
  if (type === "emergency-light") {
    return <><rect x={x + width * 0.08} y={y + height * 0.2} width={width * 0.84} height={height * 0.6} rx={1} fill={color} stroke={stroke} strokeWidth={selStroke} /><circle cx={x + width * 0.33} cy={cy} r={Math.min(width, height) * 0.12} fill="#fff7ed" /><circle cx={x + width * 0.67} cy={cy} r={Math.min(width, height) * 0.12} fill="#fff7ed" /></>;
  }
  if (type === "first-aid-cabinet") {
    return <><rect x={x + 1} y={y + 1} width={width - 2} height={height - 2} rx={1} fill={color} stroke={stroke} strokeWidth={selStroke} /><path d={`M ${cx - width * 0.28} ${cy} h${width * 0.56} M ${cx} ${cy - height * 0.28} v${height * 0.56}`} stroke="white" strokeWidth={1.2} strokeLinecap="round" /></>;
  }
  if (type === "restroom-trash-bin" || type === "indoor-trash-bin") {
    return <><path d={`M ${x + width * 0.2} ${y + height * 0.24} h${width * 0.6} l-${width * 0.08} ${height * 0.64} h-${width * 0.44} z`} fill={color} stroke={stroke} strokeWidth={selStroke} /><line x1={x + width * 0.27} y1={y + height * 0.16} x2={x + width * 0.73} y2={y + height * 0.16} stroke={stroke} strokeWidth={1} /></>;
  }
  if (type.includes("chair")) {
    // Chair: rounded seat + a clear backrest band on the "top" side.
    return (
      <>
        <rect x={x + width * 0.18} y={y + height * 0.34} width={width * 0.64} height={height * 0.54} rx={Math.min(width, height) * 0.18} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <rect x={x + width * 0.16} y={y + height * 0.12} width={width * 0.68} height={height * 0.24} rx={1.5} fill="rgba(255,255,255,0.3)" stroke={color} strokeWidth={0.8} />
      </>
    );
  }
  if (type.includes("sofa")) {
    // Sofa: rounded body with two armrest blocks and a seat-cushion divider.
    return (
      <>
        <rect x={x} y={y} width={width} height={height} rx={Math.min(width, height) * 0.16} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <rect x={x + width * 0.1} y={y + height * 0.16} width={width * 0.8} height={height * 0.66} rx={2} fill="rgba(255,255,255,0.18)" />
        <rect x={x + width * 0.03} y={y + height * 0.12} width={width * 0.09} height={height * 0.72} rx={1.5} fill="rgba(0,0,0,0.14)" />
        <rect x={x + width * 0.88} y={y + height * 0.12} width={width * 0.09} height={height * 0.72} rx={1.5} fill="rgba(0,0,0,0.14)" />
        <line x1={cx} y1={y + height * 0.18} x2={cx} y2={y + height * 0.78} stroke="rgba(255,255,255,0.32)" strokeWidth={1} />
      </>
    );
  }
  if (type === "waiting-bench") {
    const slats = Math.max(2, Math.min(4, Math.floor(width / 12)));
    return (
      <g data-testid="waiting-bench-symbol">
        <rect x={x} y={y + height * 0.22} width={width} height={height * 0.62} rx={height * 0.2} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <rect data-testid="waiting-bench-back" x={x + width * 0.04} y={y + height * 0.08} width={width * 0.92} height={height * 0.18}
          rx={height * 0.08} fill="rgba(255,255,255,0.23)" stroke={stroke} strokeWidth={selStroke * 0.7} />
        {Array.from({ length: slats - 1 }, (_, i) => <line key={i} x1={x + (width / slats) * (i + 1)} y1={y + height * 0.28}
          x2={x + (width / slats) * (i + 1)} y2={y + height * 0.78} stroke="rgba(255,255,255,0.35)" strokeWidth={0.75} />)}
      </g>
    );
  }
  if (type.includes("bench")) {
    // Bench: long rounded seating structure with visible slats.
    const slats = Math.max(1, Math.min(4, Math.floor(width / 12)));
    return (
      <>
        <rect x={x} y={y + height * 0.16} width={width} height={height * 0.68} rx={height * 0.22} fill={color} stroke={stroke} strokeWidth={selStroke} />
        {slats > 1 && Array.from({ length: slats - 1 }, (_, i) => (
          <line key={i} x1={x + (width / slats) * (i + 1)} y1={y + height * 0.18} x2={x + (width / slats) * (i + 1)} y2={y + height * 0.82} stroke="rgba(255,255,255,0.35)" strokeWidth={0.8} />
        ))}
      </>
    );
  }
  if (type.includes("computer")) {
    // Computer workstation: desk surface + monitor + keyboard.
    return (
      <>
        <rect x={x} y={y} width={width} height={height} rx={1.5} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <rect x={x + width * 0.3} y={y + height * 0.1} width={width * 0.4} height={height * 0.3} rx={1} fill="#1f2937" />
        <rect x={x + width * 0.26} y={y + height * 0.5} width={width * 0.48} height={height * 0.14} rx={1} fill="#374151" />
        <line x1={cx} y1={y + height * 0.4} x2={cx} y2={y + height * 0.5} stroke="#1f2937" strokeWidth={1} />
      </>
    );
  }
  if (type.includes("table")) {
    // Table: rounded tabletop with a centre-leaf hint.
    return (
      <>
        <rect x={x} y={y} width={width} height={height} rx={Math.min(width, height) * 0.14} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <rect x={x + inset} y={y + inset} width={Math.max(1, width - inset * 2)} height={Math.max(1, height - inset * 2)} rx={Math.min(width, height) * 0.1} fill="rgba(255,255,255,0.14)" />
        <line x1={cx} y1={y + inset} x2={cx} y2={y + height - inset} stroke="rgba(255,255,255,0.24)" strokeWidth={0.8} />
      </>
    );
  }
  if (type.includes("desk")) {
    // Desk: flat work surface with a darker back work-zone and keyboard band.
    return (
      <>
        <rect x={x} y={y} width={width} height={height} rx={1.5} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <rect x={x + width * 0.06} y={y + height * 0.1} width={width * 0.88} height={height * 0.24} rx={1} fill="rgba(0,0,0,0.12)" />
        <rect x={x + width * 0.1} y={y + height * 0.46} width={width * 0.8} height={height * 0.12} rx={0.8} fill="rgba(255,255,255,0.26)" />
      </>
    );
  }
  if (type.includes("cabinet")) {
    // Cabinet: body with a door division and handle dots.
    const handleR = Math.max(0.7, Math.min(width, height) * 0.05);
    return (
      <>
        <rect x={x} y={y} width={width} height={height} rx={1.5} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <line x1={cx} y1={y + inset} x2={cx} y2={y + height - inset} stroke="rgba(255,255,255,0.45)" strokeWidth={0.9} />
        <circle cx={cx - Math.min(width, height) * 0.16} cy={cy} r={handleR} fill="rgba(0,0,0,0.3)" />
        <circle cx={cx + Math.min(width, height) * 0.16} cy={cy} r={handleR} fill="rgba(0,0,0,0.3)" />
      </>
    );
  }
  if (type.includes("shelf") || type.includes("bookshelf")) {
    // Shelf: body with visible horizontal shelf divisions.
    return (
      <>
        <rect x={x} y={y} width={width} height={height} rx={1.5} fill={color} stroke={stroke} strokeWidth={selStroke} />
        {[0.32, 0.58, 0.82].map((t) => (
          <line key={t} x1={x + inset * 0.7} y1={y + height * t} x2={x + width - inset * 0.7} y2={y + height * t} stroke="rgba(255,255,255,0.38)" strokeWidth={0.8} />
        ))}
        {Array.from({ length: Math.max(2, Math.min(6, Math.floor(width / 7))) }, (_, i) => <line key={`book-divider-${i}`}
          x1={x + width * ((i + 1) / (Math.max(2, Math.min(6, Math.floor(width / 7))) + 1))} y1={y + height * 0.12}
          x2={x + width * ((i + 1) / (Math.max(2, Math.min(6, Math.floor(width / 7))) + 1))} y2={y + height * 0.88}
          stroke="rgba(31,41,55,0.22)" strokeWidth={0.55} />)}
      </>
    );
  }
  if (type.includes("plant")) {
    // Plant: planter pot + organic leaf clusters.
    const r = Math.min(width, height);
    const leafR = Math.max(0.8, r * 0.17);
    return (
      <>
        <rect x={x + width * 0.16} y={y + height * 0.54} width={width * 0.68} height={height * 0.4} rx={r * 0.12} fill="#c2620a" stroke={stroke} strokeWidth={selStroke} />
        <circle cx={cx - width * 0.16} cy={cy - height * 0.05} r={leafR} fill={color} opacity={0.94} />
        <circle cx={cx + width * 0.14} cy={cy - height * 0.17} r={leafR * 0.94} fill="#2f6f3e" opacity={0.94} />
        <circle cx={cx + width * 0.02} cy={cy - height * 0.31} r={leafR * 0.88} fill="#5f9360" opacity={0.94} />
      </>
    );
  }
  // Fallback — structured generic storage (never a bare rect, never a text box).
  return (
    <>
      <rect x={x} y={y} width={width} height={height} rx={1.5} fill={color} stroke={stroke} strokeWidth={selStroke} />
      <line x1={x + inset} y1={y + inset} x2={x + width - inset} y2={y + height - inset} stroke="rgba(255,255,255,0.28)" strokeWidth={0.8} />
      <line x1={x + width - inset} y1={y + inset} x2={x + inset} y2={y + height - inset} stroke="rgba(255,255,255,0.28)" strokeWidth={0.8} />
    </>
  );
}


