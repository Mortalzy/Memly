export type Theme = 'light' | 'dark';
const themeKey = 'memly.theme';

export function readTheme(): Theme {
  try {
    return window.localStorage.getItem(themeKey) === 'dark' ? 'dark' : 'light';
  } catch {
    console.warn('Не удалось прочитать сохранённую тему Memly.');
    return 'light';
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function saveTheme(theme: Theme): boolean {
  try {
    window.localStorage.setItem(themeKey, theme);
    return true;
  } catch {
    return false;
  }
}
