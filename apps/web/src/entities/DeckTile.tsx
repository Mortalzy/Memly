import { useState } from 'react';
import { Ellipsis, Star } from 'lucide-react';
import type { Deck } from './deck';
import { ProgressBar, Symbol } from '../shared/ui';
import { cardCount, ru } from '../shared/ru';

export function DeckTile({
  deck,
  open,
  edit,
  toggleFavorite,
}: {
  deck: Deck;
  open: () => void;
  edit: () => void;
  toggleFavorite: () => void;
}) {
  const [menu, setMenu] = useState(false);
  return (
    <article className="deck-tile">
      <button className="deck-open" onClick={open}>
        <div className="deck-summary">
          <Symbol value={deck.icon} />
          <div>
            <h3>{deck.title}</h3>
            <p>{cardCount(deck.count)}</p>
          </div>
        </div>
        <div className="deck-progress">
          <ProgressBar value={deck.progress} />
          <span>{deck.progress}%</span>
        </div>
      </button>
      <button
        className="icon-button deck-menu-button"
        aria-label={ru.deckMenu}
        aria-expanded={menu}
        onClick={() => setMenu(!menu)}
      >
        <Ellipsis size={21} />
      </button>
      {menu && (
        <>
          <button className="menu-dismiss" aria-label={ru.close} onClick={() => setMenu(false)} />
          <div className="popover deck-popover">
            <button
              onClick={() => {
                toggleFavorite();
                setMenu(false);
              }}
            >
              <Star size={17} />
              {deck.favorite ? ru.unfavorite : ru.favorite}
            </button>
            <button
              onClick={() => {
                edit();
                setMenu(false);
              }}
            >
              {ru.edit}
            </button>
          </div>
        </>
      )}
    </article>
  );
}
