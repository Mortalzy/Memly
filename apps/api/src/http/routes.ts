import { Router } from 'express';
import {
  deckInputSchema,
  deckUpdateSchema,
  deleteSchema,
  favoriteSchema,
  folderInputSchema,
  folderUpdateSchema,
  idSchema,
  pageSchema,
  profileSchema,
  reviewSchema,
  startStudySchema,
  studyEventSchema,
  activeStudySchema,
  activityQuerySchema,
  starterKeySchema,
  addStarterSchema,
  type UserDto,
} from '@memly/contracts';
import type { PrismaClient } from '@memly/database';
import { createDeckService } from '../modules/decks/decks.service.ts';
import { createLibraryService } from '../modules/library/library.service.ts';
import { z } from 'zod';
import { createStudySessionService } from '../modules/study/sessions.service.ts';
import { createStudyService } from '../modules/study/study.service.ts';
import { createStarterService } from '../modules/starters/starters.service.ts';
import { createActivityService } from '../modules/study/activity.service.ts';

export function createRoutes(db: PrismaClient): Router {
  const router = Router();
  const decks = createDeckService(db);
  const library = createLibraryService(db);
  const study = createStudyService(db);
  const sessions = createStudySessionService(db);
  const starters = createStarterService(db);
  const activity = createActivityService(db);
  router.get('/me', (_req, res) => {
    res.json(res.locals.user as UserDto);
  });
  router.patch('/me', async (req, res) => {
    const data = profileSchema.parse(req.body);
    res.json(
      await db.user.update({
        where: { id: res.locals.user.id },
        data,
        select: { id: true, name: true, email: true },
      }),
    );
  });
  router.get('/decks', async (req, res) => {
    res.json(await decks.list(res.locals.user.id, pageSchema.parse(req.query)));
  });
  router.get('/starter-decks', async (_req, res) => {
    res.json(await starters.list(res.locals.user.id));
  });
  router.get('/starter-decks/:key', async (req, res) => {
    res.json(await starters.get(res.locals.user.id, starterKeySchema.parse(req.params.key)));
  });
  router.post('/starter-decks/:key/add', async (req, res) => {
    addStarterSchema.parse(req.body);
    res.json(await starters.add(res.locals.user.id, starterKeySchema.parse(req.params.key)));
  });
  router.post('/decks', async (req, res) => {
    res.status(201).json(await decks.create(res.locals.user.id, deckInputSchema.parse(req.body)));
  });
  router.get('/decks/:id', async (req, res) => {
    res.json(await decks.get(res.locals.user.id, idSchema.parse(req.params.id)));
  });
  router.put('/decks/:id', async (req, res) => {
    res.json(
      await decks.update(
        res.locals.user.id,
        idSchema.parse(req.params.id),
        deckUpdateSchema.parse(req.body),
      ),
    );
  });
  router.delete('/decks/:id', async (req, res) => {
    await decks.remove(
      res.locals.user.id,
      idSchema.parse(req.params.id),
      deleteSchema.parse(req.body).revision,
    );
    res.status(204).end();
  });
  router.put('/decks/:id/favorite', async (req, res) => {
    await decks.favorite(
      res.locals.user.id,
      idSchema.parse(req.params.id),
      favoriteSchema.parse(req.body).favorite,
    );
    res.status(204).end();
  });
  router.get('/folders', async (_req, res) => {
    res.json(await library.list(res.locals.user.id));
  });
  router.post('/folders', async (req, res) => {
    res
      .status(201)
      .json(await library.create(res.locals.user.id, folderInputSchema.parse(req.body)));
  });
  router.put('/folders/:id', async (req, res) => {
    res.json(
      await library.update(
        res.locals.user.id,
        idSchema.parse(req.params.id),
        folderUpdateSchema.parse(req.body),
      ),
    );
  });
  router.delete('/folders/:id', async (req, res) => {
    await library.remove(
      res.locals.user.id,
      idSchema.parse(req.params.id),
      deleteSchema.parse(req.body).revision,
    );
    res.status(204).end();
  });
  router.post('/study/reviews', async (req, res) => {
    await study.review(res.locals.user.id, reviewSchema.parse(req.body));
    res.status(204).end();
  });
  router.get('/study/progress', async (_req, res) => {
    res.json(await study.progress(res.locals.user.id));
  });
  router.post('/study/sessions', async (req, res) => {
    res
      .status(201)
      .json(await sessions.start(res.locals.user.id, startStudySchema.parse(req.body)));
  });
  router.get('/study/sessions/active', async (req, res) => {
    const input = activeStudySchema.parse(req.query);
    res.json(await sessions.active(res.locals.user.id, input.deckId, input.mode));
  });
  router.get('/study/sessions/:id', async (req, res) => {
    res.json(await sessions.get(res.locals.user.id, idSchema.parse(req.params.id)));
  });
  router.post('/study/sessions/:id/events', async (req, res) => {
    res.json(
      await sessions.event(
        res.locals.user.id,
        idSchema.parse(req.params.id),
        studyEventSchema.parse(req.body),
      ),
    );
  });
  router.get('/study/overview', async (req, res) => {
    const days = z.coerce.number().int().min(1).max(366).default(30).parse(req.query.days);
    res.json(await sessions.overview(res.locals.user.id, days));
  });
  router.get('/study/activity', async (req, res) => {
    res.json(await activity.get(res.locals.user.id, activityQuerySchema.parse(req.query)));
  });
  return router;
}
