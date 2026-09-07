export default function RiskGauge({
  killSwitchEnabled,
  maxLossPercent,
  todayPnlPct,
}: {
  killSwitchEnabled: boolean;
  maxLossPercent: number | null;
  todayPnlPct: number;
}) {
  const limit = maxLossPercent ?? 0;
  const used = limit > 0 ? Math.min(Math.max(-todayPnlPct / limit, 0), 1) : 0;
  const angle = used * 180;

  const R = 70;
  const CX = 84;
  const CY = 84;
  const toXY = (deg: number) => {
    const rad = (Math.PI * (180 - deg)) / 180;
    return [CX - R * Math.cos(rad), CY - R * Math.sin(rad)];
  };
  const [ex, ey] = toXY(angle);
  const large = angle > 180 ? 1 : 0;

  const color = used > 0.8 ? "#d60000" : used > 0.5 ? "#bda360" : "#00a83e";

  return (
    <div data-tour="risk-gauge" className="flex items-center gap-6">
      <svg viewBox="0 0 168 100" width="168" height="100">
        <path d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`} fill="none" stroke="#f0f1f5" strokeWidth="14" strokeLinecap="round" />
        {limit > 0 && (
          <path
            d={`M ${CX - R} ${CY} A ${R} ${R} 0 ${large} 1 ${ex} ${ey}`}
            fill="none"
            stroke={color}
            strokeWidth="14"
            strokeLinecap="round"
          />
        )}
      </svg>
      <div>
        {killSwitchEnabled ? (
          <p className="text-sm font-semibold text-brand-sell">Kill switch is ON</p>
        ) : limit > 0 ? (
          <>
            <p className="text-2xl font-bold text-brand-navy">{(used * 100).toFixed(0)}%</p>
            <p className="text-xs text-brand-navy/50">of your {limit}% daily loss limit used</p>
          </>
        ) : (
          <p className="text-sm text-brand-navy/50">No max-loss limit set yet.</p>
        )}
      </div>
    </div>
  );
}
