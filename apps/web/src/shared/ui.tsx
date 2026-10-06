import type { CSSProperties, ReactNode } from 'react';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  Clock3,
  Code2,
  Copy,
  Folder,
  House,
  Layers2,
  Leaf,
  Link2,
  ListChecks,
  Repeat2,
  Settings,
  Star,
} from 'lucide-react';
import { ru } from './ru';
import type { StudyMode } from '../entities/deck';

export const icons = {
  home: House,
  library: BookOpen,
  folders: Folder,
  progress: ChartNoAxesColumnIncreasing,
  cards: Copy,
  learn: Repeat2,
  test: ListChecks,
  match: Link2,
  calendar: CalendarDays,
  clock: Clock3,
  code: Code2,
  layers: Layers2,
  leaf: Leaf,
  book: BookOpen,
  settings: Settings,
  star: Star,
};
export type IconName = keyof typeof icons;
export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const Component = icons[name];
  return <Component size={size} strokeWidth={1.7} aria-hidden="true" />;
}
export function Symbol({ value }: { value: string }) {
  return (
    <span className="deck-symbol">
      {value in icons ? <Icon name={value as IconName} size={28} /> : value}
    </span>
  );
}
export function ProgressBar({ value }: { value: number }) {
  return (
    <div
      className="progress-track"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ '--progress': `${value}%` } as CSSProperties} />
    </div>
  );
}
export function PageHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
export const modes: StudyMode[] = ['cards', 'learn', 'test', 'match'];
export function Modes({
  onSelect,
  active,
}: {
  onSelect: (mode: StudyMode) => void;
  active?: StudyMode;
}) {
  return (
    <div className="mode-grid">
      {modes.map((mode) => (
        <button
          key={mode}
          className={`mode-button ${active === mode ? 'active' : ''}`}
          onClick={() => onSelect(mode)}
        >
          <Icon name={mode} size={31} />
          <span>
            <strong>{ru[mode]}</strong>
            <small>{ru[`${mode}Hint`]}</small>
          </span>
          <ArrowRight size={17} className="mode-arrow" />
        </button>
      ))}
    </div>
  );
}
export function Stats() {
  return (
    <div className="stats-grid">
      {(
        [
          { icon: 'calendar', value: '5', label: ru.days },
          { icon: 'cards', value: '126', label: ru.studied },
          { icon: 'progress', value: '3', label: ru.completed },
          { icon: 'clock', value: ru.timeValue, label: ru.time },
        ] as const
      ).map((stat) => (
        <div className="stat" key={stat.icon}>
          <Icon name={stat.icon} size={29} />
          <div>
            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
