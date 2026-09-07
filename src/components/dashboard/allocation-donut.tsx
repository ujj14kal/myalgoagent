const SLICE_COLORS = ["#471898", "#466fff", "#bda360", "#6a35c2", "#00a83e", "#d60000"];

export default function AllocationDonut({
  slices,
}: {
  slices: { label: string; value: number }[];
}) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  if (total <= 0) {
    return (
      <div className="flex h-[168px] items-center justify-center text-sm text-brand-navy/40">
        No open positions to allocate.
      </div>
    );
  }

  const R = 60;
  const CX = 84;
  const CY = 84;
  const CIRC = 2 * Math.PI * R;

  const arcs = slices.reduce<{ label: string; value: number; dash: number; offset: number }[]>((acc, s) => {
    const dash = (s.value / total) * CIRC;
    const offset = acc.length > 0 ? acc[acc.length - 1].offset + acc[acc.length - 1].dash : 0;
    return [...acc, { ...s, dash, offset }];
  }, []);

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 168 168" width="168" height="168">
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#f0f1f5" strokeWidth="20" />
        {arcs.map((s, i) => (
          <circle
            key={s.label}
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke={SLICE_COLORS[i % SLICE_COLORS.length]}
            strokeWidth="20"
            strokeDasharray={`${s.dash} ${CIRC - s.dash}`}
            strokeDashoffset={-s.offset}
            transform={`rotate(-90 ${CX} ${CY})`}
          />
        ))}
        <text x={CX} y={CY - 2} textAnchor="middle" className="fill-brand-navy text-[13px] font-bold">
          ₹{total.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
        </text>
        <text x={CX} y={CY + 14} textAnchor="middle" className="fill-brand-navy/40 text-[9px] font-medium">
          exposed
        </text>
      </svg>
      <ul className="space-y-1.5 text-sm">
        {slices.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }}
            />
            <span className="text-brand-navy/70">{s.label}</span>
            <span className="ml-auto font-medium text-brand-navy">
              {((s.value / total) * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
