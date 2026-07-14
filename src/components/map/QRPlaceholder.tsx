export function QRPlaceholder() {
  const rows = [
    [1, 1, 1, 0, 1, 1, 1],
    [1, 0, 1, 0, 1, 0, 1],
    [1, 1, 1, 0, 1, 1, 1],
    [0, 0, 0, 0, 0, 0, 0],
    [1, 1, 1, 0, 1, 0, 1],
    [0, 0, 1, 0, 1, 0, 1],
    [1, 1, 1, 0, 1, 1, 1],
  ];
  return (
    <svg width={40} height={40} viewBox="0 0 7 7" style={{ imageRendering: "pixelated" }}>
      {rows.map((row, r) =>
        row.map((cell, c) =>
          cell ? <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="currentColor" /> : null,
        ),
      )}
    </svg>
  );
}
