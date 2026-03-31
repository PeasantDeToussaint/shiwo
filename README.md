# Mytype · 人格测验小程序

> 一个运行在微信生态内的 AI 驱动人格测验平台，题目、结果、评分权重全部由 AI 流水线自动生成，内容存储于腾讯云 CloudBase，无需后端服务器。

---

## 目录

- [项目简介](#项目简介)
- [技术架构](#技术架构)
- [内容数据库](#内容数据库)
- [AI 生成流水线](#ai-生成流水线)
- [脚本工具](#脚本工具)
- [环境配置](#环境配置)
- [快速开始](#快速开始)
- [云端批量运行](#云端批量运行)

---

## 项目简介

Mytype 提供多种维度的人格测验，覆盖文学、历史、文化、职业、生活方式等主题。每道测验的题目、人格原型、评分权重均由 AI 根据领域专业知识自动设计，而非人工硬编码。

**已上线测验示例：**

| 主题类型 | 示例 |
|--------|------|
| 历史人物 | 你和哪位唐朝诗人气质相符、你和哪位民国女性最像 |
| 文化映射 | 你是哪种宝石、你的精神故乡在哪里 |
| 生活方式 | 你适合养什么宠物、你适合什么运动 |
| 职业发展 | 你适合什么赛道的自媒体、你适合读研吗 |
| 角色扮演 | 末世中你会扮演什么角色、水浒好汉你是谁 |
| 经典体系 | MBTI、Big Five、九型人格 |

---

## 技术架构

```
miniprogram/          微信小程序前端（WXML / WXSS / JS）
├── pages/            主包页面
├── subpackages/      分包（测验题目页、结果页）
├── components/       公共组件
└── utils/            工具函数

cloudfunctions/       云函数（腾讯云 CloudBase）
├── quizWriter/       测验数据写入接口
└── userService/      用户数据接口

scripts/              本地 Node.js 工具脚本
└── data/             生成的测验 JSON 文件
```

**核心依赖：**
- 微信小程序 + 腾讯云 CloudBase（数据库 + 云函数）
- AI 提供商：智谱 GLM / DeepSeek / Gemini / Anthropic（四选一）
- 纯 Node.js 脚本，无第三方 npm 依赖

---

## 内容数据库

每道测验对应 `scripts/data/` 下的一个 JSON 文件，结构如下：

```jsonc
{
  "id": "tang-poet-personality",
  "title": "你和哪位唐朝诗人气质相符",
  "scoring": {
    "type": "weighted-dimension",
    "dimensions": ["豪放", "沉郁", "清丽", "禅意"],
    "results": [ /* 每个结果对应一个维度 */ ]
  },
  "questions": [ /* 题目 + 选项 + 各维度得分 */ ],
  "results": [
    {
      "id": "r1",
      "title": "李白",
      "portrait": "...",       // 三段人格画像
      "strengths": [...],      // 6条优势
      "weaknesses": [...],     // 6条局限
      "temperament": "...",
      "situation": "...",
      "extras": [...]          // 自定义扩展字段
    }
  ]
}
```

---

## AI 生成流水线

`generate-quiz.js` 将一个主题描述转化为完整测验，分四个阶段：

```
Phase 0 — 领域架构
  └─ AI 以领域专家身份决定：resultType（人物/事物/原型）、
     维度数量与名称、每个结果的人格核心与 profileHints

Phase 1 — 框架生成
  └─ 基于 Phase 0 输出，生成正式测验结构：
     题目风格指南（aestheticContext）、维度轴定义、
     每个结果的数值化 dimension_profile

Phase 2 — 题目生成（3批并行）
  └─ 根据 Phase 0 确定的题目数量（12–24题）分批生成，
     每题包含 4 个选项，每个选项携带维度得分

Phase 3 — 结果内容生成（2–3批）
  └─ 为每个人格原型生成完整内容：
     人格画像、优劣势、气质描述、自定义扩展字段

Assembly — 纯 JS 组装 → 上传至 CloudBase
```

**结果类型（resultType）：**
- `figure` — 真实历史/文化人物（如李白、林徽因）
- `item` — 真实存在的具体事物（如柴犬、攀岩、成都）
- `archetype` — 有象征意味的人格原型（如翡翠、猫系恋人）

---

## 脚本工具

| 脚本 | 用途 |
|------|------|
| `generate-quiz.js` | 从主题生成全新测验并上传 |
| `rewrite-all-quizzes.js` | 批量重写已有测验的题目和结果 |
| `upload-quiz.js` | 将本地 JSON 手动上传至 CloudBase |
| `upload-all-data-quizzes.js` | 批量上传 `scripts/data/` 下所有测验 |
| `export-quizzes.js` | 从 CloudBase 导出测验数据到本地 |
| `delete-quizzes-from-cloud.js` | 从 CloudBase 删除指定测验 |

---

## 环境配置

复制 `.env.example` 为 `.env` 并填写：

```bash
cp .env.example .env
```

```env
# 微信小程序凭证（从 mp.weixin.qq.com 获取）
WX_APPID=wx...
WX_APPSECRET=...
WX_CLOUD_ENV=cloudbase-...

# AI API 密钥（至少填一个，优先级：智谱 > Gemini > DeepSeek > Anthropic）
ZHIPU_API_KEY=...
GEMINI_API_KEY=...
DEEPSEEK_API_KEY=...
ANTHROPIC_API_KEY=...
```

---

## 快速开始

**生成一道新测验：**

```bash
# 基础用法
node scripts/generate-quiz.js --topic="你是哪种雨"

# 指定 AI 提供商
node scripts/generate-quiz.js --topic="你是哪种雨" --provider=zhipu

# 添加创作约束
node scripts/generate-quiz.js --topic="你是哪种宝石" \
  --hint="结果必须涵盖彩色宝石" \
  --hint="运用宝石行业专业知识"

# 仅生成不上传（调试用）
node scripts/generate-quiz.js --topic="你是哪种雨" --dry-run

# 预估 token 用量
node scripts/generate-quiz.js --topic="你是哪种雨" --estimate
```

**批量生成（顺序执行）：**

```bash
node scripts/generate-quiz.js --topic="主题A" --provider=zhipu && \
node scripts/generate-quiz.js --topic="主题B" --provider=zhipu && \
node scripts/generate-quiz.js --topic="主题C" --provider=zhipu
```

**手动上传已有 JSON：**

```bash
node scripts/upload-quiz.js scripts/data/tang-poet-personality.json
node scripts/upload-quiz.js scripts/data/tang-poet-personality.json --update  # 覆盖已有
```

---

## 云端批量运行

在 GitHub Actions 中远程触发批量生成（无需本机常驻）：

1. 将项目推送到 GitHub 私有仓库
2. 在仓库 **Settings → Secrets and variables → Actions** 中添加 `.env` 中的所有密钥
3. 创建 `.github/workflows/generate.yml`：

```yaml
name: 批量生成测验

on:
  workflow_dispatch:
    inputs:
      topics:
        description: '测验主题（每行一个）'
        required: true

jobs:
  generate:
    runs-on: ubuntu-latest
    timeout-minutes: 360
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: 生成测验
        env:
          ZHIPU_API_KEY: ${{ secrets.ZHIPU_API_KEY }}
          WX_APPID: ${{ secrets.WX_APPID }}
          WX_APPSECRET: ${{ secrets.WX_APPSECRET }}
          WX_CLOUD_ENV: ${{ secrets.WX_CLOUD_ENV }}
        run: |
          node scripts/generate-quiz.js --topic="你的精神故乡" --provider=zhipu
          node scripts/generate-quiz.js --topic="你和哪位民国女性最像" --provider=zhipu
```

4. 进入仓库 **Actions → 批量生成测验 → Run workflow** 手动触发

---

*生成的测验数据自动上传至腾讯云 CloudBase，小程序端实时可用。*
