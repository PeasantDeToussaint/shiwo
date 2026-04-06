# 按云目录批量重做测验（`generate-quiz_副本.js` + GitHub Actions）

## 规则

- **数据源**：`scripts/data/live_audit/catalog-from-cloud.json`（云 `quiz_catalog` 导出）。
- **策划主题**：`scripts/data/regenerate-topics.manifest.json` — 每条只需 **`id` + 简短 `topic`**（作 `--topic`）。**`featureId` 不在批量脚本里锁定**；成品由 `generate-quiz_副本.js` 组装时的 **`inferFeatureId(outline)`** 按大纲文案规则推断。**在 `entries` 末尾追加 `{ "id", "topic" }` 即可扩展。**
- **会重做**：目录中 `isAvailable !== false` 且未被排除的条目；有 manifest 同 `id` 则用其短 `topic`，否则 **告警** 并用 catalog `title`+`subtitle` 作 `--topic`。
- **跳过**：
  - `featureId === "classics"`
  - `id`：`red-chambers`、`city`、`temple`
- **生成器**：`scripts/generate-quiz_副本.js`

## 更新云目录快照

```bash
node scripts/list-cloud-catalog.js --out scripts/data/live_audit/catalog-from-cloud.json
```

## 更新 / 扩展主题清单

编辑 **`scripts/data/regenerate-topics.manifest.json`**：

```json
{
  "entries": [
    { "id": "your-quiz-id", "topic": "你是哪种……？" }
  ]
}
```

- `topic`：一句短问句，作为 `--topic`。
- 上传云后若 `quiz_catalog` 与推断分区不一致，可用 `patchCatalog` 或随 `updateQuiz` 一并更新 catalog 行。

## 本地

```bash
# 默认读取上述 catalog + manifest
DRY_RUN=true PROVIDER=zhipu node scripts/run-regenerate-cloud-catalog.js

# 指定清单路径
TOPIC_MANIFEST=scripts/data/regenerate-topics.manifest.json DRY_RUN=true node scripts/run-regenerate-cloud-catalog.js

# 分片 3/12
SHARD=3 SHARD_COUNT=12 DRY_RUN=true node scripts/run-regenerate-cloud-catalog.js
```

## GitHub Actions

Workflow：`.github/workflows/regenerate-from-cloud-catalog.yml`

- 表单字段 **`catalog_path`**：默认 `scripts/data/live_audit/catalog-from-cloud.json`。
- 可选：在 env 中设置 **`TOPIC_MANIFEST`**（若日后为 workflow 增加输入项，与本地变量名一致）。
- 默认 **12 分片**、`max-parallel: 2`；`shard_count` 须与 matrix 中 `shard` 个数一致。

## 体量与风险

- 当前约 **92** 条 manifest + catalog 交集（随 catalog 变动略变）。
- 定制结果页（如 perfume）若仍在列表中，重生后路径可能与 catalog 不一致，需人工核对。

