# API Memly

Базовый путь `/api/v1`. Все прикладные запросы требуют cookie-сессию Better Auth.
Мутации: `Content-Type: application/json` и `Origin` из `TRUSTED_ORIGINS`.
В development браузер обращается к Vite на 5173, который проксирует `/api` на 3001.

| Метод / путь                     | Результат                                      |
| -------------------------------- | ---------------------------------------------- |
| GET `/api/health`                | Процесс жив                                    |
| GET `/api/ready`                 | БД доступна, иначе 503                         |
| GET `/api/config`                | `emailEnabled`, без секретов                   |
| GET `/api/v1/me`                 | `{id, name, email}`                            |
| PATCH `/api/v1/me`               | Изменить `name` (2–100 символов)               |
| GET `/api/v1/decks`              | Пагинация наборов: `items, page, total, pages` |
| POST `/api/v1/decks`             | Создать набор с карточками, 201                |
| GET `/api/v1/decks/:id`          | Доступный набор со всеми карточками            |
| PUT `/api/v1/decks/:id`          | Полностью заменить содержимое своего набора    |
| DELETE `/api/v1/decks/:id`       | Удалить свой набор, тело `{revision}`, 204     |
| PUT `/api/v1/decks/:id/favorite` | `{favorite: boolean}`, 204                     |
| GET `/api/v1/folders`            | Личные папки с количеством наборов             |
| POST `/api/v1/folders`           | `{title, icon?}`, 201                          |
| PUT `/api/v1/folders/:id`        | `{title, icon?, revision}`                     |
| DELETE `/api/v1/folders/:id`     | `{revision}`, наборы остаются, 204             |
| POST `/api/v1/study/reviews`     | Самооценка текущей версии карточки, 204        |
| GET `/api/v1/study/progress`     | `{reviewed, known, decks}`                     |

Auth: Better Auth под `/api/auth`, включая `sign-up/email`, `sign-in/email`, `sign-out`,
`get-session`, `verify-email`, `request-password-reset`, `reset-password`.
Email-сценарии работают после настройки SMTP. После сброса пароля все старые сессии
отзываются. Пароли: 10–128 символов. Прикладные маршруты не возвращают auth-модели.

## Наборы

### Готовая подборка

- GET `/starter-decks` — 10 метаданных `StarterDeckDto`: key, title, description,
  icon, level, count и `addedDeckId` своей копии (или null). Карточки в список не входят.
- GET `/starter-decks/:key` — те же поля и все исходные пары `cards: [{term, definition}]`.
- POST `/starter-decks/:key/add`, тело `{}` — 200, обычный `DeckDto` личной private-копии
  с новыми ID карточек. Повтор возвращает существующую копию без перезаписи правок.

Неизвестный корректный key — 404, некорректный key/тело — 400. Все маршруты требуют
входа, POST дополнительно требует JSON и trusted Origin. Каталог не возвращает ID
копий других пользователей. Удалённую свою копию можно добавить заново. Подборка
доступна без seed; сложность указана ориентировочно. Подробнее: [ADR 0006](adr/0006-starter-decks.md).

### Пользовательские наборы

GET списка принимает `page` (от 1), `limit` (1–50, по умолчанию 20), `q` (до 100 символов)
и `scope=mine|public`. mine — свои и доступные публичные избранные; public — публичный
каталог. Поиск без учёта регистра, по названию и описанию; FTS пока не добавлен.
Список возвращает сводки с `cards: []`, GET конкретного набора — полное содержимое.

POST и PUT принимают:

```json
{
  "title": "Английский",
  "description": "Слова на каждый день",
  "icon": "Aa",
  "visibility": "private",
  "termLanguage": "en",
  "definitionLanguage": "ru",
  "folderId": null,
  "cards": [
    { "term": "One", "definition": "Один" },
    { "term": "Two", "definition": "Два" }
  ]
}
```

В PUT добавьте `revision` из последнего GET. У существующих карточек передайте их `id`,
у новых — опустите `id`. Отсутствующие в PUT карточки удаляются; порядок массива определяет
порядок карточек. Карточки сохраняются атомарно, чужие ID отклоняются. POST всегда
генерирует новые ID, даже если у входных карточек указан ID.

Ограничения: название 1–100, описание до 500, 2–500 карточек, термин 1–2000, определение
1–5000 символов. Значения trim; частично заполненные карточки отклоняются. Видимость
private/public, по умолчанию private. Языки первого этапа ru/en. Набор можно привязать
к одной своей папке. Папка другого пользователя и чужой private-набор возвращают 404.

Набор DTO: id, title, description, icon, visibility, языки, ownerId, ownerName, revision,
count, progress (процент известного содержимого текущих версий), folder, favorite, cards.
Папка владельца скрывается от других; favorite/progress всегда относятся к текущему
пользователю. Карточка DTO: id, term, definition, revision.

## Самооценка

```json
{
  "eventId": "b2ec6d9f-5f4d-433b-9952-8e8e2b149c75",
  "cardId": "5c1fd51b-c1b5-4b98-97e7-28c73d4d54bc",
  "cardRevision": 1,
  "known": true
}
```

Повтор запроса отправляется с тем же eventId и тем же содержимым. Он не увеличивает
число повторений. Другой payload с занятым ID получает 409. После изменения текста
прежний прогресс не учитывается; новая отметка должна относиться к актуальной ревизии.
Это самооценка, а не объективная оценка знаний, алгоритм FSRS или результат игры.

## Ошибки

```json
{
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Материал изменился. Обновите страницу перед сохранением.",
    "requestId": "серверный идентификатор"
  }
}
```

400 — входные данные; 401 — нет сессии; 403 — источник запроса; 404 — маршрут/материал
не найден или нет доступа; 409 — устаревшая версия/конфликт; 413 — размер тела;
415 — не JSON; 429 — лимит. Ошибки валидации дополнительно содержат безопасный массив
`details` с путями полей. Неожиданные ошибки не раскрывают SQL, пароли или stack trace.
Auth сохраняет собственный контракт ошибок Better Auth.

## Учебные сессии

| Маршрут                                                    | Назначение                                                 |
| ---------------------------------------------------------- | ---------------------------------------------------------- |
| POST `/api/v1/study/sessions`                              | Создать занятие (201), идемпотентный requestId             |
| GET `/api/v1/study/sessions/active?deckId=…&mode=…`        | Последнее активное или null                                |
| GET `/api/v1/study/sessions/:id`                           | Сохранённое состояние своего занятия                       |
| POST `/api/v1/study/sessions/:id/events`                   | Атомарное действие с ревизией и eventId                    |
| GET `/api/v1/study/overview?days=30`                       | Итоги периода и до 30 последних занятий                    |
| GET `/api/v1/study/activity?days=7&timeZone=Europe/Samara` | Календарный график завершённых занятий, серия и результаты |

Запуск:

```json
{
  "requestId": "cf867105-d90b-4b4a-b5f4-50ab98c1d124",
  "deckId": "5c1fd51b-c1b5-4b98-97e7-28c73d4d54bc",
  "mode": "learn",
  "options": {
    "direction": "forward",
    "answerType": "mixed",
    "count": 20,
    "shuffle": true,
    "filter": "all"
  }
}
```

Новый запуск из набора: mode cards/learn/test/match; direction: forward/reverse; answerType: choice/written/mixed;
count: 1–500 (ограничивается доступным объёмом), filter: all/learning/starred. Для повторения
конкретных карточек можно передать cardIds (1–500 уникальных UUID из того же набора).
Новый запуск того же режима/набора закрывает прежнее активное как abandoned.

Новые optional-настройки: cardSorting boolean; learnMethod learn/write/spell; retype boolean;
audioSpeed 0.7/1; grading strict/typos; singleAnswer boolean; testTypes — непустой список
written/choice/truefalse/matching; matchGame boolean (до 6 пар и штрафы). Без этих полей
сохраняются прежние правила снимка. DTO включает penaltyMs, learning (familiar/mastered/
total/streak), summary.reviewed; current может содержать starred и audio только в диктанте.
Истинность truefalse, ожидаемые ответы и внутренние индексы в незавершённом тесте скрыты.

Действие: `{eventId, revision, action}`. action:

- cards: `{type:'navigate', index}`, `{type:'rate', questionId, known}`, `{type:'review', questionId}` без сортировки либо `{type:'shuffle'}`;
- learn: `{type:'answer', questionId, value}` / `{type:'skip', questionId}`, затем `{type:'next'}`; при ошибке `{type:'retype', value}` или разрешённый `{type:'override'}`;
- test: `{type:'test', finish:false|true, answers:[{questionId,value}]}`;
- match: `{type:'pair', left, right}` с ID плиток из текущей доски; в matchGame `{type:'mismatch', first, second}` для двух разных свободных плиток одной стороны;
- cards/learn: `{type:'star', questionId, starred}` — личная звёздочка без учебной оценки;
- scanword: `{type:'scanword-draft', round, cells:[{key,value}]}` — полный снимок
  заполненных клеток текущего раунда; отсутствие незаблокированной клетки очищает её;
- scanword: `{type:'scanword-check', round, cells:[{key,value}]}` — сохранение того же
  снимка и проверка полностью заполненных слов;
- scanword: `{type:'scanword-hint', round, wordId}` — открыть одну букву;
- scanword: `{type:'scanword-next', round}` — переход после проверки всех слов поля;
- любой режим: `{type:'abandon'}`.

В choice value — ID предложенного варианта; в written — текст. Пустой value допускается
в черновике теста. Завершение с пропусками требует allowUnanswered=true; пропуск оценивается как ошибка. В truefalse value — true/false как строка, в matching — ID варианта из группы. Неизвестные
вопросы, плитки, повторные пары и чужие карточки отклоняются. Один eventId с другим
payload — 409; устаревшая revision — 409. Идентичный повтор возвращает актуальное
состояние без повторного счёта. После завершения новые действия запрещены.

DTO содержит настройки, статус, summary, current/questions, черновики, feedback и доску.
Тест до сдачи не возвращает правильные ответы или results. После сдачи results содержит
ответ, эталон, правильность и число ошибок каждой карточки. Сводка заучивания показывает
правильные первые попытки и освоенные ступени; подбор — найденные пары и отдельный счётчик
ошибок. elapsedMs — серверное время с паузами и штрафами matchGame, bestMs — личный рекорд подбора для одинакового
набора/ревизии/направления/объёма. days в overview: 1–366, период — последние days×24 часа.

Правка набора не меняет снимок занятия, но outdated=true предупреждает об изменении.
Прогресс изменённых/удалённых карточек не перезаписывается старым снимком. Доступ к
набору проверяется при каждом чтении/действии и в истории. Удаление набора каскадно
удаляет его учебные сессии; ReviewEvent сохраняется. Полные правила — ADR 0005.

### Активность по календарным дням

`GET /study/activity` принимает `days=7|30` (по умолчанию 7), необязательный
`mode=cards|learn|test|match|scanword` и валидный IANA `timeZone` (по умолчанию UTC).
Неверные значения — 400. DTO `StudyActivity`: `timeZone`, `today` (YYYY-MM-DD),
`days: [{date, completed}]` по возрастанию, `completed`, `activeDays`, `streak`,
`todayByMode: {cards, learn, test, match, scanword}`, `history` (до 30 последних завершённых
занятий в выбранном периоде, по completedAt убыванию).

Считаются свои завершённые сессии доступных наборов и готовых уровней сканворда.
Все выбранные карточки или слова должны быть пройдены до конца; оценка не влияет на зачёт. Повторы считаются
отдельными сессиями. Даты берутся по завершению, включая занятия, начатые до периода.
Нулевые дни включены. Серия не ограничена 7/30 днями и сохраняется до конца сегодняшнего
дня, если вчера было занятие. При фильтре режима остальные todayByMode равны нулю.
Период старого `/study/overview` остаётся rolling по startedAt для полной истории.

### Готовые уровни сканворда

- GET `/games/scanword/levels` → `{levels, completed, total:5}`. Каждый уровень содержит
  id, number, title, wordCount, difficulty, revision, unlocked, completed, completedAt,
  activeSessionId. Поле completed — число уникальных пройденных уровней, не число попыток.
- GET `/games/scanword/levels/:levelId/active` → активная StudySessionDto или null.
- POST `/games/scanword/levels/:levelId/sessions` с `{requestId:UUID}` → 201 StudySessionDto.
  Другие поля запрещены: слова, сетка и правила берутся из серверного каталога.

levelId: warmup / around-us / nature / science / final. Количество слов: 6 / 8 / 10 / 12 / 15.
Каждый уровень имеет одну неизменную сетку; вопросы и ответы на английском (revision=2). Следующий уровень
доступен только после completed-сессий всех предыдущих у этого пользователя; запуск
и восстановление закрытого уровня возвращают 403 LEVEL_LOCKED. Галочки остаются после
повторных/прерванных игр. Повторный запуск того же уровня закрывает прежнюю активную
попытку как abandoned. requestId с другим уровнем или содержимым → 409 EVENT_CONFLICT.

DTO сессии/истории для уровней: mode=scanword, deckId=null, levelId, deckTitle=название
уровня, deckRevision=версия содержания. Прежние занятия имеют обычный deckId и levelId=null.
Автоматическое восстановление и activeSessionId учитывают только текущую редакцию уровня.
Завершённые попытки прежних редакций сохраняют галочки и открытые уровни. Прямой GET
старой попытки возвращает её прежний снимок с outdated=true; запуск новой английской
попытки закрывает прежнюю активную. Схема БД не меняется.

Общие GET `/study/sessions/:id` и POST `/study/sessions/:id/events` проверяют владельца;
чужая сессия → 404. Действия, eventId и revision остаются общими. `scanword-next` существует
для восстановления старых многораундовых игр; новые уровни завершаются на одном поле.

Новое создание mode=scanword через POST `/study/sessions` → 400 READY_LEVELS_ONLY.
Старые сканворды из наборов можно восстановить и завершить; их доступ по-прежнему
зависит от доступности набора. Общая история, overview и activity учитывают оба источника.

Поле DTO scanword содержит размеры, round/rounds, слова с координатами, направлением,
длиной, подсказкой и стабильными ID; клетки block/clue/letter с key, wordIds, value,
locked; wrongWords и общий счётчик подсказок. Поле не больше 22×22. Эталонные ответы
скрыты в активном DTO, раскрывается только открытая/разгаданная буква. После завершения
results содержит ответы всех слов, mistakes и hints.

Черновик — полный снимок заполненных клеток текущего поля; отсутствие незаблокированной
клетки очищает её. Ключи не повторяются, открытые буквы неизменны. Пустые/неполные слова
не создают попытку, неверный полный ответ увеличивает ошибки; верный блокирует буквы.
Подсказка учитывается у всех неразгаданных слов на пересечении и сама не завершает слово.
Только проверка всех слов завершает уровень и открывает следующий. Новые игры не пишут
CardProgress/ReviewEvent. Score — доля слов с первого раза без подсказок, mastered — слова
без подсказок. Полное повторное прохождение даёт ещё одно занятие в графике; повтор
того же завершающего eventId не даёт второго зачёта. `completedAt` и время вычисляет сервер.
