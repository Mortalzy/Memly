import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { ActivityDay } from '@memly/contracts';
import { chartScale, progressDate, progressText as text } from '../shared/progress-text';

export function ActivityChart({ days, today }: { days: ActivityDay[]; today: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const scale = chartScale(Math.max(0, ...days.map((day) => day.completed)));
  const month = days.length > 7;
  return (
    <>
      <div className="activity-chart-scroll" role="group" aria-label={text.activity}>
        <div className={`activity-chart ${month ? 'activity-chart-month' : ''}`}>
          <div className="activity-grid" aria-hidden="true">
            {scale.ticks.map((value) => (
              <div key={value} style={{ bottom: `${(value / scale.maximum) * 100}%` }}>
                <span>{value}</span>
              </div>
            ))}
          </div>
          <div className="activity-columns">
            {days.map((day) => {
              const date = progressDate(day.date, { day: 'numeric', month: 'long' });
              const label = `${date} · ${text.runCount(day.completed)}`;
              return (
                <button
                  key={day.date}
                  className={`activity-column ${day.date === today ? 'is-today' : ''} ${selected === day.date ? 'is-selected' : ''}`}
                  aria-label={label}
                  aria-pressed={selected === day.date}
                  onClick={() => setSelected((value) => (value === day.date ? null : day.date))}
                  style={
                    {
                      '--activity-height': `${(day.completed / scale.maximum) * 100}%`,
                    } as CSSProperties
                  }
                >
                  <span className={`activity-bar ${day.completed === 0 ? 'is-zero' : ''}`}>
                    <span className="activity-number" aria-hidden="true">
                      {day.completed}
                    </span>
                    <span className="activity-tooltip" aria-hidden="true">
                      {label}
                    </span>
                  </span>
                  <span className="activity-date" aria-hidden="true">
                    {progressDate(
                      day.date,
                      month ? { day: 'numeric' } : { weekday: 'short', day: 'numeric' },
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <p className="activity-chart-hint">{text.chartHint}</p>
    </>
  );
}
