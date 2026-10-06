import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Check, ChevronDown, HelpCircle, Menu, Plus, Search, X } from 'lucide-react';
import { demoDecks, demoFolders } from '../entities/deck';
import type { Deck, StudyMode } from '../entities/deck';
import { Home } from '../pages/Home';
import { Library } from '../pages/Library';
import { Folders } from '../pages/Folders';
import { Progress } from '../pages/Progress';
import { DeckPage } from '../pages/DeckPage';
import { Study } from '../pages/Study';
import { Editor } from '../pages/Editor';
import { Settings } from '../pages/Settings';
import { Modal } from '../shared/Modal';
import { Icon } from '../shared/ui';
import { ru } from '../shared/ru';
import { navigate, parseRoute } from './navigation';

export function App() {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  const [decks, setDecks] = useState(demoDecks);
  const [folders, setFolders] = useState(demoFolders);
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState(false);
  const [profile, setProfile] = useState(false);
  const [modal, setModal] = useState<'help' | 'folder' | null>(null);
  const [folderName, setFolderName] = useState('');
  const [toast, setToast] = useState('');
  const [dark, setDark] = useState(false);
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
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);
  const go = (path: string) => {
    setQuery('');
    navigate(path);
    setMenu(false);
    setProfile(false);
  };
  const openDeck = (id: string) => go(`deck/${id}`);
  const startStudy = (id: string, mode: StudyMode) => go(`study/${id}/${mode}`);
  const favorite = (id: string) => {
    const item = decks.find((deck) => deck.id === id);
    setDecks((items) =>
      items.map((deck) => (deck.id === id ? { ...deck, favorite: !deck.favorite } : deck)),
    );
    setToast(item?.favorite ? ru.unsaved : ru.saved);
  };
  const actions = { open: openDeck, edit: (id: string) => go(`edit/${id}`), favorite };
  const saveDeck = (deck: Deck) => {
    setDecks((items) =>
      items.some((item) => item.id === deck.id)
        ? items.map((item) => (item.id === deck.id ? deck : item))
        : [deck, ...items],
    );
    setToast(ru.savedDeck);
    openDeck(deck.id);
  };
  const activePage = ['deck', 'study', 'create', 'edit', 'folder'].includes(route.page)
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
        study={(mode) => startStudy('english', mode)}
        library={() => go('library')}
        progress={() => go('progress')}
      />
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
      />
    );
  else if (route.page === 'folders')
    content = (
      <Folders
        folders={folders}
        decks={decks}
        open={(id) => go(`folder/${id}`)}
        create={() => setModal('folder')}
      />
    );
  else if (route.page === 'progress') content = <Progress decks={decks} open={openDeck} />;
  else if (route.page === 'create' || (route.page === 'edit' && selectedDeck))
    content = (
      <Editor
        key={route.page === 'edit' ? route.id : 'create'}
        deck={selectedDeck}
        back={() => go('library')}
        save={saveDeck}
      />
    );
  else if (route.page === 'settings')
    content = <Settings dark={dark} setDark={setDark} saved={() => setToast(ru.settingsSaved)} />;
  else if (route.page === 'deck' && selectedDeck)
    content = (
      <DeckPage
        deck={selectedDeck}
        back={() => go('library')}
        edit={() => go(`edit/${selectedDeck.id}`)}
        favorite={() => favorite(selectedDeck.id)}
        study={(mode) => startStudy(selectedDeck.id, mode)}
      />
    );
  else if (route.page === 'study' && selectedDeck)
    content = (
      <Study
        key={`${route.id}-${route.mode}`}
        deck={selectedDeck}
        mode={route.mode}
        back={() => openDeck(selectedDeck.id)}
        changeMode={(mode) => startStudy(selectedDeck.id, mode)}
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
          {(['home', 'library', 'folders', 'progress'] as const).map((page) => (
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
            <span>{ru.help}</span>
          </button>
          <div className="sidebar-caption">
            <span className="prototype-dot" />
            {ru.prototype}
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
                if (route.page !== 'library') navigate('library');
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
                <span className="avatar">М</span>
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
                      <strong>{ru.account}</strong>
                      <small>{ru.prototype}</small>
                    </div>
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
          <div className="page-content">{content}</div>
          <footer className="page-footer">
            <span>
              {ru.brand}
              <span className="dot">·</span>
              {ru.tagline}
            </span>
            <button onClick={() => setModal('help')}>{ru.prototype}</button>
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
          <p>{ru.helpText}</p>
          <button className="primary" onClick={closeModal}>
            {ru.gotIt}
            <ArrowRight size={17} />
          </button>
        </Modal>
      )}
      {modal === 'folder' && (
        <Modal title={ru.newFolder} close={closeModal}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!folderName.trim()) return;
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
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={closeModal}>
                {ru.cancel}
              </button>
              <button type="submit" className="primary">
                {ru.createFolder}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
