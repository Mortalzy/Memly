import { ArrowRight, Play } from 'lucide-react';
import type { Deck, StudyMode } from '../entities/deck';
import { DeckTile } from '../entities/DeckTile';
import { Modes, ProgressBar, Stats } from '../shared/ui';
import { cardCount, ru } from '../shared/ru';

export interface DeckActions {
  open: (id: string) => void;
  edit: (id: string) => void;
  favorite: (id: string) => void;
}
export function Home({
  decks,
  actions,
  study,
  library,
  progress,
  userName,
  live = false,
  stats,
}: {
  decks: Deck[];
  actions: DeckActions;
  study: (mode: StudyMode) => void;
  library: () => void;
  progress: () => void;
  userName?: string;
  live?: boolean;
  stats?: import('@memly/contracts').ProgressDto;
}) {
  const current = live ? decks[0] : decks.find((deck) => deck.id === 'english');
  return (
    <>
      <div className="welcome">
        <h1>{userName ? `Привет, ${userName}!` : ru.greeting}</h1>
        <p>{ru.subtitle}</p>
      </div>
      <section className="continue-card">
        <div className="continue-content">
          <span className="eyebrow">{ru.continueLabel}</span>
          <h2>{current?.title ?? 'Создайте первый набор'}</h2>
          <p>
            {cardCount(current?.count ?? 0)}
            <span className="dot">·</span>
            {live ? 'Карточки для вашего следующего занятия' : ru.studyMeta}
          </p>
          <div className="hero-progress">
            <ProgressBar value={current?.progress ?? 0} />
            <span>{current?.progress ?? 0}%</span>
          </div>
          <button className="primary" onClick={() => study('cards')}>
            <Play size={18} fill="currentColor" />
            {current ? ru.continue : ru.create}
          </button>
        </div>
        <div className="cards-illustration" aria-hidden="true">
          <div />
          <div />
          <div>
            <i />
            <i />
          </div>
        </div>
      </section>
      <section>
        <div className="section-heading">
          <h2>{ru.chooseMode}</h2>
        </div>
        <Modes onSelect={study} active="cards" />
      </section>
      <section>
        <div className="section-heading">
          <h2>{ru.yourDecks}</h2>
          <button className="text-button" onClick={library}>
            {ru.allDecks}
            <ArrowRight size={18} />
          </button>
        </div>
        <div className="deck-grid">
          {decks.slice(0, 3).map((deck) => (
            <DeckTile
              key={deck.id}
              deck={deck}
              open={() => actions.open(deck.id)}
              edit={() => actions.edit(deck.id)}
              toggleFavorite={() => actions.favorite(deck.id)}
            />
          ))}
        </div>
      </section>
      <section className="weekly-card">
        <div className="section-heading">
          <h2>{live ? 'Ваш прогресс' : ru.week}</h2>
          <button className="text-button" onClick={progress}>
            {ru.allStats}
            <ArrowRight size={18} />
          </button>
        </div>
        {live ? (
          <p>
            {stats
              ? `Повторений: ${stats.reviewed} · Известных карточек: ${stats.known} · Наборов: ${stats.decks}`
              : 'Загружаем прогресс…'}
          </p>
        ) : (
          <Stats />
        )}
      </section>
    </>
  );
}
