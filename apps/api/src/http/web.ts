import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';

export function createWebRouter(directory: string) {
  // Fail before listening if the frontend has not been built.
  const index = join(directory, 'index.html');
  if (!existsSync(index) || !statSync(index).isFile()) {
    throw new Error('Сначала выполните npm run build в корне Memly');
  }
  const router = express.Router();
  const serve = express.static(directory, { dotfiles: 'ignore', redirect: false });
  router.use((req, res, next) => {
    // Unknown API routes must never resolve to a frontend file.
    if (req.path === '/api' || req.path.startsWith('/api/')) return next();
    return serve(req, res, next);
  });
  // The app uses hash routes: no catch-all HTML response for missing assets.
  return router;
}
