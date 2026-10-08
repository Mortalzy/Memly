import { ArrowRight, Plus } from 'lucide-react';
import type { Deck, Folder } from '../entities/deck';
import { PageHeading, Symbol } from '../shared/ui';
import { deckCount, ru } from '../shared/ru';

export function Folders({
  folders,
  decks,
  open,
  create,
  remove,
}: {
  folders: Folder[];
  decks: Deck[];
  open: (id: string) => void;
  create: () => void;
  remove?: (folder: Folder) => Promise<void>;
}) {
  return (
    <>
      <PageHeading
        title={ru.folders}
        subtitle={ru.foldersHint}
        action={
          <button className="primary" onClick={create}>
            <Plus size={18} />
            {ru.newFolder}
          </button>
        }
      />
      <div className="folder-grid">
        {folders.map((folder) => (
          <div key={folder.id}>
            <button className="folder-tile" key={folder.id} onClick={() => open(folder.id)}>
              <div className="folder-top">
                <Symbol value={folder.icon} />
                <ArrowRight size={21} />
              </div>
              <h2>{folder.title}</h2>
              <p>
                {deckCount(
                  folder.count ?? decks.filter((deck) => deck.folder === folder.id).length,
                )}
              </p>
              <div className="folder-lines" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </button>
            {remove && (
              <button
                className="text-button"
                onClick={() => {
                  if (window.confirm('Удалить папку? Наборы сохранятся без папки.'))
                    void remove(folder);
                }}
              >
                Удалить папку
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
