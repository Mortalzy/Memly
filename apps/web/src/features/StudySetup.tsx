import { ArrowRight } from 'lucide-react';
import type { StudyMode, StudyOptions } from '@memly/contracts';
import { studyText as text } from '../shared/study-text';
export function StudySetup({
  mode,
  options,
  pending,
  available,
  updateOptions,
  onStart,
}: {
  mode: StudyMode;
  options: StudyOptions;
  pending: boolean;
  available: number;
  updateOptions: (next: Partial<StudyOptions>) => void;
  onStart: () => void;
}) {
  return (
    <form
      className="panel study-setup"
      onSubmit={(event) => {
        event.preventDefault();
        onStart();
      }}
    >
      <h2>{text.setup}</h2>
      <p>{text.setupHint}</p>
      <div className="study-settings-grid">
        <label>
          {text.direction}
          <select
            value={options.direction}
            disabled={pending}
            onChange={(event) =>
              updateOptions({ direction: event.target.value as StudyOptions['direction'] })
            }
          >
            <option value="forward">{text.forward}</option>
            <option value="reverse">{text.reverse}</option>
          </select>
        </label>
        {(mode === 'test' || mode === 'learn') && (
          <label>
            {text.answerType}
            <select
              value={options.answerType}
              disabled={pending}
              onChange={(event) =>
                updateOptions({
                  answerType: event.target.value as StudyOptions['answerType'],
                })
              }
            >
              {(['mixed', 'choice', 'written'] as const).map((type) => (
                <option key={type} value={type}>
                  {text[type]}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          {text.count}
          <input
            type="number"
            min={1}
            max={available}
            value={options.count}
            disabled={pending}
            required
            onChange={(event) => updateOptions({ count: Number(event.target.value) })}
          />
        </label>
        <label>
          {text.filter}
          <select
            value={options.filter}
            disabled={pending}
            onChange={(event) =>
              updateOptions({ filter: event.target.value as StudyOptions['filter'] })
            }
          >
            <option value="all">{text.all}</option>
            <option value="learning">{text.learning}</option>
          </select>
        </label>
      </div>
      <label className="study-checkbox">
        <input
          type="checkbox"
          checked={options.shuffle}
          disabled={pending}
          onChange={(event) => updateOptions({ shuffle: event.target.checked })}
        />
        {text.shuffle}
      </label>
      <button className="primary" disabled={pending || !available}>
        {pending ? text.saving : text.start}
        <ArrowRight size={17} />
      </button>
    </form>
  );
}
