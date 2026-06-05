# TASK-08 — Добавить `engines` в `package.json`

> Уровень: 🟢 Юниор  
> Приоритет: P2  
> Спека: [WIN10_IMPLEMENTATION_TASK.md](./WIN10_IMPLEMENTATION_TASK.md) → TASK-08

---

## Что сделать

Файл: `/home/gg/projects/context-manager/package.json`

Добавить поле `"engines"` на верхний уровень (рядом с `"name"`, `"version"` и т.д.):

```json
"engines": {
  "node": ">=18.0.0"
}
```

---

## Пример — как должно выглядеть после правки

```json
{
  "name": "context-manager",
  "version": "...",
  "engines": {
    "node": ">=18.0.0"
  },
  ...
}
```

---

## Проверка

```bash
# engines присутствует
node -e "const p=require('./package.json'); console.log(p.engines)"
# Ожидается: { node: '>=18.0.0' }

# JSON валиден
node -e "require('./package.json')" && echo "JSON OK"
# Ожидается: JSON OK
```

## Регрессионный тест

[WIN10_TEST_SPEC.md](./WIN10_TEST_SPEC.md) → T0-01 (node version check)
