import { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, CheckCircle2, Flame, GraduationCap } from 'lucide-react';
import type { StudyActivity, StudyHistoryItem, StudyMode } from '@memly/contracts';
import { Icon, PageHeading, modes } from '../shared/ui';
import { studyClient } from '../features/study-client';
import { StudyHistory } from '../features/StudyHistory';
import { ActivityChart } from '../features/ActivityChart';
import { progressDemo } from '../features/progress-demo';
import { errorMessage } from '../shared/api';
import { browserDate, progressDate, progressText as text } from '../shared/progress-text';
import { ru } from '../shared/ru';

export function Progress({
  live = false,
  openSession,
}: {
  live?: boolean;
  openSession?: (item: StudyHistoryItem) => void;
}) {
  const [days, setDays] = useState<7 | 30>(7);
  const [mode, setMode] = useState<StudyMode | ''>('');
  const [data, setData] = useState<StudyActivity | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [date, setDate] = useState(browserDate);
  const [expanded, setExpanded] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  useEffect(() => {
    const abort = new AbortController();
    setData(null);
    setError('');
    setExpanded(false);
    const query = { days, timeZone, ...(mode ? { mode } : {}) };
    if (!live) {
      setData(progressDemo(query));
      return;
    }
    studyClient
      .activity(query, abort.signal)
      .then((result) => {
        if (!abort.signal.aborted) setData(result);
      })
      .catch((failure) => {
        if (!abort.signal.aborted) setError(errorMessage(failure));
      });
    return () => abort.abort();
  }, [days, mode, timeZone, live, attempt, date]);
  useEffect(() => {
    const timer = window.setInterval(() => setDate(browserDate()), 60000);
    const refresh = () => {
      setDate(browserDate());
      setAttempt((value) => value + 1);
    };
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  const todayCount = data
    ? Object.values(data.todayByMode).reduce((sum, value) => sum + value, 0)
    : 0;
  const range = data
    ? `${progressDate(data.days[0].date, { day: 'numeric', month: 'short' })} — ${progressDate(data.today, { day: 'numeric', month: 'short', year: 'numeric' })}`
    : '';
  return (
    <div className="progress-page">
      <PageHeading
        title={text.title}
        subtitle={text.subtitle}
        action={
          <div className="progress-period">
            <div className="segmented" aria-label={text.period}>
              {[7, 30].map((value) => (
                <button
                  key={value}
                  aria-pressed={days === value}
                  className={days === value ? 'active' : ''}
                  onClick={() => setDays(value as 7 | 30)}
                >
                  {value === 7 ? text.week : text.month}
                </button>
              ))}
            </div>
            <span>{range}</span>
          </div>
        }
      />
      {!live && <p className="progress-demo-note">{text.demo}</p>}
      {error ? (
        <section className="panel progress-status" role="alert">
          <p>{error}</p>
          <button className="secondary" onClick={() => setAttempt((value) => value + 1)}>
            {text.retry}
          </button>
        </section>
      ) : !data ? (
        <section className="panel progress-status" role="status">
          {text.loading}
        </section>
      ) : (
        <>
          <section className="progress-metrics" aria-label={text.title}>
            {[
              { icon: GraduationCap, value: data.completed, label: text.completed },
              {
                icon: CalendarDays,
                value: `${data.activeDays} из ${days}`,
                label: text.activeDays,
              },
              {
                icon: Flame,
                value: text.dayCount(data.streak),
                label: text.streak,
                hint: text.streakHint,
              },
            ].map((metric) => (
              <div className="panel progress-metric" key={metric.label} title={metric.hint}>
                <span className="progress-metric-icon">
                  <metric.icon size={27} strokeWidth={1.6} aria-hidden="true" />
                </span>
                <div>
                  <strong>{metric.value}</strong>
                  <span>{metric.label}</span>
                </div>
              </div>
            ))}
          </section>
          <div className="progress-dashboard">
            <section className="panel progress-activity">
              <div className="section-heading">
                <div>
                  <h2>{text.activity}</h2>
                  <p>{text.activityHint}</p>
                </div>
                <label className="progress-mode">
                  <span className="sr-only">{text.mode}</span>
                  <select
                    value={mode}
                    onChange={(event) => setMode(event.target.value as StudyMode | '')}
                  >
                    <option value="">{text.allModes}</option>
                    {modes.map((value) => (
                      <option key={value} value={value}>
                        {ru[value]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <ActivityChart key={`${days}:${mode}`} days={data.days} today={data.today} />
              <p className="progress-rule" title={text.ruleHint}>
                <CheckCircle2 size={18} aria-hidden="true" />
                {text.rule}
              </p>
              {data.completed === 0 && (
                <div className="progress-empty">
                  <strong>{text.empty}</strong>
                  <p>{text.emptyHint}</p>
                </div>
              )}
            </section>
            <section className="panel progress-today">
              <h2>{text.today}</h2>
              <strong className="progress-today-value">{todayCount}</strong>
              <p>{text.todayHint}</p>
              <div className="progress-mode-counts">
                {modes.map((value) => (
                  <div key={value}>
                    <Icon name={value} size={23} />
                    <span>{ru[value]}</span>
                    <strong>{data.todayByMode[value]}</strong>
                  </div>
                ))}
              </div>
              <div className="progress-streak-status">
                <Flame size={24} aria-hidden="true" />
                <span>
                  {todayCount ? text.keepStreak : data.streak ? text.startToday : text.startStreak}
                </span>
              </div>
            </section>
          </div>
          <section className="panel progress-history">
            <div className="section-heading">
              <h2>{text.history}</h2>
              {data.history.length > 5 && (
                <button className="text-button" onClick={() => setExpanded((value) => !value)}>
                  {expanded ? text.collapse : text.allResults}
                  <ArrowRight size={16} />
                </button>
              )}
            </div>
            {data.history.length ? (
              data.history.slice(0, expanded ? 30 : 5).map((item) => (
                <article key={item.id} className="progress-history-row">
                  <h3>{item.deckTitle}</h3>
                  <span className={`progress-mode-tag mode-${item.mode}`}>{ru[item.mode]}</span>
                  <time dateTime={item.completedAt!}>
                    {new Date(item.completedAt!).toLocaleString('ru-RU', {
                      timeZone: data.timeZone,
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                  {openSession && (
                    <button
                      className="text-button"
                      aria-label={`${text.result}: ${item.deckTitle}`}
                      onClick={() => openSession(item)}
                    >
                      {text.result}
                      <ArrowRight size={16} />
                    </button>
                  )}
                </article>
              ))
            ) : (
              <p className="progress-history-empty">
                {mode ? text.noModeHistory : text.emptyHistory}
              </p>
            )}
          </section>
          {live && openSession && (
            <details
              className="progress-all-history"
              onToggle={(event) => setHistoryExpanded(event.currentTarget.open)}
            >
              <summary>{text.fullHistory}</summary>
              {historyExpanded && <StudyHistory open={openSession} />}
            </details>
          )}
        </>
      )}
    </div>
  );
}
