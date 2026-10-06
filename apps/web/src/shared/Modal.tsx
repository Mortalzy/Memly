import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { ru } from './ru';

export function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current;
    element?.querySelector<HTMLElement>('input, button')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key !== 'Tab' || !element) return;
      const controls = element.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, a[href]',
      );
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', keydown);
      document.body.style.overflow = oldOverflow;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [close]);
  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        className="modal panel"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="section-heading">
          <h2 id="modal-title">{title}</h2>
          <button className="icon-button" aria-label={ru.close} onClick={close}>
            <X size={21} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
