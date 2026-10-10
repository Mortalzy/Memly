import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Check, ChevronDown, HelpCircle, Menu, Plus, Search, X } from 'lucide-react';
import { demoDecks, demoFolders } from '../entities/deck';
import type { Deck, Folder, StudyMode } from '../entities/deck';
import { Home } from '../pages/Home';
import { Library } from '../pages/Library';
import { Folders } from '../pages/Folders';
import { Progress } from '../pages/Progress';
import { DeckPage } from '../pages/DeckPage';
import { Study } from '../pages/Study';
import { Editor } from '../pages/Editor';
import { Settings } from '../pages/Settings';
import { Games } from '../pages/Games';
import { Modal } from '../shared/Modal';
import { Icon } from '../shared/ui';
import { ru } from '../shared/ru';
import { navigate, parseRoute } from './navigation';
import type { Backend } from './ConnectedApp';
import { errorMessage } from '../shared/api';
import { StarterCatalog } from '../features/StarterCatalog';
import { starterText } from '../shared/starter-text';
import { applyTheme, readTheme, saveTheme } from '../shared/theme';

export function Workspace({ backend }: { backend?: Backend }) {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  const [localDecks, setDecks] = useState(demoDecks);
  const decks = backend?.decks ?? localDecks;
  const [localFolders, setFolders] = useState(demoFolders);
  const folders = backend?.folders ?? localFolders;
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState(false);
  const [profile, setProfile] = useState(false);
  const [modal, setModal] = useState<'help' | 'folder' | null>(null);
  const [folderName, setFolderName] = useState('');
  const [folderError, setFolderError] = useState('');
  const [folderPending, setFolderPending] = useState(false);
  const [toast, setToast] = useState('');
  const [dark, setDarkState] = useState(() => readTheme() === 'dark');
  const setDark = (value: boolean) => {
    setDarkState(value);
    if (!saveTheme(value ? 'dark' : 'light')) setToast(ru.themeNotSaved);
  };
  const closeModal = useCallback(() => setModal(null), []);
  useEffect(() => {
    const update = () => {
      setRoute(parseRoute(window.location.hash));
      setMenu(false);
      setProfile(false);
      window.scrollTo({ top: 0, behavior: 'instant' });
    };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    applyTheme(dark ? 'dark' : 'light');
  }, [dark]);
  const go = (path: string) => {
    if (
      !window.dispatchEvent(
        new window.CustomEvent('memly:before-navigate', { cancelable: true, detail: path }),
      )
    )
      return;
    setQuery('');
    navigate(path);
    setMenu(false);
    setProfile(false);
  };
  const openDeck = (id: string) => go(`deck/${id}`);
  const startStudy = (id: string, mode: StudyMode) => go(`study/${id}/${mode}`);
  const favorite = async (id: string) => {
    const item = decks.find((deck) => deck.id === id);
    if (backend) {
      try {
        await backend.favorite(id, !item?.favorite);
        setToast(item?.favorite ? ru.unsaved : ru.saved);
      } catch (error) {
        setToast(errorMessage(error));
      }
      return;
    }
    setDecks((items) =>
      items.map((deck) => (deck.id === id ? { ...deck, favorite: !deck.favorite } : deck)),
    );
    setToast(item?.favorite ? ru.unsaved : ru.saved);
  };
  const actions = { open: openDeck, edit: (id: string) => go(`edit/${id}`), favorite };
  const saveDeck = async (deck: Deck) => {
    if (backend) {
      const saved = await backend.save(deck);
      setToast('Набор сохранён');
      openDeck(saved.id);
      return;
    }
    setDecks((items) =>
      items.some((item) => item.id === deck.id)
        ? items.map((item) => (item.id === deck.id ? deck : item))
        : [deck, ...items],
    );
    setToast(ru.savedDeck);
    openDeck(deck.id);
  };
  const activePage =
    route.page === 'study' && route.mode === 'scanword'
      ? 'games'
      : ['deck', 'study', 'create', 'edit', 'folder'].includes(route.page)
        ? 'library'
        : route.page;
  const selectedDeck = 'id' in route ? decks.find((deck) => deck.id === route.id) : undefined;
  const selectedFolder =
    route.page === 'folder' ? folders.find((folder) => folder.id === route.id) : undefined;
  let content;
  if (route.page === 'home')
    content = (
      <Home
        decks={decks}
        actions={actions}
        study={(mode) =>
          decks[0] ? startStudy(backend ? decks[0].id : 'english', mode) : go('create')
        }
        userName={backend?.user.name}
        live={Boolean(backend)}
        stats={backend?.progress}
        library={() => go('library')}
        progress={() => go('progress')}
      />
    );
  else if (route.page === 'library' && backend?.scope === 'starters')
    content = (
      <StarterCatalog query={query} setQuery={setQuery} add={backend.addStarter} open={openDeck} />
    );
  else if (route.page === 'library' || route.page === 'folder')
    content = (
      <Library
        key={route.page === 'folder' ? route.id : 'library'}
        decks={route.page === 'folder' ? decks.filter((deck) => deck.folder === route.id) : decks}
        actions={actions}
        query={query}
        setQuery={setQuery}
        create={() => go('create')}
        folderTitle={selectedFolder?.title}
        viewerId={backend?.user.id}
      />
    );
  else if (route.page === 'folders')
    content = (
      <Folders
        folders={folders}
        decks={decks}
        open={(id) => go(`folder/${id}`)}
        create={() => {
          setFolderError('');
          setModal('folder');
        }}
        remove={
          backend
            ? async (folder: Folder) => {
                try {
                  await backend.removeFolder(folder as Parameters<Backend['removeFolder']>[0]);
                } catch (error) {
                  setToast(errorMessage(error));
                }
              }
            : undefined
        }
      />
    );
  else if (route.page === 'games')
    content = (
      <Games
        decks={decks}
        play={(id) => startStudy(id, 'scanword')}
        library={() => go('library')}
      />
    );
  else if (route.page === 'progress')
    content = (
      <Progress
        live={Boolean(backend)}
        openSession={
          backend ? (item) => go(`study/${item.deckId}/${item.mode}?session=${item.id}`) : undefined
        }
      />
    );
  else if (route.page === 'create' || (route.page === 'edit' && selectedDeck))
    content = (
      <Editor
        key={route.page === 'edit' ? route.id : 'create'}
        deck={selectedDeck}
        back={() => go('library')}
        save={saveDeck}
        folders={backend?.folders}
        live={Boolean(backend)}
      />
    );
  else if (route.page === 'settings')
    content = (
      <Settings
        dark={dark}
        setDark={setDark}
        saved={() => setToast(backend ? 'Профиль сохранён' : ru.settingsSaved)}
        user={backend?.user}
        saveProfile={backend?.saveProfile}
      />
    );
  else if (route.page === 'deck' && selectedDeck)
    content = (
      <DeckPage
        deck={selectedDeck}
        back={() => go('library')}
        edit={() => go(`edit/${selectedDeck.id}`)}
        favorite={() => favorite(selectedDeck.id)}
        study={(mode) => startStudy(selectedDeck.id, mode)}
        live={Boolean(backend)}
        canEdit={!backend || selectedDeck.ownerId === backend.user.id}
        remove={
          backend
            ? async () => {
                await backend.deleteDeck(selectedDeck);
                go('library');
              }
            : undefined
        }
      />
    );
  else if (route.page === 'study' && selectedDeck)
    content = (
      <Study
        key={`${route.id}-${route.mode}-${route.session ?? ''}`}
        deck={selectedDeck}
        mode={route.mode}
        back={() => (route.mode === 'scanword' ? go('games') : openDeck(selectedDeck.id))}
        changeMode={(mode) => startStudy(selectedDeck.id, mode)}
        saved={backend?.studySaved}
        sessionId={route.session}
      />
    );
  else
    content = (
      <div className="empty-state">
        <h1>{ru.empty}</h1>
        <button className="primary" onClick={() => go('library')}>
          {ru.toLibrary}
          <ArrowRight size={18} />
        </button>
      </div>
    );
  if (backend?.detailLoading) content = <p role="status">Загружаем набор…</p>;
  if (backend?.detailError) content = <p role="alert">{backend.detailError}</p>;
  if (
    backend &&
    route.page === 'edit' &&
    selectedDeck?.ownerId !== backend.user.id &&
    !backend.detailLoading
  )
    content = <p role="alert">Редактировать набор может только его владелец.</p>;
  return (
    <div className="app-shell">
      <button
        className="skip-link"
        onClick={() => document.getElementById('main-content')?.focus()}
      >
        {ru.goToContent}
      </button>
      {menu && (
        <button
          className="sidebar-backdrop"
          aria-label={ru.closeMenu}
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={`sidebar ${menu ? 'mobile-open' : ''}`}>
        <button className="brand" onClick={() => go('')}>
          {ru.brand}
          <span className="brand-dot" />
        </button>
        <button
          className="icon-button sidebar-close"
          aria-label={ru.closeMenu}
          onClick={() => setMenu(false)}
        >
          <X size={22} />
        </button>
        <nav aria-label={ru.brand}>
          {(['home', 'library', 'folders', 'games', 'progress'] as const).map((page) => (
            <button
              key={page}
              className={`nav-item ${activePage === page ? 'active' : ''}`}
              aria-current={activePage === page ? 'page' : undefined}
              onClick={() => go(page === 'home' ? '' : page)}
            >
              <Icon name={page} />
              <span>{ru[page]}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => go('settings')}>
            <Icon name="settings" />
            <span>{ru.settings}</span>
          </button>
          <button className="nav-item" onClick={() => setModal('help')}>
            <HelpCircle size={21} />
            <span>{backend ? 'О Memly' : ru.help}</span>
          </button>
          <div className="sidebar-caption">
            <span className="prototype-dot" />
            {backend ? 'Memly' : ru.prototype}
            <small>{ru.tagline}</small>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label={ru.openMenu}
            onClick={() => setMenu(true)}
          >
            <Menu size={24} />
          </button>
          <label className="search-box">
            <Search size={19} />
            <input
              placeholder={ru.search}
              aria-label={ru.search}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                if (route.page !== 'library') go('library');
              }}
            />
            {query && (
              <button
                className="icon-button"
                aria-label={ru.resetSearch}
                onClick={() => setQuery('')}
              >
                <X size={16} />
              </button>
            )}
          </label>
          <div className="topbar-actions">
            <button
              className="primary header-create"
              aria-label={ru.create}
              onClick={() => go('create')}
            >
              <Plus size={20} />
              <span>{ru.create}</span>
            </button>
            <span className="topbar-divider" />
            <div className="profile-wrap">
              <button
                className="profile-button"
                aria-label={ru.profile}
                aria-expanded={profile}
                onClick={() => setProfile(!profile)}
              >
                <span className="avatar">{backend?.user.name.charAt(0) ?? 'М'}</span>
                <ChevronDown size={16} />
              </button>
              {profile && (
                <>
                  <button
                    className="menu-dismiss"
                    aria-label={ru.close}
                    onClick={() => setProfile(false)}
                  />
                  <div className="popover profile-popover">
                    <div>
                      <strong>{backend?.user.name ?? ru.account}</strong>
                      <small>{backend?.user.email ?? ru.prototype}</small>
                    </div>
                    {backend && (
                      <button
                        onClick={async () => {
                          try {
                            await backend.logout();
                          } catch (error) {
                            setToast(errorMessage(error));
                          }
                        }}
                      >
                        Выйти
                      </button>
                    )}
                    <button onClick={() => go('settings')}>
                      <Icon name="settings" size={17} />
                      {ru.settings}
                    </button>
                    <button
                      onClick={() => {
                        setProfile(false);
                        setModal('help');
                      }}
                    >
                      <HelpCircle size={17} />
                      {ru.help}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className={`main-content ${route.page === 'study' ? 'study-main' : ''}`}
          key={route.page}
        >
          <div className="page-content">
            {backend && route.page === 'library' && (
              <div className="segmented catalog-switch">
                <button
                  className={backend.scope === 'mine' ? 'active' : ''}
                  onClick={() => backend.setScope('mine')}
                >
                  Моя библиотека
                </button>
                <button
                  className={backend.scope === 'public' ? 'active' : ''}
                  onClick={() => backend.setScope('public')}
                >
                  Публичные наборы
                </button>
                <button
                  className={backend.scope === 'starters' ? 'active' : ''}
                  onClick={() => backend.setScope('starters')}
                >
                  {starterText.tab}
                </button>
              </div>
            )}
            {backend &&
              (route.page === 'home' || (route.page === 'library' && backend.scope === 'mine')) && (
                <section className="panel starter-suggestion">
                  <div>
                    <strong>{starterText.suggestionTitle}</strong>
                    <p>{starterText.suggestionHint}</p>
                  </div>
                  <button
                    className="secondary"
                    onClick={() => {
                      go('library');
                      backend.setScope('starters');
                    }}
                  >
                    {starterText.browse}
                    <ArrowRight size={17} />
                  </button>
                </section>
              )}
            {backend?.progressError && (
              <p role="alert" className="form-error">
                {backend.progressError}
              </p>
            )}
            {content}
          </div>
          <footer className="page-footer">
            <span>
              {ru.brand}
              <span className="dot">·</span>
              {ru.tagline}
            </span>
            <button onClick={() => setModal('help')}>{backend ? 'О Memly' : ru.prototype}</button>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
      {modal === 'help' && (
        <Modal title={ru.helpTitle} close={closeModal}>
          <p>
            {backend
              ? 'Наборы, карточки, папки и избранное сохраняются в аккаунте. В режиме карточек можно отмечать «Знаю» и «Ещё учу». Учебные режимы и сканворд сохраняют занятия и результаты. Незавершённое занятие можно продолжить. В тесте ответы проверяются после сдачи, а в заучивании ошибки повторяются.'
              : ru.helpText}
          </p>
          <button className="primary" onClick={closeModal}>
            {ru.gotIt}
            <ArrowRight size={17} />
          </button>
        </Modal>
      )}
      {modal === 'folder' && (
        <Modal title={ru.newFolder} close={closeModal}>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (!folderName.trim() || folderPending) return;
              if (backend) {
                setFolderPending(true);
                setFolderError('');
                try {
                  await backend.createFolder(folderName.trim());
                  setFolderName('');
                  setModal(null);
                  setToast('Папка создана');
                } catch (error) {
                  setFolderError(errorMessage(error));
                } finally {
                  setFolderPending(false);
                }
                return;
              }
              setFolders((items) => [
                ...items,
                { id: crypto.randomUUID(), title: folderName.trim(), icon: 'folders' },
              ]);
              setFolderName('');
              setModal(null);
              setToast(ru.savedFolder);
            }}
          >
            <label>
              {ru.folderName}
              <input
                required
                maxLength={80}
                value={folderName}
                onChange={(event) => setFolderName(event.target.value)}
                placeholder={ru.folderPlaceholder}
              />
            </label>
            {folderError && (
              <p role="alert" className="form-error">
                {folderError}
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={closeModal}>
                {ru.cancel}
              </button>
              <button type="submit" className="primary" disabled={folderPending}>
                {folderPending ? 'Сохраняем…' : ru.createFolder}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
