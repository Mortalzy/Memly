# @memly/database

Prisma + PostgreSQL. Схема и SQL-миграции в `prisma`; generated client не хранится в git.
Из корня: `npm run db:generate`, `npm run db:migrate`.
Для создания новой миграции на dev-базе: `npm run db:migrate:dev -- --name change_name`.
Production использует только migrate deploy, без schema push.
