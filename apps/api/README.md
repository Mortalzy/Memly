# @memly/api

Express API. Настройка и запуск описаны в [корневом README](../../README.md).
Контракт маршрутов — [docs/api.md](../../docs/api.md).
HTTP-слой в `src/http`, бизнес-сценарии и права — в `src/modules`.
`src/app.ts` создаёт тестируемое приложение, `src/server.ts` управляет запуском и остановкой.

Учебные HTTP-маршруты вызывают sessions.service: доступ, Serializable-транзакция,
идемпотентность, ревизии и перенос прогресса. Алгоритмы — в @memly/study-engine.
Снимки и события хранятся в study_sessions/study_events; правильные ответы теста
проецируются в DTO только после завершения. API-тесты требуют отдельную memly_test БД.
