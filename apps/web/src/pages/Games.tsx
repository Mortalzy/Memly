import { useState } from 'react';
import { ArrowRight, Clock3, Grid2X2, Search } from 'lucide-react';
import { scanwordCandidates } from '@memly/contracts';
import type { Deck } from '../entities/deck';
import { PageHeading, Symbol } from '../shared/ui';
import { scanwordText as text } from '../shared/scanword-text';

export function Games({
  decks,
  play,
  library,
}: {
  decks: Deck[];
  play: (id: string) => void;
  library: () => void;
}) {
  const [query, setQuery] = useState('');
  const [choosing, setChoosing] = useState(false);
  const matching = decks.filter((deck) =>
    deck.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <div className="games-page">
      <PageHeading title={text.games} subtitle={text.gamesHint} />
      <section className="panel game-card">
        <div className="game-card-art" aria-hidden="true">
          <Grid2X2 size={64} strokeWidth={1.3} />
          <span>A</span>
          <span>B</span>
        </div>
        <div className="game-card-copy">
          <span className="eyebrow">Memly</span>
          <h2>{text.title}</h2>
          <p>{text.description}</p>
          <div className="game-card-meta">
            <Clock3 size={17} />
            {text.unlimited.split('.')[0]}
          </div>
          <button className="primary" aria-expanded={choosing} onClick={() => setChoosing(true)}>
            {text.choose}
            <ArrowRight size={18} />
          </button>
        </div>
      </section>
      {choosing && (
        <section className="panel game-decks">
          <h2>{decks.length ? text.choose : text.noDecks}</h2>
          <p>{text.chooseHint}</p>
          {decks.length > 0 && (
            <label className="search-box">
              <Search size={18} />
              <input
                aria-label={text.search}
                placeholder={text.search}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          )}
          <div className="game-deck-list">
            {matching.map((deck) => {
              const available = Math.max(
                scanwordCandidates(deck.cards, 'reverse').eligible.length,
                scanwordCandidates(deck.cards, 'forward').eligible.length,
              );
              return (
                <button
                  className="game-deck"
                  key={deck.id}
                  disabled={!available}
                  onClick={() => play(deck.id)}
                >
                  <Symbol value={deck.icon} />
                  <span>
                    <strong>{deck.title}</strong>
                    <small>{text.ready(available, deck.cards.length)}</small>
                  </span>
                  <ArrowRight size={18} />
                </button>
              );
            })}
          </div>
          {!matching.length && decks.length > 0 && <p>{text.noResults}</p>}
          <button className="text-button" onClick={library}>
            {text.library}
            <ArrowRight size={16} />
          </button>
        </section>
      )}
    </div>
  );
}
