# TASK-04 — Скачать ONNX модель

> Уровень: 🟡 Юниор+  
> Приоритет: P0 (блокирующий — без модели TASK-01 не работает)  
> Спека: [SPEC_ONNX_EMBEDDER.md](./SPEC_ONNX_EMBEDDER.md) → секция "Модель"

---

## Что скачать

| Параметр | Значение |
|----------|----------|
| HuggingFace repo | `intfloat/multilingual-e5-small` |
| Целевая папка | `C:\context-manager\models\multilingual-e5-small_Q8\onnx\` |
| Нужные файлы | `*.onnx`, `tokenizer.json`, `tokenizer_config.json`, `config.json` |
| Размер | ~40 MB |

---

## Как скачать

**Вариант A — через `scripts/download-model.ps1`** (после выполнения TASK-06):
```powershell
.\scripts\download-model.ps1
```

**Вариант B — вручную:**
```powershell
pip install huggingface_hub

python -c "
from huggingface_hub import snapshot_download
snapshot_download(
    repo_id='intfloat/multilingual-e5-small',
    repo_type='model',
    local_dir=r'C:\context-manager\models\multilingual-e5-small_Q8\onnx',
    allow_patterns=['*.onnx', 'tokenizer*', 'config.json', 'special_tokens*', 'vocab*', '*.model']
)
print('Done.')
"
```

**Вариант C — из Docker volume** (если Docker был установлен ранее):
```powershell
docker cp tei-embeddings:/data C:\context-manager\models\multilingual-e5-small_Q8\onnx
```

---

## Проверка

```powershell
$dir = "C:\context-manager\models\multilingual-e5-small_Q8\onnx"

# ONNX файл существует
(Get-ChildItem $dir -Filter "*.onnx").Count -ge 1
# Ожидается: True

# tokenizer существует
Test-Path "$dir\tokenizer.json"
# Ожидается: True

# config существует
Test-Path "$dir\config.json"
# Ожидается: True
```

## Регрессионный тест

[WIN10_TEST_SPEC.md](./WIN10_TEST_SPEC.md) → T0-06, T6-02
