import { useCallback, useEffect, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import type { DeckDto, StarterDeckDto, StarterDeckDetailDto } from '@memly/contracts';
import { api, errorMessage } from '../shared/api';
import { PageHeading, Symbol } from '../shared/ui';
import { Modal } from '../shared/Modal';
import { cardCount } from '../shared/ru';
import { starterText as text } from '../shared/starter-text';

export function StarterCatalog({
  query,
  setQuery,
  add,
  open,
}: {
  query: string;
  setQuery: (value: string) => void;
  add: (key: string) => Promise<DeckDto>;
  open: (id: string) => void;
}) {
  const [items, setItems] = useState<StarterDeckDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [addError, setAddError] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [level, setLevel] = useState('all');
  const [selected, setSelected] = useState<StarterDeckDto | null>(null);
  const [detail, setDetail] = useState<StarterDeckDetailDto | null>(null);
  const [detailError, setDetailError] = useState('');
  const [retry, setRetry] = useState(0);
  const [previewRetry, setPreviewRetry] = useState(0);
  const close = useCallback(() => setSelected(null), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setListError('');
    api<StarterDeckDto[]>('/v1/starter-decks', { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setItems(value);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setListError(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setDetail(null);
    setDetailError('');
    api<StarterDeckDetailDto>(`/v1/starter-decks/${selected.key}`, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setDetail(value);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setDetailError(errorMessage(error));
      });
    return () => controller.abort();
  }, [selected?.key, previewRetry]);
  const addDeck = async (key: string) => {
    if (pending) return;
    setPending(key);
    setAddError('');
    try {
      const copy = await add(key);
      setItems((values) =>
        values.map((item) => (item.key === key ? { ...item, addedDeckId: copy.id } : item)),
      );
      setSelected((item) => (item?.key === key ? { ...item, addedDeckId: copy.id } : item));
    } catch (error) {
      setAddError(errorMessage(error));
    } finally {
      setPending(null);
    }
  };
  const action = (item: StarterDeckDto) =>
    item.addedDeckId ? (
      <button className="primary" onClick={() => open(item.addedDeckId!)}>
        {text.open}
      </button>
    ) : (
      <button
        className="primary"
        disabled={Boolean(pending)}
        onClick={() => void addDeck(item.key)}
      >
        <Plus size={17} />
        {pending === item.key ? text.adding : text.add}
      </button>
    );
  const search = query.trim().toLocaleLowerCase('ru');
  const filtered = items.filter(
    (item) =>
      (level === 'all' || level === item.level) &&
      `${item.title} ${item.description} ${item.key}`.toLocaleLowerCase('ru').includes(search),
  );
  return (
    <>
      <PageHeading title={text.title} subtitle={text.subtitle} />
      <p className="starter-hint">{text.hint}</p>
      <div className="starter-toolbar">
        <label>
          {text.level}
          <select value={level} onChange={(event) => setLevel(event.target.value)}>
            <option value="all">{text.allLevels}</option>
            {text.levels.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <small>{text.levelHint}</small>
      </div>
      {loading && <p role="status">{text.loading}</p>}
      {listError && (
        <div className="form-error" role="alert">
          <p>{listError}</p>
          <button className="secondary" onClick={() => setRetry((value) => value + 1)}>
            {text.retry}
          </button>
        </div>
      )}
      {addError && !selected && (
        <p className="form-error" role="alert">
          {addError}
        </p>
      )}
      {!loading &&
        !listError &&
        (filtered.length ? (
          <div className="deck-grid library-grid starter-grid">
            {filtered.map((item) => (
              <article className="panel starter-tile" key={item.key} aria-label={item.title}>
                <div className="starter-tile-top">
                  <Symbol value={item.icon} />
                  <span className="starter-level">{item.level}</span>
                </div>
                <h2>{item.title}</h2>
                <p>{item.description}</p>
                <small>{cardCount(item.count)}</small>
                {item.addedDeckId && (
                  <span className="starter-added">
                    <Check size={16} />
                    {text.added}
                  </span>
                )}
                <div className="starter-actions">
                  <button
                    className="secondary"
                    onClick={() => {
                      setAddError('');
                      setSelected(item);
                    }}
                  >
                    {text.preview}
                  </button>
                  {action(item)}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h2>{text.empty}</h2>
            <button
              className="secondary"
              onClick={() => {
                setQuery('');
                setLevel('all');
              }}
            >
              {text.reset}
            </button>
          </div>
        ))}
      {selected && (
        <Modal title={selected.title} close={close}>
          <p>{text.original}</p>
          {detailError ? (
            <div className="form-error" role="alert">
              <p>{detailError}</p>
              <button className="secondary" onClick={() => setPreviewRetry((value) => value + 1)}>
                {text.retry}
              </button>
            </div>
          ) : !detail ? (
            <p role="status">{text.previewLoading}</p>
          ) : (
            <div className="starter-preview">
              {detail.cards.map((card, index) => (
                <div className="starter-preview-row" key={index}>
                  <strong lang="en">{card.term}</strong>
                  <span lang="ru">{card.definition}</span>
                </div>
              ))}
            </div>
          )}
          {addError && (
            <p className="form-error" role="alert">
              {addError}
            </p>
          )}
          <div className="modal-actions">{action(selected)}</div>
        </Modal>
      )}
    </>
  );
}
