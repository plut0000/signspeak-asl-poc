import { FINGERTIPS, HAND_POINTS } from "@/components/signspeak-mark";
import { HAND_CONNECTIONS } from "@/lib/landmark-overlay";

/** Bones are drawn wrist-out: depth along the finger sets the delay. */
function boneDelay(a: number, b: number) {
  const tip = Math.max(a, b);
  const depth = a === 0 ? 0 : a >= 5 && b >= 5 && (b - a) % 4 === 0 ? 1 : ((tip - 1) % 4) + 1;
  const finger = Math.floor((tip - 1) / 4);
  return 300 + depth * 150 + finger * 45;
}

function jointDelay(i: number) {
  if (i === 0) return 300;
  return 300 + (((i - 1) % 4) + 1) * 150 + Math.floor((i - 1) / 4) * 45;
}

/**
 * The landing illustration: an open hand waving hello, drawn on MediaPipe's
 * 21-point hand skeleton, with a coral sun behind it.
 */
export function HandPoster({ className }: { className?: string }) {
  const [wx, wy] = HAND_POINTS[0];
  return (
    <svg
      viewBox="0 0 32 36"
      className={className}
      aria-hidden="true"
      focusable="false"
      overflow="hidden"
    >
      <circle className="hand-sun" cx={16.5} cy={14.5} r={12.5} fill="var(--flamingo)" />
      <g transform={`rotate(-9 ${wx} ${wy})`}>
        <line
          className="hand-bone"
          pathLength={1}
          x1={wx}
          y1={wy}
          x2={wx + 2.6}
          y2={wy + 12}
          stroke="var(--porcelain)"
          strokeWidth={0.62}
          strokeLinecap="round"
          style={{ "--delay": "150ms" } as React.CSSProperties}
        />
        <g stroke="var(--porcelain)" strokeWidth={0.62} strokeLinecap="round">
          {HAND_CONNECTIONS.map(([a, b]) => (
            <line
              key={`${a}-${b}`}
              className="hand-bone"
              pathLength={1}
              x1={HAND_POINTS[a][0]}
              y1={HAND_POINTS[a][1]}
              x2={HAND_POINTS[b][0]}
              y2={HAND_POINTS[b][1]}
              style={{ "--delay": `${boneDelay(a, b)}ms` } as React.CSSProperties}
            />
          ))}
        </g>
        {HAND_POINTS.map(([x, y], i) => {
          const tip = (FINGERTIPS as readonly number[]).includes(i);
          return (
            <circle
              key={i}
              className="hand-joint"
              cx={x}
              cy={y}
              r={tip || i === 0 ? 0.95 : 0.62}
              fill={tip || i === 0 ? "var(--porcelain)" : "var(--ink)"}
              stroke={tip || i === 0 ? "var(--ink)" : "var(--porcelain)"}
              strokeWidth={0.28}
              style={{ "--delay": `${jointDelay(i)}ms` } as React.CSSProperties}
            />
          );
        })}
      </g>
    </svg>
  );
}
