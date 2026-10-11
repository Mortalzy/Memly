import type { StudyQuestion } from '@memly/contracts';
import { studyText as text } from '../shared/study-text';
export function QuestionInput({
  question,
  value,
  change,
  disabled,
  submit,
}: {
  question: StudyQuestion;
  value: string;
  change: (value: string) => void;
  disabled: boolean;
  submit?: () => void;
}) {
  if (question.type === 'matching')
    return (
      <label>
        {text.matching}
        <select value={value} disabled={disabled} onChange={(event) => change(event.target.value)}>
          <option value="">{text.matchingPlaceholder}</option>
          {question.options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.text}
            </option>
          ))}
        </select>
      </label>
    );
  return question.type === 'choice' || question.type === 'truefalse' ? (
    <div className="answer-grid">
      {question.options.map((option, index) => (
        <button
          type="button"
          className={`answer-option ${value === option.id ? 'selected' : ''}`}
          key={option.id}
          disabled={disabled}
          aria-pressed={value === option.id}
          onClick={() => change(option.id)}
        >
          {question.type === 'choice' && <span>{String.fromCharCode(65 + index)}</span>}
          {option.text}
        </button>
      ))}
    </div>
  ) : (
    <label>
      {text.write}
      <textarea
        autoFocus={Boolean(submit)}
        onKeyDown={(event) => {
          if (submit && event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (value.trim() && !disabled) submit();
          }
        }}
        rows={2}
        maxLength={5000}
        value={value}
        disabled={disabled}
        onChange={(event) => change(event.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
    </label>
  );
}
