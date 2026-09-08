"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { relativeDays } from "@/lib/format";
import { scoreColor } from "./ui";

export type MapSchool = {
  id: string;
  name: string;
  village: string | null;
  block: string | null;
  lat: number;
  lng: number;
  enrolment: number | null;
  score: number | null;
  last_audit_days: number | null;
};

const W = 720;
const PAD_X = 30;
const PAD_TOP = 26;
/** room under the data for the longitude labels and the scale bar */
const PAD_BOTTOM = 46;
/** A wide district fills the frame; a square one letterboxes inside it rather
 *  than growing into a panel too tall to read. The graticule spans the whole
 *  frame either way, so the margins read as map rather than as dead space. */
const MIN_H = 300;
const MAX_H = 430;

/** Degrees of latitude to kilometres — the one constant the scale bar needs. */
const KM_PER_DEG_LAT = 110.574;

function fill(score: number | null): string {
  if (score == null) return "none";
  if (score >= 70) return "var(--color-good)";
  if (score >= 50) return "var(--color-warn)";
  return "var(--color-bad)";
}

/**
 * Where the district actually is. An equirectangular plot of the org's schools,
 * with longitude compressed by cos(latitude) so the spacing on screen is the
 * spacing on the ground — a scale bar over a distorted plot would be a lie.
 *
 * Radius encodes enrolment, fill encodes score, and a school with no site
 * evidence is drawn hollow. It is not given a colour it has not earned: an
 * unvisited school has to read as a hole in the map, because that is what it is.
 */
export function DistrictMap({ schools }: { schools: MapSchool[] }) {
  const router = useRouter();
  const [hover, setHover] = useState<MapSchool | null>(null);

  const geo = useMemo(() => {
    if (schools.length === 0) return null;
    const meanLat = schools.reduce((a, s) => a + s.lat, 0) / schools.length;
    const kx = Math.cos((meanLat * Math.PI) / 180);
    const gx = (lng: number) => lng * kx;

    const xs = schools.map((s) => gx(s.lng));
    const ys = schools.map((s) => s.lat);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = maxX - minX || 0.01;
    const spanY = maxY - minY || 0.01;
    const innerW = W - 2 * PAD_X;

    // Fit longitude to the panel width and let latitude decide the height. One
    // scale serves both axes — a fixed frame would letterbox a compact district
    // and stretch a long one, and then the scale bar would be measuring nothing.
    let scale = innerW / (spanX * 1.16);
    let H = spanY * 1.16 * scale + PAD_TOP + PAD_BOTTOM;
    if (H > MAX_H) {
      H = MAX_H;
      scale = (H - PAD_TOP - PAD_BOTTOM) / (spanY * 1.16);
    } else if (H < MIN_H) {
      H = MIN_H;
    }

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const innerH = H - PAD_TOP - PAD_BOTTOM;

    return {
      kx,
      H,
      px: (lng: number) => PAD_X + innerW / 2 + (gx(lng) - cx) * scale,
      py: (lat: number) => PAD_TOP + innerH / 2 - (lat - cy) * scale,
      bounds: { minX, maxX, minY, maxY },
      pxPerKm: scale / KM_PER_DEG_LAT,
    };
  }, [schools]);

  const maxEnrol = useMemo(
    () => Math.max(1, ...schools.map((s) => s.enrolment ?? 0)),
    [schools]
  );

  if (!geo || schools.length === 0) {
    return (
      <p className="py-12 text-center text-[13px] text-mute">
        No school on record carries coordinates yet.
      </p>
    );
  }

  const radius = (enrolment: number | null) =>
    6 + 11 * Math.sqrt((enrolment ?? 0) / maxEnrol);

  // a round number of kilometres that lands between 70 and 180px wide
  const barKm =
    [1, 2, 5, 10, 20, 50, 100].find((k) => k * geo.pxPerKm >= 70 && k * geo.pxPerKm <= 180) ??
    Math.max(1, Math.round(90 / geo.pxPerKm));

  // graticule every 0.05° unless that would crowd the frame
  const step = [0.02, 0.05, 0.1, 0.25, 0.5].find(
    (s) => (geo.bounds.maxY - geo.bounds.minY) / s <= 5
  ) ?? 0.5;
  const latLines: number[] = [];
  for (
    let v = Math.ceil(geo.bounds.minY / step) * step;
    v <= geo.bounds.maxY + 1e-9;
    v += step
  ) {
    latLines.push(Number(v.toFixed(4)));
  }
  const lngLines: number[] = [];
  const minLng = geo.bounds.minX / geo.kx;
  const maxLng = geo.bounds.maxX / geo.kx;
  for (let v = Math.ceil(minLng / step) * step; v <= maxLng + 1e-9; v += step) {
    lngLines.push(Number(v.toFixed(4)));
  }

  const unaudited = schools.filter((s) => s.score == null).length;

  return (
    <div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${geo.H}`}
          className="mx-auto block max-h-[440px] w-full"
          role="img"
          aria-label={`Map of ${schools.length} schools. ${unaudited} have never been audited.`}
        >
          <rect x="0" y="0" width={W} height={geo.H} fill="var(--color-canvas)" rx="8" />

          {latLines.map((v) => (
            <g key={`lat${v}`}>
              <line
                x1="0"
                y1={geo.py(v)}
                x2={W}
                y2={geo.py(v)}
                stroke="var(--color-hair-soft)"
                strokeWidth="1"
              />
              <text
                x="7"
                y={geo.py(v) - 5}
                fontFamily="var(--font-mono)"
                fontSize="9"
                fill="var(--color-faint)"
              >
                {v.toFixed(2)}°N
              </text>
            </g>
          ))}
          {lngLines.map((v) => (
            <g key={`lng${v}`}>
              <line
                x1={geo.px(v)}
                y1="0"
                x2={geo.px(v)}
                y2={geo.H}
                stroke="var(--color-hair-soft)"
                strokeWidth="1"
              />
              <text
                x={geo.px(v) + 5}
                y={geo.H - 8}
                fontFamily="var(--font-mono)"
                fontSize="9"
                fill="var(--color-faint)"
              >
                {v.toFixed(2)}°E
              </text>
            </g>
          ))}

          {/* scale bar — honest because longitude was compressed by cos(lat) */}
          <g transform={`translate(${W - PAD_X - barKm * geo.pxPerKm}, ${geo.H - 26})`}>
            <line
              x1="0"
              y1="0"
              x2={barKm * geo.pxPerKm}
              y2="0"
              stroke="var(--color-mute)"
              strokeWidth="1.5"
            />
            <line x1="0" y1="-4" x2="0" y2="4" stroke="var(--color-mute)" strokeWidth="1.5" />
            <line
              x1={barKm * geo.pxPerKm}
              y1="-4"
              x2={barKm * geo.pxPerKm}
              y2="4"
              stroke="var(--color-mute)"
              strokeWidth="1.5"
            />
            <text
              x={(barKm * geo.pxPerKm) / 2}
              y="-9"
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontSize="10"
              fill="var(--color-mute)"
            >
              {barKm} km
            </text>
          </g>

          {schools.map((s, i) => {
            const r = radius(s.enrolment);
            const on = hover?.id === s.id;
            return (
              <g
                key={s.id}
                onMouseEnter={() => setHover(s)}
                onMouseLeave={() => setHover((h) => (h?.id === s.id ? null : h))}
                onClick={() => router.push(`/schools/${s.id}`)}
                style={{
                  cursor: "pointer",
                  transformOrigin: `${geo.px(s.lng)}px ${geo.py(s.lat)}px`,
                  animation: `pin-in 340ms ease-out ${i * 28}ms both`,
                }}
              >
                <circle
                  cx={geo.px(s.lng)}
                  cy={geo.py(s.lat)}
                  r={r}
                  fill={fill(s.score)}
                  fillOpacity={s.score == null ? 0 : 0.9}
                  stroke={s.score == null ? "var(--color-faint)" : "var(--color-surface)"}
                  strokeWidth={s.score == null ? 1.5 : 2}
                  strokeDasharray={s.score == null ? "3 3" : undefined}
                />
                {on && (
                  <circle
                    cx={geo.px(s.lng)}
                    cy={geo.py(s.lat)}
                    r={r + 5}
                    fill="none"
                    stroke="var(--color-brand)"
                    strokeWidth="1.5"
                  />
                )}
                <text
                  x={geo.px(s.lng)}
                  y={geo.py(s.lat) + r + 12}
                  textAnchor="middle"
                  fontFamily="var(--font-geist)"
                  fontSize="10.5"
                  fontWeight={on ? 600 : 500}
                  fill={on ? "var(--color-ink)" : "var(--color-mute)"}
                >
                  {s.village ?? s.name}
                </text>
                <title>
                  {`${s.name} — ${s.score == null ? "never audited" : `score ${s.score}`}`}
                </title>
              </g>
            );
          })}
        </svg>

        {/* readout: fixed slot, so hovering never reflows the panel */}
        <div className="pointer-events-none absolute left-[14px] top-[12px] max-w-[260px]">
          {hover ? (
            <div className="rounded-[7px] border border-hair bg-surface/95 px-[11px] py-[8px]">
              <div className="truncate text-[13px] font-semibold tracking-[-0.005em]">
                {hover.name}
              </div>
              <div className="mt-[3px] flex items-center gap-[7px] text-[11.5px] text-mute">
                <span className={`num font-semibold ${scoreColor(hover.score)}`}>
                  {hover.score ?? "not audited"}
                </span>
                <span className="h-[3px] w-[3px] rounded-full bg-faint" />
                <span className="num">{hover.enrolment ?? "—"} pupils</span>
                <span className="h-[3px] w-[3px] rounded-full bg-faint" />
                <span>{relativeDays(hover.last_audit_days)}</span>
              </div>
            </div>
          ) : (
            <div className="text-[11.5px] text-faint">Hover a school · click to open</div>
          )}
        </div>
      </div>

      <div className="mt-[10px] flex flex-wrap items-center gap-x-[14px] gap-y-[6px] border-t border-hair-soft pt-[11px] text-[11.5px] text-mute">
        <Key color="var(--color-good)" label="70+" />
        <Key color="var(--color-warn)" label="50–69" />
        <Key color="var(--color-bad)" label="under 50" />
        <span className="inline-flex items-center gap-[6px]">
          <span className="h-[10px] w-[10px] rounded-full border-[1.5px] border-dashed border-faint" />
          never audited{unaudited > 0 && <span className="num text-faint">({unaudited})</span>}
        </span>
        <span className="ml-auto text-faint">Circle area is enrolment</span>
      </div>
    </div>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-[6px]">
      <span className="h-[10px] w-[10px] rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
