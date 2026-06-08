; =============================================================================
; context-manager-setup.iss — Inno Setup script for Context Manager
;
; What this installer does:
;   1. Installs PostgreSQL 16 (silent install, with auto-generated password, skipped if already exists)
;   2. Creates database context_db (idempotently)
;   3. Copies project files to %ProgramFiles%\Context Manager
;   4. Creates Python venv + installs embedder dependencies
;   5. Downloads ONNX model (multilingual-e5-small)
;   6. Registers and starts Windows services via nssm (using bundled node.exe)
;   7. Shows information popup: database password and how to change it
;
; Build Requirements:
;   - Inno Setup 6.3+ (https://jrsoftware.org/isinfo.php)
;   - bin\nssm.exe     — download from nssm.cc/release/nssm-2.24.zip
;   - bin\qdrant.exe   — download from github.com/qdrant/qdrant/releases (windows msvc)
;   - dist_bundle\*    — run bundle script: npm install && npm run bundle
;   - mcp\*            — mcp adapters source
;   - embed\*          — embed_server.py, requirements.txt, watchdog_cm.py
;
; Compilation: iscc context-manager-setup.iss
; Output:      installer\context-manager-setup.exe
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
; AppId={{...} — double {{ is an escape for single { in Inno Setup, not a syntax error
AppId={{F4A7C2D8-3E5B-4F1A-8C6D-2A9E0B7F4C1E}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}/issues
AppUpdatesURL={#AppURL}/releases

; --- Installation Paths -------------------------------------------------------
; {autopf} = $env:ProgramFiles — correct for any Windows localization
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes

; --- Output -------------------------------------------------------------------
OutputDir=installer
OutputBaseFilename=context-manager-setup

; --- Privileges (UAC requested automatically) ---------------------------------
PrivilegesRequired=admin

; --- UI ----------------------------------------------------------------------
WizardStyle=modern
WizardResizable=no
DisableWelcomePage=no

; --- Compression -------------------------------------------------------------
Compression=lzma2/ultra64
SolidCompression=yes

; --- Min Windows Version ------------------------------------------------------
MinVersion=10.0.17763

; --- Misc --------------------------------------------------------------------
UninstallDisplayName={#AppName} {#AppVersion}
CloseApplications=yes
ChangesEnvironment=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Messages]
WelcomeLabel1=Welcome to {#AppName} Setup
WelcomeLabel2=This will install {#AppName} {#AppVersion} — the AI context management layer.%n%nThe following will be installed automatically:%n  • Embedded Node.js runtime (bundled with installer)%n  • PostgreSQL 16 (if not already installed)%n  • Python 3.12 (if not already installed)%n  • Context Manager Windows Services%n%nClick Next to continue.
FinishedHeadingLabel=Setup Complete
FinishedLabel={#AppName} has been installed and is running as a background service.%n%nClick Finish.

[Dirs]
; Runtime data — ProgramData (written by services)
Name: "{commonappdata}\{#AppName}"
Name: "{commonappdata}\{#AppName}\models"
Name: "{commonappdata}\{#AppName}\logs"
Name: "{commonappdata}\{#AppName}\app"
; Qdrant storage — explicitly create directory so the service does not fail at startup
Name: "{commonappdata}\{#AppName}\qdrant_storage"

[Files]
; Compiled Node.js code (bundle) — PRE-BUILT
Source: "dist_bundle\index.js"; DestDir: "{app}\app\dist"; Flags: ignoreversion
Source: "dist_bundle\worker.js"; DestDir: "{app}\app\dist"; Flags: ignoreversion skipifsourcedoesntexist

Source: "package.json"; DestDir: "{app}\app"; Flags: ignoreversion
Source: "package-lock.json"; DestDir: "{app}\app"; Flags: ignoreversion

; MCP adapter (bundle)
Source: "mcp\cm_http_adapter.bundle.js"; DestDir: "{app}\app\mcp"; DestName: "cm_http_adapter.js"; Flags: ignoreversion
Source: "mcp\server.bundle.js"; DestDir: "{app}\app\mcp"; DestName: "server.js"; Flags: ignoreversion
Source: "mcp\tg_bot_mcp.mjs"; DestDir: "{app}\app\mcp"; Flags: ignoreversion

; Python integration (tray and tunnel)
Source: "mcp\integration\*"; DestDir: "{app}\app\mcp\integration"; Flags: ignoreversion recursesubdirs createallsubdirs

; Qdrant binary (download beforehand)
Source: "bin\qdrant.exe"; DestDir: "{app}\qdrant"; Flags: ignoreversion

; Node.js embedded binary (runtime bundling)
Source: "bin\node.exe"; DestDir: "{app}\bin"; Flags: ignoreversion

; Python embedder
Source: "embed\*"; DestDir: "{app}\embed"; Flags: ignoreversion recursesubdirs createallsubdirs

; NSSM (download beforehand)
Source: "bin\nssm.exe"; DestDir: "{app}\bin"; Flags: ignoreversion

; Template .env.windows — copied to ProgramData as .env.template (for reference)
Source: ".env.windows"; DestDir: "{commonappdata}\{#AppName}\app"; \
  DestName: ".env.template"; Flags: ignoreversion

; Password change script
Source: "scripts\change-pg-password.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion

[Icons]
; Uninstaller in Programs menu -------------------------------------------
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"
; User startup shortcut for system tray —
; PyQt6 is included in embed\requirements.txt (sys_platform == 'win32')
; cm_integration is installed via pip install in STEP 6b
Name: "{userstartup}\{#AppName} Tray"; \
  Filename: "{app}\embed\.venv\Scripts\pythonw.exe"; \
  Parameters: "-m cm_integration.tray_pyqt"; \
  Comment: "Start Context Manager Tray"

[Code]
// ============================================================================
// Global Variables
// ============================================================================
var
  GeneratedPgPassword : String;
  PsqlExePath         : String;   // resolved via where.exe or standard PG path
  PopupShown          : Boolean;  // protection against double popup display

// ----------------------------------------------------------------------------
// GeneratePassword — without special characters (which break winget/PG arguments)
// Length: 16 characters (62^16 ≈ 47 bits of entropy — enough for local DB)
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
// FindCommandPath — searches for executable path via where.exe
// Returns first found path or fallback
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
// IsServiceInstalled — checks if service exists in SCM via registry
// ----------------------------------------------------------------------------
function IsServiceInstalled(ServiceName: String): Boolean;
var
  Res: DWORD;
begin
  Result := RegQueryDWordValue(HKLM,
    'SYSTEM\CurrentControlSet\Services\' + ServiceName, 'Type', Res);
end;

// ----------------------------------------------------------------------------
// IsPgAlreadyInstalled — extended check:
//   1. Known service names (EDB with x64 suffix and without)
//   2. EDB installer registry — SOFTWARE\PostgreSQL\Installations
// ----------------------------------------------------------------------------
function IsPgAlreadyInstalled: Boolean;
var
  Dummy: String;
begin
  // Standard EDB installer names (x64)
  Result :=
    IsServiceInstalled('postgresql-x64-16') or
    IsServiceInstalled('postgresql-x64-15') or
    IsServiceInstalled('postgresql-x64-14') or
    // Non-standard names (Chocolatey, some EDB variants)
    IsServiceInstalled('postgresql-16') or
    IsServiceInstalled('postgresql-15') or
    IsServiceInstalled('postgresql-14');
  if Result then Exit;

  // EDB installer registry key
  Result :=
    RegQueryStringValue(HKLM,
      'SOFTWARE\PostgreSQL\Installations\postgresql-x64-16',
      'Base Directory', Dummy) or
    RegQueryStringValue(HKLM,
      'SOFTWARE\PostgreSQL\Installations\postgresql-x64-15',
      'Base Directory', Dummy) or
    RegQueryStringValue(HKLM,
      'SOFTWARE\PostgreSQL\Installations\postgresql-x64-14',
      'Base Directory', Dummy);
end;

function ShouldInstallPg(Param: String): Boolean;
begin
  Result := not IsPgAlreadyInstalled;
end;

function IsPgAvailable: Boolean;
begin
  Result := IsPgAlreadyInstalled or IsWingetAvailable;
end;

// ----------------------------------------------------------------------------
// GetPgServiceName — returns the name of PostgreSQL service actually installed
// Used in DependOnService so cm-api waits for PG during system boot
// ----------------------------------------------------------------------------
function GetPgServiceName(Param: String): String;
begin
  if IsServiceInstalled('postgresql-x64-16') then Result := 'postgresql-x64-16'
  else if IsServiceInstalled('postgresql-x64-15') then Result := 'postgresql-x64-15'
  else if IsServiceInstalled('postgresql-x64-14') then Result := 'postgresql-x64-14'
  else if IsServiceInstalled('postgresql-16') then Result := 'postgresql-16'
  else if IsServiceInstalled('postgresql-15') then Result := 'postgresql-15'
  else Result := 'postgresql-x64-16';  // fallback — PG was just installed by winget
end;

// ----------------------------------------------------------------------------
// GetGeneratedPgPassword
// ----------------------------------------------------------------------------
function GetGeneratedPgPassword(Param: String): String;
begin
  Result := GeneratedPgPassword;
end;

// ----------------------------------------------------------------------------
// GetPgPassTmpPath — path to temporary file containing password
// FIX C-1: password is not passed in CLI arguments, read from file
// ----------------------------------------------------------------------------
function GetPgPassTmpPath(Param: String): String;
begin
  Result := ExpandConstant('{tmp}\cm_pg_pass.tmp');
end;

// ----------------------------------------------------------------------------
// GetPgOverrideArgs — PostgreSQL silent installation arguments
// FIX C-2: ExpandConstant for {commonappdata} inside Pascal function
// ----------------------------------------------------------------------------
function GetPgOverrideArgs(Param: String): String;
begin
  Result := '--mode unattended --unattendedmodeui none' +
            ' --superpassword ' + GeneratedPgPassword +
            ' --serverport {#PgPort}' +
            ' --servicename postgresql-x64-16' +
            ' --datadir ' + ExpandConstant('{commonappdata}') + '\PostgreSQL\16\data';
end;

// ----------------------------------------------------------------------------
// GetPythonVenvPath / GetPythonVenvPip
// ----------------------------------------------------------------------------
function GetPythonVenvPath(Param: String): String;
begin
  Result := ExpandConstant('{app}\embed\.venv\Scripts\python.exe');
end;

// ----------------------------------------------------------------------------
// GetPythonVenvPip
// ----------------------------------------------------------------------------
function GetPythonVenvPip(Param: String): String;
begin
  Result := ExpandConstant('{app}\embed\.venv\Scripts\pip.exe');
end;

// ----------------------------------------------------------------------------
// GetPsqlPath
// ----------------------------------------------------------------------------
function GetPsqlPath(Param: String): String;
begin
  Result := PsqlExePath;
end;

// ----------------------------------------------------------------------------
// GetEnvContent — generates .env file content
// Used for .env file (read by change-pg-password.ps1)
// Services cm-api/cm-mcp receive environment variables via AppEnvironmentExtra in registry
// ----------------------------------------------------------------------------
function GetEnvContent(Param: String): String;
begin
  Result :=
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
    'EMBEDDING_PROVIDER=huggingface-tei' + #13#10 +
    'EMBEDDING_DIMENSIONS=384' + #13#10 +
    'SYNC_BATCH_SIZE=100' + #13#10 +
    'SYNC_INTERVAL_MS=60000' + #13#10;
end;

// ----------------------------------------------------------------------------
// GetCredsContent — user credentials file template
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
    ' How to change the password to your own:' + #13#10 +
    '=======================================================' + #13#10 +
    '' + #13#10 +
    ' Run as Administrator:' + #13#10 +
    '    ' + ExpandConstant('{app}') + '\scripts\change-pg-password.ps1' + #13#10 +
    '' + #13#10 +
    ' The script will automatically:' + #13#10 +
    '   - Ask for a new password' + #13#10 +
    '   - Apply it in PostgreSQL (ALTER USER)' + #13#10 +
    '   - Update the .env file' + #13#10 +
    '   - Restart the cm-api service' + #13#10 +
    '' + #13#10 +
    '=======================================================' + #13#10;
end;

// ----------------------------------------------------------------------------
// CreateConfigFiles — writes .env and postgres_credentials.txt in ProgramData
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
// ShowPasswordPopup — informative popup shown after setup finishes
// FIX M-2: shown only after all [Run] steps are completed
// ----------------------------------------------------------------------------
procedure ShowPasswordPopup;
var
  Msg: String;
begin
  if PopupShown then Exit;
  PopupShown := True;
  Msg :=
    'PostgreSQL has been successfully configured.' + #13#10 + #13#10 +
    'The auto-generated password is saved in the file:' + #13#10 +
    #13#10 +
    ExpandConstant('{commonappdata}\{#AppName}\postgres_credentials.txt') + #13#10 +
    #13#10 +
    '────────────────────────────────────────────────' + #13#10 +
    'To change the password to your own:' + #13#10 +
    #13#10 +
    'Run as Administrator:' + #13#10 +
    ExpandConstant('{app}') + '\scripts\change-pg-password.ps1' + #13#10 +
    #13#10 +
    'The script will update the password in PostgreSQL and .env, and restart the services.';
  MsgBox(Msg, mbInformation, MB_OK);
end;

// ----------------------------------------------------------------------------
// CurStepChanged — config files creation after copy files step
// FIX M-2: ShowPasswordPopup moved to CurPageChanged(wpFinished)
// ----------------------------------------------------------------------------
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    CreateConfigFiles;
end;

// ----------------------------------------------------------------------------
// CurPageChanged — FIX M-2: show password popup when setup finishes
// ----------------------------------------------------------------------------
procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = wpFinished then
    ShowPasswordPopup;
end;

// ----------------------------------------------------------------------------
// CurUninstallStepChanged — alert about residual ProgramData folders
// ----------------------------------------------------------------------------
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
  begin
    MsgBox(
      'Context Manager services have been removed.' + #13#10 + #13#10 +
      'The following data was NOT removed automatically:' + #13#10 +
      '  ' + ExpandConstant('{commonappdata}\{#AppName}') + #13#10 + #13#10 +
      'The folder contains: ONNX model, logs, .env with DB password.' + #13#10 +
      'Please remove it manually if it is no longer needed.',
      mbInformation, MB_OK);
  end;
end;

// ----------------------------------------------------------------------------
// IsPythonInstalled — checks if Python is installed via registry keys
// ----------------------------------------------------------------------------
function IsPythonInstalled: Boolean;
begin
  Result :=
    RegKeyExists(HKLM, 'SOFTWARE\Python\PythonCore') or
    RegKeyExists(HKCU, 'SOFTWARE\Python\PythonCore') or
    RegKeyExists(HKLM32, 'SOFTWARE\Python\PythonCore') or
    RegKeyExists(HKCU32, 'SOFTWARE\Python\PythonCore');
end;

// ----------------------------------------------------------------------------
// IsWingetAvailable — checks if winget.exe is available in the system PATH
// ----------------------------------------------------------------------------
function IsWingetAvailable: Boolean;
var
  ResultCode: Integer;
begin
  if Exec('cmd.exe', '/c where winget.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    Result := (ResultCode = 0)
  else
    Result := False;
end;

// ----------------------------------------------------------------------------
// ShouldInstallPgAndWinget — checks if PG is not installed AND winget is available
// ----------------------------------------------------------------------------
function ShouldInstallPgAndWinget(Param: String): Boolean;
begin
  Result := ShouldInstallPg(Param) and IsWingetAvailable;
end;

// ----------------------------------------------------------------------------
// InitializeSetup — password generation + preflight checks + path discovery
// FIX C-4: verify pre-built artifacts presence before starting setup
// FIX C-1: write password to tmp file with restricted permissions
// ----------------------------------------------------------------------------
function InitializeSetup: Boolean;
var
  ResultCode: Integer;
  TmpPassPath: String;
  DistIndexPath: String;
  McpAdapterPath: String;
  McpServerPath: String;
  NodeExePath: String;
begin
  Result := True;
  Randomize;
  GeneratedPgPassword := GeneratePassword(16);
  PopupShown := False;

  if not IsPythonInstalled and not IsWingetAvailable then
  begin
    MsgBox(
      'Error: Python is not installed, and Windows Package Manager (winget) is not available.' + #13#10 + #13#10 +
      'Context Manager requires Python 3.10+ for the ONNX embedding service.' + #13#10 +
      'Please install Python manually and restart the installation.',
      mbCriticalError, MB_OK);
    Result := False;
    Exit;
  end;

  DistIndexPath  := ExpandConstant('{src}') + '\dist_bundle\index.js';
  McpAdapterPath := ExpandConstant('{src}') + '\mcp\cm_http_adapter.bundle.js';
  McpServerPath  := ExpandConstant('{src}') + '\mcp\server.bundle.js';
  NodeExePath    := ExpandConstant('{src}') + '\bin\node.exe';

  if not FileExists(NodeExePath) then
  begin
    MsgBox(
      'Build Error: bin\node.exe not found.' + #13#10 + #13#10 +
      'Before building the installer, run the binary preparation script:' + #13#10 +
      '  powershell scripts\build-installer.ps1' + #13#10 + #13#10 +
      'Installation aborted.',
      mbCriticalError, MB_OK);
    Result := False;
    Exit;
  end;

  if not FileExists(DistIndexPath) then
  begin
    MsgBox(
      'Build Error: dist_bundle\index.js not found.' + #13#10 + #13#10 +
      'Before building the installer, run:' + #13#10 +
      '  npm install && npm run bundle' + #13#10 + #13#10 +
      'Installation aborted.',
      mbCriticalError, MB_OK);
    Result := False;
    Exit;
  end;

  if not FileExists(McpAdapterPath) then
  begin
    MsgBox(
      'Build Error: mcp\cm_http_adapter.bundle.js not found.' + #13#10 + #13#10 +
      'Before building the installer, run:' + #13#10 +
      '  npm install && npm run bundle' + #13#10 + #13#10 +
      'Installation aborted.',
      mbCriticalError, MB_OK);
    Result := False;
    Exit;
  end;

  if not FileExists(McpServerPath) then
  begin
    MsgBox(
      'Build Error: mcp\server.bundle.js not found.' + #13#10 + #13#10 +
      'Before building the installer, run:' + #13#10 +
      '  npm install && npm run bundle' + #13#10 + #13#10 +
      'Installation aborted.',
      mbCriticalError, MB_OK);
    Result := False;
    Exit;
  end;

  // --- FIX C-1: write password to tmp file with restricted permissions --------
  // Read by PowerShell steps, not passed in CLI arguments
  TmpPassPath := ExpandConstant('{tmp}\cm_pg_pass.tmp');
  SaveStringToFile(TmpPassPath, GeneratedPgPassword, False);
  // Restrict access: only SYSTEM and Administrators
  Exec(ExpandConstant('{sys}\icacls.exe'),
    '"' + TmpPassPath + '" /inheritance:r /grant SYSTEM:(R) /grant Administrators:(R)',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  // --- Find psql.exe — check standard PG paths first, then PATH --------------
  PsqlExePath := '';
  if FileExists(ExpandConstant('{pf}\PostgreSQL\16\bin\psql.exe')) then
    PsqlExePath := ExpandConstant('{pf}\PostgreSQL\16\bin\psql.exe')
  else if FileExists(ExpandConstant('{pf}\PostgreSQL\15\bin\psql.exe')) then
    PsqlExePath := ExpandConstant('{pf}\PostgreSQL\15\bin\psql.exe');
  if PsqlExePath = '' then
    PsqlExePath := FindCommandPath('psql', 'psql.exe');
end;

procedure CheckModelDownloaded;
var
  ModelPath: String;
begin
  ModelPath := ExpandConstant('{commonappdata}\{#AppName}\models\multilingual-e5-small_Q8\onnx\tokenizer.json');
  if not FileExists(ModelPath) then
  begin
    MsgBox(
      'Warning: Failed to download the ONNX embedding model.' + #13#10 +
      'Please check your internet connection.' + #13#10 + #13#10 +
      'You can download the model manually later by running:' + #13#10 +
      '  powershell -File "' + ExpandConstant('{app}') + '\scripts\download-model.ps1"',
      mbWarning, MB_OK);
  end;
end;

[Run]
; =============================================================================
; STEP 1 — Install / Register Windows Package Manager (winget) if missing
; =============================================================================
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -NonInteractive -Command ""if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { try { Add-AppxPackage -RegisterByFamilyName -MainPackage Microsoft.DesktopAppInstaller_8wekyb3d8bbwe -ErrorAction Stop } catch { try { $releasesUrl = 'https://api.github.com/repos/microsoft/winget-cli/releases/latest'; $downloadUrl = (Invoke-RestMethod -Uri $releasesUrl).assets.browser_download_url | Where-Object { $_.EndsWith('.msixbundle') } | Select-Object -First 1; if ($downloadUrl) { $installerPath = Join-Path $env:TEMP 'winget.msixbundle'; Invoke-WebRequest -Uri $downloadUrl -OutFile $installerPath -UseBasicParsing; Add-AppxPackage -Path $installerPath; Remove-Item $installerPath -ErrorAction SilentlyContinue } } catch {} } }"""; \
  Flags: runhidden waituntilterminated; \
  Check: not IsWingetAvailable; \
  StatusMsg: "Checking and restoring Windows Package Manager (winget)..."

; =============================================================================
; STEP 1b — Install Python 3.12 (silent, skipped if already installed or winget unavailable)
; =============================================================================
Filename: "winget.exe"; \
  Parameters: "install --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements --silent"; \
  Flags: waituntilterminated; \
  Check: not IsPythonInstalled and IsWingetAvailable; \
  StatusMsg: "Installing Python 3.12 (silent)..."; \
  Description: "Install Python 3.12"

; =============================================================================
; STEP 2 — PostgreSQL 16 (silent install, skipped if already installed or winget unavailable)
; FIX H-2: IsPgAlreadyInstalled checks registry + extended services list
; FIX H-4: Check if winget is available via ShouldInstallPgAndWinget
; =============================================================================
Filename: "winget.exe"; \
  Parameters: "install --id {#PgWingetId} --accept-package-agreements --accept-source-agreements --silent --override ""{code:GetPgOverrideArgs}"""; \
  Flags: waituntilterminated; \
  Check: ShouldInstallPgAndWinget(''); \
  StatusMsg: "Installing PostgreSQL 16 (silent)..."; \
  Description: "Install PostgreSQL 16"

; =============================================================================
; STEP 3 — Wait for PostgreSQL service to start (up to 90 seconds)
; FIX H-3: Check: ShouldInstallPgAndWinget — skip if PG is already installed or winget is unavailable
; =============================================================================
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -NonInteractive -Command ""$sw=[Diagnostics.Stopwatch]::StartNew(); while($sw.Elapsed.TotalSeconds -lt 90){try{$s=Get-Service 'postgresql-x64-16' -EA Stop; if($s.Status -eq 'Running'){break}; Start-Service 'postgresql-x64-16' -EA SilentlyContinue}catch{}; Start-Sleep 1}"""; \
  Flags: runhidden waituntilterminated; \
  Check: ShouldInstallPgAndWinget(''); \
  StatusMsg: "Waiting for PostgreSQL to start..."

; =============================================================================
; STEP 4 — Create database context_db
; FIX C-1: PGPASSWORD is read from tmp file, not passed in CLI arguments
; FIX M-8: idempotent DO $$ IF NOT EXISTS $$ — safe on reinstall
; =============================================================================
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -NonInteractive -Command ""$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User'); $psql = (Get-Command psql -ErrorAction SilentlyContinue).Source; if (-not $psql) { $psql = Join-Path $env:ProgramFiles 'PostgreSQL\16\bin\psql.exe' }; if (-not (Test-Path $psql)) { $psql = Join-Path $env:ProgramFiles 'PostgreSQL\15\bin\psql.exe' }; $env:PGPASSWORD = (Get-Content '{code:GetPgPassTmpPath}' -Raw -ErrorAction Stop).Trim(); $sql = ""DO `$`$ BEGIN IF NOT EXISTS (SELECT FROM pg_database WHERE datname='{#PgDbName}') THEN CREATE DATABASE {#PgDbName}; END IF; END `$`$;""; & $psql -U {#PgUser} -h 127.0.0.1 -p {#PgPort} -c $sql 2>&1; Remove-Item Env:\PGPASSWORD -EA SilentlyContinue"""; \
  Flags: runhidden waituntilterminated; \
  Check: IsPgAvailable; \
  StatusMsg: "Creating database context_db..."

; =============================================================================
; STEP 5 — (DELETED) npm install + build
; FIX C-3: pre-built workflow — dist/ is built before iscc
; =============================================================================

; =============================================================================
; STEP 6a — Python venv + pip install dependencies
; =============================================================================
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -NonInteractive -Command ""$env:Path=[System.Environment]::GetEnvironmentVariable('Path','Machine')+';'+[System.Environment]::GetEnvironmentVariable('Path','User'); python -m venv '{app}\embed\.venv'; & '{app}\embed\.venv\Scripts\pip.exe' install -r '{app}\embed\requirements.txt' --quiet"""; \
  Flags: runhidden waituntilterminated; \
  StatusMsg: "Installing Python dependencies for ONNX embedder..."

; =============================================================================
; STEP 6b — pip install cm_integration (Python package for tray and tunnel)
; FIX H-5: cm_integration is installed as a package
; =============================================================================
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -NonInteractive -Command ""& '{app}\embed\.venv\Scripts\pip.exe' install '{app}\app\mcp\integration' --quiet"""; \
  Flags: runhidden waituntilterminated; \
  StatusMsg: "Installing cm-integration package (tray + tunnel)..."

; =============================================================================
; STEP 7 — Download ONNX model (show progress — window is visible)
; FIX H-4: removed runhidden — user sees download progress of huggingface_hub
; =============================================================================
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -Command ""New-Item -ItemType Directory -Force '{commonappdata}\{#AppName}\models\multilingual-e5-small_Q8\onnx' | Out-Null; & '{app}\embed\.venv\Scripts\python.exe' -m huggingface_hub download intfloat/multilingual-e5-small --local-dir '{commonappdata}\{#AppName}\models\multilingual-e5-small_Q8\onnx' --include '*.onnx' --include 'tokenizer*' --include 'config.json' --include 'special_tokens*' --include 'vocab*'"""; \
  Flags: waituntilterminated; \
  AfterInstall: CheckModelDownloaded
; STEP 8 — Stop old services (on upgrade)
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
; STEP 9 — Service registration via nssm
; FIX C-1: DATABASE_URL read from tmp file
; =============================================================================

; --- cm-qdrant ---------------------------------------------------------------
Filename: "{app}\bin\nssm.exe"; Parameters: "install {#ServiceQdr} ""{app}\qdrant\qdrant.exe"""; Flags: runhidden waituntilterminated; StatusMsg: "Registering cm-qdrant..."
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
Filename: "{app}\bin\nssm.exe"; Parameters: "install {#ServiceEmb} ""{app}\embed\.venv\Scripts\python.exe"""; Flags: runhidden waituntilterminated; StatusMsg: "Registering cm-embed..."
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
Filename: "{app}\bin\nssm.exe"; Parameters: "install {#ServiceAPI} ""{app}\bin\node.exe"""; Flags: runhidden waituntilterminated; StatusMsg: "Registering cm-api..."
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceAPI} AppParameters ""dist\index.js""";           Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceAPI} AppDirectory ""{app}\app""";                Flags: runhidden waituntilterminated
; FIX C-1: password is read from tmp file, not passed in CLI arguments
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -NonInteractive -Command ""$pass = (Get-Content '{code:GetPgPassTmpPath}' -Raw -ErrorAction Stop).Trim(); Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Services\{#ServiceAPI}\Parameters' -Name 'AppEnvironmentExtra' -Value @(""DATABASE_URL=postgresql://{#PgUser}:$pass@127.0.0.1:{#PgPort}/{#PgDbName}"", 'PORT={#ApiPort}', 'HOST=127.0.0.1', 'NODE_ENV=production', 'LOG_LEVEL=info', 'CORS_ORIGIN=*', 'DB_POOL_SIZE=20', 'DB_IDLE_TIMEOUT=30000', 'QDRANT_HOST=127.0.0.1', 'QDRANT_PORT={#QdrPort}', 'TEI_HOST=http://127.0.0.1:{#EmbPort}', 'EMBEDDING_PROVIDER=huggingface-tei', 'EMBEDDING_DIMENSIONS=384', 'SYNC_BATCH_SIZE=100', 'SYNC_INTERVAL_MS=60000') -Type MultiString"""; \
  Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceAPI} AppStdout ""{commonappdata}\{#AppName}\logs\cm-api.log""";     Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceAPI} AppStderr ""{commonappdata}\{#AppName}\logs\cm-api-err.log"""; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceAPI} AppRotateFiles 1";                          Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceAPI} AppRotateSeconds 86400";                    Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceAPI} Start SERVICE_AUTO_START";                  Flags: runhidden waituntilterminated

; --- cm-mcp ------------------------------------------------------------------
Filename: "{app}\bin\nssm.exe"; Parameters: "install {#ServiceMCP} ""{app}\bin\node.exe"""; Flags: runhidden waituntilterminated; StatusMsg: "Registering cm-mcp..."
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceMCP} AppParameters ""mcp\cm_http_adapter.js"""; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceMCP} AppDirectory ""{app}\app""";                Flags: runhidden waituntilterminated
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -NonInteractive -Command ""Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Services\{#ServiceMCP}\Parameters' -Name 'AppEnvironmentExtra' -Value @('CM_API_BASE=http://127.0.0.1:{#ApiPort}/api/context', 'CM_MCP_PORT={#McpPort}') -Type MultiString"""; \
  Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceMCP} AppStdout ""{commonappdata}\{#AppName}\logs\cm-mcp.log""";     Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceMCP} AppStderr ""{commonappdata}\{#AppName}\logs\cm-mcp-err.log"""; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceMCP} AppRotateFiles 1";                          Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceMCP} AppRotateSeconds 86400";                    Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceMCP} Start SERVICE_AUTO_START";                  Flags: runhidden waituntilterminated

; --- cm-watchdog -------------------------------------------------------------
; FIX L-7: added AppEnvironmentExtra with WD_INTERVAL (sole env variable from os.getenv)
Filename: "{app}\bin\nssm.exe"; Parameters: "install {#ServiceWDG} ""{app}\embed\.venv\Scripts\python.exe"""; Flags: runhidden waituntilterminated; StatusMsg: "Registering cm-watchdog..."
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceWDG} AppParameters ""watchdog_cm.py""";          Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceWDG} AppDirectory ""{app}\embed""";               Flags: runhidden waituntilterminated
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -NonInteractive -Command ""Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Services\{#ServiceWDG}\Parameters' -Name 'AppEnvironmentExtra' -Value @('WD_INTERVAL=10') -Type MultiString"""; \
  Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceWDG} AppStdout ""{commonappdata}\{#AppName}\logs\cm-watchdog.log""";     Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceWDG} AppStderr ""{commonappdata}\{#AppName}\logs\cm-watchdog-err.log"""; Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceWDG} AppRotateFiles 1";                          Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceWDG} AppRotateSeconds 86400";                    Flags: runhidden waituntilterminated
Filename: "{app}\bin\nssm.exe"; Parameters: "set {#ServiceWDG} Start SERVICE_AUTO_START";                  Flags: runhidden waituntilterminated

; =============================================================================
; STEP 10 — DependOnService via registry PowerShell
; FIX M-4: cm-api depends on real PG service name (GetPgServiceName)
; =============================================================================
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -NonInteractive -Command ""Set-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\{#ServiceEmb}' DependOnService @('{#ServiceQdr}') -Type MultiString; Set-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\{#ServiceAPI}' DependOnService @('{code:GetPgServiceName}','{#ServiceQdr}','{#ServiceEmb}') -Type MultiString; Set-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\{#ServiceMCP}' DependOnService @('{#ServiceAPI}') -Type MultiString; Set-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\{#ServiceWDG}' DependOnService @('{#ServiceAPI}') -Type MultiString"""; \
  Flags: runhidden waituntilterminated; \
  StatusMsg: "Configuring service dependencies..."

; =============================================================================
; STEP 11 — Start services and wait for each to become ready
; =============================================================================
Filename: "{app}\bin\nssm.exe"; Parameters: "start {#ServiceQdr}"; Flags: runhidden waituntilterminated; StatusMsg: "Starting cm-qdrant..."
Filename: "powershell.exe"; Parameters: "-NoProfile -NonInteractive -Command ""$sw=[Diagnostics.Stopwatch]::StartNew(); while($sw.Elapsed.TotalSeconds -lt 30){try{$t=New-Object Net.Sockets.TcpClient;$t.Connect('127.0.0.1',{#QdrPort});$t.Close();break}catch{Start-Sleep -ms 500}}"""; Flags: runhidden waituntilterminated; StatusMsg: "Waiting for Qdrant to be ready..."

Filename: "{app}\bin\nssm.exe"; Parameters: "start {#ServiceEmb}"; Flags: runhidden waituntilterminated; StatusMsg: "Starting cm-embed (loading ONNX model ~30s)..."
Filename: "powershell.exe"; Parameters: "-NoProfile -NonInteractive -Command ""$sw=[Diagnostics.Stopwatch]::StartNew(); while($sw.Elapsed.TotalSeconds -lt 90){try{$t=New-Object Net.Sockets.TcpClient;$t.Connect('127.0.0.1',{#EmbPort});$t.Close();break}catch{Start-Sleep -ms 500}}"""; Flags: runhidden waituntilterminated; StatusMsg: "Waiting for ONNX model to load (up to 90s)..."

Filename: "{app}\bin\nssm.exe"; Parameters: "start {#ServiceAPI}"; Flags: runhidden waituntilterminated; StatusMsg: "Starting cm-api..."
Filename: "{app}\bin\nssm.exe"; Parameters: "start {#ServiceMCP}"; Flags: runhidden waituntilterminated; StatusMsg: "Starting cm-mcp..."
Filename: "{app}\bin\nssm.exe"; Parameters: "start {#ServiceWDG}"; Flags: runhidden waituntilterminated; StatusMsg: "Starting cm-watchdog..."

; =============================================================================
; STEP 12 — Cleanup tmp file containing password (FIX C-1)
; =============================================================================
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -NonInteractive -Command ""Remove-Item '{code:GetPgPassTmpPath}' -ErrorAction SilentlyContinue"""; \
  Flags: runhidden waituntilterminated; \
  StatusMsg: "Finalizing installation..."

; =============================================================================
; STEP 13 — Start Context Manager Tray
; =============================================================================
Filename: "{app}\embed\.venv\Scripts\pythonw.exe"; \
  Parameters: "-m cm_integration.tray_pyqt"; \
  Flags: nowait postinstall; \
  Description: "Start Context Manager Tray now"

[UninstallRun]
; FIX H-6: Check: IsServiceInstalled added for all stop/remove commands
; Stop in reverse order
Filename: "{app}\bin\nssm.exe"; Parameters: "stop {#ServiceWDG}"; Flags: runhidden waituntilterminated; Check: IsServiceInstalled('{#ServiceWDG}')
Filename: "{app}\bin\nssm.exe"; Parameters: "stop {#ServiceMCP}"; Flags: runhidden waituntilterminated; Check: IsServiceInstalled('{#ServiceMCP}')
Filename: "{app}\bin\nssm.exe"; Parameters: "stop {#ServiceAPI}"; Flags: runhidden waituntilterminated; Check: IsServiceInstalled('{#ServiceAPI}')
Filename: "{app}\bin\nssm.exe"; Parameters: "stop {#ServiceEmb}"; Flags: runhidden waituntilterminated; Check: IsServiceInstalled('{#ServiceEmb}')
Filename: "{app}\bin\nssm.exe"; Parameters: "stop {#ServiceQdr}"; Flags: runhidden waituntilterminated; Check: IsServiceInstalled('{#ServiceQdr}')
; Pause to allow processes to exit
Filename: "powershell.exe"; Parameters: "-NoProfile -NonInteractive -Command ""Start-Sleep 5"""; Flags: runhidden waituntilterminated
; Remove registration
Filename: "{app}\bin\nssm.exe"; Parameters: "remove {#ServiceWDG} confirm"; Flags: runhidden waituntilterminated; Check: IsServiceInstalled('{#ServiceWDG}')
Filename: "{app}\bin\nssm.exe"; Parameters: "remove {#ServiceMCP} confirm"; Flags: runhidden waituntilterminated; Check: IsServiceInstalled('{#ServiceMCP}')
Filename: "{app}\bin\nssm.exe"; Parameters: "remove {#ServiceAPI} confirm"; Flags: runhidden waituntilterminated; Check: IsServiceInstalled('{#ServiceAPI}')
Filename: "{app}\bin\nssm.exe"; Parameters: "remove {#ServiceEmb} confirm"; Flags: runhidden waituntilterminated; Check: IsServiceInstalled('{#ServiceEmb}')
Filename: "{app}\bin\nssm.exe"; Parameters: "remove {#ServiceQdr} confirm"; Flags: runhidden waituntilterminated; Check: IsServiceInstalled('{#ServiceQdr}')

[UninstallDelete]
; Delete binaries and bundle from ProgramFiles
Type: filesandordirs; Name: "{app}"
; INTENTIONALLY do not delete {commonappdata}\Context Manager — contains ONNX model and user data
; User is notified via CurUninstallStepChanged
