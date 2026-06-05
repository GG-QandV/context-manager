> **NOTE 2026-06-04:** Пути `~/.iflow/`, упоминаемые в этом документе, — устаревшие.
> Актуальное расположение конфигов определяется функцией `getConfigDir()`:
> - **Linux:** `~/.config/iflow/`
> - **macOS:** `~/Library/Application Support/iflow/`
> - **Windows:** `%APPDATA%/iflow/`
> Старый путь `~/.iflow/` автоматически мигрируется при старте сервера (см. `src/config/migration.ts`).

## РАУНД 1: Архитектурное решение

**Архитектор:**  
Два подхода:

- A) Модифицировать iFlow CLI (форк исходников)
- B) Внешний wrapper через hooks + MCP-сервер

**Backend Engineer:**  
Вариант A - сложно, закрытый код iFlow. Вариант B - hooks SubagentStop недостаточно (нет доступа к размышлениям).

**Node.js Expert:**  
Третий путь: MCP-сервер как инструмент. iFlow поддерживает MCP. Агенты сами вызывают context_save/context_search.

**Архитектор:**  
Принято. MCP-сервер + модификация systemPrompt дефолтного агента.

---

## РАУНД 2: Автоматизация поиска/сохранения

**Backend Engineer:**  
Проблема: как заставить агента ВСЕГДА искать контекст?

**Node.js Expert:**  
Добавить в systemPrompt дефолта:

text

```text
ОБЯЗАТЕЛЬНО перед ответом:
1. Если вопрос требует контекста -> context_search <query>
2. После завершения задачи -> context_save <summary>
```

**DevOps Engineer:**  
Недостаточно. Агент может проигнорировать. Нужен хук на уровне CLI.

**Архитектор:**  
Комбинация: systemPrompt + hook SessionEnd для гарантии.

---

## РАУНД 3: Фильтрация мусора

**DB Architect:**  
Не сохранять всё. Только:

- Финальные выводы агентов
- Ключевые решения
- Артефакты (код, команды)

**Backend Engineer:**  
Кто фильтрует? Дефолтный агент или отдельный агент-фильтр?

**Node.js Expert:**  
Дефолтный агент в конце задачи вызывает:

text

```text
context_save {
  task: "описание",
  key_decisions: ["решение1", "решение2"],
  artifacts: ["код", "команды"],
  next_steps: ["что дальше"]
}
```

**Архитектор:**  
Принято. Структурированная суммаризация в JSON.

---

## РАУНД 4: Размышления из логов

**DevOps Engineer:**  
Проблема: размышления в верхней части терминала недоступны для hook.

**Node.js Expert:**  
iFlow пишет логи в ~/.iflow/history/. Можно парсить.

**Backend Engineer:**  
Слишком сложно. Пропустить размышления, сохранять только финальные ответы.

**Архитектор:**  
Согласен. Размышления = служебная информация. В к-м только результаты.

---

## РАУНД 5: Три уровня суммаризации

**DB Architect:**  
Сохранять три записи в БД с разными logical_section:

- summary_brief
- summary_medium
- summary_detailed

**Backend Engineer:**  
Нет. Одна запись с metadata: {summary_level: "all"}. Поиск по весу.

**Node.js Expert:**  
Компромисс: одна запись с полями:

json

```json
{
  "brief": "50 символов",
  "medium": "200 символов",
  "detailed": "полный текст"
}
```

**Архитектор:**  
Принято. Один вектор для detailed, поиск возвращает все уровни.

---

## РАУНД 6: Контекст при смене $агента

**Backend Engineer:**  
При $агент контекст теряется. Как передать?

**DevOps Engineer:**  
Hook AgentSwitch -> auto context_search перед стартом нового агента.

**Node.js Expert:**  
Проблема: такого хука нет в iFlow. Решение: модифицировать systemPrompt каждого агента.

**Архитектор:**  
Добавить во ВСЕ агенты в ~/.iflow/agents/:

yaml

```yaml
systemPrompt: |
  ...existing...

  ПЕРЕД началом работы: вызови context_search для поиска релевантного контекста из предыдущих сессий.
```

---

## РАУНД 7: Краш Ctrl+C

**DevOps Engineer:**  
При Ctrl+C контекст теряется. Нужен периодический авто-сейв.

**Backend Engineer:**  
Каждые N сообщений агент авто-сохраняет промежуточное состояние.

**Node.js Expert:**  
Невозможно без модификации CLI. Альтернатива: wrapper-скрипт через trap SIGINT.

**Архитектор:**  
Wrapper-скрипт при выходе вызывает финальное сохранение. Создадим iflow_context.sh.

---

## ИТОГОВОЕ РЕШЕНИЕ

**Архитектор:**

**Архитектура:**

text

```text
User → iflow_context.sh wrapper → iFlow CLI
                                    ↓
                          MCP Context Server
                                    ↓
                          Context Manager API → PostgreSQL + Qdrant
```

**Компоненты:**

1. MCP-сервер для context_save/context_search
2. Модификация systemPrompt дефолтного агента
3. Модификация всех агентов (массово)
4. Wrapper-скрипт для trap SIGINT
5. Периодический батч-sync в фоне

**Следующий шаг:**  
Батч команд для реализации каждого компонента.

**ДОПОЛНЕНИЕ К СПИСКУ ХОТЕЛОК**

11. Ручное управление: команды /cm on, /cm off, /cm status
12. Уровни записи: краткий/важный/полный (переключаемые)
13. Выборочная запись по типу: только списки/таблицы/код/команды/ошибки
14. Запросы контекста: "покажи краткое саммари сессий позавчера после 20:00"
15. Фильтры по датам, времени, агентам, типу контента

---

## РАУНД 8: Управление и конфигурация

**Архитектор:**
Нужен конфиг для управления. Где хранить?

**DevOps Engineer:**
Создать ~/.iflow/context-manager-config.json:

```json
{
  "enabled": true,
  "level": "important",
  "capture_types": ["all"],
  "auto_summarize": true
}
```

**Node.js Expert:**
Добавить команды в дефолтный агент:

```
/cm on - включить запись
/cm off - выключить
/cm level brief|important|full
/cm capture lists,tables,code
/cm status
```

**Backend Engineer:**
Агент должен читать конфиг перед каждым сохранением.

**Архитектор:**
Принято. Конфиг + команды управления.

---

## РАУНД 9: Уровни записи

**DB Architect:**
Три уровня записи в metadata:

```json
{
  "level": "brief",
  "content": {
    "brief": "задача выполнена",
    "important": "создал API /users, добавил валидацию",
    "full": "полный лог с кодом и командами"
  }
}
```

**Backend Engineer:**
Проблема размера. Full может быть 50KB на одну задачу.

**Node.js Expert:**
Лимиты по уровням:

- brief: max 200 символов
- important: max 2000 символов  
- full: без лимита

Хранить full в отдельном поле, индексировать только brief/important.

**Архитектор:**
Принято. Три поля в БД: content_brief, content_important, content_full.

---

## РАУНД 10: Выборочная запись

**Backend Engineer:**
Фильтрация по типу контента:

- lists: начинается с "-" или "1."
- tables: содержит "|" или разделители
- code: в блоках ```
- commands: начинается с $ или содержит curl/docker
- errors: содержит "error", "failed", "exception"

**Node.js Expert:**
Агент перед сохранением определяет типы:

```javascript
const types = detectContentTypes(response);
// ["code", "commands"]

if (config.capture_types.includes("all") || 
    types.some(t => config.capture_types.includes(t))) {
  context_save(response);
}
```

**DevOps Engineer:**
Добавить команду:

```
/cm capture all
/cm capture code,commands,errors
/cm capture lists,tables
```

**Архитектор:**
Принято. Детекция типов + фильтрация.

---

## РАУНД 11: Запросы контекста по времени

**DB Architect:**
SQL запросы с фильтрами:

```sql
SELECT * FROM development_context 
WHERE created_at >= '2026-01-10 20:00' 
  AND created_at < '2026-01-11'
  AND logical_section = 'summary_brief'
ORDER BY created_at DESC;
```

**Node.js Expert:**
Добавить endpoint в API:

```
POST /api/context/query
{
  "date_from": "2026-01-10T20:00:00",
  "date_to": "2026-01-11T23:59:59",
  "level": "brief",
  "agent": "code-reviewer"
}
```

**Backend Engineer:**
Агент должен понимать естественный язык:

```
User: покажи краткое саммари сессий позавчера после 20:00

Agent парсит:
- date: позавчера = 2026-01-10
- time: после 20:00 = >= 20:00:00
- level: краткое = brief
- type: саммари = summary

Вызывает context_query с параметрами.
```

**Архитектор:**
Принято. NLP парсинг + структурированный запрос.

---

## РАУНД 12: Команды просмотра

**Node.js Expert:**
Полный список команд управления:

```
/cm on|off - включить/выключить
/cm status - текущие настройки
/cm level brief|important|full - уровень записи
/cm capture [types] - типы контента
/cm show <query> - показать контекст
/cm sessions - список сессий
/cm clear - очистка старых
```

**Backend Engineer:**
Примеры запросов:

```
/cm show сессии вчера
/cm show код по PostgreSQL
/cm show ошибки последние 3 дня
/cm show таблицы создание API
```

**DevOps Engineer:**
Автодополнение для команд через readline в CLI.

**Архитектор:**
Принято. Команды + NLP.

---

## ОБНОВЛЕННОЕ ИТОГОВОЕ РЕШЕНИЕ

**Компоненты:**

1. **Конфиг** (~/.iflow/context-manager-config.json)
   
   - enabled, level, capture_types

2. **MCP Context Server** с методами:
   
   - context_save(content, level, types)
   - context_search(query, filters)
   - context_query(date, time, agent, level)
   - context_config(action, value)

3. **API endpoints** (/api/context/query, /api/context/config)

4. **Модификация systemPrompt** всех агентов:
   
   - Чтение конфига перед сохранением
   - Детекция типов контента
   - Парсинг команд /cm
   - NLP обработка запросов

5. **БД изменения**:
   
   ```sql
   ALTER TABLE development_context
   ADD COLUMN content_brief TEXT,
   ADD COLUMN content_important TEXT,
   ADD COLUMN content_full TEXT,
   ADD COLUMN content_types TEXT[];
   ```

6. **Wrapper iflow_context.sh**:
   
   - Инициализация конфига
   - Trap SIGINT для финального сохранения
   - Загрузка MCP сервера

---

#### **Следующий шаг:** Пошаговая реализация батчами (каждый компонент отдельно).

**СХЕМА РЕАЛИЗАЦИИ ПО БАТЧАМ**

**БАТЧ 1: Подготовка БД и конфига**

1) Изменение схемы PostgreSQL (3 колонки для уровней)
2) Добавление колонки content_types
3) Создание индексов для быстрого поиска
4) Создание ~/.iflow/context-manager-config.json
5) Проверка через psql

**БАТЧ 2: MCP Context Server (основа)**

1) Создание директории для MCP сервера
2) Файл package.json с зависимостями
3) Файл server.js с методами:
   - context_save
   - context_search
   - context_query
   - context_config
4) Тест запуска сервера
5) Регистрация в ~/.iflow/settings.json

**БАТЧ 3: API endpoints в context-manager**

1) Добавление роута POST /api/context/query
2) Добавление роута GET /api/context/config
3) Добавление роута POST /api/context/config
4) Логика парсинга дат/времени
5) Тест через curl

**БАТЧ 4: Детектор типов контента**

1) Функция detectContentTypes в Node.js
2) Регулярки для lists, tables, code, commands, errors
3) Интеграция в context_save
4) Тест на примерах разного контента
5) Сохранение types в БД

**БАТЧ 5: Модификация дефолтного агента**

1) Поиск конфига дефолта в iFlow CLI
2) Добавление в systemPrompt:
   - Чтение ~/.iflow/context-manager-config.json
   - Команды /cm
   - Логика сохранения по уровням
3) Перезапуск iFlow
4) Тест команды /cm status

**БАТЧ 6: Массовое обновление агентов**

1) Скрипт для добавления блока в все *.md агенты
2) Добавление в каждый агент:
   - Чтение конфига
   - Проверка enabled перед сохранением
   - context_search перед стартом
3) Выполнение для всех ~/.iflow/agents/*.md
4) /agents refresh
5) Тест на одном агенте

**БАТЧ 7: NLP парсер запросов**

1) Функция parseTimeQuery("позавчера после 20:00")
2) Словарь: вчера, позавчера, неделю назад
3) Парсинг "последние N дней/часов"
4) Интеграция в context_query
5) Тест запросов

**БАТЧ 8: Команды управления /cm**

1) Обработка /cm on|off
2) Обработка /cm level
3) Обработка /cm capture
4) Обработка /cm show
5) Обработка /cm status
6) Тест каждой команды

**БАТЧ 9: Wrapper iflow_context.sh**

1) Создание скрипта с trap SIGINT
2) Инициализация конфига если отсутствует
3) Запуск MCP сервера в фоне
4) Запуск iFlow CLI
5) Финальное сохранение при выходе
6) Тест Ctrl+C

**БАТЧ 10: Интеграция и тесты**

1) End-to-end тест: сессия с сохранением
2) Тест смены агента через $ с передачей контекста
3) Тест запроса контекста по дате
4) Тест выборочной записи (только код)
5) Тест уровней brief/important/full
6) Проверка размеров в БД

**БАТЧ 11: Документация**

1) README для MCP сервера
2) Примеры команд /cm
3) Примеры запросов контекста
4) Troubleshooting
5) Конфигурация по умолчанию

---

**Порядок выполнения: последовательно 1→11**
