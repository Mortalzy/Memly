import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Plus, X } from 'lucide-react';
import { bulkImportText as text, cardCount, ru } from '../shared/ru';
import { maxDeckCards, parseCardList } from './bulk-import';
import type { ImportRow, ImportSeparator } from './bulk-import';

export function BulkImportDialog({
  existingCount,
  onClose,
  onAdd,
}: {
  existingCount: number;
  onClose: () => void;
  onAdd: (rows: ImportRow[]) => void;
}) {
  const [input, setInput] = useState('');
  const [separator, setSeparator] = useState<ImportSeparator>('space');
  const rows = useMemo(() => parseCardList(input, separator), [input, separator]);
  const invalid = rows.filter((row) => row.issue).length;
  const available = Math.max(0, maxDeckCards - existingCount);
  const overLimit = rows.length > available;
  const ready = rows.length > 0 && !invalid && !overLimit;
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const titleId = useId();
  const hintId = useId();

  useEffect(() => {
    const previousFocus = document.activeElement;
    const root = document.getElementById('root');
    const previousInert = root?.inert;
    if (root) root.inert = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector('textarea')?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      }
      if (event.key !== 'Tab') return;
      const controls = dialog.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), textarea, input, select, [tabindex="0"]',
      );
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('keydown', handleKey, true);
      document.body.style.overflow = previousOverflow;
      if (root) root.inert = previousInert ?? false;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  return createPortal(
    <div
      className="modal-backdrop import-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="panel import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={hintId}
        ref={dialog}
      >
        <header className="import-header">
          <div>
            <h2 id={titleId}>{text.title}</h2>
            <p id={hintId}>{text.hint}</p>
          </div>
          <button type="button" className="icon-button" aria-label={ru.close} onClick={onClose}>
            <X size={22} />
          </button>
        </header>
        <div className="import-body">
          <div className="import-separators" role="group" aria-label={text.separator}>
            <strong>{text.separator}</strong>
            <div>
              {(['space', 'tab', 'semicolon'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={separator === value}
                  onClick={() => setSeparator(value)}
                >
                  {text[value]}
                </button>
              ))}
            </div>
          </div>
          <p className="import-hint">{text.separatorHints[separator]}</p>
          <div className="import-columns">
            <section>
              <div className="import-section-title">
                <label htmlFor={`${titleId}-input`}>{text.input}</label>
                <span>{text.lines(rows.length)}</span>
              </div>
              <textarea
                id={`${titleId}-input`}
                className="import-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={text.placeholder}
                spellCheck={false}
                aria-describedby={`${titleId}-limit`}
              />
              <p className="import-hint" id={`${titleId}-limit`}>
                {text.capacity(available)}
              </p>
            </section>
            <section>
              <div className="import-section-title">
                <h3>{text.preview}</h3>
                <span>{cardCount(rows.length - invalid)}</span>
              </div>
              <div className="import-preview">
                {rows.length ? (
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">#</th>
                        <th scope="col">{text.term}</th>
                        <th scope="col">{text.definition}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, maxDeckCards).map((row) => (
                        <tr key={row.line} className={row.issue ? 'import-invalid' : ''}>
                          <td>{row.line}</td>
                          <td>{row.term || '—'}</td>
                          <td>
                            {row.definition || '—'}
                            {row.issue && <small>{text.issues[row.issue]}</small>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="import-empty">{text.empty}</p>
                )}
                {rows.length > maxDeckCards && <p className="import-hint">{text.previewLimit}</p>}
              </div>
            </section>
          </div>
          {(invalid > 0 || overLimit) && (
            <p className="form-error" role="alert">
              {overLimit ? text.limit(available) : text.invalid(invalid)}
            </p>
          )}
          <p className="import-notice">
            <Plus size={20} aria-hidden="true" />
            {text.appendHint}
          </p>
        </div>
        <footer className="import-footer">
          <p role="status" aria-live="polite">
            {ready && <CheckCircle2 size={20} aria-hidden="true" />}
            {ready ? text.ready(rows.length) : text.notReady}
          </p>
          <div>
            <button type="button" className="secondary" onClick={onClose}>
              {ru.cancel}
            </button>
            <button
              type="button"
              className="primary"
              disabled={!ready}
              onClick={() => {
                if (ready) onAdd(rows);
              }}
            >
              {text.add(rows.length - invalid)}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
