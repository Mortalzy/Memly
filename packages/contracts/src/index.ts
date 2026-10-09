import { z } from 'zod';

export const idSchema = z.uuid();
export const revisionSchema = z.number().int().positive();
export const cardInputSchema = z.strictObject({
  id: idSchema.optional(),
  term: z.string().trim().min(1).max(2000),
  definition: z.string().trim().min(1).max(5000),
});
export const deckInputSchema = z.strictObject({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).default(''),
  icon: z.enum(['book', 'JS', 'Aa', 'layers', 'code', 'leaf']).default('book'),
  visibility: z.enum(['private', 'public']).default('private'),
  termLanguage: z.enum(['ru', 'en']).default('en'),
  definitionLanguage: z.enum(['ru', 'en']).default('ru'),
  folderId: idSchema.nullable().default(null),
  cards: z
    .array(cardInputSchema)
    .min(2)
    .max(500)
    .refine(
      (cards) =>
        new Set(cards.flatMap((card) => (card.id ? [card.id] : []))).size ===
        cards.filter((card) => card.id).length,
      'ID карточек не должны повторяться',
    ),
});
export const deckUpdateSchema = deckInputSchema.extend({ revision: revisionSchema });
export const deleteSchema = z.strictObject({ revision: revisionSchema });
export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().trim().max(100).default(''),
  scope: z.enum(['mine', 'public']).default('mine'),
});
export const folderInputSchema = z.strictObject({
  title: z.string().trim().min(1).max(80),
  icon: z.enum(['folders', 'Aa', 'code', 'book']).default('folders'),
});
export const folderUpdateSchema = folderInputSchema.extend({ revision: revisionSchema });
export const favoriteSchema = z.strictObject({ favorite: z.boolean() });
export const reviewSchema = z.strictObject({
  eventId: idSchema,
  cardId: idSchema,
  cardRevision: revisionSchema,
  known: z.boolean(),
});
export const profileSchema = z.strictObject({ name: z.string().trim().min(2).max(100) });

export type DeckInput = z.infer<typeof deckInputSchema>;
export type DeckUpdate = z.infer<typeof deckUpdateSchema>;
export type FolderInput = z.infer<typeof folderInputSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
export interface UserDto {
  id: string;
  name: string;
  email: string;
}
export interface CardDto {
  id: string;
  term: string;
  definition: string;
  revision: number;
}
export interface FolderDto {
  count: number;
  id: string;
  title: string;
  icon: string;
  revision: number;
}
export interface DeckDto {
  id: string;
  title: string;
  description: string;
  icon: string;
  visibility: 'private' | 'public';
  termLanguage: 'ru' | 'en';
  definitionLanguage: 'ru' | 'en';
  ownerId: string;
  ownerName: string;
  revision: number;
  count: number;
  progress: number;
  folder: string;
  favorite: boolean;
  cards: CardDto[];
}
export interface PageDto<T> {
  items: T[];
  page: number;
  total: number;
  pages: number;
}
export interface ProgressDto {
  reviewed: number;
  known: number;
  decks: number;
}

export * from './study.ts';
export * from './starters.ts';
