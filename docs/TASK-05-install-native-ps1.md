# TASK-05 — Создать `scripts/install-native.ps1`

> Уровень: 🔴 Мидл+  
> Приоритет: P1  
> Спеки: [WIN10_ARCHITECTURE_DESIGN.md](./WIN10_ARCHITECTURE_DESIGN.md) | [WIN10_INSTALL_GUIDE.md](./WIN10_INSTALL_GUIDE.md) | [GAPS_AUDIT.md](./GAPS_AUDIT.md) → GAP-4

---

## Назначение

Заменить текущий `scripts/install.ps1` (покрывает только `npm install + build + init-mcp-config`) на полный нативный инсталлятор Windows без Docker.

Текущий `install.ps1` **не покрывает**: PostgreSQL, Qdrant, Python, ONNX embedder, nssm, регистрацию сервисов.

---

## Требования к скрипту

### Обязательные шаги (в порядке выполнения):

```
1. Проверка prerequisites (node, python, nssm, psql)
   └─ Если не найден — сообщить что установить, exit 1

2. npm install + npm run build
   └─ Проверить что dist/index.js создан

3. node scripts/init-mcp-config.mjs
   └─ Генерирует mcp.json с абсолютным путём (не ./mcp/server.js)

4. pip install -r embed/requirements.txt

5. Создать директории
   └─ C:\context-manager\models\multilingual-e5-small_Q8\onnx\
   └─ C:\ProgramData\nssm\logs\

6. Скачать модель (вызвать scripts/download-model.ps1)
   └─ Или сообщить пользователю если модель уже есть

7. copy .env.windows .env с подстановкой пароля PG
   └─ Запросить пароль через Read-Host -AsSecureString
   └─ Подставить в DATABASE_URL

8. Регистрация nssm сервисов (все 5: cm-qdrant, cm-embed, cm-api, cm-mcp, cm-watchdog)
   └─ Полные команды — в WIN10_ARCHITECTURE_DESIGN.md → секция "nssm конфигурации"
   └─ Идемпотентность: если сервис уже существует — пропустить (не падать с ошибкой)

9. Запуск всех сервисов

10. Smoke tests всех портов
    └─ 5432, 6333, 8080, 3847, 8770
    └─ Вывести статус каждого: OK / FAIL
```

---

## Требования к качеству

- **Идемпотентность**: повторный запуск не ломает уже работающую установку
- **Defensive**: каждый шаг проверяет exit code, при ошибке — понятное сообщение + exit 1
- **Variadic Python path**: не хардкодить `C:\Python312\` — искать через `Get-Command python`
- **Цветной вывод**: `Write-Host "..." -ForegroundColor Green/Red/Cyan` для читаемости
- **-DryRun параметр**: опционально — показать что будет делать без реального выполнения

---

## Справка по nssm командам

Все nssm-конфиги: [WIN10_ARCHITECTURE_DESIGN.md](./WIN10_ARCHITECTURE_DESIGN.md) → секция "nssm конфигурации всех сервисов"

Идемпотентная регистрация сервиса:
```powershell
$svcName = "cm-qdrant"
$existing = nssm status $svcName 2>$null
if ($LASTEXITCODE -ne 0) {
    # сервис не существует — создать
    nssm install $svcName ...
} else {
    Write-Host "$svcName already registered, skipping install" -ForegroundColor Yellow
}
```

---

## Проверка

```powershell
# Запуск
.\scripts\install-native.ps1

# После: все сервисы в статусе SERVICE_RUNNING
@("cm-qdrant","cm-embed","cm-api","cm-mcp","cm-watchdog") | % { nssm status $_ }

# Все порты открыты
@(5432,6333,8080,3847,8770) | % { 
    $c = New-Object System.Net.Sockets.TcpClient
    try { $c.Connect("127.0.0.1",$_); "Port $_ : OPEN" } catch { "Port $_ : CLOSED" }
}
```

## Регрессионный тест

[WIN10_TEST_SPEC.md](./WIN10_TEST_SPEC.md) → Layer 7 (T7-01..T7-05)
