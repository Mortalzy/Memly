import { ConnectedApp } from './ConnectedApp';
import { Workspace } from './Workspace';

export function App({ demo = false }: { demo?: boolean }) {
  return demo ? <Workspace /> : <ConnectedApp />;
}
