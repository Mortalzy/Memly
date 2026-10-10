import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { ArrowDown, ArrowRight, Lightbulb } from 'lucide-react';
import type { ScanwordBoardDto, ScanwordCellDto, ScanwordWordDto } from '@memly/contracts';
import { scanwordText as text } from '../shared/scanword-text';

export function ScanwordBoard({
  board,
  drafts,
  change,
  blocked,
  pending,
  hint,
  check,
}: {
  board: ScanwordBoardDto;
  drafts: Record<string, string>;
  change: (values: Record<string, string>) => void;
  blocked: boolean;
  pending: boolean;
  hint: (wordId: string) => void;
  check: () => void;
}) {
  const [selection, setSelection] = useState('');
  const [activeCell, setActiveCell] = useState('');
  const fields = useRef(new Map<string, HTMLInputElement>());
  const word = board.words.find((item) => item.id === selection) ?? board.words[0];
  const letters = (item: ScanwordWordDto) =>
    board.cells
      .filter((cell) => cell.kind === 'letter' && cell.wordIds.includes(item.id))
      .sort((a, b) => (item.direction === 'across' ? a.column - b.column : a.row - b.row));
  function focus(cell: ScanwordCellDto | undefined, selected = word.id) {
    if (!cell) return;
    setSelection(selected);
    setActiveCell(cell.key);
    fields.current.get(cell.key)?.focus({ preventScroll: true });
    fields.current.get(cell.key)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }
  function choose(item: ScanwordWordDto) {
    const cells = letters(item);
    focus(
      cells.find((cell) => !cell.locked && !drafts[cell.key]) ??
        cells.find((cell) => !cell.locked) ??
        cells[0],
      item.id,
    );
  }
  useEffect(() => {
    const first = board.words.find((item) => !item.solved) ?? board.words[0];
    setSelection(first.id);
    setActiveCell(letters(first).find((cell) => !cell.locked)?.key ?? letters(first)[0].key);
  }, [board.round]);
  function input(cell: ScanwordCellDto, value: string) {
    if (blocked || cell.locked) return;
    const letter = value.normalize('NFKC').toUpperCase().slice(-1);
    if (letter && !/^[A-ZА-ЯЁ]$/u.test(letter)) return;
    const next = { ...drafts };
    if (letter) next[cell.key] = letter;
    else delete next[cell.key];
    change(next);
    if (letter) {
      const cells = letters(word);
      focus(
        cells
          .slice(cells.findIndex((item) => item.key === cell.key) + 1)
          .find((item) => !item.locked),
      );
    }
  }
  function key(event: KeyboardEvent<HTMLInputElement>, cell: ScanwordCellDto) {
    if (blocked) return;
    const cells = letters(word);
    const index = cells.findIndex((item) => item.key === cell.key);
    if (event.key === 'Enter') {
      event.preventDefault();
      if (!pending) check();
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      if (!cell.locked && drafts[cell.key]) input(cell, '');
      else if (event.key === 'Backspace')
        focus(
          cells
            .slice(0, index)
            .reverse()
            .find((item) => !item.locked),
        );
    } else if (event.key === 'Tab') {
      const next =
        board.words[
          board.words.findIndex((item) => item.id === word.id) + (event.shiftKey ? -1 : 1)
        ];
      if (next) {
        event.preventDefault();
        choose(next);
      }
    } else if (event.key === ' ' && cell.wordIds.length > 1) {
      event.preventDefault();
      const other = board.words.find(
        (item) => cell.wordIds.includes(item.id) && item.id !== word.id,
      );
      if (other) focus(cell, other.id);
    } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const dr = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
      const dc = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
      for (let distance = 1; distance <= Math.max(board.rows, board.columns); distance++) {
        const next = board.cells.find(
          (item) =>
            item.kind === 'letter' &&
            item.row === cell.row + dr * distance &&
            item.column === cell.column + dc * distance,
        );
        if (next) {
          const direction = dr ? 'down' : 'across';
          const selected =
            board.words.find(
              (item) => next.wordIds.includes(item.id) && item.direction === direction,
            ) ?? board.words.find((item) => next.wordIds.includes(item.id))!;
          focus(next, selected.id);
          break;
        }
      }
    }
  }
  const selectedLetters = letters(word);
  return (
    <div className="scanword-layout">
      <div className="scanword-scroll" role="region" aria-label={text.title} tabIndex={-1}>
        <div className="scanword-grid" style={{ '--columns': board.columns } as CSSProperties}>
          {board.cells.map((cell) => {
            if (cell.kind === 'block')
              return <div className="scanword-block" key={cell.key} aria-hidden="true" />;
            if (cell.kind === 'clue') {
              const clue = board.words.find((item) => item.id === cell.wordIds[0])!;
              return (
                <button
                  key={cell.key}
                  className={`scanword-clue ${selection === clue.id ? 'is-selected' : ''}`}
                  tabIndex={-1}
                  aria-label={`${clue.clue}, ${clue.direction === 'across' ? text.across : text.down}, ${text.letters(clue.length)}`}
                  title={clue.clue}
                  onClick={() => choose(clue)}
                >
                  <span>{clue.clue}</span>
                  {clue.direction === 'across' ? <ArrowRight size={16} /> : <ArrowDown size={16} />}
                </button>
              );
            }
            const selected = cell.wordIds.includes(word.id);
            const solved = board.words.some(
              (item) => cell.wordIds.includes(item.id) && item.solved,
            );
            const incorrect = cell.wordIds.some((id) => board.wrongWords.includes(id));
            const related = selected
              ? word
              : board.words.find((item) => cell.wordIds.includes(item.id))!;
            const index = letters(related).findIndex((item) => item.key === cell.key);
            return (
              <input
                key={cell.key}
                ref={(element) => {
                  if (element) fields.current.set(cell.key, element);
                  else fields.current.delete(cell.key);
                }}
                className={`scanword-letter ${selected ? 'is-selected' : ''} ${solved ? 'is-solved' : ''} ${incorrect && !solved ? 'is-wrong' : ''} ${cell.locked && !solved ? 'is-hint' : ''}`}
                aria-label={text.cell(related.clue, index, related.length)}
                aria-invalid={incorrect && !solved}
                tabIndex={cell.key === activeCell ? 0 : -1}
                value={cell.locked ? cell.value : (drafts[cell.key] ?? '')}
                maxLength={1}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="characters"
                spellCheck={false}
                readOnly={cell.locked || blocked}
                onFocus={() => {
                  setActiveCell(cell.key);
                  if (!selected) setSelection(related.id);
                }}
                onClick={() => {
                  if (!selected) setSelection(related.id);
                }}
                onChange={(event) => input(cell, event.target.value)}
                onKeyDown={(event) => key(event, cell)}
                onPaste={(event) => {
                  event.preventDefault();
                  if (blocked || cell.locked) return;
                  const pasted = event.clipboardData
                    .getData('text')
                    .normalize('NFKC')
                    .trim()
                    .toUpperCase();
                  if (!/^[A-ZА-ЯЁ]+$/u.test(pasted)) return;
                  const cells = letters(word),
                    start = cells.findIndex((item) => item.key === cell.key);
                  const next = { ...drafts };
                  [...pasted].slice(0, cells.length - start).forEach((letter, offset) => {
                    if (!cells[start + offset].locked) next[cells[start + offset].key] = letter;
                  });
                  change(next);
                  focus(cells[Math.min(start + pasted.length, cells.length - 1)]);
                }}
              />
            );
          })}
        </div>
      </div>
      <aside className="scanword-selected" aria-label={text.selection}>
        <span className="eyebrow">{text.selection}</span>
        <div className="scanword-clue-title">
          <h2>{word.clue}</h2>
          {word.direction === 'across' ? <ArrowRight size={24} /> : <ArrowDown size={24} />}
        </div>
        <p>
          {text.letters(word.length)} · {word.direction === 'across' ? text.across : text.down}
        </p>
        <p className="scanword-input-hint">{text.inputHint}</p>
        <div className="scanword-preview" aria-hidden="true">
          {selectedLetters.map((cell) => (
            <span className={activeCell === cell.key ? 'active' : ''} key={cell.key}>
              {cell.locked ? cell.value : (drafts[cell.key] ?? '')}
            </span>
          ))}
        </div>
        <button
          className="secondary scanword-hint"
          disabled={
            pending || blocked || word.solved || selectedLetters.every((cell) => cell.locked)
          }
          onClick={() => hint(word.id)}
        >
          <Lightbulb size={18} />
          {text.hint}
        </button>
        <p className="scanword-hint-notice">
          {text.hintNotice} {board.hints > 0 && `${text.hints}: ${board.hints}`}
        </p>
        <p className="scanword-keyboard">{text.keyboard}</p>
      </aside>
    </div>
  );
}
