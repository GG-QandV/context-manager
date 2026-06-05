# TASK-06 — Создать `scripts/download-model.ps1`

> Уровень: 🟡 Юниор+  
> Приоритет: P1  
> Спека: [WIN10_IMPLEMENTATION_TASK.md](./WIN10_IMPLEMENTATION_TASK.md) → TASK-06 | [SPEC_ONNX_EMBEDDER.md](./SPEC_ONNX_EMBEDDER.md) → секция "Как получить модель"

---

## Что создать

Файл: `/home/gg/projects/context-manager/scripts/download-model.ps1`

---

## Код

```powershell
param(
    [string]$ModelDir = "C:\context-manager\models\multilingual-e5-small_Q8\onnx"
)

$ErrorActionPreference = "Stop"
Write-Host "Downloading multilingual-e5-small ONNX model..." -ForegroundColor Cyan
Write-Host "Target: $ModelDir" -ForegroundColor Gray

New-Item -ItemType Directory -Force -Path $ModelDir | Out-Null

# Проверить что huggingface_hub установлен
python -c "import huggingface_hub" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Installing huggingface_hub..." -ForegroundColor Yellow
    pip install huggingface_hub --quiet
}

python -c @"
from huggingface_hub import snapshot_download
snapshot_download(
    repo_id='intfloat/multilingual-e5-small',
    repo_type='model',
    local_dir=r'$ModelDir',
    allow_patterns=['*.onnx', 'tokenizer*', 'config.json', 'special_tokens*', 'vocab*', '*.model']
)
print('Download complete.')
"@

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Download failed." -ForegroundColor Red
    exit 1
}

$onnxFiles = Get-ChildItem $ModelDir -Filter "*.onnx" -ErrorAction SilentlyContinue
if ($onnxFiles.Count -eq 0) {
    Write-Host "ERROR: No .onnx file found in $ModelDir" -ForegroundColor Red
    exit 1
}

Write-Host "Model ready: $($onnxFiles[0].Name)" -ForegroundColor Green
Write-Host "Location: $ModelDir" -ForegroundColor Green
```

---

## Использование

```powershell
# Стандартный путь
.\scripts\download-model.ps1

# Кастомный путь
.\scripts\download-model.ps1 -ModelDir "D:\models\multilingual-e5-small_Q8\onnx"
```

---

## Проверка

```powershell
.\scripts\download-model.ps1

# Ожидается в stdout:
# Downloading multilingual-e5-small ONNX model...
# Download complete.
# Model ready: model_optimized.onnx (или другой)

# Exit code
$LASTEXITCODE
# Ожидается: 0

# Файл существует
(Get-ChildItem "C:\context-manager\models\multilingual-e5-small_Q8\onnx" -Filter "*.onnx").Count
# Ожидается: >= 1
```

## Регрессионный тест

[WIN10_TEST_SPEC.md](./WIN10_TEST_SPEC.md) → T0-06, T6-02
