// Tiny inline trend line for a stat tile — used by the Daily Activity history chart
// (Home) and anywhere else that wants a glance-sized trend without a full chart lib.
export default function SparkLine({ values, color }: { values: (number | null)[]; color: string }) {
  const W = 64, H = 28;
  const pts = values
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v !== null);
  if (pts.length === 0) return (
    <div style={{ width: W, height: H }} className="flex items-center">
      <div className="w-full h-px bg-slate-100" />
    </div>
  );
  if (pts.length === 1) {
    const cx = ((pts[0].i / Math.max(values.length - 1, 1)) * W).toFixed(1);
    const cy = (H / 2).toFixed(1);
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
        <line x1="0" y1={cy} x2={W} y2={cy} stroke={color} strokeWidth="1" strokeOpacity="0.2" strokeDasharray="3,3" />
        <circle cx={cx} cy={cy} r="2.5" fill={color} />
      </svg>
    );
  }
  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v), min + 1);
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => H - 2 - ((v - min) / (max - min)) * (H - 6);
  const line = pts.map((p) => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const area = `${x(pts[0].i).toFixed(1)},${H} ${pts.map((p) => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ")} ${x(pts[pts.length - 1].i).toFixed(1)},${H}`;
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
      <polygon points={area} fill={color} fillOpacity="0.15" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(last.i).toFixed(1)} cy={y(last.v).toFixed(1)} r="2.5" fill={color} />
    </svg>
  );
}
