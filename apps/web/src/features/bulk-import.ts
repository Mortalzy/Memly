import type { Card } from '../entities/deck';

export type ImportSeparator = 'space' | 'tab' | 'semicolon';
export type ImportIssue = 'missingPair' | 'termTooLong' | 'definitionTooLong';
export interface ImportRow {
  line: number;
  term: string;
  definition: string;
  issue?: ImportIssue;
}
export const maxDeckCards = 500;

export function parseCardList(text: string, separator: ImportSeparator): ImportRow[] {
  const boundary = separator === 'space' ? /[^\S\r\n]+/ : separator === 'tab' ? /\t/ : /;/;
  return text.split(/\r\n|\n|\r/).flatMap((raw, index) => {
    if (!raw.trim()) return [];
    // Preserve the separator at the edges so a missing term/definition remains an error.
    const line = raw.replace(/^\uFEFF/, '');
    const source = separator === 'space' ? line.trim() : line;
    const match = boundary.exec(source);
    const term = (match ? source.slice(0, match.index) : source).trim();
    const definition = match ? source.slice(match.index + match[0].length).trim() : '';
    const issue =
      !term || !definition
        ? 'missingPair'
        : term.length > 2000
          ? 'termTooLong'
          : definition.length > 5000
            ? 'definitionTooLong'
            : undefined;
    return [{ line: index + 1, term, definition, issue }];
  });
}

export function retainedDraftCards(cards: Card[]): Card[] {
  return cards.filter((card) => card.term.trim() || card.definition.trim());
}
