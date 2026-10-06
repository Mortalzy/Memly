import { useState } from 'react';
import { Flame, ArrowRight, Check } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Deck } from '../entities/deck';
import { PageHeading, ProgressBar, Stats, Symbol } from '../shared/ui';
import { ru } from '../shared/ru';

const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export function Progress({ decks, open }: { decks: Deck[]; open: (id: string) => void }) {
  const [month, setMonth] = useState(false);
  const bars = month ? [42, 62, 35, 80, 66, 45, 85] : [35, 61, 48, 79, 64, 20, 9];
  return (
    <>
      <PageHeading
        title={ru.progress}
        subtitle={ru.progressHint}
        action={
          <div className="segmented">
            <button className={!month ? 'active' : ''} onClick={() => setMonth(false)}>
              {ru.thisWeek}
            </button>
            <button className={month ? 'active' : ''} onClick={() => setMonth(true)}>
              {ru.thisMonth}
            </button>
          </div>
        }
      />
      <section className="weekly-card standalone">
        <Stats />
      </section>
      <div className="progress-layout">
        <section className="panel activity-panel">
          <div className="section-heading">
            <div>
              <h2>{ru.activity}</h2>
              <p>{ru.activityHint}</p>
            </div>
            <span className="badge">
              {month ? '512' : '126'} {ru.cardsNoun}
            </span>
          </div>
          <div className="chart" aria-label={ru.activity}>
            {bars.map((height, i) => (
              <div className="chart-column" key={days[i]}>
                <span className="chart-number">{Math.round(height * (month ? 2 : 0.45))}</span>
                <div style={{ '--bar-height': `${height}%` } as CSSProperties} />
                <small>{days[i]}</small>
              </div>
            ))}
          </div>
        </section>
        <section className="panel goal-panel">
          <h2>{ru.dailyGoal}</h2>
          <div className="goal-ring">
            <div>
              <strong>
                {month ? '24' : '16'}
                <span>/ {month ? '30' : '20'}</span>
              </strong>
              <small>{month ? ru.days : ru.cardsNoun}</small>
            </div>
          </div>
          <p>{month ? ru.goalMonthHint : ru.goalHint}</p>
          <button className="text-button" onClick={() => open('english')}>
            {ru.keepGoing}
            <ArrowRight size={18} />
          </button>
        </section>
      </div>
      <section className="streak-banner">
        <Flame size={30} />
        <div>
          <h2>{ru.weeklyGoal}</h2>
          <p>{ru.encouragement}</p>
        </div>
        <div className="streak-days">
          {days.slice(0, 5).map((day) => (
            <span key={day}>
              <Check size={14} />
              <small>{day}</small>
            </span>
          ))}
        </div>
      </section>
      <section>
        <div className="section-heading">
          <h2>{ru.deckProgress}</h2>
        </div>
        <div className="panel progress-list">
          {decks.slice(0, 4).map((deck) => (
            <button key={deck.id} onClick={() => open(deck.id)}>
              <Symbol value={deck.icon} />
              <strong>{deck.title}</strong>
              <ProgressBar value={deck.progress} />
              <span>{deck.progress}%</span>
              <ArrowRight size={17} />
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
