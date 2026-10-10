import { useEffect, useRef, useState } from 'react';
import type {
  StartStudyInput,
  StudyAction,
  StudyEventInput,
  StudySessionDto,
} from '@memly/contracts';
import type { StudyState } from '@memly/study-engine';
import type { Deck } from '../entities/deck';
import { errorMessage } from '../shared/api';
import { studyClient } from './study-client';

const values = (session: StudySessionDto): Record<string, string> =>
  Object.fromEntries(
    (session.scanword?.cells ?? [])
      .filter((cell) => cell.value)
      .map((cell) => [cell.key, cell.value]),
  );
export function sameLetters(a: Record<string, string>, b: Record<string, string>): boolean {
  const left = Object.keys(a).filter((key) => a[key]);
  const right = Object.keys(b).filter((key) => b[key]);
  return left.length === right.length && left.every((key) => a[key] === b[key]);
}
export function useScanwordSession(deck: Deck, saved?: () => Promise<void>, sessionId?: string) {
  const live = Boolean(saved);
  const [session, setSession] = useState<StudySessionDto | null>(null);
  const [resume, setResume] = useState<StudySessionDto | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(live);
  const [pending, setPending] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [error, setError] = useState('');
  const [clock, setClock] = useState(Date.now());
  const current = useRef(session);
  const draftRef = useRef(drafts);
  const receivedAt = useRef(Date.now());
  const retry = useRef<StudyEventInput | null>(null);
  const retryStart = useRef<StartStudyInput | null>(null);
  const flight = useRef<Promise<StudySessionDto | null> | null>(null);
  const demo = useRef<StudyState | null>(null);
  const mounted = useRef(true);
  const savedRef = useRef(saved);
  savedRef.current = saved;
  function accept(value: StudySessionDto, restore = true) {
    current.current = value;
    receivedAt.current = Date.now();
    if (restore) draftRef.current = values(value);
    if (!mounted.current) return;
    setSession(value);
    if (restore) setDrafts(draftRef.current);
  }
  function updateLetters(next: Record<string, string>) {
    draftRef.current = next;
    setDrafts(next);
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // A browser history change can unmount the board before its debounce runs.
      if (live) void flush();
    };
  }, []);
  async function load(signal?: AbortSignal) {
    if (!live) return;
    setLoading(true);
    setError('');
    try {
      if (sessionId) {
        const value = await studyClient.get(sessionId, signal);
        if (value.deckId !== deck.id || value.mode !== 'scanword' || !value.scanword)
          throw new Error('Игра относится к другому набору или режиму');
        accept(value);
      } else {
        const active = await studyClient.active(deck.id, 'scanword', signal);
        if (!signal?.aborted) setResume(active);
      }
    } catch (failure) {
      if (!signal?.aborted) setError(errorMessage(failure));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    const abort = new AbortController();
    void load(abort.signal);
    return () => abort.abort();
  }, [deck.id, live, sessionId]);
  useEffect(() => {
    if (session?.status !== 'active') return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [session?.status]);
  async function send(action?: StudyAction, freeze = false): Promise<StudySessionDto | null> {
    if (flight.current) return null;
    const lesson = current.current;
    if (!lesson) return null;
    const input =
      retry.current ??
      (action ? { eventId: crypto.randomUUID(), revision: lesson.revision, action } : null);
    if (!input) return null;
    retry.current = input;
    if (mounted.current) {
      setPending(true);
      setBlocking(freeze || input.action.type !== 'scanword-draft');
      setError('');
    }
    const task = (async () => {
      try {
        let result: StudySessionDto;
        if (live) result = await studyClient.event(lesson.id, input);
        else {
          const engine = await import('@memly/study-engine');
          demo.current = engine.applyStudyAction(demo.current!, input.action).state;
          result = {
            ...lesson,
            revision: lesson.revision + 1,
            status: demo.current.status,
            ...engine.studyView(demo.current),
            elapsedMs: Date.now() - new Date(lesson.startedAt).getTime(),
            completedAt: demo.current.status === 'completed' ? new Date().toISOString() : null,
          };
        }
        retry.current = null;
        accept(result, input.action.type !== 'scanword-draft');
        if (result.status === 'completed')
          void savedRef.current?.().catch((failure) => {
            if (mounted.current) setError(errorMessage(failure));
          });
        return result;
      } catch (failure) {
        if (mounted.current) setError(errorMessage(failure));
        return null;
      } finally {
        flight.current = null;
        if (mounted.current) {
          setPending(false);
          setBlocking(false);
        }
      }
    })();
    flight.current = task;
    return task;
  }
  async function start(input: StartStudyInput) {
    if (pending || flight.current) return;
    setPending(true);
    setError('');
    retryStart.current ??= input;
    try {
      let value: StudySessionDto;
      if (live) value = await studyClient.start(retryStart.current);
      else {
        const engine = await import('@memly/study-engine');
        const selected = deck.cards.filter((card) => input.cardIds?.includes(card.id));
        demo.current = engine.createStudyState(
          selected.map((card) => ({ ...card, revision: card.revision ?? 1 })),
          'scanword',
          input.options,
          Math.random,
        );
        value = {
          id: crypto.randomUUID(),
          deckId: deck.id,
          deckTitle: deck.title,
          deckRevision: deck.revision ?? 1,
          mode: 'scanword',
          options: input.options,
          revision: 1,
          status: 'active',
          startedAt: new Date().toISOString(),
          completedAt: null,
          elapsedMs: 0,
          ...engine.studyView(demo.current),
          bestMs: null,
          outdated: false,
        };
      }
      retryStart.current = null;
      retry.current = null;
      setResume(null);
      accept(value);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  }
  async function flush(): Promise<StudySessionDto | null> {
    if (flight.current) await flight.current;
    const lesson = current.current;
    if (!lesson || lesson.status !== 'active') return lesson;
    if (retry.current) return null;
    if (sameLetters(draftRef.current, values(lesson))) return lesson;
    return send(
      {
        type: 'scanword-draft',
        round: lesson.scanword!.round,
        cells: Object.entries(draftRef.current)
          .filter(([, value]) => value)
          .map(([key, value]) => ({ key, value })),
      },
      true,
    );
  }
  async function hint(wordId: string) {
    const lesson = await flush();
    if (lesson) await send({ type: 'scanword-hint', round: lesson.scanword!.round, wordId });
  }
  async function reload() {
    if (flight.current || !current.current || !live) return;
    setPending(true);
    try {
      const value = await studyClient.get(current.current.id);
      retry.current = null;
      accept(value);
      setError('');
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  }
  const dirty = Boolean(session && !sameLetters(drafts, values(session)));
  useEffect(() => {
    if (!session || session.status !== 'active' || pending || error || !dirty) return;
    const timer = window.setTimeout(
      () =>
        void send({
          type: 'scanword-draft',
          round: session.scanword!.round,
          cells: Object.entries(draftRef.current)
            .filter(([, value]) => value)
            .map(([key, value]) => ({ key, value })),
        }),
      500,
    );
    return () => window.clearTimeout(timer);
  }, [session?.revision, drafts, pending, error, dirty]);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      const lesson = current.current;
      if (
        live &&
        lesson?.status === 'active' &&
        (flight.current || retry.current || !sameLetters(draftRef.current, values(lesson)))
      ) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [live]);
  useEffect(() => {
    const navigate = (event: Event) => {
      const lesson = current.current;
      if (
        !lesson ||
        lesson.status !== 'active' ||
        (!flight.current && !retry.current && sameLetters(draftRef.current, values(lesson)))
      )
        return;
      event.preventDefault();
      const path = (event as CustomEvent<string>).detail;
      void flush().then((result) => {
        if (result) window.location.hash = `/${path}`;
      });
    };
    window.addEventListener('memly:before-navigate', navigate);
    return () => window.removeEventListener('memly:before-navigate', navigate);
  }, [session?.revision]);
  return {
    session,
    resume,
    drafts,
    updateLetters,
    loading,
    pending,
    blocked: blocking || Boolean(retry.current && retry.current.action.type !== 'scanword-draft'),
    error,
    dirty,
    hasRetry: Boolean(retry.current),
    hasStartRetry: Boolean(retryStart.current),
    elapsedMs:
      session?.status === 'active'
        ? session.elapsedMs + Math.max(0, clock - receivedAt.current)
        : (session?.elapsedMs ?? 0),
    start,
    send,
    hint,
    flush,
    reload,
    load,
    retryStart: () => retryStart.current && start(retryStart.current),
    continueGame: () => {
      if (resume) {
        accept(resume);
        setResume(null);
      }
    },
    reset: () => {
      setSession(null);
      current.current = null;
      setResume(null);
      retry.current = null;
      retryStart.current = null;
      setError('');
    },
  };
}
