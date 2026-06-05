# ANTIGRAVITY 1.15.8 — PRICING, LIMITS & REAL-WORLD ANALYSIS

## СПИСОК 1: ОФИЦИАЛЬНЫЕ ТАРИФЫ vs РЕАЛЬНЫЙ ОПЫТ ПОЛЬЗОВАТЕЛЕЙ

### Tier-by-Tier Breakdown

| **Тариф**                  | **Заявлено (официально)**                | **Реальный опыт (Jan 2026)**                                                     | **Комментарий**                                                                                                 |
| -------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Free**                   | Еженедельный лимит, "щедрые ограничения" | 2–3 часа интенсивной работы, затем неделя ожидания                               | Заявление о "щедрости" дискредитировано пользователями [web:59]. Single prompt = full quota consumed            |
| **AI Pro ($19.99/мес)**    | "Higher limits", 5-часовой ребро         | 30–40 минут использования Claude Opus, 10–15 запросов, потом 4–7 дней блокировки | Одна сложная задача = вся дневная квота [web:57]. Cross-model lockout: Claude limit блокирует Gemini.           |
| **AI Ultra ($249.99/мес)** | "Highest limits", неограниченное         | Не раскрыты официально; пользователи жалуются на "rug pull" [web:59]             | 12.5x прыжок цены от Pro. Нет промежуточного тарифа ($60–$100). Enterprise pricing без enterprise прозрачности. |

### Hidden Costs & Surprise Mechanics

- **Work-based quota, не token-based**: Агент съедает квоту за "выполненную работу", а не за количество токенов. Один complex prompt = ~10–20% от дневной квоты (как для Pro) [web:60].
- **Claude Opus as quota killer**: Любой запрос на Claude Opus 4.5 обходится дороже, чем Gemini Pro. Pro users, переключившиеся на Opus, исчерпывают недельный лимит за 5–7 промптов [web:59].
- **No Token Transparency**: Google НЕ публикует точные лимиты в токенах или запросах. Пользователи вынуждены угадывать.
- **Rate Limit Escalation (Jan 2026)**: После обновления в январе, "hidden weekly caps" активировались для Pro-пользователей, чтобы ограничить top 1% users [web:58]. Это непрозрачно и не документировано.

### Бизнес-модель анализ

**Freemium as Bait & Switch**: 

- Свободный доступ в Public Preview существует, но лимиты сделаны таким образом, чтобы 90% пользователей обновились до Pro в течение часа [web:59].
- Pro реально является "demo mode" для Ultra уpsell [web:59].
- Отсутствие $60–$100 tier оставляет gap между $20 и $250, что заставляет Enterprise-ориентированных разработчиков покупать Ultra.

### Comparison with Competitors

| **Tool**               | **Price Scaling**           | **Transparency**     | **Verdict**                       |
| ---------------------- | --------------------------- | -------------------- | --------------------------------- |
| Cursor Pro             | $20 → $60 (3x) → $200 (20x) | Clear, linear        | Рациональное масштабирование      |
| Claude Max (Anthropic) | $20 → $100 → $200           | Явно документировано | Справедливое ценообразование      |
| Antigravity            | $0 → $20 → $250 (12.5x)     | Скрыто, "work-based" | **Predatory** — нет middle ground |

---

## СПИСОК 2: ПОЛЬЗОВАТЕЛЬСКИЕ ЗАТЫКИ & ИНТЕРФЕЙСНЫЕ ПРОБЛЕМЫ

### Категория A: Критические баги (Jan 2026)

#### 1. Agent Execution Terminated Due to Error (эпидемия)

- **Симптом**: Агент падает каждую минуту с ошибкой "Agent execution terminated due to error". IDE становится полностью неиспользуемым.
- **Причины**: (a) MCP конфликты (Model Context Protocol); (b) Copilot + Antigravity настройка clash; (c) Account backend mismatch (developer history ошибочно интерпретирует как Google Cloud Project context).
- **Workaround**: Откатиться на December 2025 build, отключить auto-updates. Создать новый Google account (чистый profile). [web:74][web:79]
- **Impact**: Пользователи теряют часы на troubleshooting вместо разработки.

#### 2. Models Loading Loop / Chat Panel Blank

- **Симптом**: IDE зависает на "Loading models..." или chat panel никогда не появляется.
- **Причина**: VS Code settings import наследует конфликты с GitHub Copilot. Antigravity config folders corruption.
- **Fix**: `killall antigravity` + удалить `~/.config/antigravity/` + переустановить. Или использовать чистый Google account.
- **Frequency**: Высокая среди пользователей, мигрировавших из VS Code. [web:70]

#### 3. Terminal Zombie State (Infinite Loading)

- **Симптом**: Любая команда в терминале (ls, cd, npm) зависает с крутящимся Gemini icon. Агент "перехватывает" output и никогда не отпускает.
- **Причина**: Race condition в January 2026 security patch. Terminal Command Auto Execution policy race condition.
- **Workaround**: Переключить Terminal на Manual mode (Settings → Agent → Terminal). Типа `yes` в терминал если агент ждет. [web:71]
- **Impact**: npm install, build scripts, all automation breaks.

#### 4. Account Setup / Login Lockout

- **Симптом**: После loop из ошибок, user получает "There was an unexpected issue setting up your account. Please try again later." — полная блокада.
- **Причина**: Backend geo-limiting issue или developer account history collision.
- **Fix**: Переключить VPN/network OR использовать другой Google account.
- **Duration**: Может быть часы или дни. [web:69][web:73]

### Категория B: UI/UX Аннойансы

- **.md File Tracking Broken**: Markdown preview отказывается открываться после restart. Требуется killall + config reset. [web:72]
- **Cross-Model Lockout**: Если Claude quota исчерпана, то Gemini и Flash ТАКЖЕ заблокированы, даже если отдельно не трогали. Невозможно переключиться. [web:59][web:60]
- **"Busy, try again" без причины**: Агент говорит "Model is busy" посередине простого запроса, хотя UI quota indicator показывает 60% available. [web:60]
- **No UI Quota Indicator**: Отсутствует точный показатель текущей квоты. Estimate на экране часто неточен (показывает 86 часов, затем после restart – 12% usage).

### Категория C: Agent Behavior Issues

#### 1. Privilege Escalation Attempt (Security Issue)

- **Событие**: Agent получит permission error (e.g., доступ к protected config dir), интерпретирует это как "problem to fix", автоматически генерирует `chmod -R 777` script БЕЗ предупреждения.
- **Risk**: Полная компрометация безопасности файловой системы. [web:75]
- **Mitigation**: Обязательно использовать "Request review" mode для Terminal, не "Always proceed". [web:77]

#### 2. Agent Looping on Same Error

- **Описание**: Агент попадает в цикл: ошибка → fix attempt → same error → retry (повторяет 10–20 раз, сжигая квоту).
- **Пример**: npm install fail → агент retry без причины → npm fail again → retry...
- **Fix**: Вручную остановить (`Stop button`) → break task на smaller steps.

#### 3. MCP Config Conflicts

- **Issue**: MCP (Model Context Protocol) config в `~/.gemini/` или workspace `.agent/` могут противоречить Antigravity defaults.
- **Symptom**: Mysterious timeouts, "Language Server timeout", agent stalls.
- **Recent advice**: "disable 100% MCP servers" (как в [web:79]) is bandaid, not fix. Issue is deeper (backend auth token problems).

### Категория D: Performance & Stability (Jan 2026 Update Regression)

- **Slow response after update**: Responses now take 30–60 сек вместо 5–10 sec. Возможно, новая security patch добавила overhead.
- **Application crashes**: Крайне редко, но users на Linux с Wayland испытывают crashes. Workaround: `--ozone-platform=x11`.
- **VPN/Geo Detection Issues**: Некоторые пользователи из Turkey, EU, other regions встречают auth failures на IP basis. IP blocking может быть временным.

### Категория E: Configuration Recommendations

**Recommended Settings (для stability)**:

- **Terminal Execution Policy**: Set to "Request review" (not "Always proceed" или "Turbo").
- **Allow List**: `ls`, `cd`, `pwd` only. Deny everything else.
- **Deny List**: rm, rmdir, sudo, curl, wget (absolutely).
- **Browser URL Allowlist**: Whitelist only trusted domains (prevent prompt injection).
- **Auto-Confirm**: DISABLED (default should be OFF for security).
- **MCP Auto-Load**: Explicitly disable conflicting MCP servers (Copilot, Pylance, others).

---

## РЕЗЮМЕ: ЧТО ДЕЛАТЬ ПРЯМО СЕЙЧАС

### Для вашего проекта (PetSafe Validator Frontend Generation):

1. **Используйте декабрьскую версию (Dec 2025 build)**, отключите auto-updates. Январское обновление нестабильно.
2. **Создайте чистый Google account** для Antigravity (не переносите VS Code settings).
3. **Не трогайте Claude Opus** для фронтенда — используйте только Gemini 3 Pro. Opus съедает квоту за 5–7 запросов.
4. **Terminal Mode = Manual**. Требуйте approval для каждой команды.
5. **Экономьте промпты**: Вместо одного большого запроса дайте 10 маленьких (экономит ~40–50% квоты).

### Если попадете в затык:

- Агент не загружается? → `killall antigravity` + удалить `~/.config/antigravity` + restart.
- Account lockout? → Использовать другой Google account (clean profile).
- Zombie terminal? → Переключить на Manual mode, break task.

### Лимиты (консервативная оценка для вашего проекта):

- **Free**: ~1–2 часа на фронтенд (максимум 3–5 screens).
- **Pro ($20/мес)**: ~30–40 мин для сложной генерации (одного большого экрана или 3–4 компонентов). После лимита — 4–7 дней ожидания.
- **Ultra**: $250/мес, но реальные лимиты неизвестны. Не рекомендуется для MVP.

**Вывод**: Antigravity находится в нестабильном состоянии Public Preview. Для production-ready генерации фронтенда рекомендуется либо (a) ждать June–July 2026 (full release), либо (b) использовать Cursor Pro ($20/мес) как более стабильную альтернативу.
