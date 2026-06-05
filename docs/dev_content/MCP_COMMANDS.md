# MCP Context Manager — команды

## Команды сохранения

- `cm_save_br`: brief auto-summary (200-300 символов)
- `cm_save_im`: important by topics (до 3K символов)
- `cm_save_fl`: full log (весь контент)

Параметры: `content`, `session_id` (optional), `agent` (optional), `topics` (для `cm_save_im`)

## Команды поиска

- `cm_search`: семантический поиск в своём контексте
  
  - `q` (required): запрос
  - `mode`: `br`/`im`/`fl` (default: `im`)
  - `n`: количество результатов (default: 5)
  - `agent`: фильтр по агенту (optional)

- `cm_query`: SQL-фильтры
  
  - `date`: ISO-дата (optional)
  - `agent`: имя агента (optional)
  - `session`: ID сессии (optional)
  - `mode`: `br`/`im`/`fl` (default: `im`)

- `cm_cross`: поиск в контексте другого агента
  
  - `q` (required): запрос
  - `from` (required): имя агента
  - `mode`: `br`/`im`/`fl` (default: `im`)
  - `n`: количество результатов (default: 5)

## Команды аналитики

- `cm_agents`: список агентов с количеством записей
- `cm_stats`: статистика (total/sessions/last_updated), параметры: `agent`, `session`
- `cm_export`: экспорт сессии в JSON, параметр: `session` (required), `agent` (optional)
- `cm_help`: справка по командам

## Настройка клиентов

См. `MCP_Context_Manager_Setup_2026-01-27.md` в репозитории.
