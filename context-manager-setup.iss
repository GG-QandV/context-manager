; =============================================================================
; context-manager-setup.iss — Inno Setup script for Context Manager
;
; Что делает этот инсталлятор:
;   1. Устанавливает Node.js LTS (через winget)
;   2. Устанавливает PostgreSQL 16 (тихо, с авто-паролем, пропуск если уже есть)
;   3. Создаёт базу данных context_db
;   4. Копирует файлы проекта в %ProgramFiles%\Context Manager
;   5. Создаёт Python venv + устанавливает зависимости embedder'а
;   6. Скачивает ONNX модель (multilingual-e5-small, 38 MB)
;   7. Регистрирует и запускает Windows-сервисы через nssm
;   8. Показывает попап: где пароль и как его поменять
;
; Требования к сборке:
;   - Inno Setup 6.3+ (https://jrsoftware.org/isinfo.php)
;   - bin\nssm.exe     — скачать с nssm.cc/release/nssm-2.24.zip
;   - bin\qdrant.exe   — скачать с github.com/qdrant/qdrant/releases (windows msvc)
;   - app\*            — запустить: npm install && npm run build
;   - embed\*          — embed_server.py, requirements.txt, watchdog_cm.py
;
; Сборка: iscc context-manager-setup.iss
; Вывод:  installer\context-manager-setup.exe
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
; {autopf} = $env:ProgramFiles — правильный для любого языка Windows
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
russian.WelcomeLabel1=Установка {#AppName}
russian.WelcomeLabel2=Этот мастер установит {#AppName} {#AppVersion} — систему управления AI-контекстом.%n%nЧто будет установлено автоматически:%n  • Node.js LTS (если ещё не установлен)%n  • PostgreSQL 16 (если ещё не установлен)%n  • Сервисы Context Manager (фоновые процессы)%n%nНажмите «Далее», чтобы продолжить.
russian.FinishedHeadingLabel=Установка завершена
russian.FinishedLabel={#AppName} успешно установлен и запущен.%n%nСистема работает в фоновом режиме как служба Windows.%n%nНажмите «Готово».

english.WelcomeLabel1=Welcome to {#AppName} Setup
english.WelcomeLabel2=This will install {#AppName} {#AppVersion} — the AI context management layer.%n%nThe following will be installed automatically:%n  • Node.js LTS (if not already installed)%n  • PostgreSQL 16 (if not already installed)%n  • Context Manager Windows Services%n%nClick Next to continue.
english.FinishedHeadingLabel=Setup Complete
english.FinishedLabel={#AppName} has been installed and is running as a background service.%n%nClick Finish.

[Dirs]
; Runtime данные — ProgramData (не ProgramFiles, пишется сервисами)
Name: "{commonappdata}\{#AppName}"
Name: "{commonappdata}\{#AppName}\models"
Name: "{commonappdata}\{#AppName}\logs"
Name: "{commonappdata}\{#AppName}\app"

[Files]
; Скомпилированный код Node.js
Source: "dist\*"; DestDir: "{app}\app\dist"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "package.json"; DestDir: "{app}\app"; Flags: ignoreversion
Source: "package-lock.json"; DestDir: "{app}\app"; Flags: ignoreversion

; MCP адаптеры и интеграция
Source: "mcp\*"; DestDir: "{app}\app\mcp"; Flags: ignoreversion recursesubdirs createallsubdirs; \
  Excludes: "node_modules\*"

; Qdrant бинарь (скачать заранее: qdrant-x86_64-pc-windows-msvc.zip)
Source: "bin\qdrant.exe"; DestDir: "{app}\qdrant"; Flags: ignoreversion

; Python embedder
Source: "embed\*"; DestDir: "{app}\embed"; Flags: ignoreversion recursesubdirs createallsubdirs

; NSSM (скачать заранее: nssm-2.24.zip → bin\nssm.exe)
Source: "bin\nssm.exe"; DestDir: "{app}\bin"; Flags: ignoreversion

; Шаблон .env.windows — копируется в ProgramData как .env.template (для справки)
Source: ".env.windows"; DestDir: "{commonappdata}\{#AppName}\app"; \
  DestName: ".env.template"; Flags: ignoreversion

; Скрипт смены пароля
Source: "scripts\change-pg-password.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion

[Icons]
; Деинсталлятор в меню «Программы» -------------------------------------------
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"
; Автозагрузка системного трея для пользователя -----------------------------
Name: "{userstartup}\{#AppName} Tray"; \
  Filename: "{app}\embed\.venv\Scripts\pythonw.exe"; \
  Parameters: """{app}\app\mcp\integration\tray_pyqt.py"""; \
  Comment: "Start Context Manager Tray"

[Code]
// ============================================================================
// Глобальные переменные
// ============================================================================
var
  GeneratedPgPassword : String;
  NodeExePath         : String;   // БАГ-3: определяется через where.exe
  PythonExePath       : String;   // определяется через where.exe
  PsqlExePath         : String;   // определяется через where.exe или стандартный PG путь

// ----------------------------------------------------------------------------
// GeneratePassword — без спецсимволов (ломают аргументы winget)
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
// FindCommandPath — ищет полный путь к исполняемому файлу через where.exe
// Возвращает первую найденную строку или fallback
// БАГ-3, БАГ-5: все пути через where.exe, не хардкод
// ----------------------------------------------------------------------------
function FindCommandPath(Cmd, Fallback: String): String;
var
  TmpFile    : String;
  ResultCode : Integer;
  Lines      : TArrayOfString;
begin
  TmpFile := ExpandConstant('{tmp}\') + Cmd + '_path.txt';
  Exec(ExpandConstant('{sys}\cmd.exe'),
       '/c where ' + Cmd + ' > "' + TmpFile + '" 2>&1',
       '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  if LoadStringsFromFile(TmpFile, Lines) and (GetArrayLength(Lines) > 0) then
    Result := Trim(Lines[0])
  else
    Result := Fallback;
  DeleteFile(TmpFile);
end;

// ----------------------------------------------------------------------------
// IsServiceInstalled — проверяет наличие службы в SCM через реестр
// ----------------------------------------------------------------------------
function IsServiceInstalled(ServiceName: String): Boolean;
var
  Res: DWORD;
begin
  Result := RegQueryDWordValue(HKLM,
    'SYSTEM\CurrentControlSet\Services\' + ServiceName, 'Type', Res);
end;

// ----------------------------------------------------------------------------
// IsPgAlreadyInstalled — БАГ-11: пропустить winget если PG уже есть
// ----------------------------------------------------------------------------
function IsPgAlreadyInstalled: Boolean;
begin
  Result := IsServiceInstalled('postgresql-x64-16') or
            IsServiceInstalled('postgresql-x64-15') or
            IsServiceInstalled('postgresql-x64-14');
end;

function ShouldInstallPg(Param: String): Boolean;
begin
  Result := not IsPgAlreadyInstalled;
end;

// ----------------------------------------------------------------------------
// GetGeneratedPgPassword
// ----------------------------------------------------------------------------
function GetGeneratedPgPassword(Param: String): String;
begin
  Result := GeneratedPgPassword;
end;

// ----------------------------------------------------------------------------
// GetPgOverrideArgs — аргументы тихой установки PostgreSQL
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
// GetNodePath / GetPythonPath — БАГ-3: динамический поиск
// ----------------------------------------------------------------------------
function GetNodePath(Param: String): String;
begin
  Result := NodeExePath;
end;

function GetPythonVenvPath(Param: String): String;
begin
  Result := ExpandConstant('{app}\embed\.venv\Scripts\python.exe');
end;

function GetPythonVenvPip(Param: String): String;
begin
  Result := ExpandConstant('{app}\embed\.venv\Scripts\pip.exe');
end;

function GetPsqlPath(Param: String): String;
begin
  Result := PsqlExePath;
end;

// ----------------------------------------------------------------------------
// GetEnvContent — генерирует содержимое .env
// БАГ-1 FIX: EMBEDDING_PROVIDER=huggingface-tei (не local-onnx)
// ----------------------------------------------------------------------------
function GetEnvContent(Param: String): String;
begin
  Result :=
    'PORT={#ApiPort}' + #13#10 +
    'HOST=127.0.0.1' + #13#10 +
    'NODE_ENV=production' + #13#10 +
    'LOG_LEVEL=info' + #13#10 +
    'CORS_ORIGIN=*' + #13#10 +
    'DATABASE_URL=postgresql://{#PgUser}:' + GeneratedPgPassword +
      '@127.0.0.1:{#PgPort}/{#PgDbName}' + #13#10 +
    'DB_POOL_SIZE=20' + #13#10 +
    'DB_IDLE_TIMEOUT=30000' + #13#10 +
    'QDRANT_HOST=127.0.0.1' + #13#10 +
    'QDRANT_PORT={#QdrPort}' + #13#10 +
    'TEI_HOST=http://127.0.0.1:{#EmbPort}' + #13#10 +
    'EMBEDDING_PROVIDER=huggingface-tei' + #13#10 +   // БАГ-1 FIX: было local-onnx
    'EMBEDDING_DIMENSIONS=384' + #13#10 +
    'SYNC_BATCH_SIZE=100' + #13#10 +
    'SYNC_INTERVAL_MS=60000' + #13#10;
end;

// ----------------------------------------------------------------------------
// GetDbUrlEnvArg — БАГ-2: DATABASE_URL для AppEnvironmentExtra cm-api
// ----------------------------------------------------------------------------
function GetDbUrlEnvArg(Param: String): String;
begin
  Result := 'DATABASE_URL=postgresql://{#PgUser}:' + GeneratedPgPassword +
            '@127.0.0.1:{#PgPort}/{#PgDbName}';
end;

// ----------------------------------------------------------------------------
// GetCredsContent — файл с паролем для пользователя
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
    ' Запустите от Администратора:' + #13#10 +
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
// CreateConfigFiles — пишет .env и postgres_credentials.txt в ProgramData
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
// ShowPasswordPopup — информационный диалог после установки
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
    'Скрипт обновит пароль в PostgreSQL и .env, перезапустит сервисы.';
  MsgBox(Msg, mbInformation, MB_OK);
end;

// ----------------------------------------------------------------------------
// InitializeSetup — генерация пароля + обнаружение путей бинарей
// БАГ-3, БАГ-5 FIX: NodeExePath, PsqlExePath через where.exe
// ----------------------------------------------------------------------------
function InitializeSetup: Boolean;
begin
  Randomize;
  GeneratedPgPassword := GeneratePassword(10);

  // Ищем node.exe — стандартные места + PATH
  NodeExePath := FindCommandPath('node', '');
  if NodeExePath = '' then
  begin
    if FileExists(ExpandConstant('{pf}\nodejs\node.exe')) then
      NodeExePath := ExpandConstant('{pf}\nodejs\node.exe')
    else if FileExists(ExpandConstant('{pf32}\nodejs\node.exe')) then
      NodeExePath := ExpandConstant('{pf32}\nodejs\node.exe')
    else
      NodeExePath := 'node.exe'; // последний резерв — PATH
  end;

  // Ищем psql.exe — сначала стандартный PG путь, потом PATH
  PsqlExePath := '';
  if FileExists(ExpandConstant('{pf}\PostgreSQL\16\bin\psql.exe')) then
    PsqlExePath := ExpandConstant('{pf}\PostgreSQL\16\bin\psql.exe')
  else if FileExists(ExpandConstant('{pf}\PostgreSQL\15\bin\psql.exe')) then
    PsqlExePath := ExpandConstant('{pf}\PostgreSQL\15\bin\psql.exe');
  if PsqlExePath = '' then
    PsqlExePath := FindCommandPath('psql', 'psql.exe');

  Result := True;
end;

// ----------------------------------------------------------------------------
// CurStepChanged — запись конфигов после копирования файлов
// ----------------------------------------------------------------------------
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    CreateConfigFiles;
    ShowPasswordPopup;
  end;
end;

// ----------------------------------------------------------------------------
// CurUninstallStepChanged — БАГ-10: уведомление о данных в ProgramData
// ----------------------------------------------------------------------------
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
  begin
    MsgBox(
      'Сервисы Context Manager удалены.' + #13#10 + #13#10 +
      'Следующие данные НЕ были удалены автоматически:' + #13#10 +
      '  ' + ExpandConstant('{commonappdata}\{#AppName}') + #13#10 + #13#10 +
      'Папка содержит: ONNX модель, логи, .env с паролем БД.' + #13#10 +
      'Удалите её вручную если она больше не нужна.',
      mbInformation, MB_OK);
  end;
end;

[Run]
; =============================================================================
; STEP 1 — Node.js LTS
; БАГ-5 FIX: --silent чтобы не блокировать UI
; =============================================================================
Filename: "winget.exe"; \
  Parameters: "install --id {#NodeWingetId} --accept-package-agreements --accept-source-agreements --silent"; \
  Flags: waituntilterminated; \
  StatusMsg: "Устанавливаем Node.js LTS..."; \
  Description: "Install Node.js LTS"

; =============================================================================
; STEP 2 — PostgreSQL 16 (тихая установка, пропуск если уже установлен)
; БАГ-11 FIX: Check: ShouldInstallPg
; =============================================================================
Filename: "winget.exe"; \
  Parameters: "install --id {#PgWingetId} --accept-package-agreements --accept-source-agreements --silent --override ""{code:GetPgOverrideArgs}"""; \
  Flags: waituntilterminated; \
  Check: ShouldInstallPg(''); \
  StatusMsg: "Устанавливаем PostgreSQL 16 (тихая установка)..."; \
  Description: "Install PostgreSQL 16"

; =============================================================================
; STEP 3 — Ждём запуска PostgreSQL сервиса (до 30 секунд)
; =============================================================================
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -NonInteractive -Command ""$sw=[Diagnostics.Stopwatch]::StartNew(); while($sw.Elapsed.TotalSeconds -lt 30){try{$s=Get-Service 'postgresql-x64-16' -EA Stop; if($s.Status -eq 'Running'){break}; Start-Service 'postgresql-x64-16' -EA SilentlyContinue}catch{}; Start-Sleep 1}"""; \
  Flags: runhidden waituntilterminated; \
  StatusMsg: "Ожидаем запуска PostgreSQL..."

; =============================================================================
; STEP 4 — Создаём базу данных context_db
; БАГ-5 FIX: динамический поиск psql.exe с обновлением PATH, чтобы избежать зависаний
; =============================================================================
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -NonInteractive -Command ""$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User'); $psql = (Get-Command psql -ErrorAction SilentlyContinue).Source; if (-not $psql) { $psql = Join-Path $env:ProgramFiles 'PostgreSQL\16\bin\psql.exe' }; if (-not (Test-Path $psql)) { $psql = 'C:\Program Files\PostgreSQL\16\bin\psql.exe' }; $env:PGPASSWORD = '{code:GetGeneratedPgPassword}'; & $psql -U {#PgUser} -h 127.0.0.1 -p {#PgPort} -c 'CREATE DATABASE {#PgDbName};' 2>&1; Remove-Item Env:\PGPASSWORD -EA SilentlyContinue"""; \
  Flags: runhidden waituntilterminated; \
  StatusMsg: "Создаём базу данных context_db..."

; =============================================================================
; STEP 5 — npm install + build
; БАГ-5 FIX: обновляем PATH перед запуском npm
; =============================================================================
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -NonInteractive -Command ""$env:Path=[System.Environment]::GetEnvironmentVariable('Path','Machine')+';'+[System.Environment]::GetEnvironmentVariable('Path','User'); Set-Location '{app}\app'; & npm install --silent; if($LASTEXITCODE -ne 0){exit 1}; & npm run build; if($LASTEXITCODE -ne 0){exit 1}"""; \
  Flags: runhidden waituntilterminated; \
  StatusMsg: "Устанавливаем Node.js зависимости и собираем проект..."

; =============================================================================
; STEP 6 — Python venv + pip install
; =============================================================================
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -NonInteractive -Command ""$env:Path=[System.Environment]::GetEnvironmentVariable('Path','Machine')+';'+[System.Environment]::GetEnvironmentVariable('Path','User'); python -m venv '{app}\embed\.venv'; & '{app}\embed\.venv\Scripts\pip.exe' install -r '{app}\embed\requirements.txt' --quiet"""; \
  Flags: runhidden waituntilterminated; \
  StatusMsg: "Устанавливаем Python зависимости для ONNX embedder..."

; =============================================================================
; STEP 7 — Скачать ONNX модель
; БАГ-7 FIX: повторный --include для каждого паттерна
; =============================================================================
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -NonInteractive -Command ""New-Item -ItemType Directory -Force '{commonappdata}\{#AppName}\models\multilingual-e5-small_Q8\onnx' | Out-Null; & '{app}\embed\.venv\Scripts\python.exe' -m huggingface_hub download intfloat/multilingual-e5-small --local-dir '{commonappdata}\{#AppName}\models\multilingual-e5-small_Q8\onnx' --include '*.onnx' --include 'tokenizer*' --include 'config.json' --include 'special_tokens*' --include 'vocab*'"""; \
  Flags: runhidden waituntilterminated; \
  StatusMsg: "Скачиваем ONNX модель (38 MB)..."

; =============================================================================
; STEP 8 — Остановить старые сервисы (при апгрейде)
; =============================================================================
Filename: "{app}\bin\nssm.exe"; Parameters: "stop {#ServiceWDG}";  Flags: runhidden waituntilterminated; Check: IsServiceInstalled('{#ServiceWDG}')
Filename: "{app}\bin\nssm.exe"; Parameters: "stop {#ServiceMCP}";  Flags: runhidden waituntilterminated; Check: IsServiceInstalled('{#ServiceMCP}')
Filename: "{app}\bin\nssm.exe"; Parameters: "stop {#ServiceAPI}";  Flags: runhidden waituntilterminated; Check: IsServiceInstalled('{#ServiceAPI}')
Filename: "{app}\bin\nssm.exe"; Parameters: "stop {#ServiceEmb}";  Flags: runhidden waituntilterminated; Check: IsServiceInstalled('{#ServiceEmb}')
Filename: "{app}\bin\nssm.exe"; Parameters: "stop {#ServiceQdr}";  Flags: runhidden waituntilterminated; Check: IsServiceInstalled('{#ServiceQdr}')
Filename: "{app}\bin\nssm.exe"; Parameters: "remove {#ServiceWDG} confirm"; Flags: runhidden waituntilterminated; Check: IsServiceInstalled('{#ServiceWDG}')
Filename: "{app}\bin\nssm.exe"; Parameters: "remove {#ServiceMCP} confirm"; Flags: runhidden waituntilterminated; Check: IsServiceInstalled('{#ServiceMCP}')
Filename: "{app}\bin\nssm.exe"; Parameters: "remove {#ServiceAPI} confirm"; Flags: runhidden waituntilterminated; Check: IsServiceInstalled('{#ServiceAPI}')
Filename: "{app}\bin\nssm.exe"; Parameters: "remove {#ServiceEmb} confirm"; Flags: runhidden waituntilterminated; Check: IsServiceInstalled('{#ServiceEmb}')
Filename: "{app}\bin\nssm.exe"; Parameters: "remove {#ServiceQdr} confirm"; Flags: runhidden waituntilterminated; Check: IsServiceInstalled('{#ServiceQdr}')

; =============================================================================
; STEP 9 — Регистрация сервисов через nssm
; БАГ-3 FIX: динамический поиск node.exe через PowerShell
; БАГ-2, БАГ-4, БАГ-6 FIX: запись AppEnvironmentExtra через Set-ItemProperty MultiString
; =============================================================================

; --- cm-qdrant ---------------------------------------------------------------
Filename: "{app}\bin\nssm.exe"; Parameters: "install {#ServiceQdr} ""{app}\qdrant\qdrant.exe"""; Flags: runhidden waituntilterminated; StatusMsg: "Регистрируем cm-qdrant..."
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceQdr} AppDirectory ""{app}\qdrant"""; Flags: runhidden waituntilterminated
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -NonInteractive -Command ""Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Services\{#ServiceQdr}\Parameters' -Name 'AppEnvironmentExtra' -Value @('QDRANT__STORAGE__STORAGE_PATH={commonappdata}\{#AppName}\qdrant_storage') -Type MultiString"""; \
  Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceQdr} AppStdout ""{commonappdata}\{#AppName}\logs\cm-qdrant.log""";   Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceQdr} AppStderr ""{commonappdata}\{#AppName}\logs\cm-qdrant-err.log"""; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceQdr} AppRotateFiles 1";                          Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceQdr} AppRotateSeconds 86400";                    Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceQdr} Start SERVICE_AUTO_START";                  Flags: runhidden waituntilterminated

; --- cm-embed ----------------------------------------------------------------
Filename: "{app}\bin\nssm.exe"; Parameters: "install {#ServiceEmb} ""{app}\embed\.venv\Scripts\python.exe"""; Flags: runhidden waituntilterminated; StatusMsg: "Регистрируем cm-embed..."
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceEmb} AppParameters ""-m uvicorn embed_server:app --host 127.0.0.1 --port {#EmbPort}"""; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceEmb} AppDirectory ""{app}\embed""";               Flags: runhidden waituntilterminated
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -NonInteractive -Command ""Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Services\{#ServiceEmb}\Parameters' -Name 'AppEnvironmentExtra' -Value @('MODEL_DIR={commonappdata}\{#AppName}\models\multilingual-e5-small_Q8\onnx') -Type MultiString"""; \
  Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceEmb} AppStdout ""{commonappdata}\{#AppName}\logs\cm-embed.log""";     Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceEmb} AppStderr ""{commonappdata}\{#AppName}\logs\cm-embed-err.log"""; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceEmb} AppRotateFiles 1";                          Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceEmb} AppRotateSeconds 86400";                    Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceEmb} Start SERVICE_AUTO_START";                  Flags: runhidden waituntilterminated

; --- cm-api ------------------------------------------------------------------
; БАГ-3 FIX: динамический поиск node.exe при регистрации службы
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -NonInteractive -Command ""$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User'); $node = (Get-Command node -ErrorAction SilentlyContinue).Source; if (-not $node) { $node = Join-Path $env:ProgramFiles 'nodejs\node.exe' }; if (-not (Test-Path $node)) { $node = 'C:\Program Files\nodejs\node.exe' }; & '{app}\bin\nssm.exe' install {#ServiceAPI} $node"""; \
  Flags: runhidden waituntilterminated; \
  StatusMsg: "Регистрируем cm-api..."
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceAPI} AppParameters ""dist\index.js""";           Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceAPI} AppDirectory ""{app}\app""";                Flags: runhidden waituntilterminated
; БАГ-2, БАГ-4 FIX: передача DATABASE_URL и всех остальных параметров
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -NonInteractive -Command ""Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Services\{#ServiceAPI}\Parameters' -Name 'AppEnvironmentExtra' -Value @('DATABASE_URL=postgresql://{#PgUser}:{code:GetGeneratedPgPassword}@127.0.0.1:{#PgPort}/{#PgDbName}', 'PORT={#ApiPort}', 'HOST=127.0.0.1', 'NODE_ENV=production', 'LOG_LEVEL=info', 'CORS_ORIGIN=*', 'DB_POOL_SIZE=20', 'DB_IDLE_TIMEOUT=30000', 'QDRANT_HOST=127.0.0.1', 'QDRANT_PORT={#QdrPort}', 'TEI_HOST=http://127.0.0.1:{#EmbPort}', 'EMBEDDING_PROVIDER=huggingface-tei', 'EMBEDDING_DIMENSIONS=384', 'SYNC_BATCH_SIZE=100', 'SYNC_INTERVAL_MS=60000') -Type MultiString"""; \
  Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceAPI} AppStdout ""{commonappdata}\{#AppName}\logs\cm-api.log""";     Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceAPI} AppStderr ""{commonappdata}\{#AppName}\logs\cm-api-err.log"""; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceAPI} AppRotateFiles 1";                          Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceAPI} AppRotateSeconds 86400";                    Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceAPI} Start SERVICE_AUTO_START";                  Flags: runhidden waituntilterminated

; --- cm-mcp ------------------------------------------------------------------
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -NonInteractive -Command ""$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User'); $node = (Get-Command node -ErrorAction SilentlyContinue).Source; if (-not $node) { $node = Join-Path $env:ProgramFiles 'nodejs\node.exe' }; if (-not (Test-Path $node)) { $node = 'C:\Program Files\nodejs\node.exe' }; & '{app}\bin\nssm.exe' install {#ServiceMCP} $node"""; \
  Flags: runhidden waituntilterminated; \
  StatusMsg: "Регистрируем cm-mcp..."
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceMCP} AppParameters ""mcp\cm_http_adapter.mjs"""; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceMCP} AppDirectory ""{app}\app""";                Flags: runhidden waituntilterminated
; БАГ-4 FIX: два AppEnvironmentExtra через MultiString реестра
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -NonInteractive -Command ""Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Services\{#ServiceMCP}\Parameters' -Name 'AppEnvironmentExtra' -Value @('CM_API_BASE=http://127.0.0.1:{#ApiPort}/api/context', 'CM_MCP_PORT={#McpPort}') -Type MultiString"""; \
  Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceMCP} AppStdout ""{commonappdata}\{#AppName}\logs\cm-mcp.log""";     Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceMCP} AppStderr ""{commonappdata}\{#AppName}\logs\cm-mcp-err.log"""; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceMCP} AppRotateFiles 1";                          Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceMCP} AppRotateSeconds 86400";                    Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceMCP} Start SERVICE_AUTO_START";                  Flags: runhidden waituntilterminated

; --- cm-watchdog -------------------------------------------------------------
Filename: "{app}\bin\nssm.exe"; Parameters: "install {#ServiceWDG} ""{app}\embed\.venv\Scripts\python.exe"""; Flags: runhidden waituntilterminated; StatusMsg: "Регистрируем cm-watchdog..."
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceWDG} AppParameters ""watchdog_cm.py""";          Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceWDG} AppDirectory ""{app}\embed""";               Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceWDG} AppStdout ""{commonappdata}\{#AppName}\logs\cm-watchdog.log""";     Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceWDG} AppStderr ""{commonappdata}\{#AppName}\logs\cm-watchdog-err.log"""; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceWDG} AppRotateFiles 1";                          Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceWDG} AppRotateSeconds 86400";                    Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceWDG} Start SERVICE_AUTO_START";                  Flags: runhidden waituntilterminated

; =============================================================================
; STEP 10 — DependOnService через реестр PowerShell
; =============================================================================
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -NonInteractive -Command ""Set-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\{#ServiceEmb}' DependOnService @('{#ServiceQdr}') -Type MultiString; Set-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\{#ServiceAPI}' DependOnService @('{#ServiceQdr}','{#ServiceEmb}') -Type MultiString; Set-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\{#ServiceMCP}' DependOnService @('{#ServiceAPI}') -Type MultiString; Set-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\{#ServiceWDG}' DependOnService @('{#ServiceAPI}') -Type MultiString"""; \
  Flags: runhidden waituntilterminated; \
  StatusMsg: "Настраиваем порядок запуска сервисов..."

; =============================================================================
; STEP 11 — Запуск сервисов с ожиданием готовности каждого
; =============================================================================
Filename: "{app}\bin\nssm.exe"; Parameters: "start {#ServiceQdr}"; Flags: runhidden waituntilterminated; StatusMsg: "Запускаем cm-qdrant..."
Filename: "powershell.exe"; Parameters: "-NoProfile -NonInteractive -Command ""$sw=[Diagnostics.Stopwatch]::StartNew(); while($sw.Elapsed.TotalSeconds -lt 30){try{$t=New-Object Net.Sockets.TcpClient;$t.Connect('127.0.0.1',{#QdrPort});$t.Close();break}catch{Start-Sleep -ms 500}}"""; Flags: runhidden waituntilterminated; StatusMsg: "Ожидаем готовности Qdrant..."

Filename: "{app}\bin\nssm.exe"; Parameters: "start {#ServiceEmb}"; Flags: runhidden waituntilterminated; StatusMsg: "Запускаем cm-embed (загрузка ONNX модели ~30s)..."
Filename: "powershell.exe"; Parameters: "-NoProfile -NonInteractive -Command ""$sw=[Diagnostics.Stopwatch]::StartNew(); while($sw.Elapsed.TotalSeconds -lt 90){try{$t=New-Object Net.Sockets.TcpClient;$t.Connect('127.0.0.1',{#EmbPort});$t.Close();break}catch{Start-Sleep -ms 500}}"""; Flags: runhidden waituntilterminated; StatusMsg: "Ожидаем загрузки ONNX модели (до 90 сек)..."

Filename: "{app}\bin\nssm.exe"; Parameters: "start {#ServiceAPI}"; Flags: runhidden waituntilterminated; StatusMsg: "Запускаем cm-api..."
Filename: "{app}\bin\nssm.exe"; Parameters: "start {#ServiceMCP}"; Flags: runhidden waituntilterminated; StatusMsg: "Запускаем cm-mcp..."
Filename: "{app}\bin\nssm.exe"; Parameters: "start {#ServiceWDG}"; Flags: runhidden waituntilterminated; StatusMsg: "Запускаем cm-watchdog..."

[UninstallRun]
; Остановить в обратном порядке
Filename: "{app}\bin\nssm.exe"; Parameters: "stop {#ServiceWDG}"; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "stop {#ServiceMCP}"; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "stop {#ServiceAPI}"; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "stop {#ServiceEmb}"; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "stop {#ServiceQdr}"; Flags: runhidden waituntilterminated
; Пауза чтобы процессы завершились
Filename: "powershell.exe"; Parameters: "-NoProfile -NonInteractive -Command ""Start-Sleep 5"""; Flags: runhidden waituntilterminated
; Удалить регистрацию
Filename: "{app}\bin\nssm.exe"; Parameters: "remove {#ServiceWDG} confirm"; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "remove {#ServiceMCP} confirm"; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "remove {#ServiceAPI} confirm"; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "remove {#ServiceEmb} confirm"; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "remove {#ServiceQdr} confirm"; Flags: runhidden waituntilterminated

[UninstallDelete]
; Удалить бинари и сборку из ProgramFiles
Type: filesandordirs; Name: "{app}"
; НАМЕРЕННО не удаляем {commonappdata}\Context Manager — там модель и данные пользователя
; Пользователь уведомлён через CurUninstallStepChanged
