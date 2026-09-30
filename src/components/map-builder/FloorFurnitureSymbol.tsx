import { CanvasAssetVisual } from "../canvas/CanvasAssetVisual";
import { getCanvasAsset, resolveCanvasAssetKey } from "../canvas/canvasAssetCatalog";

/** Admin-authored physical furniture artwork, shared by editor and published viewer. */
function FurnitureArtwork({ type, x, y, width, height, color, selected = false, assetKey }: {
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
  // Reusable plan-view chair primitive for the grouped seating symbols below.
  // Rotation is local to the chair so each seat can face the shared table
  // while the containing FloorFurniture record remains one transformable item.
  const facingChair = (sx: number, sy: number, sw: number, sh: number, rotation: number, key: string) => (
    <g key={key} data-testid="furniture-seat" transform={`rotate(${rotation}, ${sx}, ${sy})`}>
      <rect x={sx - sw / 2} y={sy - sh / 2} width={sw} height={sh} rx={Math.min(sw, sh) * 0.24}
        fill={color} stroke={stroke} strokeWidth={selStroke * 0.8} />
      <path d={`M ${sx - sw * 0.34} ${sy - sh * 0.28} Q ${sx} ${sy - sh * 0.48} ${sx + sw * 0.34} ${sy - sh * 0.28}`}
        fill="none" stroke="rgba(255,255,255,0.72)" strokeWidth={Math.max(0.55, selStroke * 0.45)} strokeLinecap="round" />
    </g>
  );
  const lectureChair = (sx: number, sy: number, sw: number, sh: number, rotation: number, key: string) => (
    <g key={key} data-testid="furniture-seat" transform={`rotate(${rotation}, ${sx}, ${sy})`}>
      <rect x={sx - sw / 2} y={sy - sh / 2} width={sw} height={sh} rx={Math.min(sw, sh) * 0.2}
        fill={color} stroke={stroke} strokeWidth={selStroke * 0.8} />
      <path d={`M ${sx - sw * 0.34} ${sy - sh * 0.28} Q ${sx} ${sy - sh * 0.48} ${sx + sw * 0.34} ${sy - sh * 0.28}`}
        fill="none" stroke="rgba(255,255,255,0.72)" strokeWidth={Math.max(0.55, selStroke * 0.45)} strokeLinecap="round" />
      <g data-testid="lecture-chair-writing-arm">
        <rect x={sx + sw * 0.28} y={sy - sh * 0.22} width={sw * 0.52} height={sh * 0.44} rx={Math.min(sw, sh) * 0.08}
          fill={color} stroke={stroke} strokeWidth={selStroke * 0.65} />
        <line x1={sx + sw * 0.36} y1={sy} x2={sx + sw * 0.7} y2={sy} stroke="rgba(255,255,255,0.46)" strokeWidth={0.55} />
      </g>
    </g>
  );
  const roundSeat = (sx: number, sy: number, radius: number, key: string) => (
    <g key={key} data-testid="furniture-seat">
      <circle cx={sx} cy={sy} r={radius} fill={color} stroke={stroke} strokeWidth={selStroke * 0.8} />
      <path d={`M ${sx - radius * 0.42} ${sy - radius * 0.28} Q ${sx} ${sy - radius * 0.62} ${sx + radius * 0.42} ${sy - radius * 0.28}`}
        fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth={Math.max(0.5, selStroke * 0.4)} strokeLinecap="round" />
    </g>
  );
  const studyCarrelUnit = (unitX: number, unitY: number, unitW: number, unitH: number, key: string) => {
    const surfaceY = unitY + unitH * 0.2;
    const surfaceH = unitH * 0.3;
    return (
      <g key={key} data-testid="study-carrel-unit">
        <rect data-testid="study-carrel-surface" x={unitX + unitW * 0.12} y={surfaceY} width={unitW * 0.76} height={surfaceH}
          rx={1} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <line data-testid="study-carrel-partition" x1={unitX + unitW * 0.08} y1={unitY + unitH * 0.08} x2={unitX + unitW * 0.08} y2={unitY + unitH * 0.72}
          stroke={stroke} strokeWidth={Math.max(1, selStroke)} />
        <line data-testid="study-carrel-partition" x1={unitX + unitW * 0.92} y1={unitY + unitH * 0.08} x2={unitX + unitW * 0.92} y2={unitY + unitH * 0.72}
          stroke={stroke} strokeWidth={Math.max(1, selStroke)} />
        <line x1={unitX + unitW * 0.08} y1={unitY + unitH * 0.08} x2={unitX + unitW * 0.92} y2={unitY + unitH * 0.08}
          stroke={stroke} strokeWidth={Math.max(0.8, selStroke * 0.8)} />
        {facingChair(unitX + unitW * 0.5, unitY + unitH * 0.84, unitW * 0.34, unitH * 0.2, 180, `${key}-chair`)}
      </g>
    );
  };

  if (type === "audience-chair") {
    return (
      <g data-testid="audience-chair-symbol">
        {facingChair(cx, cy, Math.max(4, width * 0.62), Math.max(4, height * 0.62), 0, "audience-chair")}
        <path d={`M ${x + width * 0.22} ${y + height * 0.2} Q ${cx} ${y - height * 0.02} ${x + width * 0.78} ${y + height * 0.2}`} fill="none" stroke={color} strokeWidth={0.8} strokeLinecap="round" />
      </g>
    );
  }
  if (type === "garden-shade-umbrella") {
    const radius = Math.min(width, height) * 0.42;
    const points = Array.from({ length: 8 }, (_, index) => {
      const angle = -Math.PI / 8 + index * Math.PI / 4;
      return `${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`;
    }).join(" ");
    return (
      <g data-testid="garden-shade-umbrella-symbol">
        <polygon data-testid="garden-shade-canopy" points={points} fill={color} fillOpacity={0.66} stroke={stroke} strokeWidth={selStroke} strokeLinejoin="round" />
        {Array.from({ length: 8 }, (_, index) => {
          const angle = -Math.PI / 8 + index * Math.PI / 4;
          return <line key={`umbrella-rib-${index}`} data-testid="garden-shade-rib" x1={cx} y1={cy}
            x2={cx + Math.cos(angle) * radius * 0.9} y2={cy + Math.sin(angle) * radius * 0.9}
            stroke="rgba(255,255,255,0.7)" strokeWidth={0.85} />;
        })}
        <circle data-testid="garden-shade-hub" cx={cx} cy={cy} r={Math.min(width, height) * 0.075} fill="#f8fafc" stroke={stroke} strokeWidth={selStroke} />
        <circle cx={cx} cy={cy} r={Math.min(width, height) * 0.03} fill={color} stroke={stroke} strokeWidth={0.55} />
      </g>
    );
  }
  if (type === "lecture-chair-writing-arm") {
    return (
      <g data-testid="lecture-chair-writing-arm-symbol">
        {lectureChair(cx, cy, Math.max(5, width * 0.62), Math.max(5, height * 0.66), 0, "lecture-chair")}
      </g>
    );
  }
  if (type === "audience-seating-4x4") {
    const columns = 4;
    const rows = 4;
    const cellW = width / columns;
    const cellH = height / rows;
    const chairW = Math.max(4, Math.min(cellW * 0.6, 10));
    const chairH = Math.max(4, Math.min(cellH * 0.62, 10));
    return (
      <g data-testid="audience-seating-4x4-symbol">
        <rect x={x + width * 0.05} y={y + height * 0.04} width={width * 0.9} height={height * 0.92} rx={2}
          fill="rgba(148,163,184,0.12)" stroke={stroke} strokeWidth={selStroke * 0.8} strokeDasharray="2 1.5" />
        {Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, column) => {
          const sx = x + cellW * (column + 0.5);
          const sy = y + cellH * (row + 0.5);
          return facingChair(sx, sy, chairW, chairH, 0, `audience-seat-${row}-${column}`);
        }))}
        <line x1={x + width * 0.1} y1={y + height * 0.03} x2={x + width * 0.9} y2={y + height * 0.03}
          stroke={color} strokeWidth={1.2} />
      </g>
    );
  }
  if (type === "round-table-chairs") {
    const tableRadius = Math.min(width, height) * 0.22;
    const chairRadius = Math.min(width, height) * 0.34;
    const chairW = Math.max(4, Math.min(width * 0.18, 10));
    const chairH = Math.max(4, Math.min(height * 0.15, 8));
    const angles = [-90, -30, 30, 90, 150, 210];
    return (
      <g data-testid="round-table-chairs-symbol">
        <circle data-testid="round-table" cx={cx} cy={cy} r={tableRadius} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <circle cx={cx} cy={cy} r={tableRadius * 0.72} fill="none" stroke="rgba(255,255,255,0.38)" strokeWidth={0.8} />
        {angles.map((angle) => {
          const radians = angle * Math.PI / 180;
          const sx = cx + Math.cos(radians) * chairRadius;
          const sy = cy + Math.sin(radians) * chairRadius;
          return facingChair(sx, sy, chairW, chairH, angle + 90, `round-chair-${angle}`);
        })}
      </g>
    );
  }
  if (type === "dining-table-4-seats") {
    const tableX = x + width * 0.27;
    const tableY = y + height * 0.25;
    const tableW = width * 0.46;
    const tableH = height * 0.5;
    const chairW = Math.max(4, width * 0.16);
    const chairH = Math.max(4, height * 0.17);
    return (
      <g data-testid="dining-table-4-symbol">
        <rect x={tableX} y={tableY} width={tableW} height={tableH} rx={Math.min(tableW, tableH) * 0.14} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <rect x={tableX + tableW * 0.12} y={tableY + tableH * 0.12} width={tableW * 0.76} height={tableH * 0.76} rx={2} fill="none" stroke="rgba(255,255,255,0.34)" strokeWidth={0.75} />
        {facingChair(cx, y + height * 0.1, chairW, chairH, 0, "dining-4-top")}
        {facingChair(cx, y + height * 0.9, chairW, chairH, 180, "dining-4-bottom")}
        {facingChair(x + width * 0.11, cy, chairH, chairW, -90, "dining-4-left")}
        {facingChair(x + width * 0.89, cy, chairH, chairW, 90, "dining-4-right")}
      </g>
    );
  }
  if (type === "dining-table-6-seats") {
    const tableX = x + width * 0.12;
    const tableY = y + height * 0.31;
    const tableW = width * 0.76;
    const tableH = height * 0.38;
    const chairW = Math.max(4, width * 0.13);
    const chairH = Math.max(4, height * 0.18);
    return (
      <g data-testid="dining-table-6-symbol">
        <rect x={tableX} y={tableY} width={tableW} height={tableH} rx={Math.min(tableW, tableH) * 0.16} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <line x1={tableX + tableW * 0.08} y1={cy} x2={tableX + tableW * 0.92} y2={cy} stroke="rgba(255,255,255,0.34)" strokeWidth={0.75} />
        {[0.22, 0.5, 0.78].map((position) => <g key={position}>
          {facingChair(tableX + tableW * position, y + height * 0.1, chairW, chairH, 0, `dining-6-top-${position}`)}
          {facingChair(tableX + tableW * position, y + height * 0.9, chairW, chairH, 180, `dining-6-bottom-${position}`)}
        </g>)}
      </g>
    );
  }
  if (type === "conference-table-large") {
    const tableX = x + width * 0.17;
    const tableY = y + height * 0.25;
    const tableW = width * 0.66;
    const tableH = height * 0.5;
    const bevelX = tableW * 0.16;
    const bevelY = tableH * 0.28;
    const tablePoints = [
      [tableX + bevelX, tableY],
      [tableX + tableW - bevelX, tableY],
      [tableX + tableW, tableY + bevelY],
      [tableX + tableW, tableY + tableH - bevelY],
      [tableX + tableW - bevelX, tableY + tableH],
      [tableX + bevelX, tableY + tableH],
      [tableX, tableY + tableH - bevelY],
      [tableX, tableY + bevelY],
    ].map(([px, py]) => `${px},${py}`).join(" ");
    const innerPoints = [
      [tableX + bevelX * 1.3, tableY + tableH * 0.22],
      [tableX + tableW - bevelX * 1.3, tableY + tableH * 0.22],
      [tableX + tableW - bevelX * 1.5, tableY + tableH * 0.78],
      [tableX + bevelX * 1.5, tableY + tableH * 0.78],
    ].map(([px, py]) => `${px},${py}`).join(" ");
    const chairW = Math.max(4, Math.min(width * 0.1, 8));
    const chairH = Math.max(4, Math.min(height * 0.12, 8));
    const topBottomPositions = [0.27, 0.385, 0.5, 0.615, 0.73];
    const sidePositions = [0.36, 0.5, 0.64];
    return (
      <g data-testid="conference-table-large-symbol">
        <polygon data-testid="conference-table-large-surface" points={tablePoints} fill={color} stroke={stroke} strokeWidth={selStroke} strokeLinejoin="round" />
        <polygon data-testid="conference-table-large-inner" points={innerPoints} fill="none" stroke="rgba(255,255,255,0.36)" strokeWidth={0.9} strokeLinejoin="round" />
        <line x1={cx} y1={tableY + tableH * 0.24} x2={cx} y2={tableY + tableH * 0.76} stroke="rgba(255,255,255,0.26)" strokeWidth={0.8} strokeDasharray="2 1.5" />
        {topBottomPositions.map((position) => <g key={position}>
          {facingChair(tableX + tableW * position, tableY - height * 0.09, chairW, chairH, 0, `large-top-${position}`)}
          {facingChair(tableX + tableW * position, tableY + tableH + height * 0.09, chairW, chairH, 180, `large-bottom-${position}`)}
        </g>)}
        {sidePositions.map((position) => <g key={position}>
          {facingChair(tableX - width * 0.08, tableY + tableH * position, chairH, chairW, -90, `large-left-${position}`)}
          {facingChair(tableX + tableW + width * 0.08, tableY + tableH * position, chairH, chairW, 90, `large-right-${position}`)}
        </g>)}
      </g>
    );
  }
  if (type === "boardroom-table-chairs") {
    const tableX = x + width * 0.1;
    const tableY = y + height * 0.25;
    const tableW = width * 0.8;
    const tableH = height * 0.5;
    const chairW = Math.max(4, Math.min(width * 0.085, 8));
    const chairH = Math.max(4, Math.min(height * 0.14, 8));
    const sidePositions = [0.14, 0.286, 0.429, 0.571, 0.714, 0.86];
    return (
      <g data-testid="boardroom-table-chairs-symbol">
        <rect data-testid="boardroom-table-surface" x={tableX} y={tableY} width={tableW} height={tableH}
          rx={Math.min(tableW, tableH) * 0.12} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <rect x={tableX + tableW * 0.06} y={tableY + tableH * 0.18} width={tableW * 0.88} height={tableH * 0.64}
          rx={2} fill="none" stroke="rgba(255,255,255,0.36)" strokeWidth={0.8} />
        <line x1={cx} y1={tableY + tableH * 0.2} x2={cx} y2={tableY + tableH * 0.8}
          stroke="rgba(255,255,255,0.28)" strokeWidth={0.7} strokeDasharray="2 1.5" />
        {sidePositions.map((position) => <g key={position}>
          {facingChair(tableX + tableW * position, tableY - height * 0.095, chairW, chairH, 0, `boardroom-top-${position}`)}
          {facingChair(tableX + tableW * position, tableY + tableH + height * 0.095, chairW, chairH, 180, `boardroom-bottom-${position}`)}
        </g>)}
        {facingChair(tableX - width * 0.055, cy, chairH, chairW, -90, "boardroom-left")}
        {facingChair(tableX + tableW + width * 0.055, cy, chairH, chairW, 90, "boardroom-right")}
      </g>
    );
  }
  if (type === "collaborative-hub-table") {
    const armLength = Math.min(width, height) * 0.36;
    const armWidth = Math.min(width, height) * 0.26;
    const seatRadius = Math.min(width, height) * 0.075;
    const armAngles = [-90, 30, 150];
    return (
      <g data-testid="collaborative-hub-table-symbol">
        {armAngles.map((angle) => (
          <g key={angle} transform={`rotate(${angle}, ${cx}, ${cy})`}>
            <rect data-testid="collaborative-hub-arm" x={cx - armWidth / 2} y={cy - armLength * 0.72}
              width={armWidth} height={armLength} rx={armWidth * 0.34}
              fill={color} stroke={stroke} strokeWidth={selStroke} />
            <line x1={cx - armWidth * 0.25} y1={cy - armLength * 0.58} x2={cx + armWidth * 0.25} y2={cy - armLength * 0.58}
              stroke="rgba(255,255,255,0.42)" strokeWidth={0.7} />
          </g>
        ))}
        <circle data-testid="collaborative-hub-center" cx={cx} cy={cy} r={Math.min(width, height) * 0.16}
          fill={color} stroke={stroke} strokeWidth={selStroke} />
        <circle cx={cx} cy={cy} r={Math.min(width, height) * 0.075} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={0.8} />
        {armAngles.map((angle) => {
          const radians = angle * Math.PI / 180;
          const sx = cx + Math.cos(radians) * armLength * 0.82;
          const sy = cy + Math.sin(radians) * armLength * 0.82;
          return (
            <g key={`hub-seat-${angle}`} transform={`rotate(${angle + 90}, ${sx}, ${sy})`}>
              {roundSeat(sx - seatRadius * 1.3, sy, seatRadius, `hub-seat-a-${angle}`)}
              {roundSeat(sx + seatRadius * 1.3, sy, seatRadius, `hub-seat-b-${angle}`)}
            </g>
          );
        })}
      </g>
    );
  }
  if (type === "long-table") {
    const tableX = x + width * 0.03;
    const tableY = y + height * 0.18;
    const tableW = width * 0.94;
    const tableH = height * 0.64;
    return (
      <g data-testid="long-table-symbol">
        <rect data-testid="long-table-surface" x={tableX} y={tableY} width={tableW} height={tableH}
          rx={Math.min(tableW, tableH) * 0.16} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <line x1={tableX + tableW * 0.08} y1={cy} x2={tableX + tableW * 0.92} y2={cy}
          stroke="rgba(255,255,255,0.38)" strokeWidth={0.8} />
        <line x1={cx} y1={tableY + tableH * 0.18} x2={cx} y2={tableY + tableH * 0.82}
          stroke="rgba(31,41,55,0.22)" strokeWidth={0.7} />
        <circle cx={tableX + tableW * 0.08} cy={cy} r={Math.min(width, height) * 0.055} fill="none" stroke="rgba(255,255,255,0.34)" strokeWidth={0.7} />
        <circle cx={tableX + tableW * 0.92} cy={cy} r={Math.min(width, height) * 0.055} fill="none" stroke="rgba(255,255,255,0.34)" strokeWidth={0.7} />
      </g>
    );
  }
  if (type === "communal-study-table") {
    const tableX = x + width * 0.08;
    const tableY = y + height * 0.29;
    const tableW = width * 0.84;
    const tableH = height * 0.42;
    const chairW = Math.max(4, Math.min(width * 0.075, 8));
    const chairH = Math.max(4, Math.min(height * 0.16, 8));
    const positions = [0.07, 0.19, 0.31, 0.43, 0.57, 0.69, 0.81, 0.93];
    return (
      <g data-testid="communal-study-table-symbol">
        <rect data-testid="communal-study-table-surface" x={tableX} y={tableY} width={tableW} height={tableH}
          rx={Math.min(tableW, tableH) * 0.1} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <rect x={tableX + tableW * 0.025} y={tableY + tableH * 0.18} width={tableW * 0.95} height={tableH * 0.64}
          rx={1.5} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={0.75} />
        <line x1={cx} y1={tableY + tableH * 0.18} x2={cx} y2={tableY + tableH * 0.82}
          stroke="rgba(31,41,55,0.22)" strokeWidth={0.7} />
        {positions.map((position) => <g key={position}>
          {facingChair(tableX + tableW * position, tableY - height * 0.1, chairW, chairH, 0, `communal-top-${position}`)}
          {facingChair(tableX + tableW * position, tableY + tableH + height * 0.1, chairW, chairH, 180, `communal-bottom-${position}`)}
        </g>)}
      </g>
    );
  }
  if (type === "double-sided-study-table") {
    const tableX = x + width * 0.1;
    const tableY = y + height * 0.28;
    const tableW = width * 0.8;
    const tableH = height * 0.34;
    const benchY = y + height * 0.1;
    const benchH = height * 0.16;
    return (
      <g data-testid="double-sided-study-table-symbol">
        <rect data-testid="double-sided-study-table-bench" x={x + width * 0.08} y={benchY} width={width * 0.84} height={benchH}
          rx={Math.min(width, height) * 0.08} fill={color} fillOpacity={0.78} stroke={stroke} strokeWidth={selStroke} />
        <rect data-testid="double-sided-study-table-surface" x={tableX} y={tableY} width={tableW} height={tableH}
          rx={Math.min(tableW, tableH) * 0.12} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <rect data-testid="double-sided-study-table-bench" x={x + width * 0.08} y={y + height * 0.74} width={width * 0.84} height={benchH}
          rx={Math.min(width, height) * 0.08} fill={color} fillOpacity={0.78} stroke={stroke} strokeWidth={selStroke} />
        <line x1={tableX + tableW * 0.08} y1={cy} x2={tableX + tableW * 0.92} y2={cy}
          stroke="rgba(255,255,255,0.4)" strokeWidth={0.8} />
        {Array.from({ length: 4 }, (_, index) => {
          const dividerX = x + width * (0.18 + index * 0.21);
          return <line key={`double-study-divider-${index}`} x1={dividerX} y1={benchY + benchH * 0.16} x2={dividerX} y2={benchY + benchH * 0.84}
            stroke="rgba(255,255,255,0.42)" strokeWidth={0.65} />;
        })}
        {Array.from({ length: 4 }, (_, index) => {
          const dividerX = x + width * (0.18 + index * 0.21);
          return <line key={`double-study-divider-bottom-${index}`} x1={dividerX} y1={y + height * 0.74 + benchH * 0.16} x2={dividerX} y2={y + height * 0.74 + benchH * 0.84}
            stroke="rgba(255,255,255,0.42)" strokeWidth={0.65} />;
        })}
      </g>
    );
  }
  if (type === "rectangular-table" || type === "coffee-table") {
    const low = type === "coffee-table";
    const tableX = x + width * (low ? 0.04 : 0.02);
    const tableY = y + height * (low ? 0.14 : 0.08);
    const tableW = width * (low ? 0.92 : 0.96);
    const tableH = height * (low ? 0.72 : 0.84);
    return (
      <g data-testid={low ? "coffee-table-symbol" : "rectangular-table-symbol"}>
        <rect x={tableX} y={tableY} width={tableW} height={tableH} rx={Math.min(tableW, tableH) * (low ? 0.18 : 0.1)} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <rect x={tableX + tableW * 0.08} y={tableY + tableH * 0.14} width={tableW * 0.84} height={tableH * 0.72} rx={2} fill="none" stroke="rgba(255,255,255,0.34)" strokeWidth={0.75} />
        <line x1={cx} y1={tableY + tableH * 0.14} x2={cx} y2={tableY + tableH * 0.86} stroke="rgba(255,255,255,0.22)" strokeWidth={0.7} />
      </g>
    );
  }
  if (type === "round-coffee-table") {
    return (
      <g data-testid="round-coffee-table-symbol">
        <circle cx={cx} cy={cy} r={Math.min(width, height) * 0.44} fill={color} fillOpacity={0.88} stroke={stroke} strokeWidth={selStroke} />
      </g>
    );
  }
  if (type === "square-coffee-table") {
    const insetX = width * 0.06;
    const insetY = height * 0.06;
    return (
      <g data-testid="square-coffee-table-symbol">
        <rect x={x + insetX} y={y + insetY} width={width - insetX * 2} height={height - insetY * 2}
          fill={color} fillOpacity={0.88} stroke={stroke} strokeWidth={selStroke} />
      </g>
    );
  }
  if (type === "workstation" || type === "computer-workstation" || type === "computer-workstation-chair") {
    const computer = type !== "workstation";
    const deskX = x + width * 0.08;
    const deskY = y + height * 0.08;
    const deskW = width * 0.84;
    const deskH = height * 0.5;
    return (
      <g data-testid={computer ? "computer-workstation-symbol" : "workstation-symbol"}>
        <rect x={deskX} y={deskY} width={deskW} height={deskH} rx={1.6} fill={color} stroke={stroke} strokeWidth={selStroke} />
        {computer && <>
          <rect data-testid="computer-workstation-monitor" x={cx - width * 0.18} y={deskY + height * 0.08} width={width * 0.36} height={height * 0.2} rx={1} fill="#1f2937" stroke={stroke} strokeWidth={0.55} />
          <line x1={cx} y1={deskY + height * 0.28} x2={cx} y2={deskY + height * 0.35} stroke="#1f2937" strokeWidth={0.8} />
          <rect data-testid="computer-workstation-keyboard" x={cx - width * 0.2} y={deskY + height * 0.35} width={width * 0.4} height={height * 0.08} rx={0.7} fill="#e2e8f0" stroke="#475569" strokeWidth={0.45} />
        </>}
        {!computer && <line x1={deskX + deskW * 0.12} y1={deskY + deskH * 0.7} x2={deskX + deskW * 0.88} y2={deskY + deskH * 0.7} stroke="rgba(255,255,255,0.32)" strokeWidth={0.8} />}
        {facingChair(cx, y + height * 0.8, width * 0.34, height * 0.2, 180, "workstation-chair")}
      </g>
    );
  }
  if (type === "computer-station") {
    const counterX = x + width * 0.04;
    const counterY = y + height * 0.24;
    const counterW = width * 0.92;
    const counterH = height * 0.34;
    return (
      <g data-testid="computer-station-symbol">
        <rect data-testid="computer-station-counter" x={counterX} y={counterY} width={counterW} height={counterH}
          rx={1.4} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <line x1={counterX + counterW * 0.06} y1={counterY + counterH * 0.22} x2={counterX + counterW * 0.94} y2={counterY + counterH * 0.22}
          stroke="rgba(255,255,255,0.45)" strokeWidth={0.7} />
        <rect data-testid="computer-station-monitor" x={cx - width * 0.14} y={y + height * 0.1} width={width * 0.28} height={height * 0.18}
          rx={0.9} fill="#1f2937" stroke={stroke} strokeWidth={0.55} />
        <line x1={cx} y1={y + height * 0.28} x2={cx} y2={counterY + counterH * 0.2} stroke="#1f2937" strokeWidth={0.75} />
        <rect data-testid="computer-station-keyboard" x={cx - width * 0.16} y={counterY + counterH * 0.42} width={width * 0.32} height={height * 0.08}
          rx={0.7} fill="#e2e8f0" stroke="#475569" strokeWidth={0.45} />
        {facingChair(cx, y + height * 0.82, width * 0.34, height * 0.2, 180, "computer-station-seat")}
      </g>
    );
  }
  if (type === "l-shaped-workstation") {
    const horizontal = { x: x + width * 0.08, y: y + height * 0.1, w: width * 0.74, h: height * 0.25 };
    const vertical = { x: x + width * 0.57, y: y + height * 0.1, w: width * 0.3, h: height * 0.78 };
    return (
      <g data-testid="l-shaped-workstation-symbol">
        <rect x={horizontal.x} y={horizontal.y} width={horizontal.w} height={horizontal.h} rx={1.5} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <rect x={vertical.x} y={vertical.y} width={vertical.w} height={vertical.h} rx={1.5} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <rect data-testid="l-shaped-workstation-monitor" x={x + width * 0.24} y={y + height * 0.16} width={width * 0.2} height={height * 0.12} rx={0.8} fill="#1f2937" />
        <rect x={x + width * 0.2} y={y + height * 0.3} width={width * 0.28} height={height * 0.06} rx={0.6} fill="#e2e8f0" />
        <rect x={x + width * 0.64} y={y + height * 0.5} width={width * 0.13} height={height * 0.14} rx={1} fill="rgba(31,41,55,0.35)" />
        {facingChair(x + width * 0.42, y + height * 0.58, width * 0.25, height * 0.18, 0, "l-shaped-chair")}
      </g>
    );
  }
  if (type === "clinic-bed") {
    const bedX = x + width * 0.12;
    const bedY = y + height * 0.04;
    const bedW = width * 0.76;
    const bedH = height * 0.92;
    return (
      <g data-testid="clinic-bed-symbol">
        <rect x={bedX} y={bedY} width={bedW} height={bedH} rx={2} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <rect data-testid="clinic-bed-pillow" x={bedX + bedW * 0.12} y={bedY + bedH * 0.07} width={bedW * 0.76} height={bedH * 0.16} rx={1.5} fill="#f8fafc" stroke="#94a3b8" strokeWidth={0.65} />
        <line x1={bedX + bedW * 0.08} y1={bedY + bedH * 0.3} x2={bedX + bedW * 0.92} y2={bedY + bedH * 0.3} stroke="#94a3b8" strokeWidth={0.7} />
        <line x1={bedX + bedW * 0.08} y1={bedY + bedH * 0.78} x2={bedX + bedW * 0.92} y2={bedY + bedH * 0.78} stroke="#94a3b8" strokeWidth={0.7} />
        <circle cx={bedX + bedW * 0.18} cy={bedY + bedH * 0.9} r={1.1} fill="#64748b" />
        <circle cx={bedX + bedW * 0.82} cy={bedY + bedH * 0.9} r={1.1} fill="#64748b" />
      </g>
    );
  }
  if (type === "service-stall") {
    const padX = x + width * 0.025;
    const padY = y + height * 0.035;
    const padW = width * 0.95;
    const padH = height * 0.93;
    const bodyX = x + width * 0.1;
    const bodyY = y + height * 0.1;
    const bodyW = width * 0.8;
    const bodyH = height * 0.59;
    const serviceY = y + height * 0.73;
    const serviceH = height * 0.14;
    return (
      <g data-testid="service-stall-symbol">
        {/* A quiet tiled pad gives the kiosk a clear footprint without making
            the asset look like a solid brown rectangle. */}
        <rect data-testid="service-stall-footprint" x={padX} y={padY} width={padW} height={padH} rx={3}
          fill="#d7c5a8" fillOpacity={0.34} stroke={stroke} strokeWidth={selStroke} />
        <path data-testid="service-stall-floor-pattern"
          d={`M ${padX + padW * 0.12} ${padY + padH * 0.9} H ${padX + padW * 0.88} M ${padX + padW * 0.23} ${padY + padH * 0.78} H ${padX + padW * 0.77}`}
          fill="none" stroke="rgba(120,85,48,0.28)" strokeWidth={0.65} strokeDasharray="2 2" />

        {/* Rear preparation kiosk: a darker body, light worktop and two
            simple equipment cues make the worker/customer sides legible. */}
        <rect data-testid="service-stall-rear-work-zone" x={bodyX} y={bodyY} width={bodyW} height={bodyH} rx={2.5}
          fill={color} fillOpacity={0.72} stroke={stroke} strokeWidth={selStroke} />
        <rect data-testid="service-stall-prep-counter" x={bodyX + bodyW * 0.1} y={bodyY + bodyH * 0.13}
          width={bodyW * 0.8} height={bodyH * 0.2} rx={1.2} fill="rgba(248,250,252,0.38)" stroke={stroke} strokeWidth={0.75} />
        <line x1={bodyX + bodyW * 0.1} y1={bodyY + bodyH * 0.42} x2={bodyX + bodyW * 0.9} y2={bodyY + bodyH * 0.42}
          stroke="rgba(31,41,55,0.3)" strokeWidth={0.8} />
        <rect x={bodyX + bodyW * 0.2} y={bodyY + bodyH * 0.52} width={bodyW * 0.18} height={bodyH * 0.16} rx={0.8} fill="rgba(31,41,55,0.34)" />
        <rect x={bodyX + bodyW * 0.62} y={bodyY + bodyH * 0.52} width={bodyW * 0.18} height={bodyH * 0.16} rx={0.8} fill="rgba(31,41,55,0.34)" />

        {/* Full-width customer-facing counter with a deliberately open
            service window in the middle. */}
        <rect data-testid="service-stall-serving-counter" x={x + width * 0.1} y={serviceY}
          width={width * 0.8} height={serviceH} rx={1.2} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <rect data-testid="service-stall-serving-window" x={x + width * 0.28} y={serviceY - serviceH * 0.08}
          width={width * 0.44} height={serviceH * 0.9} rx={0.6} fill="rgba(248,250,252,0.32)" stroke={stroke} strokeWidth={0.65} />
        <path data-testid="service-stall-serving-opening"
          d={`M ${x + width * 0.3} ${serviceY + serviceH * 0.5} H ${x + width * 0.7}`}
          fill="none" stroke="#f8fafc" strokeWidth={1.3} strokeDasharray="2 1.5" strokeLinecap="round" />
        <line x1={x + width * 0.1} y1={serviceY + serviceH} x2={x + width * 0.9} y2={serviceY + serviceH}
          stroke="rgba(31,41,55,0.48)" strokeWidth={1.1} />
        <line data-testid="service-stall-side-post-left" x1={x + width * 0.1} y1={bodyY + bodyH * 0.9} x2={x + width * 0.1} y2={serviceY + serviceH * 1.1}
          stroke={stroke} strokeWidth={1.4} />
        <line data-testid="service-stall-side-post-right" x1={x + width * 0.9} y1={bodyY + bodyH * 0.9} x2={x + width * 0.9} y2={serviceY + serviceH * 1.1}
          stroke={stroke} strokeWidth={1.4} />
        <circle data-testid="service-stall-queue-marker" cx={cx} cy={y + height * 0.9}
          r={Math.min(width, height) * 0.04} fill="#f8fafc" stroke={stroke} strokeWidth={0.55} />
      </g>
    );
  }
  if (type === "service-counter") {
    return (
      <g data-testid="service-counter-symbol">
        <rect data-testid="service-counter-work-surface" x={x + width * 0.04} y={y + height * 0.11}
          width={width * 0.92} height={height * 0.78} rx={2} fill={color} fillOpacity={0.3} stroke={stroke} strokeWidth={selStroke} />
        <rect x={x + width * 0.12} y={y + height * 0.2} width={width * 0.76} height={height * 0.36}
          rx={1.2} fill="rgba(248,250,252,0.24)" stroke={stroke} strokeWidth={0.75} />
        <line x1={x + width * 0.12} y1={y + height * 0.61} x2={x + width * 0.88} y2={y + height * 0.61}
          stroke="rgba(31,41,55,0.32)" strokeWidth={0.8} />
        <rect data-testid="service-counter-customer-edge" x={x + width * 0.04} y={y + height * 0.66}
          width={width * 0.92} height={height * 0.19} rx={1} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <rect data-testid="service-counter-pos" x={x + width * 0.7} y={y + height * 0.28}
          width={width * 0.11} height={height * 0.15} rx={0.8} fill="#1f2937" stroke={stroke} strokeWidth={0.5} />
        <path d={`M ${x + width * 0.2} ${y + height * 0.38} h${width * 0.32}`} stroke="#f8fafc" strokeWidth={0.8} strokeLinecap="round" />
      </g>
    );
  }
  if (type === "study-carrel") {
    return (
      <g data-testid="study-carrel-symbol">
        {studyCarrelUnit(x, y, width, height, "study-carrel")}
      </g>
    );
  }
  if (type === "study-carrel-row") {
    const stationCount = 4;
    const unitW = width / stationCount;
    return (
      <g data-testid="study-carrel-row-symbol">
        <rect data-testid="study-carrel-row-outline" x={x + 1} y={y + height * 0.04} width={width - 2} height={height * 0.92}
          rx={1.5} fill="rgba(122,92,58,0.08)" stroke={stroke} strokeWidth={selStroke * 0.7} strokeDasharray="2 1.5" />
        {Array.from({ length: stationCount }, (_, index) => studyCarrelUnit(x + unitW * index, y, unitW, height, `study-carrel-row-${index}`))}
      </g>
    );
  }
  if (type === "library-counter") {
    return (
      <g data-testid="library-counter-symbol">
        <path data-testid="library-counter-body"
          d={`M ${x + width * 0.05} ${y + height * 0.2} Q ${x + width * 0.05} ${y + height * 0.1} ${x + width * 0.13} ${y + height * 0.1} H ${x + width * 0.87} Q ${x + width * 0.95} ${y + height * 0.1} ${x + width * 0.95} ${y + height * 0.2} V ${y + height * 0.78} H ${x + width * 0.76} V ${y + height * 0.48} H ${x + width * 0.24} V ${y + height * 0.78} H ${x + width * 0.05} Z`}
          fill={color} stroke={stroke} strokeWidth={selStroke} strokeLinejoin="round" />
        <rect data-testid="library-counter-work-surface" x={x + width * 0.27} y={y + height * 0.22} width={width * 0.46} height={height * 0.18}
          rx={1} fill="rgba(248,250,252,0.3)" stroke={stroke} strokeWidth={0.7} />
        <rect data-testid="library-counter-computer" x={x + width * 0.57} y={y + height * 0.25} width={width * 0.12} height={height * 0.13}
          rx={0.8} fill="#1f2937" stroke={stroke} strokeWidth={0.5} />
        <rect x={x + width * 0.32} y={y + height * 0.27} width={width * 0.15} height={height * 0.08}
          rx={0.5} fill="rgba(248,250,252,0.56)" stroke={stroke} strokeWidth={0.45} />
        <path data-testid="library-counter-public-side" d={`M ${x + width * 0.31} ${y + height * 0.72} H ${x + width * 0.69}`}
          fill="none" stroke="rgba(248,250,252,0.86)" strokeWidth={1.15} strokeLinecap="round" strokeDasharray="2 1.5" />
      </g>
    );
  }
  if (type === "wall-counter") {
    const counterX = x + width * 0.03;
    const counterY = y + height * 0.2;
    const counterW = width * 0.94;
    const counterH = height * 0.62;
    const stationCount = Math.max(2, Math.min(6, Math.round(width / 16)));
    return (
      <g data-testid="wall-counter-symbol">
        <rect data-testid="wall-counter-back-rail" x={counterX} y={y + height * 0.06} width={counterW} height={height * 0.16}
          rx={0.8} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <rect data-testid="wall-counter-surface" x={counterX} y={counterY} width={counterW} height={counterH}
          rx={1.2} fill={color} fillOpacity={0.55} stroke={stroke} strokeWidth={selStroke} />
        {Array.from({ length: stationCount - 1 }, (_, index) => {
          const dividerX = counterX + counterW * ((index + 1) / stationCount);
          return <line key={`wall-counter-divider-${index}`} x1={dividerX} y1={counterY + counterH * 0.14} x2={dividerX} y2={counterY + counterH * 0.86}
            stroke="rgba(255,255,255,0.44)" strokeWidth={0.7} />;
        })}
        <line x1={counterX + counterW * 0.04} y1={counterY + counterH * 0.2} x2={counterX + counterW * 0.96} y2={counterY + counterH * 0.2}
          stroke="rgba(255,255,255,0.5)" strokeWidth={0.8} />
      </g>
    );
  }
  if (type === "rack-bookshelf") {
    const shelfCount = Math.max(2, Math.min(5, Math.floor(width / 9)));
    return (
      <g data-testid="rack-bookshelf-symbol">
        <rect x={x + 0.5} y={y + height * 0.08} width={width - 1} height={height * 0.84} rx={1} fill={color} stroke={stroke} strokeWidth={selStroke} />
        {Array.from({ length: shelfCount - 1 }, (_, index) => <line key={`rack-shelf-${index}`} x1={x + width * 0.06} y1={y + height * ((index + 1) / shelfCount)} x2={x + width * 0.94} y2={y + height * ((index + 1) / shelfCount)} stroke="rgba(255,255,255,0.48)" strokeWidth={0.8} />)}
        {Array.from({ length: shelfCount }, (_, index) => <line key={`rack-divider-${index}`} x1={x + width * ((index + 0.5) / shelfCount)} y1={y + height * 0.16} x2={x + width * ((index + 0.5) / shelfCount)} y2={y + height * 0.84} stroke="rgba(31,41,55,0.25)" strokeWidth={0.55} />)}
      </g>
    );
  }
  if (type === "drinking-fountain") {
    return (
      <g data-testid="drinking-fountain-symbol">
        <rect x={x + width * 0.08} y={y + height * 0.16} width={width * 0.84} height={height * 0.68} rx={1.5} fill={color} fillOpacity={0.35} stroke={stroke} strokeWidth={selStroke} />
        <ellipse data-testid="drinking-fountain-basin" cx={cx} cy={y + height * 0.57} rx={width * 0.28} ry={height * 0.2} fill="#f8fafc" stroke="#64748b" strokeWidth={0.8} />
        <path data-testid="drinking-fountain-spout" d={`M ${cx} ${y + height * 0.46} v-${height * 0.2} q0 -${height * 0.12} ${width * 0.2} -${height * 0.12}`} fill="none" stroke="#475569" strokeWidth={0.8} strokeLinecap="round" />
      </g>
    );
  }
  if (type === "lounge-chair") {
    return (
      <g data-testid="lounge-chair-symbol">
        <path d={`M ${x + width * 0.19} ${y + height * 0.28} Q ${cx} ${y - height * 0.02} ${x + width * 0.81} ${y + height * 0.28} L ${x + width * 0.88} ${y + height * 0.76} Q ${cx} ${y + height * 0.98} ${x + width * 0.12} ${y + height * 0.76} Z`} fill={color} stroke={stroke} strokeWidth={selStroke} strokeLinejoin="round" />
        <path d={`M ${x + width * 0.24} ${y + height * 0.4} Q ${cx} ${y + height * 0.22} ${x + width * 0.76} ${y + height * 0.4}`} fill="none" stroke="rgba(255,255,255,0.48)" strokeWidth={1} />
        <path d={`M ${x + width * 0.3} ${y + height * 0.68} Q ${cx} ${y + height * 0.84} ${x + width * 0.7} ${y + height * 0.68}`} fill="none" stroke="rgba(31,41,55,0.22)" strokeWidth={0.8} />
      </g>
    );
  }
  if (type === "lounge-chair-cluster") {
    return (
      <g data-testid="lounge-chair-cluster-symbol">
        {[
          { x: cx, y: y + height * 0.19, r: 0 },
          { x: x + width * 0.25, y: y + height * 0.7, r: -35 },
          { x: x + width * 0.75, y: y + height * 0.7, r: 35 },
        ].map((chair, index) => <g key={index} transform={`rotate(${chair.r}, ${chair.x}, ${chair.y})`}>
          <path d={`M ${chair.x - width * 0.13} ${chair.y - height * 0.14} Q ${chair.x} ${chair.y - height * 0.25} ${chair.x + width * 0.13} ${chair.y - height * 0.14} L ${chair.x + width * 0.15} ${chair.y + height * 0.13} Q ${chair.x} ${chair.y + height * 0.24} ${chair.x - width * 0.15} ${chair.y + height * 0.13} Z`} fill={color} stroke={stroke} strokeWidth={selStroke * 0.8} />
          <path d={`M ${chair.x - width * 0.1} ${chair.y - height * 0.05} Q ${chair.x} ${chair.y - height * 0.13} ${chair.x + width * 0.1} ${chair.y - height * 0.05}`} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={0.7} />
        </g>)}
      </g>
    );
  }
  if (type === "sofa") {
    const sideInset = width * 0.14;
    const seatWidth = width * 0.34;
    const cushionY = y + height * 0.38;
    const cushionHeight = height * 0.48;
    return (
      <g data-testid="sofa-symbol">
        <rect data-testid="sofa-footprint" x={x + width * 0.02} y={y + height * 0.05} width={width * 0.96} height={height * 0.9}
          fill="rgba(15,23,42,0.06)" stroke={stroke} strokeWidth={selStroke} />
        <rect data-testid="sofa-backrest" x={x + sideInset} y={y + height * 0.08} width={width * 0.72} height={height * 0.23}
          fill={color} fillOpacity={0.78} stroke={stroke} strokeWidth={selStroke * 0.8} />
        <rect data-testid="sofa-seat-cushion" data-seat="1" x={x + sideInset} y={cushionY} width={seatWidth} height={cushionHeight}
          fill={color} fillOpacity={0.32} stroke={stroke} strokeWidth={selStroke * 0.65} />
        <rect data-testid="sofa-seat-cushion" data-seat="2" x={x + width * 0.52} y={cushionY} width={seatWidth} height={cushionHeight}
          fill={color} fillOpacity={0.32} stroke={stroke} strokeWidth={selStroke * 0.65} />
        <rect data-testid="sofa-left-armrest" x={x + width * 0.025} y={y + height * 0.28} width={width * 0.105} height={height * 0.64}
          fill={color} fillOpacity={0.88} stroke={stroke} strokeWidth={selStroke * 0.8} />
        <rect data-testid="sofa-right-armrest" x={x + width * 0.87} y={y + height * 0.28} width={width * 0.105} height={height * 0.64}
          fill={color} fillOpacity={0.88} stroke={stroke} strokeWidth={selStroke * 0.8} />
      </g>
    );
  }
  if (type === "lounge-sofa") {
    return (
      <g data-testid="lounge-sofa-symbol">
        <rect x={x + width * 0.02} y={y + height * 0.08} width={width * 0.96} height={height * 0.84} rx={Math.min(width, height) * 0.22} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <rect x={x + width * 0.1} y={y + height * 0.32} width={width * 0.8} height={height * 0.48} rx={2} fill="rgba(255,255,255,0.2)" />
        <line x1={x + width * 0.1} y1={y + height * 0.32} x2={x + width * 0.9} y2={y + height * 0.32} stroke="rgba(255,255,255,0.5)" strokeWidth={0.8} />
        <line x1={cx} y1={y + height * 0.38} x2={cx} y2={y + height * 0.75} stroke="rgba(31,41,55,0.22)" strokeWidth={0.8} />
      </g>
    );
  }
  if (type === "speech-lab-row") {
    const stationCount = Math.max(4, Math.min(8, Math.round(width / 12)));
    const stationGap = width / stationCount;
    const deskY = y + height * 0.2;
    const deskH = height * 0.38;
    return (
      <g data-testid="speech-lab-row-symbol">
        <rect data-testid="speech-lab-row-surface" x={x + 1} y={deskY} width={width - 2} height={deskH}
          rx={1.3} fill={color} stroke={stroke} strokeWidth={selStroke} />
        <line x1={x + 2} y1={deskY + deskH * 0.25} x2={x + width - 2} y2={deskY + deskH * 0.25}
          stroke="rgba(255,255,255,0.45)" strokeWidth={0.7} />
        {Array.from({ length: stationCount }, (_, index) => {
          const sx = x + stationGap * (index + 0.5);
          return (
            <g key={`speech-station-${index}`}>
              <rect data-testid="speech-lab-station" x={sx - Math.min(3.2, stationGap * 0.18)} y={deskY + deskH * 0.42}
                width={Math.min(6.4, stationGap * 0.36)} height={Math.min(4, deskH * 0.34)} rx={0.6}
                fill="#1f2937" stroke={stroke} strokeWidth={0.45} />
              <line x1={sx} y1={deskY + deskH * 0.76} x2={sx} y2={deskY + deskH * 0.98}
                stroke="rgba(71,85,105,0.32)" strokeWidth={0.65} />
              {seatMark(sx, y + height * 0.82, Math.max(4, stationGap * 0.48), Math.max(4, height * 0.18), `speech-seat-${index}`)}
            </g>
          );
        })}
        <line x1={x + 2} y1={y + height * 0.16} x2={x + width - 2} y2={y + height * 0.16}
          stroke={color} strokeWidth={1.15} />
      </g>
    );
  }
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
            {workstationRow
              ? seatMark(px, y + height * 0.83, Math.max(4, gap * 0.52), height * 0.22, `row-seat-${i}`)
              : lectureChair(px, y + height * 0.83, Math.max(4, gap * 0.52), Math.max(4, height * 0.22), 0, `lecture-row-seat-${i}`)}
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
      <g data-testid={faculty ? "faculty-desk-chair-symbol" : undefined}>
        <rect data-testid={faculty ? "faculty-desk-surface" : "student-desk-surface"} x={deskX} y={deskY} width={deskW} height={deskH}
          rx={1.5} fill={color} stroke={stroke} strokeWidth={selStroke} />
        {faculty
          ? <g data-testid="faculty-desk-drawer">
              <rect x={deskX + deskW * 0.3} y={deskY + deskH * 0.68} width={deskW * 0.4} height={deskH * 0.16}
                rx={0.6} fill="rgba(31,41,55,0.12)" stroke="rgba(31,41,55,0.24)" strokeWidth={0.55} />
              <circle cx={cx} cy={deskY + deskH * 0.76} r={Math.max(0.35, Math.min(width, height) * 0.018)}
                fill="rgba(31,41,55,0.45)" />
            </g>
          : <rect x={cx - width * 0.16} y={y + height * 0.17} width={width * 0.32} height={height * 0.18} rx={1}
            fill="rgba(31,41,55,0.28)" />}
        {!faculty && <line x1={deskX + deskW * 0.1} y1={deskY + deskH * 0.78} x2={deskX + deskW * 0.9} y2={deskY + deskH * 0.78}
          stroke="rgba(255,255,255,0.36)" strokeWidth={0.75} />}
        {seatMark(cx, y + height * 0.83, faculty ? width * 0.32 : width * 0.36, faculty ? height * 0.24 : height * 0.22, faculty ? "faculty-desk-chair" : "desk-chair")}
      </g>
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
        <path data-testid="reception-counter-body"
          d={`M ${x + width * 0.05} ${y + height * 0.18} Q ${x + width * 0.05} ${y + height * 0.1} ${x + width * 0.13} ${y + height * 0.1} H ${x + width * 0.87} Q ${x + width * 0.95} ${y + height * 0.1} ${x + width * 0.95} ${y + height * 0.18} V ${y + height * 0.78} H ${x + width * 0.76} V ${y + height * 0.47} H ${x + width * 0.24} V ${y + height * 0.78} H ${x + width * 0.05} Z`}
          fill={color} stroke={stroke} strokeWidth={selStroke} strokeLinejoin="round" />
        <rect data-testid="reception-work-surface" x={x + width * 0.25} y={y + height * 0.22} width={width * 0.5} height={height * 0.18}
          rx={1} fill="rgba(248,250,252,0.26)" stroke={stroke} strokeWidth={0.7} />
        <rect data-testid="reception-workstation" x={x + width * 0.58} y={y + height * 0.25} width={width * 0.13} height={height * 0.12}
          rx={0.8} fill="#1f2937" stroke={stroke} strokeWidth={0.55} />
        <path data-testid="reception-service-side" d={`M ${x + width * 0.31} ${y + height * 0.72} H ${x + width * 0.69}`}
          fill="none" stroke="rgba(248,250,252,0.85)" strokeWidth={1.2} strokeLinecap="round" strokeDasharray="2 1.5" />
        <circle cx={x + width * 0.39} cy={y + height * 0.3} r={Math.min(width, height) * 0.05} fill="#e2e8f0" />
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
  if (type === "arm-chair") {
    const armTop = y + height * 0.25;
    const armBottom = y + height * 0.78;
    const leftArm = `M ${x + width * 0.25} ${armTop} Q ${x + width * 0.12} ${armTop} ${x + width * 0.12} ${armTop + height * 0.1} V ${armBottom - height * 0.1} Q ${x + width * 0.12} ${armBottom} ${x + width * 0.25} ${armBottom} L ${x + width * 0.29} ${armBottom} L ${x + width * 0.29} ${armTop + height * 0.1} Q ${x + width * 0.29} ${armTop} ${x + width * 0.25} ${armTop} Z`;
    const rightArm = `M ${x + width * 0.75} ${armTop} Q ${x + width * 0.88} ${armTop} ${x + width * 0.88} ${armTop + height * 0.1} V ${armBottom - height * 0.1} Q ${x + width * 0.88} ${armBottom} ${x + width * 0.75} ${armBottom} L ${x + width * 0.71} ${armBottom} L ${x + width * 0.71} ${armTop + height * 0.1} Q ${x + width * 0.71} ${armTop} ${x + width * 0.75} ${armTop} Z`;
    const backrest = `M ${x + width * 0.22} ${y + height * 0.26} Q ${x + width * 0.12} ${y + height * 0.18} ${x + width * 0.22} ${y + height * 0.1} Q ${cx} ${y + height * 0.015} ${x + width * 0.78} ${y + height * 0.1} Q ${x + width * 0.88} ${y + height * 0.18} ${x + width * 0.78} ${y + height * 0.26} Q ${cx} ${y + height * 0.2} ${x + width * 0.22} ${y + height * 0.26} Z`;
    return (
      <g data-testid="arm-chair-symbol">
        <path data-testid="arm-chair-left-arm" d={leftArm} fill={color} fillOpacity={0.42} stroke={stroke} strokeWidth={selStroke} strokeLinejoin="round" />
        <path data-testid="arm-chair-right-arm" d={rightArm} fill={color} fillOpacity={0.42} stroke={stroke} strokeWidth={selStroke} strokeLinejoin="round" />
        <path data-testid="arm-chair-backrest" d={backrest} fill={color} stroke={stroke} strokeWidth={selStroke} strokeLinejoin="round" />
        <rect data-testid="arm-chair-seat" x={x + width * 0.29} y={y + height * 0.35} width={width * 0.42} height={height * 0.39}
          rx={Math.min(width, height) * 0.14} fill={color} fillOpacity={0.78} stroke={stroke} strokeWidth={selStroke * 0.85} />
      </g>
    );
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

/** Shared Furniture artwork container. Rotation is applied by the caller so
 * it remains the item's Floor orientation; these optional mirrors are local
 * artwork transforms around the item's own center. Selection controls remain
 * outside this group and therefore are never mirrored. */
export function FloorFurnitureSymbol({ type, x, y, width, height, color, selected = false, assetKey, flipX = false, flipY = false }: {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  selected?: boolean;
  assetKey?: string;
  flipX?: boolean;
  flipY?: boolean;
}) {
  const cx = x + width / 2;
  const cy = y + height / 2;
  const mirrorTransform = flipX || flipY
    ? `translate(${cx} ${cy}) scale(${flipX ? -1 : 1} ${flipY ? -1 : 1}) translate(${-cx} ${-cy})`
    : undefined;
  return (
    <g data-testid={flipX || flipY ? "furniture-mirrored" : undefined} transform={mirrorTransform}>
      <FurnitureArtwork type={type} x={x} y={y} width={width} height={height} color={color} selected={selected} assetKey={assetKey} />
    </g>
  );
}
