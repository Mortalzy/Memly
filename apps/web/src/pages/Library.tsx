import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import type { Deck } from '../entities/deck';
import { DeckTile } from '../entities/DeckTile';
import type { DeckActions } from './Home';
import { PageHeading } from '../shared/ui';
import { deckCount, ru } from '../shared/ru';

export function Library({
  decks,
  actions,
  query,
  setQuery,
  create,
  folderTitle,
  viewerId,
}: {
  decks: Deck[];
  actions: DeckActions;
  query: string;
  setQuery: (value: string) => void;
  create: () => void;
  folderTitle?: string;
  viewerId?: string;
}) {
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('recent');
  const filtered = decks.filter(
    (deck) =>
      `${deck.title} ${deck.description}`
        .toLocaleLowerCase('ru')
        .includes(query.toLocaleLowerCase('ru')) &&
      (filter !== 'favorites' || deck.favorite) &&
      (filter !== 'mine' || !viewerId || deck.ownerId === viewerId),
  );
  if (sort === 'name') filtered.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  return (
    <>
      <PageHeading
        title={folderTitle ?? ru.library}
        subtitle={ru.libraryHint}
        action={
          <button className="primary" onClick={create}>
            <Plus size={18} />
            {ru.create}
          </button>
        }
      />
      <div className="library-toolbar">
        <div className="tabs">
          {(['all', 'mine', 'favorites'] as const).map((key) => (
            <button
              key={key}
              className={filter === key ? 'active' : ''}
              onClick={() => setFilter(key)}
            >
              {ru[key]}
              {key === 'all' && <span>{decks.length}</span>}
            </button>
          ))}
        </div>
        <label className="sort-control">
          <span className="sr-only">{ru.sort}</span>
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="recent">{ru.recent}</option>
            <option value="name">{ru.alphabetical}</option>
          </select>
        </label>
      </div>
      <div className="library-count">{deckCount(filtered.length)}</div>
      {filtered.length ? (
        <div className="deck-grid library-grid">
          {filtered.map((deck) => (
            <DeckTile
              key={deck.id}
              deck={deck}
              open={() => actions.open(deck.id)}
              edit={() => actions.edit(deck.id)}
              canEdit={!viewerId || deck.ownerId === viewerId}
              toggleFavorite={() => actions.favorite(deck.id)}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <span className="empty-icon">
            <Search size={34} />
          </span>
          <h2>{ru.empty}</h2>
          <p>{ru.emptyHint}</p>
          <button
            className="secondary"
            onClick={() => {
              setQuery('');
              setFilter('all');
            }}
          >
            {ru.resetSearch}
          </button>
        </div>
      )}
    </>
  );
}
