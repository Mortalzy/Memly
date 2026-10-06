import { useState } from 'react';
import { ArrowLeft, Plus, Trash2, LockKeyhole } from 'lucide-react';
import type { Card, Deck } from '../entities/deck';
import { PageHeading } from '../shared/ui';
import { ru } from '../shared/ru';

export function Editor({
  deck,
  back,
  save,
}: {
  deck?: Deck;
  back: () => void;
  save: (deck: Deck) => void;
}) {
  const [title, setTitle] = useState(deck?.title ?? '');
  const [description, setDescription] = useState(deck?.description ?? '');
  const [cards, setCards] = useState<Card[]>(
    deck?.cards ?? [
      { id: 'first', term: '', definition: '' },
      { id: 'second', term: '', definition: '' },
    ],
  );
  const [error, setError] = useState(false);
  const update = (id: string, key: 'term' | 'definition', value: string) =>
    setCards((items) => items.map((item) => (item.id === id ? { ...item, [key]: value } : item)));
  return (
    <>
      <button className="back-link" onClick={back}>
        <ArrowLeft size={17} />
        {ru.toLibrary}
      </button>
      <PageHeading title={deck ? ru.editTitle : ru.create} subtitle={ru.createHint} />
      <form
        className="editor"
        onSubmit={(event) => {
          event.preventDefault();
          const filled = cards.filter((card) => card.term.trim() && card.definition.trim());
          if (!title.trim() || filled.length < 2) {
            setError(true);
            return;
          }
          save({
            id: deck?.id ?? crypto.randomUUID(),
            title: title.trim(),
            description,
            icon: deck?.icon ?? 'book',
            count: filled.length,
            progress: deck?.progress ?? 0,
            folder: deck?.folder ?? 'development',
            favorite: deck?.favorite ?? false,
            cards: filled,
          });
        }}
      >
        <section className="panel editor-info">
          <label>
            {ru.deckName}
            <input
              value={title}
              maxLength={100}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={ru.deckPlaceholder}
            />
          </label>
          <label>
            {ru.description}
            <textarea
              value={description}
              maxLength={500}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={ru.descriptionPlaceholder}
              rows={2}
            />
          </label>
          <div className="editor-meta">
            <label>
              {ru.visibility}
              <span className="privacy-label">
                <LockKeyhole size={16} />
                {ru.private}
              </span>
            </label>
            <label>
              {ru.termLanguage}
              <select defaultValue="en">
                <option value="en">{ru.english}</option>
                <option value="ru">{ru.russian}</option>
              </select>
            </label>
            <label>
              {ru.definitionLanguage}
              <select defaultValue="ru">
                <option value="ru">{ru.russian}</option>
                <option value="en">{ru.english}</option>
              </select>
            </label>
          </div>
        </section>
        <div className="section-heading">
          <h2>{ru.cards}</h2>
          <span className="muted">{cards.length}</span>
        </div>
        <div className="editor-cards">
          {cards.map((card, i) => (
            <section className="panel editor-card" key={card.id}>
              <div className="editor-card-top">
                <span>{i + 1}</span>
                <button
                  type="button"
                  className="icon-button"
                  disabled={cards.length <= 2}
                  aria-label={ru.removeCard}
                  onClick={() => setCards((items) => items.filter((item) => item.id !== card.id))}
                >
                  <Trash2 size={17} />
                </button>
              </div>
              <div className="editor-card-fields">
                <label>
                  {ru.term}
                  <textarea
                    rows={2}
                    value={card.term}
                    onChange={(event) => update(card.id, 'term', event.target.value)}
                    placeholder={ru.enterTerm}
                  />
                </label>
                <label>
                  {ru.definition}
                  <textarea
                    rows={2}
                    value={card.definition}
                    onChange={(event) => update(card.id, 'definition', event.target.value)}
                    placeholder={ru.enterDefinition}
                  />
                </label>
              </div>
            </section>
          ))}
        </div>
        <button
          type="button"
          className="add-card"
          onClick={() =>
            setCards((items) => [...items, { id: crypto.randomUUID(), term: '', definition: '' }])
          }
        >
          <Plus size={19} />
          {ru.addCard}
        </button>
        {error && (
          <p className="form-error" role="alert">
            {ru.validation}
          </p>
        )}
        <div className="editor-footer">
          <button type="button" className="secondary" onClick={back}>
            {ru.cancel}
          </button>
          <button className="primary" type="submit">
            {ru.saveDeck}
          </button>
        </div>
      </form>
    </>
  );
}
