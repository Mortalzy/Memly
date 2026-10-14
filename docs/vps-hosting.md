# Memly на VPS: Ubuntu 24.04 / 26.04

Схема: браузер → HTTPS/Nginx → Express на 127.0.0.1:3001 → PostgreSQL на localhost.
Express отдаёт собранный React и API. systemd запускает сервер после перезагрузки.
Для одного тестового VPS Docker и PM2 не нужны. Домен в примерах — `memly.example`:
замените его на свой во всех настройках. Инструкция предназначена для нового VPS.

## 1. Установить программы

Нужны Node.js **24**, npm **11**, PostgreSQL **18**, Nginx, Certbot и git.
Установите системную версию Node.js 24 по [официальной инструкции](https://nodejs.org/en/download).
Проверьте `node -v`, `npm -v`, `command -v node`. Для systemd не используйте Node из
личного nvm-каталога; если системный node не в `/usr/bin/node`, измените ExecStart в службе.

PostgreSQL 18 из [официального репозитория](https://www.postgresql.org/download/linux/ubuntu/):

```bash
sudo apt update
sudo apt install -y git nginx certbot ufw postgresql-common
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh
sudo apt update
sudo apt install -y postgresql-18 postgresql-client-18
sudo systemctl enable --now postgresql nginx
```

Не используйте стандартный `compose.yaml` для публичной установки: он предназначен
для разработки с простым паролем. Сервер БД должен слушать только localhost:
проверьте `sudo -u postgres psql -c 'SHOW listen_addresses;'`.

## 2. Создать пользователя приложения и БД

```bash
sudo useradd --system --create-home --home-dir /var/lib/memly --shell /usr/sbin/nologin memly
sudo install -d -o memly -g memly /opt/memly
sudo -u memly git clone https://github.com/Mortalzy/Memly.git /opt/memly
sudo -u postgres createuser --login --pwprompt memly
sudo -u postgres createdb --owner=memly memly
cd /opt/memly
```

Введите отдельный случайный пароль БД. Роль memly не должна быть superuser.
Если нужны прежние аккаунты и наборы, сначала перенесите локальную БД резервной копией.
Новая пустая БД не содержит прежние данные.
Соединения приложения теперь используют UTC независимо от timezone PostgreSQL.
Если прежняя БД работала в другом часовом поясе, проверьте исторические даты прогресса
после переноса: ранее сохранённые моменты автоматически не пересчитываются.

## 3. Заполнить настройки

```bash
sudo -u memly cp deploy/production.env.example .env
sudo chmod 600 .env
sudo -u memly nano .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

В `.env` вставьте секрет из последней команды, пароль БД вместо CHANGE_ME и свой домен
в BETTER_AUTH_URL/TRUSTED_ORIGINS. В DATABASE_URL спецсимволы пароля требуют URL-кодирования.
Для Mail.ru укажите почту в SMTP_USER и SMTP_FROM, пароль приложения SMTP в SMTP_PASSWORD.
Не передавайте пароли в чат и не добавляйте `.env` в git. Секрет лучше сохранить при
последующих обновлениях: смена может отозвать сессии.

Оставьте NODE_ENV=production, HOST=127.0.0.1, PORT=3001, TRUST_PROXY=1, VITE_DEMO_MODE=false.
TRUST_PROXY=1 предполагает ровно один Nginx перед API; готовый конфиг перезаписывает
forwarded-заголовки. Для другой схемы проксирования настройку нужно пересмотреть.
Почтовые значения с пробелами можно заключить в двойные кавычки.

## 4. Подготовить приложение

```bash
sudo -u memly npm ci --include=dev
sudo -u memly npm run build:production
sudo -u memly npm run db:migrate
sudo -u memly npm run hosting:check
```

build:production проверяет production-настройки и принудительно отключает демо.
hosting:check проверяет сборку, БД, все миграции и SMTP-авторизацию без отправки письма.
При ошибке остановитесь и исправьте её. Проверка SMTP не гарантирует доставку:
после запуска нужен настоящий тест регистрации. Не используйте `db:migrate:dev` на VPS.

## 5. Подключить домен и выпустить сертификат

В DNS домена создайте A-запись на публичный IPv4 VPS. AAAA добавляйте только при
рабочем IPv6; ошибочная AAAA может мешать открытию сайта и выпуску сертификата.
В сетевом экране REG.RU разрешите SSH, TCP 80 и 443. Порты 3001 и 5432 не открывайте.

Для UFW сначала разрешите **свой SSH-порт** (ниже пример для стандартного 22):

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo mkdir -p /var/www/letsencrypt
sudo cp deploy/nginx-bootstrap.conf /etc/nginx/sites-available/memly
sudo nano /etc/nginx/sites-available/memly
sudo ln -s /etc/nginx/sites-available/memly /etc/nginx/sites-enabled/memly
sudo nginx -t
sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/letsencrypt -d memly.example
```

Замените домен в конфиге и команде Certbot. До выпуска сертификата временный конфиг
отвечает 503 на обычные запросы; каталог ACME доступен для проверки домена.
Метод описан в [документации Certbot](https://eff-certbot.readthedocs.io/en/stable/using.html#webroot).

Установите окончательный HTTPS-конфиг, заменив домен во всех местах:

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/memly
sudo nano /etc/nginx/sites-available/memly
sudo nginx -t
sudo systemctl reload nginx
sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy
```

Создайте `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx` с содержимым:

```sh
#!/bin/sh
/usr/sbin/nginx -t && /usr/bin/systemctl reload nginx
```

```bash
sudo chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx
sudo systemctl enable --now certbot.timer
sudo certbot renew --dry-run
```

## 6. Включить постоянный запуск

```bash
sudo cp deploy/memly.service /etc/systemd/system/memly.service
sudo systemd-analyze verify /etc/systemd/system/memly.service
sudo systemctl daemon-reload
sudo systemctl enable --now memly
sudo systemctl status memly --no-pager
curl --fail http://127.0.0.1:3001/api/ready
curl --fail https://memly.example/api/ready
```

Журнал: `sudo journalctl -u memly -n 100 --no-pager`. Проверяйте, что /api/ready
возвращает 200, главная открывается, регистрация отправляет письмо с HTTPS-ссылкой
на правильный домен, подтверждение позволяет войти, наборы и прогресс сохраняются.
Проверьте восстановление пароля, повторный вход и сохранение данных после
`sudo systemctl restart memly`. Порты БД и Express должны быть недоступны извне.

## 7. Резервная копия и обновление

В /opt/memly перед обновлением:

```bash
sudo -u memly npm run db:backup
```

Скопируйте полученный dump на другой компьютер; копия только на VPS не защищает
от потери сервера. Перед постоянной эксплуатацией настройте ежедневное копирование
за пределы VPS и проверьте восстановление. pg_dump должен быть версии 18.
Для пробного восстановления используйте отдельную пустую БД:

```bash
sudo -u postgres createdb --owner=memly memly_restore_test
sudo -u postgres pg_restore --exit-on-error --no-owner --role=memly --dbname=memly_restore_test /path/to/copy.dump
```

Файл должен быть читаем пользователем postgres; не делайте пользовательские дампы публичными.
Сравните данные восстановленной БД, затем удалите только эту тестовую БД.
Если файлы обновления уже проверены:

```bash
sudo systemctl stop memly
sudo -u memly git pull --ff-only
sudo -u memly npm ci --include=dev
sudo -u memly npm run build:production
sudo -u memly npm run db:migrate
sudo -u memly npm run hosting:check
sudo systemctl start memly
curl --fail https://memly.example/api/ready
```

На любом сбое не продолжайте команды автоматически. Простое обновление предусматривает
короткий простой; откат схемы БД требует отдельного решения, одного git checkout недостаточно.
Для VPS с небольшой RAM при нехватке памяти во время сборки потребуется swap либо
сборка в отдельной среде с тем же Node.js и совместимыми зависимостями.

## Фактический статус

Эти файлы готовят приложение к установке; сами по себе они не публикуют сайт.
DNS, сертификат, реальный SMTP, ресурсы VPS и внешнюю доступность проверяют на выбранном сервере.
Один экземпляр API использует локальный HTTP-лимитер; масштабирование на несколько
процессов требует общего хранилища. Объёмные DDoS-атаки требуют защиты провайдера.
