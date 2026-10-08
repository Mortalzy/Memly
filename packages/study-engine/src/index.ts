import type {
  CardDto,
  StudyAction,
  StudyFeedback,
  StudyMode,
  StudyOptions,
  StudyQuestion,
  StudyResultRow,
  StudySummary,
} from '@memly/contracts';

interface Question extends StudyQuestion {
  cardIndex: number;
  expected: string;
  stage: number;
}
interface Attempt {
  questionId: string;
  cardIndex: number;
  answer: string;
  correct: boolean;
  first: boolean;
}
interface Round {
  left: number[];
  right: number[];
  matchedLeft: number[];
  matchedRight: number[];
}
export interface StudyState {
  version: 1;
  mode: StudyMode;
  options: StudyOptions;
  cards: CardDto[];
  questions: Question[];
  queue: string[];
  drafts: Record<string, string>;
  ratings: Record<string, boolean>;
  attempts: Attempt[];
  feedback: StudyFeedback | null;
  cursor: number;
  rounds: Round[];
  round: number;
  status: 'active' | 'completed' | 'abandoned';
}
export interface Assessment {
  card: CardDto;
  known: boolean;
}
export class StudyRuleError extends Error {}
const requireRule = (condition: unknown, message: string) => {
  if (!condition) throw new StudyRuleError(message);
};
export function normalizeAnswer(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/\s+/gu, ' ')
    .replace(/[‘’]/gu, "'")
    .replace(/[‐‑–—]/gu, '-');
}
export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function front(card: CardDto, options: StudyOptions): string {
  return options.direction === 'forward' ? card.term : card.definition;
}
function back(card: CardDto, options: StudyOptions): string {
  return options.direction === 'forward' ? card.definition : card.term;
}
export function createStudyState(
  cards: CardDto[],
  mode: StudyMode,
  options: StudyOptions,
  random: () => number,
): StudyState {
  requireRule(cards.length > 0, 'Нет карточек для занятия');
  const selected = (options.shuffle ? shuffle(cards, random) : [...cards]).slice(0, options.count);
  const questions: Question[] = [];
  selected.forEach((card, cardIndex) => {
    const stages = mode === 'learn' && options.answerType === 'mixed' ? 2 : 1;
    for (let stage = 0; stage < stages; stage++) {
      let type: StudyQuestion['type'] =
        mode === 'cards'
          ? 'card'
          : options.answerType === 'written' ||
              (options.answerType === 'mixed' &&
                (mode === 'learn' ? stage === 1 : cardIndex % 2 === 1))
            ? 'written'
            : 'choice';
      const expected = back(card, options);
      const seen = new Set([normalizeAnswer(expected)]);
      const alternatives = shuffle(cards, random)
        .flatMap((other) => {
          const text = back(other, options);
          if (seen.has(normalizeAnswer(text))) return [];
          seen.add(normalizeAnswer(text));
          return [text];
        })
        .slice(0, 3);
      if (type === 'choice' && !alternatives.length) type = 'written';
      const values = shuffle([expected, ...alternatives], random);
      const id = `q-${cardIndex}-${stage}`;
      questions.push({
        id,
        cardIndex,
        stage,
        prompt: front(card, options),
        expected,
        type,
        options:
          type === 'choice' ? values.map((text, index) => ({ id: `${id}-o${index}`, text })) : [],
      });
    }
  });
  const rounds: Round[] = [];
  for (let start = 0; start < selected.length; start += 6) {
    const indices = Array.from(
      { length: Math.min(6, selected.length - start) },
      (_, i) => start + i,
    );
    rounds.push({
      left: shuffle(indices, random),
      right: shuffle(indices, random),
      matchedLeft: [],
      matchedRight: [],
    });
  }
  return {
    version: 1,
    mode,
    options,
    cards: selected,
    questions,
    queue: questions.filter((q) => q.stage === 0).map((q) => q.id),
    drafts: {},
    ratings: {},
    attempts: [],
    feedback: null,
    cursor: 0,
    rounds,
    round: 0,
    status: 'active',
  };
}
function evaluate(question: Question, value: string): { answer: string; correct: boolean } {
  const option = question.options.find((option) => option.id === value);
  if (question.type === 'choice') requireRule(option, 'Выберите один из предложенных ответов');
  const answer = question.type === 'choice' ? option!.text : value.trim();
  requireRule(Boolean(answer.trim()), 'Введите ответ');
  return { answer, correct: normalizeAnswer(answer) === normalizeAnswer(question.expected) };
}
function attempt(state: StudyState, question: Question, answer: string, correct: boolean): void {
  state.attempts.push({
    questionId: question.id,
    cardIndex: question.cardIndex,
    answer,
    correct,
    first: !state.attempts.some((item) => item.questionId === question.id),
  });
}
export function applyStudyAction(
  original: StudyState,
  action: StudyAction,
): { state: StudyState; assessments: Assessment[] } {
  const state = structuredClone(original);
  requireRule(state.status === 'active', 'Занятие уже завершено');
  requireRule(
    state.attempts.length < 5000 || action.type === 'abandon',
    'Слишком много попыток. Начните новое занятие.',
  );
  const assessments: Assessment[] = [];
  if (action.type === 'abandon') {
    state.status = 'abandoned';
    return { state, assessments };
  }
  if (action.type === 'navigate') {
    requireRule(
      state.mode === 'cards' && action.index < state.questions.length,
      'Недопустимый переход',
    );
    state.cursor = action.index;
  } else if (action.type === 'rate') {
    requireRule(state.mode === 'cards', 'Самооценка доступна в режиме карточек');
    const q = state.questions.find((q) => q.id === action.questionId);
    requireRule(q, 'Карточка не найдена');
    state.ratings[q!.id] = action.known;
    attempt(state, q!, action.known ? 'Знаю' : 'Ещё учу', action.known);
    assessments.push({ card: state.cards[q!.cardIndex], known: action.known });
    const next = state.questions.findIndex((q) => state.ratings[q.id] === undefined);
    if (next === -1) state.status = 'completed';
    else state.cursor = next;
  } else if (action.type === 'answer') {
    requireRule(
      state.mode === 'learn' && !state.feedback && action.questionId === state.queue[0],
      'Ответ относится к другому вопросу',
    );
    const q = state.questions.find((q) => q.id === action.questionId)!;
    const { answer, correct } = evaluate(q, action.value);
    attempt(state, q, answer, correct);
    state.feedback = { prompt: q.prompt, expected: q.expected, answer, correct };
    state.queue.shift();
    if (!correct) state.queue.push(q.id);
    else if (q.stage === 0 && state.options.answerType === 'mixed')
      state.queue.push(`q-${q.cardIndex}-1`);
    assessments.push({
      card: state.cards[q.cardIndex],
      known: correct && !(state.options.answerType === 'mixed' && q.stage === 0),
    });
    if (!state.queue.length) state.status = 'completed';
  } else if (action.type === 'next') {
    requireRule(state.mode === 'learn' && state.feedback, 'Нет проверенного ответа');
    state.feedback = null;
  } else if (action.type === 'test') {
    requireRule(state.mode === 'test', 'Это действие доступно только в тесте');
    requireRule(
      new Set(action.answers.map((item) => item.questionId)).size === action.answers.length,
      'Вопрос повторяется',
    );
    for (const input of action.answers) {
      const q = state.questions.find((q) => q.id === input.questionId);
      requireRule(q, 'Вопрос не найден');
      if (input.value.trim()) evaluate(q!, input.value);
      state.drafts[input.questionId] = input.value;
    }
    if (action.finish) {
      requireRule(
        state.questions.every((q) => state.drafts[q.id]?.trim()),
        'Ответьте на все вопросы',
      );
      for (const q of state.questions) {
        const { answer, correct } = evaluate(q, state.drafts[q.id]);
        attempt(state, q, answer, correct);
        assessments.push({ card: state.cards[q.cardIndex], known: correct });
      }
      state.status = 'completed';
    }
  } else if (action.type === 'pair') {
    requireRule(state.mode === 'match', 'Это действие доступно только в подборе');
    const round = state.rounds[state.round];
    const left = round.left.find((index) => `l-${state.round}-${index}` === action.left);
    const right = round.right.find((index) => `r-${state.round}-${index}` === action.right);
    requireRule(
      left !== undefined &&
        right !== undefined &&
        !round.matchedLeft.includes(left) &&
        !round.matchedRight.includes(right),
      'Пара недоступна',
    );
    const card = state.cards[left!];
    const answer = back(state.cards[right!], state.options);
    // Identical prompts may legitimately have different definitions; accept any such valid pair.
    const correct = round.left.some((index) => {
      const item = state.cards[index];
      return (
        normalizeAnswer(front(item, state.options)) ===
          normalizeAnswer(front(card, state.options)) &&
        normalizeAnswer(back(item, state.options)) === normalizeAnswer(answer)
      );
    });
    const q = state.questions.find((q) => q.cardIndex === left)!;
    attempt(state, q, answer, correct);
    state.feedback = {
      prompt: front(card, state.options),
      expected: back(card, state.options),
      answer,
      correct,
    };
    assessments.push({ card, known: correct });
    if (correct) {
      round.matchedLeft.push(left!);
      round.matchedRight.push(right!);
      if (round.matchedLeft.length === round.left.length) {
        state.round++;
        if (state.round === state.rounds.length) state.status = 'completed';
      }
    }
  }
  return { state, assessments };
}
export function studySummary(state: StudyState): StudySummary {
  const total = state.mode === 'learn' ? state.questions.length : state.cards.length;
  const first = state.attempts.filter((item) => item.first);
  const answered =
    state.mode === 'cards'
      ? Object.keys(state.ratings).length
      : state.mode === 'test'
        ? Object.values(state.drafts).filter(Boolean).length
        : state.mode === 'match'
          ? state.rounds.reduce((sum, round) => sum + round.matchedLeft.length, 0)
          : state.questions.filter((q) =>
              state.attempts.some((a) => a.questionId === q.id && a.correct),
            ).length;
  const correct =
    state.mode === 'cards'
      ? Object.values(state.ratings).filter(Boolean).length
      : state.mode === 'match'
        ? answered
        : first.filter((a) => a.correct).length;
  const mastered = state.cards.filter((_, i) =>
    state.questions
      .filter((q) => q.cardIndex === i)
      .every((q) =>
        state.mode === 'cards'
          ? state.ratings[q.id] === true
          : state.attempts.some((a) => a.questionId === q.id && a.correct),
      ),
  ).length;
  return {
    total,
    answered,
    correct,
    mistakes: state.attempts.filter((a) => !a.correct).length,
    attempts: state.attempts.length,
    mastered,
    score: total ? Math.round((correct / total) * 100) : 0,
  };
}
export function studyResults(state: StudyState): StudyResultRow[] {
  return state.cards.map((card, i) => {
    const attempts = state.attempts.filter((a) => a.cardIndex === i);
    const last = attempts.at(-1);
    return {
      cardId: card.id,
      prompt: front(card, state.options),
      expected: back(card, state.options),
      answer: last?.answer ?? '',
      correct:
        state.mode === 'cards' ? state.ratings[`q-${i}-0`] === true : (last?.correct ?? false),
      mistakes: attempts.filter((a) => !a.correct).length,
    };
  });
}
function publicQuestion(question: Question, state: StudyState): StudyQuestion {
  return {
    id: question.id,
    prompt: question.prompt,
    type: question.type,
    options: question.options,
    ...(state.mode === 'cards'
      ? { back: question.expected, known: state.ratings[question.id] }
      : {}),
  };
}
export function studyView(state: StudyState) {
  const q =
    state.mode === 'cards'
      ? state.questions[state.cursor]
      : state.questions.find((q) => q.id === state.queue[0]);
  const round = state.rounds[state.round];
  return {
    summary: studySummary(state),
    questions:
      state.mode === 'test' || state.mode === 'cards'
        ? state.questions.map((q) => publicQuestion(q, state))
        : [],
    current: state.status === 'active' && q ? publicQuestion(q, state) : null,
    cursor: state.cursor,
    drafts: state.mode === 'test' ? state.drafts : {},
    feedback: state.mode === 'test' ? null : state.feedback,
    board:
      state.mode === 'match' && round
        ? {
            left: round.left.map((i) => ({
              id: `l-${state.round}-${i}`,
              text: front(state.cards[i], state.options),
              matched: round.matchedLeft.includes(i),
            })),
            right: round.right.map((i) => ({
              id: `r-${state.round}-${i}`,
              text: back(state.cards[i], state.options),
              matched: round.matchedRight.includes(i),
            })),
            round: state.round + 1,
            rounds: state.rounds.length,
          }
        : null,
    results: state.status === 'completed' ? studyResults(state) : [],
  };
}
