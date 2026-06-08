param(
    [string]$ModelDir = "C:\context-manager\models\multilingual-e5-small_Q8\onnx"
)

$ErrorActionPreference = "Stop"
Write-Host "Downloading multilingual-e5-small ONNX model..." -ForegroundColor Cyan
Write-Host "Target: $ModelDir" -ForegroundColor Gray

New-Item -ItemType Directory -Force -Path $ModelDir | Out-Null

# Verify if huggingface_hub is installed
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
