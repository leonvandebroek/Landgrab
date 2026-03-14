// Pure SVG presentational component for a single radial menu slice (pie segment).

import { useCallback } from 'react';

interface Props {
  startAngle: number;   // radians
  endAngle: number;     // radians
  radius: number;       // outer radius in pixels
  innerRadius?: number; // inner radius (default 30)
  color: string;
  icon: string;         // emoji
  label: string;
  enabled: boolean;
  onClick: () => void;
}

function polarToCartesian(r: number, angle: number) {
  return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
}

/** Build the SVG path for a ring segment from innerR to outerR. */
function arcPath(innerR: number, outerR: number, start: number, end: number): string {
  const os = polarToCartesian(outerR, start);
  const oe = polarToCartesian(outerR, end);
  const ie = polarToCartesian(innerR, end);
  const is_ = polarToCartesian(innerR, start);
  const large = end - start > Math.PI ? 1 : 0;

  return [
    `M ${os.x} ${os.y}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${oe.x} ${oe.y}`,
    `L ${ie.x} ${ie.y}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${is_.x} ${is_.y}`,
    'Z',
  ].join(' ');
}

export function RadialSegment({
  startAngle,
  endAngle,
  radius,
  innerRadius = 30,
  color,
  icon,
  label,
  enabled,
  onClick,
}: Props) {
  const midAngle = (startAngle + endAngle) / 2;

  // Icon sits at ~65% of the ring depth, label at ~38%
  const iconR = innerRadius + (radius - innerRadius) * 0.65;
  const labelR = innerRadius + (radius - innerRadius) * 0.38;
  const iconPos = polarToCartesian(iconR, midAngle);
  const labelPos = polarToCartesian(labelR, midAngle);

  const path = arcPath(innerRadius, radius, startAngle, endAngle);

  const handleClick = useCallback(() => {
    if (enabled) onClick();
  }, [enabled, onClick]);

  return (
    <g
      className={`radial-segment${enabled ? '' : ' disabled'}`}
      onClick={handleClick}
      style={{ cursor: enabled ? 'pointer' : 'not-allowed' }}
    >
      <path
        d={path}
        fill={color}
        fillOpacity={enabled ? 0.85 : 0.3}
        stroke="rgba(0,0,0,0.3)"
        strokeWidth={1}
      />

      {/* Icon (emoji) at ~65% of ring depth */}
      <text
        x={iconPos.x}
        y={iconPos.y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={radius > 80 ? 22 : 18}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {icon}
      </text>

      {/* Label at ~38% of ring depth */}
      <text
        x={labelPos.x}
        y={labelPos.y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={9}
        fill="var(--text, #ecf0f1)"
        fillOpacity={enabled ? 0.9 : 0.4}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {label}
      </text>
    </g>
  );
}
