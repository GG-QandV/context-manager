# Аудит context-manager-setup.iss v2.2.1

> Дата: 2026-06-06  
> Файл: `context-manager-setup.iss` (оригинал сохранён как `context-manager-setup.iss.bak`)  
> Инструмент: Inno Setup 6.3+

---

## Что хорошо

- `{autopf}` для установки — правильный Program Files любого языка Windows ✅
- `{commonappdata}` для runtime данных (модели, логи) ✅
- Генерация пароля в Pascal-коде через `{code:GetGeneratedPgPassword}` ✅
- Python venv в Step 7 ✅
- Создание БД через PGPASSWORD env (Step 5) — нет интерактивного запроса ✅
- TCP wait loop вместо Start-Sleep (Step 12) ✅
- DependOnService через реестр (Step 11) ✅
- nssm и qdrant.exe бандлятся в `bin\` ✅
- `[UninstallRun]` останавливает и удаляет все сервисы в обратном порядке ✅
- UI на двух языках (ru/en) ✅

---

## КРИТИЧЕСКИЕ баги (блокируют работу)

### БАГ-1: `EMBEDDING_PROVIDER=local-onnx` — несуществующий провайдер
**Строка:** 224 (`GetEnvContent`)  
**Проблема:** `embedding.service.ts` знает только `huggingface-tei` и `openai`. Значение `local-onnx` не обрабатывается → embeddings не работают.  
**Фикс:** `'EMBEDDING_PROVIDER=huggingface-tei'`

---

### БАГ-2: `DATABASE_URL` не передаётся в nssm для `cm-api`
**Строки:** 412–417  
**Проблема:** cm-api регистрируется без `AppEnvironmentExtra` содержащего `DATABASE_URL`.  
`{app}\app` (ProgramFiles) ≠ `{commonappdata}\Context Manager\app\` (ProgramData) — Node.js не найдёт `.env` в своём CWD.  
**Фикс:** Добавить Pascal-функцию `GetDbUrlEnv` возвращающую строку `DATABASE_URL=postgresql://postgres:<GeneratedPgPassword>@127.0.0.1:5432/context_db` и передать в `AppEnvironmentExtra` через отдельный `nssm set` вызов.

---

### БАГ-3: Node.js путь `{sys}\..\..\Program Files\nodejs\node.exe` ломается на нелатинских Windows
**Строки:** 412, 419  
**Проблема:**  
- `{sys}` = `C:\Windows\System32`  
- `{sys}\..\..` = `C:\`  
- Итого: `C:\Program Files\nodejs\node.exe`  
- На немецкой Windows: `C:\Programme\nodejs` — не существует  
- Node через nvm/fnm: `%APPDATA%\nvm\...` — другой путь  
**Фикс:** Определить путь через `where.exe node` в Pascal [Code], сохранить в переменную, передать через `{code:GetNodePath}`.

---

### БАГ-4: `AppEnvironmentExtra` для cm-mcp — два значения в одной строке
**Строка:** 422  
```
"CM_API_BASE=http://127.0.0.1:3847/api/context CM_MCP_PORT=8770"
```
**Проблема:** nssm хранит AppEnvironmentExtra как REG_MULTI_SZ. Одна строка с пробелом = одна переменная. `CM_MCP_PORT` не устанавливается.  
**Фикс:** Два отдельных вызова `nssm set`:
```
nssm set cm-mcp AppEnvironmentExtra "CM_API_BASE=http://127.0.0.1:3847/api/context"
nssm set cm-mcp AppEnvironmentExtra "CM_MCP_PORT=8770"
```
(второй вызов добавляет, не перезаписывает — nssm поддерживает)

---

### БАГ-5: PATH не обновляется между [Run] шагами
**Строки:** 335–336  
**Проблема:** Step 3 обновляет `$env:Path` внутри одного PowerShell процесса. Каждый `[Run]` entry — новый процесс. Обновление теряется. Steps 4–8 вызывают `psql`, `npm`, `python` — могут не найтись.  
**Фикс:** Использовать полные пути из Pascal [Code] (`GetCommandPath('node')` и т.д.) вместо команд по имени. Либо `{sys}\cmd.exe /k refreshenv && npm ...`.

---

## ВЫСОКИЕ баги

### БАГ-6: Qdrant флаг `--uri` вероятно неверный
**Строка:** 398  
**Проблема:** Qdrant HTTP REST запускается на 6333 по умолчанию без флагов. `--uri` — флаг gRPC, может вызвать ошибку запуска.  
**Фикс:** Убрать AppParameters для cm-qdrant совсем, либо использовать `--config-path` если нужна кастомизация.

---

### БАГ-7: Синтаксис `--include` при скачивании модели
**Строка:** 376  
**Проблема:** `--include '*.onnx' 'tokenizer*' ...` — несколько паттернов после одного `--include` в PowerShell воспринимаются как positional args.  
**Фикс:**
```powershell
--include "*.onnx" --include "tokenizer*" --include "config.json" --include "special_tokens*" --include "vocab*"
```

---

### БАГ-8: `tray_pyqt.py` в [Icons] ссылается на файл из другого проекта
**Строка:** 127  
**Проблема:** `{app}\app\mcp\integration\tray_pyqt.py` — этот файл принадлежит проекту mnemostroma, в context-manager его нет.  
**Фикс:** Убрать автостарт трея или указать реально существующий файл.

---

## СРЕДНИЕ баги

### БАГ-9: Нет `build-installer.ps1`
**Проблема:** Инсталлятор ожидает `bin\qdrant.exe`, `bin\nssm.exe`, `app\*` (собранный проект) — без скрипта сборки это нужно делать вручную. `iscc context-manager-setup.iss` упадёт сразу если структура не подготовлена.  
**Фикс:** Создать `scripts\build-installer.ps1`.

---

### БАГ-10: Данные в ProgramData не удаляются при анинсталле — не сообщается пользователю
**Строка:** 472 (закомментировано намеренно)  
После анинсталляции остаются: модель (38 MB), логи, `.env` с паролем в `{commonappdata}\Context Manager\`.  
**Фикс:** Добавить сообщение в финальный экран анинсталлятора `[UninstallRun]` или `CurUninstallStepChanged`.

---

### БАГ-11: PG `--datadir` может конфликтовать при повторной установке
**Строка:** 208  
**Проблема:** `--datadir {commonappdata}\PostgreSQL\16\data` — если PostgreSQL уже установлен с другим datadir, EDB installer перезапишет настройки.  
**Фикс:** Добавить проверку `IsServiceInstalled('postgresql-x64-16')` и пропустить установку PG если уже есть.

---

## Итоговая таблица

| # | Severity | Строка | Проблема | Фикс |
|---|----------|--------|----------|------|
| 1 | ❌ КРИТ | 224 | `local-onnx` → не существует | `huggingface-tei` |
| 2 | ❌ КРИТ | 412–417 | DATABASE_URL не в nssm env | `GetDbUrlEnv` Pascal func + nssm set |
| 3 | ❌ КРИТ | 412, 419 | node.exe хардкод путь | `where.exe node` в Pascal [Code] |
| 4 | ❌ КРИТ | 422 | Два env в одной строке | Два отдельных nssm set |
| 5 | ❌ КРИТ | 335–336 | PATH не обновляется между шагами | Полные пути через Pascal vars |
| 6 | ⚠️ HIGH | 398 | `--uri` флаг Qdrant неверный | Убрать AppParameters |
| 7 | ⚠️ HIGH | 376 | `--include` синтаксис | Повторить флаг для каждого паттерна |
| 8 | ⚠️ HIGH | 127 | tray_pyqt.py не существует | Убрать [Icons] entry |
| 9 | ⚡ MED | — | Нет build-installer.ps1 | Создать скрипт сборки |
| 10 | ⚡ MED | 472 | ProgramData не удаляется без предупреждения | Сообщение при анинсталле |
| 11 | ⚡ MED | 208 | PG datadir конфликт | Проверка IsServiceInstalled |
