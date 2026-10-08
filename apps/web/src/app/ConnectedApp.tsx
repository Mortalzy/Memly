import { useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CardDto,
  DeckDto,
  DeckInput,
  FolderDto,
  PageDto,
  ProgressDto,
  UserDto,
} from '@memly/contracts';
import type { Deck } from '../entities/deck';
import { AuthPage } from '../pages/Auth';
import { ApiError, api, errorMessage } from '../shared/api';
import { authClient } from '../features/auth';
import { parseRoute } from './navigation';
import { Workspace } from './Workspace';

export interface Backend {
  user: UserDto;
  decks: DeckDto[];
  folders: FolderDto[];
  progress?: ProgressDto;
  progressError: string;
  detailLoading: boolean;
  detailError: string;
  scope: 'mine' | 'public';
  setScope: (scope: 'mine' | 'public') => void;
  save: (deck: Deck) => Promise<DeckDto>;
  favorite: (id: string, favorite: boolean) => Promise<void>;
  createFolder: (title: string) => Promise<void>;
  removeFolder: (folder: FolderDto) => Promise<void>;
  deleteDeck: (deck: Deck) => Promise<void>;
  review: (card: CardDto, known: boolean) => Promise<void>;
  saveProfile: (name: string) => Promise<void>;
  logout: () => Promise<void>;
}
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 10000, gcTime: 0 } },
});

async function allDecks(scope: string, signal: AbortSignal): Promise<DeckDto[]> {
  const result: DeckDto[] = [];
  let page = 1;
  while (true) {
    const response = await api<PageDto<DeckDto>>(`/v1/decks?limit=50&page=${page}&scope=${scope}`, {
      signal,
    });
    result.push(...response.items);
    if (page >= response.pages) return result;
    page++;
  }
}
function ConnectedWorkspace({ user, signedOut }: { user: UserDto; signedOut: () => void }) {
  const cache = useQueryClient();
  const pendingReviews = useRef(new Map<string, string>());
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  const [catalogScope, setScope] = useState<'mine' | 'public'>('mine');
  const scope = route.page === 'library' ? catalogScope : 'mine';
  useEffect(() => {
    const update = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  const decks = useQuery({
    queryKey: ['decks', scope],
    queryFn: ({ signal }) => allDecks(scope, signal),
  });
  const folders = useQuery({
    queryKey: ['folders'],
    queryFn: ({ signal }) => api<FolderDto[]>('/v1/folders', { signal }),
  });
  const progress = useQuery({
    queryKey: ['progress'],
    queryFn: () => api<ProgressDto>('/v1/study/progress'),
  });
  const id = 'id' in route && route.page !== 'folder' ? route.id : '';
  const detail = useQuery({
    queryKey: ['deck', id],
    enabled: Boolean(id),
    queryFn: ({ signal }) => api<DeckDto>(`/v1/decks/${id}`, { signal }),
  });
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ['decks'] }),
      cache.invalidateQueries({ queryKey: ['deck'] }),
      cache.invalidateQueries({ queryKey: ['folders'] }),
      cache.invalidateQueries({ queryKey: ['progress'] }),
    ]);
  };
  const sessionExpired = [decks.error, folders.error, detail.error, progress.error].some(
    (error) => error instanceof ApiError && error.status === 401,
  );
  useEffect(() => {
    if (sessionExpired) signedOut();
  }, [sessionExpired, signedOut]);
  if (decks.isPending || folders.isPending)
    return (
      <div className="auth-screen" role="status">
        Загружаем библиотеку…
      </div>
    );
  if (decks.error || folders.error)
    return (
      <div className="auth-screen">
        <p role="alert">{errorMessage(decks.error ?? folders.error)}</p>
        <button className="primary" onClick={() => void refresh()}>
          Повторить
        </button>
      </div>
    );
  const backend: Backend = {
    user,
    folders: folders.data!,
    decks: detail.data
      ? [detail.data, ...decks.data!.filter((deck) => deck.id !== detail.data.id)]
      : decks.data!,
    progress: progress.data,
    progressError: progress.error ? errorMessage(progress.error) : '',
    detailLoading: Boolean(id) && detail.isPending,
    detailError: detail.error ? errorMessage(detail.error) : '',
    scope,
    setScope,
    async save(deck) {
      const input: DeckInput = {
        title: deck.title,
        description: deck.description,
        icon: deck.icon as DeckInput['icon'],
        visibility: deck.visibility ?? 'private',
        termLanguage: deck.termLanguage ?? 'en',
        definitionLanguage: deck.definitionLanguage ?? 'ru',
        folderId: deck.folder || null,
        cards: deck.cards.map(({ id, term, definition }) => ({
          ...(deck.revision && detail.data?.cards.some((card) => card.id === id) ? { id } : {}),
          term,
          definition,
        })),
      };
      const saved = await api<DeckDto>(deck.revision ? `/v1/decks/${deck.id}` : '/v1/decks', {
        method: deck.revision ? 'PUT' : 'POST',
        body: JSON.stringify({ ...input, ...(deck.revision ? { revision: deck.revision } : {}) }),
      });
      cache.setQueryData(['deck', saved.id], saved);
      await refresh();
      return saved;
    },
    async favorite(id, favorite) {
      await api(`/v1/decks/${id}/favorite`, { method: 'PUT', body: JSON.stringify({ favorite }) });
      await refresh();
    },
    async createFolder(title) {
      await api('/v1/folders', { method: 'POST', body: JSON.stringify({ title }) });
      await refresh();
    },
    async removeFolder(folder) {
      await api(`/v1/folders/${folder.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ revision: folder.revision }),
      });
      await refresh();
    },
    async deleteDeck(deck) {
      await api(`/v1/decks/${deck.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ revision: deck.revision }),
      });
      cache.removeQueries({ queryKey: ['deck', deck.id] });
      await refresh();
    },
    async review(card, known) {
      const key = `${card.id}:${card.revision}:${known}`;
      const eventId = pendingReviews.current.get(key) ?? crypto.randomUUID();
      pendingReviews.current.set(key, eventId);
      await api('/v1/study/reviews', {
        method: 'POST',
        body: JSON.stringify({ eventId, cardId: card.id, cardRevision: card.revision, known }),
      });
      pendingReviews.current.delete(key);
      await refresh();
    },
    async saveProfile(name) {
      await api('/v1/me', { method: 'PATCH', body: JSON.stringify({ name }) });
      await cache.invalidateQueries({ queryKey: ['me'] });
    },
    async logout() {
      const result = await authClient.signOut();
      if (result.error) throw new Error('Не удалось выйти');
      signedOut();
    },
  };
  return <Workspace backend={backend} />;
}
function SessionGate() {
  const cache = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api<UserDto>('/v1/me');
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
  });
  if (me.isPending)
    return (
      <div className="auth-screen" role="status">
        Загружаем Memly…
      </div>
    );
  if (me.error)
    return (
      <div className="auth-screen">
        <p role="alert">Не удалось подключиться к серверу. {errorMessage(me.error)}</p>
        <button className="primary" onClick={() => void me.refetch()}>
          Повторить
        </button>
      </div>
    );
  if (!me.data || new URLSearchParams(window.location.search).has('token'))
    return (
      <AuthPage
        signedIn={async () => {
          await cache.invalidateQueries({ queryKey: ['me'] });
        }}
      />
    );
  return (
    <ConnectedWorkspace
      key={me.data.id}
      user={me.data}
      signedOut={() => {
        cache.clear();
        cache.setQueryData(['me'], null);
        window.location.hash = '/';
      }}
    />
  );
}
export function ConnectedApp() {
  return (
    <QueryClientProvider client={client}>
      <SessionGate />
    </QueryClientProvider>
  );
}
