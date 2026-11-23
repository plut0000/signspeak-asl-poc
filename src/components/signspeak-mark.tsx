import { HAND_CONNECTIONS } from "@/lib/landmark-overlay";

/**
 * An open "5" hand drawn on MediaPipe's 21-point hand topology: the same
 * skeleton the tracking overlay draws on camera.
 */
const HAND_POINTS: ReadonlyArray<readonly [number, number]> = [
  [15, 29],
  [10.5, 26],
  [7.5, 22.5],
  [5.5, 19],
  [4, 16],
  [11, 16.5],
  [10.2, 11.5],
  [9.8, 8.3],
  [9.5, 5.5],
  [15.5, 15.5],
  [15.6, 10],
  [15.7, 6.5],
  [15.8, 3.5],
  [19.8, 16.5],
  [20.7, 11.5],
  [21.2, 8.5],
  [21.6, 6],
  [23.5, 18.5],
  [25.3, 15],
  [26.4, 12.6],
  [27.3, 10.5],
];

const FINGERTIPS = [4, 8, 12, 16, 20] as const;

export function SignSpeakMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <g
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {HAND_CONNECTIONS.map(([a, b]) => (
          <line
            key={`${a}-${b}`}
            x1={HAND_POINTS[a][0]}
            y1={HAND_POINTS[a][1]}
            x2={HAND_POINTS[b][0]}
            y2={HAND_POINTS[b][1]}
          />
        ))}
      </g>
      {FINGERTIPS.map((i) => (
        <circle
          key={i}
          cx={HAND_POINTS[i][0]}
          cy={HAND_POINTS[i][1]}
          r={1.9}
          fill="var(--trace)"
        />
      ))}
      <circle cx={HAND_POINTS[0][0]} cy={HAND_POINTS[0][1]} r={1.9} fill="var(--signal)" />
    </svg>
  );
}
