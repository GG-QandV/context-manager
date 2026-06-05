# TODO #2 — Graph Layer (графовый слой)

**Цель:** добавить графовый слой поверх PostgreSQL для поиска по связям, кластерам, меткам. Без новых зависимостей.

---

## 1. Новые таблицы (PostgreSQL)

### `graph_nodes`
| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID PK | |
| node_type | enum | session / agent / topic / decision |
| ref_id | UUID FK → context_db.id | |
| flags | JSONB | {"priority":"high", "status":"active", "domain":"backend"} |
| cluster_id | UUID FK → graph_clusters.id | |
| created_at | timestamptz | |

### `graph_edges`
| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID PK | |
| source_node | UUID FK → graph_nodes.id | |
| target_node | UUID FK → graph_nodes.id | |
| relation_type | enum | continues / references / related_to / decides / conflicts_with / depends_on / fork_from |
| weight | float | 0.0–1.0 |
| label | text | описание связи |
| flags | JSONB | |
| created_at | timestamptz | |

### `graph_clusters`
| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID PK | |
| name | text | |
| description | text | |
| centroid_vector | float[] | усреднённый вектор кластера |
| algorithm | text | label_propagation / manual |
| created_at | timestamptz | |

---

## 2. Relation types (типы связей)

| Тип | Направление | Смысл |
|-----|-------------|-------|
| `continues` | → | сессия B продолжает тему сессии A |
| `references` | → | сессия A упоминает решение из сессии B |
| `related_to` | ↔ | семантически похожи (на основе Qdrant) |
| `decides` | → | сессия зафиксировала решение |
| `conflicts_with` | ↔ | противоречит решению из другой сессии |
| `depends_on` | → | задача B зависит от A |
| `fork_from` | → | ответвление от основной линии |

---

## 3. Новые MCP-инструменты

| Инструмент | Описание | Параметры |
|------------|----------|-----------|
| `cm_graph_traverse` | Обход графа от узла: все связи на depth ≤ N | node_id, max_depth (default 3) |
| `cm_graph_path` | Кратчайший путь между двумя узлами | source_id, target_id |
| `cm_graph_clusters` | Список всех кластеров | — |
| `cm_graph_cluster` | Детали одного кластера (узлы, центр темы) | cluster_id |
| `cm_graph_tags` | Поиск узлов по флагам | query (e.g. "priority:high AND domain:backend") |
| `cm_graph_link` | Явно создать связь | source, target, relation_type, label |
| `cm_graph_neighbors` | Соседи узла с фильтром по типу связи | node_id, relation_type? |

---

## 4. Кластеризация (Label Propagation)

1. При записи сессии → Qdrant top-K похожих
2. Если cosine distance < threshold → авто-связь `related_to`
3. Если 3+ сессии связаны → образуют кластер
4. centroid_vector = avg(all vectors in cluster)
5. Пересчёт: триггер при добавлении/удалении связи

---

## 5. Флаги/метки

Добавить `flags JSONB` в `context_db`:
```json
{"priority": "high", "status": "active", "domain": "backend", "reviewed": false}
```

`cm_tag_search(query)` — фильтрация по JSONB:
```
cm_tag_search("priority:high AND domain:backend")
cm_tag_search("status:pending")
cm_tag_search("domain:backend OR domain:frontend")
```

---

## 6. Background job (авто-связи)

При каждом `cm_save_br`, `cm_save_im`, `cm_save_fl`:

1. Создать/обновить `graph_nodes` для сессии
2. Спарсить текст на упоминания `session_id` → `references`
3. Qdrant search → top-3 похожих → `related_to`
4. Если `--continue-from=X` → `continues`
5. Обновить `cluster_id` (label propagation)

---

## 7. Технические требования

- **0 новых зависимостей** — только SQL + TypeScript
- Обход графа через `WITH RECURSIVE` CTE в PostgreSQL
- Все изменения — новые файлы в `src/graph/` (schema.ts, traverse.ts, cluster.ts)
- ~400 строк нового кода
