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
        {mode === 'learn' && (!options.learnMethod || options.learnMethod === 'learn') && (
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
        {mode === 'learn' && (
          <label>
            {text.learnMethod}
            <select
              value={options.learnMethod ?? 'learn'}
              disabled={pending}
              onChange={(event) =>
                updateOptions({ learnMethod: event.target.value as StudyOptions['learnMethod'] })
              }
            >
              <option value="learn">{text.learn}</option>
              <option value="write">{text.writeMode}</option>
              <option value="spell">{text.spell}</option>
            </select>
          </label>
        )}
        <label>
          {text.count}
          <input
            readOnly={mode === 'match'}
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
            <option value="starred">{text.starred}</option>
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
      {mode === 'cards' && (
        <label className="study-checkbox">
          <input
            type="checkbox"
            checked={options.cardSorting ?? true}
            disabled={pending}
            onChange={(event) => updateOptions({ cardSorting: event.target.checked })}
          />
          {text.cardSorting}
        </label>
      )}
      {mode === 'test' && (
        <fieldset className="test-type-settings">
          <legend>{text.testTypes}</legend>
          {(['written', 'choice', 'truefalse', 'matching'] as const).map((type) => (
            <label className="study-checkbox" key={type}>
              <input
                type="checkbox"
                disabled={pending}
                checked={options.testTypes?.includes(type) ?? false}
                onChange={(event) => {
                  const types = options.testTypes ?? [];
                  const next = event.target.checked
                    ? [...types, type]
                    : types.filter((item) => item !== type);
                  if (next.length) updateOptions({ testTypes: next });
                }}
              />
              {text[type]}
            </label>
          ))}
        </fieldset>
      )}
      {(mode === 'learn' || mode === 'test') && (
        <>
          <label>
            {text.grading}
            <select
              value={options.grading ?? 'strict'}
              disabled={pending}
              onChange={(event) =>
                updateOptions({ grading: event.target.value as StudyOptions['grading'] })
              }
            >
              <option value="strict">{text.strict}</option>
              <option value="typos">{text.typos}</option>
            </select>
          </label>
          {options.grading === 'typos' && <p>{text.gradingHint}</p>}
          <label className="study-checkbox">
            <input
              type="checkbox"
              checked={options.singleAnswer ?? false}
              disabled={pending}
              onChange={(event) => updateOptions({ singleAnswer: event.target.checked })}
            />
            {text.singleAnswer}
          </label>
        </>
      )}
      {mode === 'learn' && (
        <>
          <label className="study-checkbox">
            <input
              type="checkbox"
              checked={options.retype ?? false}
              disabled={pending}
              onChange={(event) => updateOptions({ retype: event.target.checked })}
            />
            {text.retype}
          </label>
          {options.learnMethod === 'spell' && (
            <>
              <p>{text.spellHint}</p>
              <label className="study-checkbox">
                <input
                  type="checkbox"
                  disabled={pending}
                  checked={options.audioSpeed === 0.7}
                  onChange={(event) =>
                    updateOptions({ audioSpeed: event.target.checked ? 0.7 : 1 })
                  }
                />
                {text.slowAudio}
              </label>
            </>
          )}
        </>
      )}
      <button className="primary" disabled={pending || !available}>
        {pending ? text.saving : mode === 'match' ? text.matchStart : text.start}
        <ArrowRight size={17} />
      </button>
    </form>
  );
}
