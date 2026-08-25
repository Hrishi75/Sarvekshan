import type { SurvivalSeries } from "@/lib/survival";

const SERIES_COLORS = ["#3B6FD4", "#B26A00", "#0E9E7A", "#8B47D6"];
const OFFSETS = [7, 90, 180, 365];

/** Survival curves. At most four series — a fifth folds into the table, never a
 *  generated hue. Direct end-labels plus a legend so identity is never colour alone. */
export function SurvivalChart({ series }: { series: SurvivalSeries[] }) {
  const shown = series.slice(0, 4);
  if (shown.length === 0) {
    return (
      <p className="py-10 text-center text-[13px] text-mute">
        No completed follow-up checks yet. The first curve appears about three months
        after the earliest repair.
      </p>
    );
  }

  const W = 700;
  const H = 236;
  const L = 44;
  const R = 672;
  const TOP = 16;
  const BOT = 196;
  const x = (o: number) => L + (OFFSETS.indexOf(o) / (OFFSETS.length - 1)) * (R - L);
  const y = (pct: number) => TOP + ((100 - pct) / 100) * (BOT - TOP);

  return (
    <div>
      <div className="mb-[10px] flex flex-wrap gap-x-4 gap-y-1">
        {shown.map((s, i) => (
          <span key={s.work_type_key} className="inline-flex items-center gap-[6px] text-[12px] text-body">
            <span
              className="h-[9px] w-[9px] rounded-[2px]"
              style={{ background: SERIES_COLORS[i] }}
            />
            {s.label}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-[236px] w-full min-w-[520px]" role="img"
          aria-label={`Survival of repairs. ${shown
            .map((s) => `${s.label}: ${s.points.filter((p) => p.pct != null).map((p) => `${Math.round(p.pct!)}% at ${p.offset_days} days`).join(", ")}`)
            .join(". ")}`}>
          {[100, 75, 50, 25].map((v) => (
            <line key={v} x1={L} y1={y(v)} x2={R} y2={y(v)} stroke="#EDEDEA" strokeWidth="1" />
          ))}
          <line x1={L} y1={BOT} x2={R} y2={BOT} stroke="#E3E3DF" strokeWidth="1" />

          {[100, 75, 50, 25].map((v) => (
            <text key={v} x={L - 8} y={y(v) + 4} textAnchor="end" fontFamily="var(--font-mono)" fontSize="10" fill="#A0A4AC">
              {v === 100 ? "100%" : v}
            </text>
          ))}
          {OFFSETS.map((o) => (
            <text key={o} x={x(o)} y={BOT + 20} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" fill="#A0A4AC">
              {o === 7 ? "7d" : `${o}`}
            </text>
          ))}
          <text x={(L + R) / 2} y={H - 4} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9.5" fill="#C0C3C9" letterSpacing="0.1em">
            DAYS AFTER THE REPAIR
          </text>

          {shown.map((s, i) => {
            const pts = s.points.filter((p) => p.pct != null);
            if (pts.length < 2) return null;
            const path = pts.map((p) => `${x(p.offset_days)},${y(p.pct!)}`).join(" ");
            const last = pts[pts.length - 1];
            return (
              <g key={s.work_type_key}>
                <polyline points={path} fill="none" stroke={SERIES_COLORS[i]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                {pts.map((p) => (
                  <circle key={p.offset_days} cx={x(p.offset_days)} cy={y(p.pct!)} r="3.5" fill={SERIES_COLORS[i]} stroke="#FFFFFF" strokeWidth="2">
                    <title>{`${s.label} — ${Math.round(p.pct!)}% working at day ${p.offset_days} (n=${p.n})`}</title>
                  </circle>
                ))}
                <text x={x(last.offset_days) + 9} y={y(last.pct!) + 4} fontFamily="var(--font-mono)" fontSize="10.5" fontWeight="600" fill={SERIES_COLORS[i]}>
                  {Math.round(last.pct!)}%
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
