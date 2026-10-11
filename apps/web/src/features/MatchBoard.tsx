import { useEffect, useRef, useState } from 'react';
import type { StudySessionDto } from '@memly/contracts';
import { SpeechButton } from '../shared/SpeechButton';

// Stable order survives server confirmations and page restoration.
function order(key: string): number {
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return (hash ^ (hash >>> 16)) >>> 0;
}
export function MatchBoard({
  session,
  blocked,
  selected,
  pair,
}: {
  session: StudySessionDto;
  blocked: boolean;
  selected: { side: 'left' | 'right'; id: string } | null;
  pair: (side: 'left' | 'right', id: string, from?: { side: 'left' | 'right'; id: string }) => void;
}) {
  const field = useRef<HTMLDivElement>(null);
  const [rowHeight, setRowHeight] = useState(72);
  useEffect(() => {
    const resize = () => {
      if (!field.current) return;
      const top = field.current.getBoundingClientRect().top + window.scrollY;
      const count = session.board!.left.length + session.board!.right.length;
      const rows = Math.ceil(count / 3);
      setRowHeight(
        Math.max(64, Math.min(140, (window.innerHeight - top - 140 - (rows - 1) * 12) / rows)),
      );
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (field.current) observer.observe(field.current);
    window.addEventListener('resize', resize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [session.board?.round, session.board?.left.length]);
  const dragging = useRef<{ side: 'left' | 'right'; id: string } | null>(null);
  const tiles = (['left', 'right'] as const)
    .flatMap((side) => session.board![side].map((tile) => ({ ...tile, side })))
    .sort((a, b) => order(session.id + a.id) - order(session.id + b.id));
  return (
    <div
      ref={field}
      className="match-field"
      style={{ gridAutoRows: `minmax(${rowHeight}px, auto)` }}
    >
      {tiles.map((tile) => (
        <div
          className={`match-field-item ${tile.matched ? 'is-matched' : ''}`}
          key={tile.id}
          aria-hidden={tile.matched}
        >
          <button
            className={`match-tile ${selected?.id === tile.id ? 'selected' : ''}`}
            disabled={blocked || tile.matched}
            aria-pressed={selected?.id === tile.id}
            draggable={!blocked && !tile.matched}
            onDragStart={(event) => {
              dragging.current = { id: tile.id, side: tile.side };
              event.dataTransfer.setData('text/plain', tile.id);
            }}
            onDragEnd={() => {
              dragging.current = null;
            }}
            onDragOver={(event) => {
              if (dragging.current && !tile.matched) event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (dragging.current) pair(tile.side, tile.id, dragging.current);
              dragging.current = null;
            }}
            onClick={() => pair(tile.side, tile.id)}
          >
            {tile.text}
          </button>
          {!tile.matched && <SpeechButton text={tile.text} disabled={blocked} />}
        </div>
      ))}
    </div>
  );
}
