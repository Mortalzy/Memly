import type { StudyMode } from '../entities/deck.ts';

export type Route =
  | { page: 'home' | 'library' | 'folders' | 'progress' | 'create' | 'settings' }
  | { page: 'deck' | 'edit' | 'folder'; id: string }
  | { page: 'study'; id: string; mode: StudyMode };
export function parseRoute(hash: string): Route {
  const [page, id, mode] = hash.replace(/^#\/?/, '').split('/');
  if (page === 'study' && id && ['cards', 'learn', 'test', 'match'].includes(mode))
    return { page, id, mode: mode as StudyMode };
  if ((page === 'deck' || page === 'edit' || page === 'folder') && id) return { page, id };
  if (['library', 'folders', 'progress', 'create', 'settings'].includes(page))
    return { page: page as 'library' | 'folders' | 'progress' | 'create' | 'settings' };
  return { page: 'home' };
}
export function navigate(path: string): void {
  window.location.hash = `/${path}`;
}
