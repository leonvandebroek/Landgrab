import type { CSSProperties } from 'react';

/**
 * Line icons for the field-kit look. Stroke icons only, drawn on a 24 grid,
 * coloured with currentColor so a button decides the colour.
 */
export type IconName =
  | 'menu'
  | 'layers'
  | 'locate'
  | 'back'
  | 'chevronRight'
  | 'chevronDown'
  | 'share'
  | 'shuffle'
  | 'plus'
  | 'minus'
  | 'flag'
  | 'shield'
  | 'sword'
  | 'check'
  | 'close'
  | 'user'
  | 'bot'
  | 'clock'
  | 'pin'
  | 'map'
  | 'bolt'
  | 'target'
  | 'rally'
  | 'eye'
  | 'radio'
  | 'fort'
  | 'wrench'
  | 'hammer'
  | 'gift'
  | 'trophy'
  | 'logout'
  | 'edit'
  | 'trash'
  | 'info'
  | 'sound'
  | 'globe'
  | 'pause'
  | 'play'
  | 'crown'
  | 'screen';

const PATHS: Record<IconName, string[]> = {
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  layers: ['M12 3 3 8l9 5 9-5-9-5Z', 'm3 13 9 5 9-5'],
  locate: ['M20 4 4 11l7 2 2 7 7-16Z'],
  back: ['m15 5-7 7 7 7'],
  chevronRight: ['m9 5 7 7-7 7'],
  chevronDown: ['m5 9 7 7 7-7'],
  share: ['M12 15V4', 'm8 8 4-4 4 4', 'M5 13v6h14v-6'],
  shuffle: ['M4 7h4l8 10h4', 'M4 17h4l2.5-3', 'm14 10 2-3h4', 'm18 5 2 2-2 2', 'm18 15 2 2-2 2'],
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M6 12h12'],
  flag: ['M6 21V4', 'M6 5h11l-2.5 4L17 13H6'],
  shield: ['M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3Z'],
  sword: ['M14.5 17.5 3 6V3h3l11.5 11.5', 'm13 19 6-6', 'm16 16 4 4', 'm19 21 2-2'],
  check: ['m5 12 5 5L20 7'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6'],
  bot: ['M6 8h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z', 'M12 4v4', 'M9 14h.01', 'M15 14h.01'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 7v5l3 2'],
  pin: ['M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12Z', 'M12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z'],
  map: ['M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z', 'M9 4v14', 'M15 6v14'],
  bolt: ['M13 2 4 14h7l-1 8 9-12h-7l1-8Z'],
  target: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M12 12h.01'],
  rally: ['M5 21V4', 'M5 4h10l-2 3.5L15 11H5', 'M17 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z', 'M21 21a2 2 0 0 0-4 0'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
  radio: ['M12 12h.01', 'M8.5 8.5a5 5 0 0 0 0 7', 'M15.5 8.5a5 5 0 0 1 0 7', 'M5.6 5.6a9 9 0 0 0 0 12.8', 'M18.4 5.6a9 9 0 0 1 0 12.8'],
  fort: ['M4 21V9l3 2V8l3 2V6l2-2 2 2v4l3-2v3l3-2v12H4Z', 'M10 21v-5h4v5'],
  wrench: ['M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6Z'],
  hammer: ['m15 12-8.5 8.5a2.1 2.1 0 0 1-3-3L12 9', 'm17.6 15.6 4-4-6-6-4 4 1.4 1.4', 'm14.5 4.5 2-2'],
  gift: ['M4 11h16v10H4z', 'M3 7h18v4H3z', 'M12 7v14', 'M12 7c-2-4-6-3-5 0', 'M12 7c2-4 6-3 5 0'],
  trophy: ['M8 21h8', 'M12 17v4', 'M7 4h10v5a5 5 0 0 1-10 0V4Z', 'M7 6H4a3 3 0 0 0 3 4', 'M17 6h3a3 3 0 0 1-3 4'],
  logout: ['M15 4h4v16h-4', 'M10 8l-4 4 4 4', 'M6 12h10'],
  edit: ['M4 20h4L19 9l-4-4L4 16v4Z', 'm13 7 4 4'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 11v5', 'M12 8h.01'],
  sound: ['M4 9v6h4l5 4V5L8 9H4Z', 'M16 9a4 4 0 0 1 0 6', 'M18.5 6.5a7.5 7.5 0 0 1 0 11'],
  globe: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M3 12h18', 'M12 3c2.5 2.5 3.5 5.5 3.5 9S14.5 18.5 12 21c-2.5-2.5-3.5-5.5-3.5-9S9.5 5.5 12 3Z'],
  pause: ['M8 5v14', 'M16 5v14'],
  play: ['M7 5v14l11-7L7 5Z'],
  crown: ['M4 18h16', 'M4 18 3 7l5 4 4-6 4 6 5-4-1 11'],
  screen: ['M3 5h18v11H3z', 'M8 20h8', 'M12 16v4'],
};

interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

export function Icon({ name, size = 22, strokeWidth = 2.1, className, style, title }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {PATHS[name].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}
