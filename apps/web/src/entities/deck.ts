export type { StudyMode } from '@memly/contracts';
export interface Card {
  id: string;
  term: string;
  definition: string;
  revision?: number;
}
export interface Deck {
  id: string;
  title: string;
  description: string;
  icon: string;
  count: number;
  progress: number;
  folder: string;
  favorite: boolean;
  cards: Card[];
  revision?: number;
  ownerId?: string;
  ownerName?: string;
  visibility?: 'private' | 'public';
  termLanguage?: 'ru' | 'en';
  definitionLanguage?: 'ru' | 'en';
}
export interface Folder {
  count?: number;
  revision?: number;
  id: string;
  title: string;
  icon: string;
}

const cards = (items: [string, string][]): Card[] =>
  items.map(([term, definition], i) => ({ id: String(i), term, definition }));

export const demoDecks: Deck[] = [
  {
    id: 'javascript',
    title: 'JavaScript',
    description: 'Основы языка: переменные, функции и работа с данными.',
    icon: 'JS',
    count: 87,
    progress: 12,
    folder: 'development',
    favorite: false,
    cards: cards([
      ['Замыкание', 'Функция вместе с её лексическим окружением'],
      ['Promise', 'Объект, представляющий результат асинхронной операции'],
      ['Массив', 'Упорядоченная коллекция элементов'],
      ['const', 'Объявление переменной без возможности переназначения'],
      ['Event loop', 'Механизм выполнения асинхронных задач'],
      ['Объект', 'Коллекция свойств вида ключ — значение'],
    ]),
  },
  {
    id: 'english-b1',
    title: 'Английский B1',
    description: 'Новые слова для уверенного общения каждый день.',
    icon: 'Aa',
    count: 56,
    progress: 36,
    folder: 'languages',
    favorite: true,
    cards: cards([
      ['Opportunity', 'Возможность'],
      ['Experience', 'Опыт'],
      ['Achieve', 'Достигать'],
      ['Improve', 'Улучшать'],
      ['Confident', 'Уверенный'],
      ['Discover', 'Открывать'],
    ]),
  },
  {
    id: 'networks',
    title: 'Компьютерные сети',
    description: 'Протоколы и технологии, которые связывают мир.',
    icon: 'layers',
    count: 64,
    progress: 28,
    folder: 'university',
    favorite: false,
    cards: cards([
      ['TCP', 'Протокол надёжной передачи данных'],
      ['IP', 'Протокол адресации и маршрутизации пакетов'],
      ['DNS', 'Система доменных имён'],
      ['Ethernet', 'Технология локальных сетей'],
      ['Маршрутизатор', 'Устройство передачи пакетов между сетями'],
      ['UDP', 'Протокол передачи датаграмм без установления соединения'],
    ]),
  },
  {
    id: 'english',
    title: 'Английский · Everyday English',
    description: 'Полезные выражения для маленьких и больших разговоров.',
    icon: 'Aa',
    count: 42,
    progress: 43,
    folder: 'languages',
    favorite: true,
    cards: cards([
      ['Little by little', 'Понемногу'],
      ['Take your time', 'Не торопись'],
      ['Make a difference', 'Изменить что-то к лучшему'],
      ['Keep in mind', 'Иметь в виду'],
      ['By the way', 'Кстати'],
      ['Sounds good', 'Звучит хорошо'],
      ['Give it a try', 'Попробуй'],
      ['See you soon', 'До скорой встречи'],
    ]),
  },
  {
    id: 'react',
    title: 'React · Основы',
    description: 'Компоненты, состояние и интерфейсы.',
    icon: 'code',
    count: 32,
    progress: 18,
    folder: 'development',
    favorite: false,
    cards: cards([
      ['Компонент', 'Независимая часть пользовательского интерфейса'],
      ['Props', 'Входные данные компонента'],
      ['State', 'Внутреннее состояние компонента'],
      ['useEffect', 'Хук синхронизации с внешней системой'],
    ]),
  },
  {
    id: 'biology',
    title: 'Биология · Клетка',
    description: 'Маленький мир внутри каждого живого организма.',
    icon: 'leaf',
    count: 28,
    progress: 72,
    folder: 'university',
    favorite: false,
    cards: cards([
      ['Митохондрия', 'Органоид, участвующий в синтезе АТФ'],
      ['Ядро', 'Органоид, содержащий генетический материал'],
      ['Рибосома', 'Структура, обеспечивающая синтез белка'],
      ['Мембрана', 'Барьер, регулирующий обмен веществ клетки'],
    ]),
  },
];

export const demoFolders: Folder[] = [
  { id: 'languages', title: 'Иностранные языки', icon: 'Aa' },
  { id: 'development', title: 'Разработка', icon: 'code' },
  { id: 'university', title: 'Университет', icon: 'book' },
];
