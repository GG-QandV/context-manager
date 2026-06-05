; =============================================================================
; context-manager-setup.iss — Inno Setup script for Context Manager
;
; Что делает этот инсталлятор:
;   1. Устанавливает Node.js LTS (видимое окно)
;   2. Устанавливает PostgreSQL 16 (тихо, с авто-паролем)
;   3. Создаёт базу данных context_db
;   4. Копирует файлы проекта
;   5. Регистрирует и запускает Windows-сервисы (nssm)
;   6. Показывает попап: где пароль и как его поменять
;
; Requires: Inno Setup 6.3+ (https://jrsoftware.org/isinfo.php)
; Build on Windows:  iscc context-manager-setup.iss
; Output:  installer\context-manager-setup.exe
; =============================================================================

#define AppName      "Context Manager"
#define AppVersion   "2.2.1"
#define AppPublisher "GG-QandV"
#define AppURL       "https://github.com/GG-QandV/context-manager"
#define ServiceAPI   "cm-api"
#define ServiceEmb   "cm-embed"
#define ServiceQdr   "cm-qdrant"
#define ServiceMCP   "cm-mcp"
#define ServiceWDG   "cm-watchdog"
#define NodeWingetId "OpenJS.NodeJS.LTS"
#define PgWingetId   "PostgreSQL.PostgreSQL.16"
#define PgPort       "5432"
#define PgUser       "postgres"
#define PgDbName     "context_db"
#define ApiPort      "3847"
#define EmbPort      "8080"
#define QdrPort      "6333"
#define McpPort      "8770"

[Setup]
; --- Identity -----------------------------------------------------------------
AppId={{F4A7C2D8-3E5B-4F1A-8C6D-2A9E0B7F4C1E}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}/issues
AppUpdatesURL={#AppURL}/releases

; --- Пути установки -----------------------------------------------------------
; {autopf} = $env:ProgramFiles — правильный Windows-путь для бинарей
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes

; --- Вывод -------------------------------------------------------------------
OutputDir=installer
OutputBaseFilename=context-manager-setup

; --- Привилегии (UAC автоматически) ------------------------------------------
PrivilegesRequired=admin

; --- UI ----------------------------------------------------------------------
WizardStyle=modern
WizardResizable=no
DisableWelcomePage=no

; --- Сжатие ------------------------------------------------------------------
Compression=lzma2/ultra64
SolidCompression=no

; --- Минимальная версия Windows ----------------------------------------------
MinVersion=10.0.17763

; --- Misc --------------------------------------------------------------------
UninstallDisplayName={#AppName} {#AppVersion}
CloseApplications=yes
ChangesEnvironment=yes

[Languages]
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Messages]
; --- Экран приветствия -------------------------------------------------------
russian.WelcomeLabel1=Установка {#AppName}
russian.WelcomeLabel2=Этот мастер установит {#AppName} {#AppVersion} — систему управления AI-контекстом.%n%nЧто будет установлено автоматически:%n  • Node.js LTS (если ещё не установлен)%n  • PostgreSQL 16 (если ещё не установлен)%n  • Сервисы Context Manager (фоновые процессы)%n%nНажмите «Далее», чтобы продолжить.
russian.FinishedHeadingLabel=Установка завершена
russian.FinishedLabel={#AppName} успешно установлен и запущен.%n%nСистема работает в фоновом режиме как служба Windows.%n%nНажмите «Готово».

english.WelcomeLabel1=Welcome to {#AppName} Setup
english.WelcomeLabel2=This will install {#AppName} {#AppVersion} — the AI context management layer.%n%nThe following will be installed automatically:%n  • Node.js LTS (if not already installed)%n  • PostgreSQL 16 (if not already installed)%n  • Context Manager Windows Services%n%nClick Next to continue.
english.FinishedHeadingLabel=Setup Complete
english.FinishedLabel={#AppName} has been installed and is running as a background service.%n%nClick Finish.

[Dirs]
; --- Данные (ProgramData — runtime данные, конфиги, логи) --------------------
Name: "{commonappdata}\{#AppName}"
Name: "{commonappdata}\{#AppName}\models"
Name: "{commonappdata}\{#AppName}\logs"
Name: "{commonappdata}\{#AppName}\app"

[Files]
; --- Основной проект (Node.js, mcp, embed) -----------------------------------
Source: "app\*"; DestDir: "{app}\app"; Flags: ignoreversion recursesubdirs createallsubdirs; \
  Excludes: "node_modules\*,.git\*,.env,*.log"

; --- Qdrant бинарь -----------------------------------------------------------
Source: "bin\qdrant.exe"; DestDir: "{app}\qdrant"; Flags: ignoreversion

; --- Python embedder ---------------------------------------------------------
Source: "embed\*"; DestDir: "{app}\embed"; Flags: ignoreversion recursesubdirs createallsubdirs

; --- NSSM (service manager) --------------------------------------------------
Source: "bin\nssm.exe"; DestDir: "{app}\bin"; Flags: ignoreversion

; --- Шаблон .env.windows -----------------------------------------------------
Source: "app\.env.windows"; DestDir: "{commonappdata}\{#AppName}\app"; \
  DestName: ".env.template"; Flags: ignoreversion

; --- Скрипт смены пароля (исполняемый .ps1) ----------------------------------
Source: "scripts\change-pg-password.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion

[Icons]
; Деинсталлятор в меню «Программы» -------------------------------------------
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"

[Code]
// ============================================================================
// Глобальная переменная — пароль генерируется один раз при запуске инсталлятора
// и переиспользуется во всех шагах [Run]
// ============================================================================
var
  GeneratedPgPassword: String;

// ----------------------------------------------------------------------------
// Генерация случайного пароля (10 символов, буквы + цифры, без спецсимволов)
// Спецсимволы исключены намеренно: они ломают аргументы командной строки winget
// ----------------------------------------------------------------------------
function GeneratePassword(Len: Integer): String;
var
  Chars: String;
  I, Idx: Integer;
begin
  Chars := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  Result := '';
  for I := 1 to Len do
  begin
    Idx := Random(Length(Chars)) + 1;
    Result := Result + Copy(Chars, Idx, 1);
  end;
end;

// ----------------------------------------------------------------------------
// Проверка: зарегистрирована ли служба Windows в SCM
// ----------------------------------------------------------------------------
function IsServiceInstalled(ServiceName: String): Boolean;
var
  Res: DWORD;
begin
  Result := RegQueryDWordValue(HKLM,
    'SYSTEM\CurrentControlSet\Services\' + ServiceName,
    'Type', Res);
end;

// ----------------------------------------------------------------------------
// Проверка: установлен ли winget (поставляется с Windows 10 1809+)
// ----------------------------------------------------------------------------
function IsWingetAvailable: Boolean;
var
  ResultCode: Integer;
begin
  Result := Exec('winget.exe', '--version', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
end;

// ----------------------------------------------------------------------------
// InitializeSetup — запускается до отображения UI
// Генерируем пароль и проверяем prerequisites
// ----------------------------------------------------------------------------
function InitializeSetup: Boolean;
begin
  // Инициализируем генератор случайных чисел
  Randomize;
  // Генерируем 10-символьный пароль
  GeneratedPgPassword := GeneratePassword(10);
  Result := True;
end;

// ----------------------------------------------------------------------------
// GetGeneratedPgPassword — хелпер для передачи пароля в [Run] секцию
// через {code:GetGeneratedPgPassword}
// ----------------------------------------------------------------------------
function GetGeneratedPgPassword(Param: String): String;
begin
  Result := GeneratedPgPassword;
end;

// ----------------------------------------------------------------------------
// GetPgOverrideArgs — аргументы для тихой установки PostgreSQL
// ----------------------------------------------------------------------------
function GetPgOverrideArgs(Param: String): String;
begin
  Result := '--mode unattended --unattendedmodeui none' +
            ' --superpassword ' + GeneratedPgPassword +
            ' --serverport {#PgPort}' +
            ' --servicename postgresql-x64-16' +
            ' --datadir {commonappdata}\PostgreSQL\16\data';
end;

// ----------------------------------------------------------------------------
// GetEnvContent — генерирует содержимое .env с реальным паролем
// ----------------------------------------------------------------------------
function GetEnvContent(Param: String): String;
begin
  Result :=
    'PORT={#ApiPort}' + #13#10 +
    'HOST=127.0.0.1' + #13#10 +
    'DATABASE_URL=postgresql://{#PgUser}:' + GeneratedPgPassword + '@127.0.0.1:{#PgPort}/{#PgDbName}' + #13#10 +
    'QDRANT_HOST=127.0.0.1' + #13#10 +
    'QDRANT_PORT={#QdrPort}' + #13#10 +
    'TEI_HOST=http://127.0.0.1:{#EmbPort}' + #13#10 +
    'EMBEDDING_PROVIDER=local-onnx' + #13#10 +
    'EMBEDDING_DIMENSIONS=384' + #13#10;
end;

// ----------------------------------------------------------------------------
// GetCredsContent — текст файла с паролем
// ----------------------------------------------------------------------------
function GetCredsContent(Param: String): String;
begin
  Result :=
    '=======================================================' + #13#10 +
    ' Context Manager — PostgreSQL Credentials' + #13#10 +
    '=======================================================' + #13#10 +
    '' + #13#10 +
    ' Database : {#PgDbName}' + #13#10 +
    ' Host     : 127.0.0.1:{#PgPort}' + #13#10 +
    ' User     : {#PgUser}' + #13#10 +
    ' Password : ' + GeneratedPgPassword + #13#10 +
    '' + #13#10 +
    '=======================================================' + #13#10 +
    ' Как сменить пароль на свой:' + #13#10 +
    '=======================================================' + #13#10 +
    '' + #13#10 +
    ' 1. Запустите от Администратора:' + #13#10 +
    '    ' + ExpandConstant('{app}') + '\scripts\change-pg-password.ps1' + #13#10 +
    '' + #13#10 +
    ' Скрипт автоматически:' + #13#10 +
    '   - Спросит новый пароль' + #13#10 +
    '   - Применит его в PostgreSQL (ALTER USER)' + #13#10 +
    '   - Обновит .env файл' + #13#10 +
    '   - Перезапустит сервис cm-api' + #13#10 +
    '' + #13#10 +
    '=======================================================' + #13#10;
end;

// ----------------------------------------------------------------------------
// AfterInstall — вызывается после копирования файлов.
// Записывает .env и postgres_credentials.txt
// ----------------------------------------------------------------------------
procedure CreateConfigFiles;
var
  EnvPath, CredsPath: String;
begin
  EnvPath   := ExpandConstant('{commonappdata}\{#AppName}\app\.env');
  CredsPath := ExpandConstant('{commonappdata}\{#AppName}\postgres_credentials.txt');

  SaveStringToFile(EnvPath,   GetEnvContent(''),   False);
  SaveStringToFile(CredsPath, GetCredsContent(''), False);
end;

// ----------------------------------------------------------------------------
// ShowPasswordPopup — попап после финального шага установки
// ----------------------------------------------------------------------------
procedure ShowPasswordPopup;
var
  Msg: String;
begin
  Msg :=
    'PostgreSQL успешно настроен.' + #13#10 + #13#10 +
    'Автоматически сгенерированный пароль сохранён в файле:' + #13#10 +
    #13#10 +
    ExpandConstant('{commonappdata}\{#AppName}\postgres_credentials.txt') + #13#10 +
    #13#10 +
    '────────────────────────────────────────────────' + #13#10 +
    'Чтобы сменить пароль на свой:' + #13#10 +
    #13#10 +
    'Запустите от Администратора:' + #13#10 +
    ExpandConstant('{app}') + '\scripts\change-pg-password.ps1' + #13#10 +
    #13#10 +
    'Скрипт сам обновит пароль в PostgreSQL и в .env,' + #13#10 +
    'и перезапустит сервисы.';

  MsgBox(Msg, mbInformation, MB_OK);
end;

// ----------------------------------------------------------------------------
// CurStepChanged — перехватываем момент после копирования файлов
// ----------------------------------------------------------------------------
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    // Создаём .env и файл с паролем
    CreateConfigFiles;
    // Показываем попап с паролем
    ShowPasswordPopup;
  end;
end;

[Run]
; =============================================================================
; STEP 1 — Node.js LTS (показывается видимое окно прогресса winget)
; =============================================================================
Filename: "winget.exe"; \
  Parameters: "install --id {#NodeWingetId} --accept-package-agreements --accept-source-agreements --silent"; \
  Flags: waituntilterminated; \
  StatusMsg: "Устанавливаем Node.js LTS..."; \
  Description: "Install Node.js LTS"

; =============================================================================
; STEP 2 — PostgreSQL 16 (тихая установка с авто-паролем)
; =============================================================================
Filename: "winget.exe"; \
  Parameters: "install --id {#PgWingetId} --accept-package-agreements --accept-source-agreements --silent --override ""{code:GetPgOverrideArgs}"""; \
  Flags: waituntilterminated; \
  StatusMsg: "Устанавливаем PostgreSQL 16 (тихая установка)..."; \
  Description: "Install PostgreSQL 16"

; =============================================================================
; STEP 3 — Обновить PATH сразу (без перезагрузки)
; =============================================================================
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -NonInteractive -Command ""$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')"""; \
  Flags: runhidden waituntilterminated; \
  StatusMsg: "Обновляем переменные окружения..."

; =============================================================================
; STEP 4 — Ждём запуска PostgreSQL сервиса (до 30 секунд)
; =============================================================================
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -NonInteractive -Command ""$sw = [Diagnostics.Stopwatch]::StartNew(); while ($sw.Elapsed.TotalSeconds -lt 30) { try { $s = Get-Service 'postgresql-x64-16' -EA Stop; if ($s.Status -eq 'Running') { break }; Start-Service 'postgresql-x64-16' -EA SilentlyContinue } catch {} ; Start-Sleep 1 }"""; \
  Flags: runhidden waituntilterminated; \
  StatusMsg: "Ожидаем запуска PostgreSQL..."

; =============================================================================
; STEP 5 — Создаём базу данных context_db
; =============================================================================
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -NonInteractive -Command ""$env:PGPASSWORD = '{code:GetGeneratedPgPassword}'; & psql -U {#PgUser} -h 127.0.0.1 -p {#PgPort} -c 'CREATE DATABASE {#PgDbName};' 2>&1; Remove-Item Env:\PGPASSWORD"""; \
  Flags: runhidden waituntilterminated; \
  StatusMsg: "Создаём базу данных context_db..."

; =============================================================================
; STEP 6 — npm install + build
; =============================================================================
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -NonInteractive -Command ""Set-Location '{app}\app'; npm install --silent; npm run build"""; \
  Flags: runhidden waituntilterminated; \
  StatusMsg: "Устанавливаем Node.js зависимости и собираем проект..."

; =============================================================================
; STEP 7 — Python venv + pip install для embedder
; =============================================================================
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -NonInteractive -Command ""python -m venv '{app}\embed\.venv'; & '{app}\embed\.venv\Scripts\pip.exe' install -r '{app}\embed\requirements.txt' --quiet"""; \
  Flags: runhidden waituntilterminated; \
  StatusMsg: "Устанавливаем Python зависимости для ONNX embedder..."

; =============================================================================
; STEP 8 — Скачать ONNX модель
; =============================================================================
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -NonInteractive -Command ""New-Item -ItemType Directory -Force '{commonappdata}\{#AppName}\models\multilingual-e5-small_Q8\onnx' | Out-Null; & '{app}\embed\.venv\Scripts\python.exe' -m huggingface_hub download intfloat/multilingual-e5-small --local-dir '{commonappdata}\{#AppName}\models\multilingual-e5-small_Q8\onnx' --include '*.onnx' 'tokenizer*' 'config.json' 'special_tokens*' 'vocab*'"""; \
  Flags: runhidden waituntilterminated; \
  StatusMsg: "Скачиваем ONNX модель (38 MB, публичная)..."

; =============================================================================
; STEP 9 — Остановить старые сервисы если апгрейд
; =============================================================================
Filename: "{app}\bin\nssm.exe"; Parameters: "stop {#ServiceQdr}"; Flags: runhidden waituntilterminated; Check: IsServiceInstalled('{#ServiceQdr}')
Filename: "{app}\bin\nssm.exe"; Parameters: "stop {#ServiceEmb}"; Flags: runhidden waituntilterminated; Check: IsServiceInstalled('{#ServiceEmb}')
Filename: "{app}\bin\nssm.exe"; Parameters: "stop {#ServiceAPI}"; Flags: runhidden waituntilterminated; Check: IsServiceInstalled('{#ServiceAPI}')
Filename: "{app}\bin\nssm.exe"; Parameters: "stop {#ServiceMCP}"; Flags: runhidden waituntilterminated; Check: IsServiceInstalled('{#ServiceMCP}')
Filename: "{app}\bin\nssm.exe"; Parameters: "stop {#ServiceWDG}"; Flags: runhidden waituntilterminated; Check: IsServiceInstalled('{#ServiceWDG}')
Filename: "{app}\bin\nssm.exe"; Parameters: "remove {#ServiceQdr} confirm"; Flags: runhidden waituntilterminated; Check: IsServiceInstalled('{#ServiceQdr}')
Filename: "{app}\bin\nssm.exe"; Parameters: "remove {#ServiceEmb} confirm"; Flags: runhidden waituntilterminated; Check: IsServiceInstalled('{#ServiceEmb}')
Filename: "{app}\bin\nssm.exe"; Parameters: "remove {#ServiceAPI} confirm"; Flags: runhidden waituntilterminated; Check: IsServiceInstalled('{#ServiceAPI}')
Filename: "{app}\bin\nssm.exe"; Parameters: "remove {#ServiceMCP} confirm"; Flags: runhidden waituntilterminated; Check: IsServiceInstalled('{#ServiceMCP}')
Filename: "{app}\bin\nssm.exe"; Parameters: "remove {#ServiceWDG} confirm"; Flags: runhidden waituntilterminated; Check: IsServiceInstalled('{#ServiceWDG}')

; =============================================================================
; STEP 10 — Регистрация сервисов через nssm
; =============================================================================
Filename: "{app}\bin\nssm.exe"; Parameters: "install {#ServiceQdr} ""{app}\qdrant\qdrant.exe"""; Flags: runhidden waituntilterminated; StatusMsg: "Регистрируем сервис cm-qdrant..."
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceQdr} AppParameters ""--uri http://127.0.0.1:{#QdrPort}"""; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceQdr} AppDirectory ""{app}\qdrant"""; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceQdr} AppStdout ""{commonappdata}\{#AppName}\logs\cm-qdrant.log"""; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceQdr} AppStderr ""{commonappdata}\{#AppName}\logs\cm-qdrant-err.log"""; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceQdr} Start SERVICE_AUTO_START"; Flags: runhidden waituntilterminated

Filename: "{app}\bin\nssm.exe"; Parameters: "install {#ServiceEmb} ""{app}\embed\.venv\Scripts\python.exe"""; Flags: runhidden waituntilterminated; StatusMsg: "Регистрируем сервис cm-embed..."
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceEmb} AppParameters ""-m uvicorn embed_server:app --host 127.0.0.1 --port {#EmbPort}"""; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceEmb} AppDirectory ""{app}\embed"""; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceEmb} AppEnvironmentExtra ""MODEL_DIR={commonappdata}\{#AppName}\models\multilingual-e5-small_Q8\onnx"""; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceEmb} AppStdout ""{commonappdata}\{#AppName}\logs\cm-embed.log"""; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceEmb} AppStderr ""{commonappdata}\{#AppName}\logs\cm-embed-err.log"""; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceEmb} Start SERVICE_AUTO_START"; Flags: runhidden waituntilterminated

Filename: "{app}\bin\nssm.exe"; Parameters: "install {#ServiceAPI} ""{sys}\..\..\Program Files\nodejs\node.exe"""; Flags: runhidden waituntilterminated; StatusMsg: "Регистрируем сервис cm-api..."
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceAPI} AppParameters ""dist\index.js"""; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceAPI} AppDirectory ""{app}\app"""; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceAPI} AppStdout ""{commonappdata}\{#AppName}\logs\cm-api.log"""; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceAPI} AppStderr ""{commonappdata}\{#AppName}\logs\cm-api-err.log"""; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceAPI} Start SERVICE_AUTO_START"; Flags: runhidden waituntilterminated

Filename: "{app}\bin\nssm.exe"; Parameters: "install {#ServiceMCP} ""{sys}\..\..\Program Files\nodejs\node.exe"""; Flags: runhidden waituntilterminated; StatusMsg: "Регистрируем сервис cm-mcp..."
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceMCP} AppParameters ""mcp\cm_http_adapter.mjs"""; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceMCP} AppDirectory ""{app}\app"""; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceMCP} AppEnvironmentExtra ""CM_API_BASE=http://127.0.0.1:{#ApiPort}/api/context CM_MCP_PORT={#McpPort}"""; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceMCP} AppStdout ""{commonappdata}\{#AppName}\logs\cm-mcp.log"""; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceMCP} AppStderr ""{commonappdata}\{#AppName}\logs\cm-mcp-err.log"""; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceMCP} Start SERVICE_AUTO_START"; Flags: runhidden waituntilterminated

Filename: "{app}\bin\nssm.exe"; Parameters: "install {#ServiceWDG} ""{app}\embed\.venv\Scripts\python.exe"""; Flags: runhidden waituntilterminated; StatusMsg: "Регистрируем сервис cm-watchdog..."
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceWDG} AppParameters ""watchdog_cm.py"""; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceWDG} AppDirectory ""{app}\embed"""; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceWDG} AppStdout ""{commonappdata}\{#AppName}\logs\cm-watchdog.log"""; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceWDG} AppStderr ""{commonappdata}\{#AppName}\logs\cm-watchdog-err.log"""; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceWDG} Start SERVICE_AUTO_START"; Flags: runhidden waituntilterminated

; =============================================================================
; STEP 11 — DependOnService через реестр
; =============================================================================
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -NonInteractive -Command ""Set-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\{#ServiceEmb}' DependOnService @('{#ServiceQdr}') -Type MultiString; Set-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\{#ServiceAPI}' DependOnService @('{#ServiceQdr}','{#ServiceEmb}') -Type MultiString; Set-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\{#ServiceMCP}' DependOnService @('{#ServiceAPI}') -Type MultiString; Set-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\{#ServiceWDG}' DependOnService @('{#ServiceAPI}') -Type MultiString"""; \
  Flags: runhidden waituntilterminated; \
  StatusMsg: "Настраиваем порядок запуска сервисов..."

; =============================================================================
; STEP 12 — Запуск сервисов
; =============================================================================
Filename: "{app}\bin\nssm.exe"; Parameters: "start {#ServiceQdr}"; Flags: runhidden waituntilterminated; StatusMsg: "Запускаем cm-qdrant..."
Filename: "powershell.exe"; Parameters: "-NoProfile -NonInteractive -Command ""$sw=[Diagnostics.Stopwatch]::StartNew(); while($sw.Elapsed.TotalSeconds -lt 30){try{$t=New-Object Net.Sockets.TcpClient;$t.Connect('127.0.0.1',{#QdrPort});$t.Close();break}catch{Start-Sleep -ms 500}}"""; Flags: runhidden waituntilterminated; StatusMsg: "Ожидаем готовности Qdrant..."
Filename: "{app}\bin\nssm.exe"; Parameters: "start {#ServiceEmb}"; Flags: runhidden waituntilterminated; StatusMsg: "Запускаем cm-embed (загрузка ONNX модели ~30s)..."
Filename: "powershell.exe"; Parameters: "-NoProfile -NonInteractive -Command ""$sw=[Diagnostics.Stopwatch]::StartNew(); while($sw.Elapsed.TotalSeconds -lt 90){try{$t=New-Object Net.Sockets.TcpClient;$t.Connect('127.0.0.1',{#EmbPort});$t.Close();break}catch{Start-Sleep -ms 500}}"""; Flags: runhidden waituntilterminated; StatusMsg: "Ожидаем загрузки ONNX модели (до 90 сек)..."
Filename: "{app}\bin\nssm.exe"; Parameters: "start {#ServiceAPI}"; Flags: runhidden waituntilterminated; StatusMsg: "Запускаем cm-api..."
Filename: "{app}\bin\nssm.exe"; Parameters: "start {#ServiceMCP}"; Flags: runhidden waituntilterminated; StatusMsg: "Запускаем cm-mcp..."
Filename: "{app}\bin\nssm.exe"; Parameters: "start {#ServiceWDG}"; Flags: runhidden waituntilterminated; StatusMsg: "Запускаем cm-watchdog..."

[UninstallRun]
; Остановить сервисы в обратном порядке
Filename: "{app}\bin\nssm.exe"; Parameters: "stop {#ServiceWDG}"; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "stop {#ServiceMCP}"; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "stop {#ServiceAPI}"; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "stop {#ServiceEmb}"; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "stop {#ServiceQdr}"; Flags: runhidden waituntilterminated
Filename: "{sys}\timeout.exe"; Parameters: "/t 5 /nobreak"; Flags: runhidden waituntilterminated
; Удалить регистрацию сервисов
Filename: "{app}\bin\nssm.exe"; Parameters: "remove {#ServiceWDG} confirm"; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "remove {#ServiceMCP} confirm"; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "remove {#ServiceAPI} confirm"; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "remove {#ServiceEmb} confirm"; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "remove {#ServiceQdr} confirm"; Flags: runhidden waituntilterminated

[UninstallDelete]
; Удалить установочную директорию (ProgramFiles\Context Manager)
Type: filesandordirs; Name: "{app}"
; Данные НЕ удаляем автоматически — пользователь мог сохранить важное
; Type: filesandordirs; Name: "{commonappdata}\Context Manager"
