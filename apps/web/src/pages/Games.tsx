import { ArrowRight, Clock3, Grid2X2 } from 'lucide-react';
import { PageHeading } from '../shared/ui';
import { scanwordText as text } from '../shared/scanword-text';

export function Games({ openLevels }: { openLevels: () => void }) {
  return (
    <div className="games-page">
      <PageHeading title={text.games} subtitle={text.gamesHint} />
      <section className="panel game-card">
        <div className="game-card-art" aria-hidden="true">
          <Grid2X2 size={64} strokeWidth={1.3} />
          <span>А</span>
          <span>Б</span>
        </div>
        <div className="game-card-copy">
          <span className="eyebrow">Memly · {text.fiveLevels}</span>
          <h2>{text.levelsTitle}</h2>
          <p>{text.description}</p>
          <div className="game-card-meta">
            <Clock3 size={17} />
            {text.unlimited.split('.')[0]}
          </div>
          <button className="primary" onClick={openLevels}>
            {text.openLevels}
            <ArrowRight size={18} />
          </button>
        </div>
      </section>
    </div>
  );
}
