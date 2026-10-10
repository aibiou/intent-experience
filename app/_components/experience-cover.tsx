import type { ExperienceSeed, CoverMotif } from '../../src/experience/catalog';
import {
  CompassIcon,
  MoonIcon,
  SearchIcon,
  EditIcon,
  ShuffleIcon,
} from './icons';
import type { ComponentType, SVGProps } from 'react';

// 确定性字符串哈希——同一体验永远得到同一张封面，
// 不同体验之间拉开细微差异。
function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const CATEGORY_ICONS: Record<ExperienceSeed['category'], ComponentType<SVGProps<SVGSVGElement> & { size?: number }>> = {
  relax: MoonIcon,
  discover: CompassIcon,
  deep: SearchIcon,
  create: EditIcon,
  wild: ShuffleIcon,
};

function motifElements(motif: CoverMotif, seed: number): React.ReactNode {
  const common = { fill: 'none', stroke: '#ffffff', strokeOpacity: 0.5, strokeWidth: 2 };
  if (motif === 'waves') {
    return (
      <g {...common}>
        {[0, 1, 2, 3].map((row) => (
          <path
            key={row}
            d={`M-20 ${70 + row * 45} Q 60 ${40 + row * 45} 140 ${70 + row * 45} T 300 ${70 + row * 45} T 460 ${70 + row * 45}`}
            strokeOpacity={0.55 - row * 0.1}
          />
        ))}
      </g>
    );
  }
  if (motif === 'rings') {
    const cx = 110 + (seed % 180);
    const cy = 60 + (seed % 120);
    return (
      <g {...common}>
        {[26, 52, 82, 116].map((radius) => (
          <circle key={radius} cx={cx} cy={cy} r={radius} strokeOpacity={0.6 - radius / 300} />
        ))}
        <circle cx={cx} cy={cy} r={7} fill="#ffffff" stroke="none" fillOpacity={0.75} />
      </g>
    );
  }
  if (motif === 'grid') {
    const size = 10 + (seed % 6);
    const gap = 30 + (seed % 14);
    const points: React.ReactNode[] = [];
    for (let x = gap; x < 400; x += gap) {
      for (let y = gap; y < 250; y += gap) {
        points.push(
          <circle
            key={`${x}-${y}`}
            cx={x}
            cy={y}
            r={(x + y) % (size + 6) < 12 ? size / 2.6 : size / 4.2}
            fill="#ffffff"
            stroke="none"
            fillOpacity={0.28 + ((x * y) % 30) / 90}
          />,
        );
      }
    }
    return <g>{points}</g>;
  }
  if (motif === 'orbit') {
    const cx = 200;
    const cy = 125;
    return (
      <g {...common}>
        <ellipse cx={cx} cy={cy} rx={150} ry={52} strokeOpacity={0.35} />
        <ellipse cx={cx} cy={cy} rx={108} ry={96} strokeOpacity={0.3} transform={`rotate(${-18 + (seed % 36)} ${cx} ${cy})`} />
        <ellipse cx={cx} cy={cy} rx={64} ry={24} strokeOpacity={0.45} transform={`rotate(${24 - (seed % 30)} ${cx} ${cy})`} />
        <circle cx={cx} cy={cy} r={13} fill="#ffffff" stroke="none" fillOpacity={0.8} />
        <circle cx={cx + 150} cy={cy} r={5} fill="#ffffff" stroke="none" fillOpacity={0.7} />
      </g>
    );
  }
  if (motif === 'peaks') {
    const shift = (seed % 60) - 30;
    return (
      <g {...common}>
        <path d={`M-20 250 L ${90 + shift} 70 L 200 250 Z`} fill="#ffffff" fillOpacity={0.16} strokeOpacity={0.4} />
        <path d={`M120 250 L ${250 + shift} 40 L 380 250 Z`} fill="#ffffff" fillOpacity={0.12} strokeOpacity={0.3} />
        <path d={`M-20 250 L ${300 - shift} 110 L 480 250 Z`} fill="#ffffff" fillOpacity={0.1} strokeOpacity={0.25} />
      </g>
    );
  }
  // dots
  const dots: React.ReactNode[] = [];
  for (let i = 0; i < 26; i += 1) {
    const x = (seed * (i + 3) * 37) % 400;
    const y = (seed * (i + 7) * 53) % 250;
    dots.push(
      <circle
        key={i}
        cx={x}
        cy={y}
        r={2 + ((seed * (i + 11)) % 14)}
        fill="#ffffff"
        stroke="none"
        fillOpacity={0.2 + ((seed * (i + 5)) % 40) / 110}
      />,
    );
  }
  return <g>{dots}</g>;
}

export function ExperienceCover({ seed }: { seed: ExperienceSeed }) {
  const hash = hashString(seed.id);
  const hue = seed.hue + (hash % 24) - 12;
  const hue2 = seed.hue2 + (hash % 20) - 10;
  const gradientId = `cover-${seed.id}`;
  const Icon = CATEGORY_ICONS[seed.category];
  return (
    <div className="card-cover" aria-hidden="true">
      <svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={`hsl(${hue} 72% 84%)`} />
            <stop offset="55%" stopColor={`hsl(${seed.hue} 64% 72%)`} />
            <stop offset="100%" stopColor={`hsl(${hue2} 60% 56%)`} />
          </linearGradient>
        </defs>
        <rect width="400" height="250" fill={`url(#${gradientId})`} />
        {motifElements(seed.motif, hash)}
      </svg>
      <span className="card-cover-icon">
        <Icon size={34} />
      </span>
    </div>
  );
}
