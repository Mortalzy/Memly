import { z } from 'zod';

export const starterKeySchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
export const addStarterSchema = z.strictObject({});
export interface StarterDeckDto {
  key: string;
  title: string;
  description: string;
  level: 'Начальный' | 'Базовый' | 'Средний';
  icon: 'book' | 'Aa' | 'layers' | 'leaf';
  count: number;
  addedDeckId: string | null;
}
export interface StarterDeckDetailDto extends StarterDeckDto {
  cards: { term: string; definition: string }[];
}
