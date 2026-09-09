/** Tiny dependency-free area + line chart for a small time series. */
export default function Spark({
  points,
  height = 92,
  label,
  fmtMax,
}: {
  points: { x: string; y: number }[];
  height?: number;
  label?: string;
  fmtMax?: (n: number) => string;
}) {
  if (!points.length) return null;
  const W = 600;
  const max = Math.max(...points.map((p) => p.y), 1e-6);
  const n = points.length;
  const px = (i: number) => (n === 1 ? W / 2 : 6 + (i / (n - 1)) * (W - 12));
  const py = (v: number) => height - 8 - (v / max) * (height - 22);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(p.y).toFixed(1)}`).join(" ");
  const area = `${line} L${px(n - 1).toFixed(1)},${height - 4} L${px(0).toFixed(1)},${height - 4} Z`;
  return (
    <div className="spark">
      {label && <div className="tiny muted" style={{ marginBottom: 4 }}>{label}</div>}
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="spark-svg" role="img">
        <path d={area} className="spark-area" />
        <path d={line} className="spark-line" fill="none" />
        {n <= 45 && points.map((p, i) => <circle key={i} cx={px(i)} cy={py(p.y)} r={2} className="spark-dot" />)}
      </svg>
      <div className="spark-axis">
        <span>{points[0].x}</span>
        <span>{fmtMax ? fmtMax(max) : String(Math.round(max))}</span>
        <span>{points[n - 1].x}</span>
      </div>
    </div>
  );
}
