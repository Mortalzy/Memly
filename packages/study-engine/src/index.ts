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
import { answersEqual, normalizeAnswer } from './grading.ts';
export { normalizeAnswer } from './grading.ts';
import { requireRule } from './rules.ts';
import {
  applyScanword,
  createFixedScanword,
  createScanword,
  scanwordResults,
  scanwordSummary,
  scanwordView,
  type ScanwordState,
  type ScanwordLayout,
} from './scanword.ts';
export { StudyRuleError } from './rules.ts';

interface Question extends StudyQuestion {
  cardIndex: number;
  expected: string;
  stage: number;
  truth?: boolean;
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
  scanword?: ScanwordState;
  viewed?: string[];
}
export interface Assessment {
  card: CardDto;
  known: boolean;
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
  scanwordLayout?: ScanwordLayout,
): StudyState {
  requireRule(cards.length > 0, 'Нет карточек для занятия');
  const selected = (options.shuffle ? shuffle(cards, random) : [...cards]).slice(
    0,
    mode === 'match' && options.matchGame ? Math.min(6, options.count) : options.count,
  );
  if (mode === 'scanword')
    return {
      version: 1,
      mode,
      options,
      cards: selected,
      questions: [],
      queue: [],
      drafts: {},
      ratings: {},
      attempts: [],
      feedback: null,
      cursor: 0,
      rounds: [],
      round: 0,
      status: 'active',
      scanword: scanwordLayout
        ? createFixedScanword(selected, scanwordLayout)
        : createScanword(selected, options, random),
    };
  const questions: Question[] = [];
  selected.forEach((card, cardIndex) => {
    const stages =
      mode === 'learn' &&
      (options.answerType === 'mixed' ||
        options.learnMethod === 'write' ||
        options.learnMethod === 'spell')
        ? 2
        : 1;
    for (let stage = 0; stage < stages; stage++) {
      let type: StudyQuestion['type'] =
        mode === 'cards'
          ? 'card'
          : options.answerType === 'written' ||
              (options.answerType === 'mixed' &&
                (mode === 'learn' ? stage === 1 : cardIndex % 2 === 1))
            ? 'written'
            : 'choice';
      if (mode === 'learn' && (options.learnMethod === 'write' || options.learnMethod === 'spell'))
        type = 'written';
      if (mode === 'test' && options.testTypes?.length)
        type = options.testTypes[cardIndex % options.testTypes.length];
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
      const truth = random() < 0.5 || alternatives.length === 0;
      questions.push({
        ...(type === 'truefalse' ? { truth, statement: truth ? expected : alternatives[0] } : {}),
        id,
        cardIndex,
        stage,
        prompt: front(card, options),
        expected,
        type,
        options:
          type === 'choice'
            ? values.map((text, index) => ({ id: `${id}-o${index}`, text }))
            : type === 'truefalse'
              ? [
                  { id: 'true', text: 'Верно' },
                  { id: 'false', text: 'Неверно' },
                ]
              : [],
      });
    }
  });
  const matching = questions.filter((q) => q.type === 'matching');
  for (let start = 0; start < matching.length; start += 6) {
    const group = matching.slice(start, start + 6);
    const values = shuffle([...new Set(group.map((q) => q.expected))], random);
    for (const q of group) {
      q.matchGroup = Math.floor(start / 6) + 1;
      q.options = values.map((text, i) => ({ id: `m-${start}-${i}`, text }));
    }
  }
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
function evaluate(
  question: Question,
  value: string,
  options: StudyOptions,
): { answer: string; correct: boolean } {
  const option = question.options.find((option) => option.id === value);
  if (question.type !== 'written') requireRule(option, 'Выберите один из предложенных ответов');
  if (question.type === 'truefalse')
    return { answer: option!.text, correct: (value === 'true') === question.truth };
  const answer = question.type !== 'written' ? option!.text : value.trim();
  requireRule(Boolean(answer.trim()), 'Введите ответ');
  return {
    answer,
    correct:
      question.type === 'written'
        ? answersEqual(answer, question.expected, options)
        : normalizeAnswer(answer) === normalizeAnswer(question.expected),
  };
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
  random?: () => number,
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
  if (state.mode === 'scanword') {
    requireRule(state.scanword, 'Сетка недоступна');
    const result = applyScanword(state.scanword, action, state.cards);
    if (result.completed) state.status = 'completed';
    return { state, assessments: result.assessments };
  }
  requireRule(!action.type.startsWith('scanword-'), 'Это действие доступно только в сканворде');
  if (action.type === 'star') {
    requireRule(
      state.mode === 'cards' || state.mode === 'learn',
      'Звёздочки доступны в карточках и заучивании',
    );
    const q = state.questions.find((q) => q.id === action.questionId);
    requireRule(q, 'Карточка не найдена');
    state.cards[q.cardIndex].starred = action.starred;
  } else if (action.type === 'shuffle') {
    requireRule(state.mode === 'cards' && random, 'Перемешивание недоступно');
    const current = state.questions[state.cursor]?.id;
    state.questions = shuffle(state.questions, random);
    state.cursor = Math.max(
      0,
      state.questions.findIndex((q) => q.id === current),
    );
  } else if (action.type === 'review') {
    requireRule(
      state.mode === 'cards' && state.options.cardSorting === false,
      'Просмотр доступен без сортировки',
    );
    const q = state.questions[state.cursor];
    requireRule(q?.id === action.questionId, 'Карточка изменилась');
    state.viewed ??= [];
    if (!state.viewed.includes(q.id)) state.viewed.push(q.id);
    if (state.viewed.length === state.cards.length) state.status = 'completed';
    else state.cursor = (state.cursor + 1) % state.questions.length;
  } else if (action.type === 'navigate') {
    requireRule(
      state.mode === 'cards' && action.index < state.questions.length,
      'Недопустимый переход',
    );
    state.cursor = action.index;
  } else if (action.type === 'rate') {
    requireRule(
      state.mode === 'cards' && state.options.cardSorting !== false,
      'Самооценка доступна в режиме сортировки карточек',
    );
    const q = state.questions.find((q) => q.id === action.questionId);
    requireRule(q, 'Карточка не найдена');
    state.ratings[q!.id] = action.known;
    attempt(state, q!, action.known ? 'Знаю' : 'Ещё учу', action.known);
    assessments.push({ card: state.cards[q!.cardIndex], known: action.known });
    const next = state.questions.findIndex((q) => state.ratings[q.id] === undefined);
    if (next === -1) state.status = 'completed';
    else state.cursor = next;
  } else if (action.type === 'answer' || action.type === 'skip') {
    requireRule(
      state.mode === 'learn' && !state.feedback && action.questionId === state.queue[0],
      'Ответ относится к другому вопросу',
    );
    const q = state.questions.find((q) => q.id === action.questionId)!;
    const { answer, correct } =
      action.type === 'skip'
        ? { answer: '', correct: false }
        : evaluate(q, action.value, state.options);
    attempt(state, q, answer, correct);
    state.feedback = {
      prompt: q.prompt,
      expected: q.expected,
      answer,
      correct,
      canOverride: !correct && q.type === 'written' && action.type !== 'skip',
      retypeRequired: !correct && q.type === 'written' && state.options.retype === true,
    };
    state.queue.shift();
    if (!correct) state.queue.push(q.id);
    else if (q.stage === 0 && state.questions.some((item) => item.id === `q-${q.cardIndex}-1`))
      state.queue.push(`q-${q.cardIndex}-1`);
    assessments.push({
      card: state.cards[q.cardIndex],
      known:
        correct &&
        !(q.stage === 0 && state.questions.some((item) => item.id === `q-${q.cardIndex}-1`)),
    });
    if (!state.queue.length) state.status = 'completed';
  } else if (action.type === 'override') {
    requireRule(
      state.mode === 'learn' && state.feedback?.canOverride,
      'Этот ответ нельзя переоценить',
    );
    const last = state.attempts.at(-1)!;
    const q = state.questions.find((q) => q.id === last.questionId)!;
    last.correct = true;
    state.feedback.correct = true;
    state.feedback.canOverride = false;
    state.feedback.retypeRequired = false;
    state.queue = state.queue.filter((id) => id !== q.id);
    const nextId = `q-${q.cardIndex}-1`;
    if (
      q.stage === 0 &&
      state.questions.some((q) => q.id === nextId) &&
      !state.queue.includes(nextId)
    )
      state.queue.push(nextId);
    assessments.push({
      card: state.cards[q.cardIndex],
      known: !state.queue.some(
        (id) => state.questions.find((q) => q.id === id)?.cardIndex === q.cardIndex,
      ),
    });
    if (!state.queue.length) state.status = 'completed';
  } else if (action.type === 'retype') {
    requireRule(
      state.mode === 'learn' && state.feedback?.retypeRequired,
      'Повторный ввод недоступен',
    );
    requireRule(
      answersEqual(action.value, state.feedback.expected, {
        ...state.options,
        grading: 'strict',
        singleAnswer: false,
      }),
      'Напишите правильный ответ ещё раз',
    );
    state.feedback.retypeRequired = false;
  } else if (action.type === 'next') {
    requireRule(state.mode === 'learn' && state.feedback, 'Нет проверенного ответа');
    requireRule(!state.feedback.retypeRequired, 'Сначала напишите правильный ответ');
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
      if (input.value.trim()) evaluate(q!, input.value, state.options);
      state.drafts[input.questionId] = input.value;
    }
    if (action.finish) {
      requireRule(
        action.allowUnanswered || state.questions.every((q) => state.drafts[q.id]?.trim()),
        'Ответьте на все вопросы',
      );
      for (const q of state.questions) {
        const value = state.drafts[q.id] ?? '';
        const { answer, correct } = value.trim()
          ? evaluate(q, value, state.options)
          : { answer: '', correct: false };
        attempt(state, q, answer, correct);
        assessments.push({ card: state.cards[q.cardIndex], known: correct });
      }
      state.status = 'completed';
    }
  } else if (action.type === 'mismatch') {
    requireRule(
      state.mode === 'match' && state.options.matchGame,
      'Это действие доступно только в подборе',
    );
    const round = state.rounds[state.round];
    const side = action.first.startsWith('l-') ? 'left' : 'right';
    const prefix = side === 'left' ? 'l' : 'r';
    const used = side === 'left' ? round.matchedLeft : round.matchedRight;
    const first = round[side].find((i) => `${prefix}-${state.round}-${i}` === action.first);
    const second = round[side].find((i) => `${prefix}-${state.round}-${i}` === action.second);
    requireRule(
      first !== undefined &&
        second !== undefined &&
        first !== second &&
        !used.includes(first) &&
        !used.includes(second),
      'Пара недоступна',
    );
    const q = state.questions.find((q) => q.cardIndex === first)!;
    const answer =
      side === 'left'
        ? front(state.cards[second], state.options)
        : back(state.cards[second], state.options);
    attempt(state, q, answer, false);
    state.feedback = { prompt: q.prompt, expected: q.expected, answer, correct: false };
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
  if (state.mode === 'scanword' && state.scanword)
    return scanwordSummary(state.scanword, state.cards);
  const total = state.mode === 'learn' ? state.questions.length : state.cards.length;
  const first = state.attempts.filter((item) => item.first);
  const answered =
    state.mode === 'cards'
      ? state.options.cardSorting === false
        ? (state.viewed?.length ?? 0)
        : Object.keys(state.ratings).length
      : state.mode === 'test'
        ? state.status === 'completed'
          ? state.questions.length
          : Object.values(state.drafts).filter((value) => value.trim()).length
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
    ...(state.mode === 'cards' && state.options.cardSorting === false
      ? { reviewed: answered }
      : {}),
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
  if (state.mode === 'scanword' && state.scanword)
    return scanwordResults(state.scanword, state.cards);
  return state.cards.map((card, i) => {
    const attempts = state.attempts.filter((a) => a.cardIndex === i);
    const last = attempts.at(-1);
    return {
      cardId: card.id,
      prompt:
        state.mode === 'test' && state.questions[i]?.type === 'truefalse'
          ? `${front(card, state.options)} — ${state.questions[i].statement}`
          : front(card, state.options),
      expected:
        state.mode === 'test' && state.questions[i]?.type === 'truefalse'
          ? state.questions[i].truth
            ? 'Верно'
            : 'Неверно'
          : back(card, state.options),
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
    prompt: state.mode === 'learn' && state.options.learnMethod === 'spell' ? '' : question.prompt,
    ...(state.mode === 'learn' && state.options.learnMethod === 'spell'
      ? { audio: question.expected }
      : {}),
    ...(question.statement !== undefined ? { statement: question.statement } : {}),
    ...(question.matchGroup !== undefined ? { matchGroup: question.matchGroup } : {}),
    ...(state.mode === 'cards' || state.mode === 'learn'
      ? { starred: state.cards[question.cardIndex].starred ?? false }
      : {}),
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
    ...(state.mode === 'match'
      ? { penaltyMs: state.options.matchGame ? studySummary(state).mistakes * 1000 : 0 }
      : {}),
    ...(state.mode === 'learn'
      ? {
          learning: {
            total: state.cards.length,
            familiar: state.cards.filter((_, i) =>
              state.attempts.some((a) => a.cardIndex === i && a.correct),
            ).length,
            mastered: studySummary(state).mastered,
            streak: (() => {
              let count = 0;
              const latest = state.attempts.at(-1);
              const type = state.questions.find((q) => q.id === latest?.questionId)?.type;
              for (const a of [...state.attempts].reverse()) {
                if (!a.correct || state.questions.find((q) => q.id === a.questionId)?.type !== type)
                  break;
                count++;
              }
              return count;
            })(),
          },
        }
      : {}),
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
    scanword:
      state.mode === 'scanword' && state.scanword
        ? scanwordView(state.scanword, state.cards)
        : null,
  };
}
