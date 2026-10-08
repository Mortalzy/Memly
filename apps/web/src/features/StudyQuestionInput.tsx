import type { StudyQuestion } from '@memly/contracts';
import { studyText as text } from '../shared/study-text';
export function QuestionInput({
  question,
  value,
  change,
  disabled,
}: {
  question: StudyQuestion;
  value: string;
  change: (value: string) => void;
  disabled: boolean;
}) {
  return question.type === 'choice' ? (
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
          <span>{String.fromCharCode(65 + index)}</span>
          {option.text}
        </button>
      ))}
    </div>
  ) : (
    <label>
      {text.write}
      <textarea
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
