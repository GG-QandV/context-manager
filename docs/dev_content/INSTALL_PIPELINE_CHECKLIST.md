# Installation Pipeline — Коррекция

## Статус: IN PROGRESS

---

### Блок 1. Config path — централизация + миграция
- [x] 1.1 Создать `src/config/paths.ts` (getConfigDir, getConfigFilePath, getLegacyConfigPath, getMcpDir)
- [x] 1.2 Исправить `src/routes/context.routes.ts` (статический import, getConfigFilePath, mkdir, error handling)
- [x] 1.3 Миграция legacy → new path при старте сервера (`src/config/migration.ts`)
- [x] 1.4 Миграция mcp-серверов со старого пути

### Блок 2. mcp.json — хардкорные пути
- [x] 2.1 Заменить хардкор `/home/gg/.iflow/...` и `/usr/bin/node` на шаблоны (`mcp.json.template`, `mcp.json` с `node` + `{{MCP_SERVER_PATH}}`)
- [x] 2.2 Создать `scripts/init-mcp-config.mjs` (генератор mcp.json под ОС, копирует server.js)
- [ ] 2.3 `.gitignore` — добавить generated mcp.json (если нужно)

### Блок 3. docker-compose.yml — хардкорные volume mount
- [x] 3.1 Заменить `/home/gg/...` на переменные `$MODELS_DIR`, `$MCP_DIR`
- [x] 3.2 Создать `.env.example` с полной документацией переменных

### Блок 4. Dockerfile — port mismatch
- [x] 4.1 `EXPOSE 3001` → `EXPOSE 3847`

### Блок 5. Установочные скрипты
- [x] 5.1 `scripts/install.sh`
- [x] 5.2 `scripts/install.ps1`
- [x] 5.3 `scripts/uninstall.sh` + `scripts/uninstall.ps1`
- [x] 5.4 `scripts/init-mcp-config.mjs` (Node.js — работает на всех ОС, .sh не нужен)

### Блок 6. Документация — вычистка старых путей
- [x] 6.1 `docs/MCP_Context_Manager_Setup_2026-01-27.md` — обновлены пути, /usr/bin/node → node
- [x] 6.2 `Architectural_solution.md` — добавлена нотация о миграции путей
- [x] 6.3 `RAG/Автоматизация контекста через Hooks.md` — добавлена нотация о миграции
- [ ] 6.4 `docs/Контекст.md` — HISTORICAL, не трогать
- [ ] 6.5 `docs/4_new_session.md` — HISTORICAL, не трогать
- [ ] 6.6 `docs/context-16-01-26.txt` — HISTORICAL, не трогать
- [ ] 6.7 `docs/Context_session_26-01-26.md` — HISTORICAL, не трогать

### Блок 7. CI/CD
- [x] 7.1 `.github/workflows/ci.yml` — npm ci → typecheck → build на push/PR в main

### Блок 8. Презентация — сверка
- [x] 8.1 Сверка путей в 4 HTML файлах: пути уже корректны (macOS: ~/Library/Application Support/, Linux: ~/.config/, Windows: %APPDATA%)
