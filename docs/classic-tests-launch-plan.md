# 经典心理测试上线计划

> mytype · 行为心理（featureId: `psychology`）  
> 目标：上线 MBTI、大五人格、九型人格、霍兰德职业兴趣、荣格12原型 五套经典测试

---

## 目录

1. [五套测试概览](#一五套测试概览)
2. [文案资源获取策略](#二文案资源获取策略)
3. [技术架构设计](#三技术架构设计)
4. [数据 Schema 规范](#四数据-schema-规范)
5. [功能清单（对标市场主流）](#五功能清单对标市场主流)
6. [上线排期](#六上线排期)
7. [差异化策略](#七差异化策略)

---

## 一、五套测试概览

| 测试 | 题目数 | 维度数 | 结果数 | 评分逻辑 | 复杂度 |
|------|--------|--------|--------|---------|--------|
| **九型人格** | 72题 | 9 | 9型 + 翼 | weighted-dimension | ⭐⭐ |
| **霍兰德职业兴趣** | 60题 | 6 (RIASEC) | 6型×组合 | weighted-dimension | ⭐⭐ |
| **荣格12原型** | 60题 | 12 | 12型 | weighted-dimension | ⭐⭐ |
| **MBTI十六型人格** | 70题 | 4对双极 | 16型 | 新引擎：bipolar-dimension | ⭐⭐⭐ |
| **大五人格（OCEAN）** | 44题 | 5维连续 | 无离散类型 | 新引擎：big-five | ⭐⭐⭐⭐ |

**核心结论**：前三套可以直接复用现有 `weighted-dimension` 引擎和 `generic-question` / `generic-result` 页面，几乎零前端开发。MBTI 和大五需要新的评分引擎，MBTI 还需要一个专属结果页变体。

---

## 二、文案资源获取策略

### 2.1 题目来源（版权边界）

#### 九型人格
- **公版资源**：国内通行的 72 题强迫选择版本（源自 Riso-Hudson 简化版），已在知乎、psytest.cc 等平台高度流通，可直接参考
- **建议操作**：以此为框架，用 mytype 风格重写情境化表述（去掉"你是否……"句式，改为叙事情境）
- **结果文案**：参考《九型人格》（唐若仁著）+ 16personalities 的结构，自行编写9型×5层叙事

#### 霍兰德职业兴趣（RIASEC）
- **公版资源**：各大高校就业指导中心使用的 60 题简版（搜索 "霍兰德兴趣量表 60题 高校版"）
- **建议操作**：题目已基本标准化，可直接使用，重点投入结果文案的质感
- **结果文案**：6个基本型 × 15种三字母组合（R、I、A、S、E、C 两两三元组合），优先写最常见的10种

#### 荣格12原型
- **公版资源**：Carol Pearson 原型测试的中文改编版（搜索"荣格原型测试 60题"），国内有较多改编版本
- **建议操作**：重新设计情境化题目，这套测试的题目在中文互联网上同质化严重，情境化是差异化核心
- **结果文案**：12个原型各自参考 Carol Pearson《英雄之旅》的描述框架

#### MBTI
- **版权注意**：Myers-Briggs Company 对题目有版权，不可直接复制官方题目
- **合规来源**：[IPIP-NEO](https://ipip.ori.org/)（International Personality Item Pool）是完全开源的学术量表，包含对应 MBTI 4个维度的题目，可免费商用
- **中文化**：GitHub 搜索 "IPIP MBTI 中文" 有多个翻译版本，或直接使用 AI 翻译后人工润色
- **结果文案**：16个型号，每个各写一份5层叙事，优先写流量最大的8个（INTJ、INFP、ENTP、ENFJ、ISTJ、ISFJ、ENTJ、INFJ）

#### 大五人格（BFI-44）
- **公版资源**：BFI-44（Big Five Inventory，John & Srivastava 1999）完全开源，学术免费，共44题
- **直接使用**：英文原版 + 经过学术验证的中文版（可在 CNKI 心理学论文附录中找到）
- **结果文案**：大五没有离散"类型"，结果是5个维度的高/中/低分组合解读。优先写每个维度的高分、低分、中间分段描述（5×3 = 15段文案），再写组合解读

### 2.2 文案创作流程（AI 辅助）

```
Step 1: 整理题目框架（参考公版，情境化改写）
Step 2: 用 Claude/GPT 按以下 Prompt 批量生成结果初稿：

  "请为 MBTI 的 [INTJ] 类型，按照以下5层结构写一篇 600 字的人格画像：
   Layer 1: 你是谁 — 核心定义，给出有尊严感的命名
   Layer 2: 你的驱动力 — 内在动机，为什么这样运作
   Layer 3: 内在矛盾 — 你的光与影，真实的复杂性
   Layer 4: 常见误解 — 别人如何误读你，你真实的内心世界
   Layer 5: 你的潜力 — 当你活出最好的自己时，你会成为什么
   风格要求：第二人称叙述，文学性强，不用励志鸡汤语气"

Step 3: 人工润色，保持 mytype 一贯的文学质感
Step 4: 添加 boldQuote（一两句直击人心的断言）和 verse（古典诗词配对）
```

---

## 三、技术架构设计

### 3.1 现有引擎复用情况

```
测试              scoring.type            页面路由                    改动
────────────────────────────────────────────────────────────────────────
九型人格          weighted-dimension      generic-question            无需改动
霍兰德            weighted-dimension      generic-question            无需改动
荣格12原型        weighted-dimension      generic-question            无需改动
MBTI              bipolar-dimension      generic-question (改造)     新引擎
大五人格          big-five               generic-question (改造)     新引擎 + 新结果页
```

### 3.2 需要新增的评分引擎

#### `scoreMBTI.js` — 双极维度引擎

**算法**：4对维度各自独立决胜（E vs I, S vs N, T vs F, J vs P），拼接出16型字母代码

```javascript
// miniprogram/subpackages/quiz/utils/scoreMBTI.js

function scoreMBTI(quiz, answers) {
  const pairs = quiz.scoring.pairs;
  // pairs = [["E","I"], ["S","N"], ["T","F"], ["J","P"]]

  // 1. 累计每个字母的得分
  const raw = {};
  pairs.flat().forEach(letter => (raw[letter] = 0));

  answers.forEach(({ questionId, optionId }) => {
    const q = (quiz.questions || []).find(q => q.id === questionId);
    const opt = (q?.options || []).find(o => o.id === optionId);
    if (!opt?.scores) return;
    Object.entries(opt.scores).forEach(([letter, val]) => {
      if (raw[letter] !== undefined) raw[letter] += val;
    });
  });

  // 2. 每对决胜，平局取第一个字母（通常为外倾/感觉/思考/判断）
  const typeCode = pairs
    .map(([a, b]) => (raw[a] >= raw[b] ? a : b))
    .join("");

  // 3. 计算每对的倾向百分比（用于结果页展示 "内倾 73%"）
  const biases = pairs.map(([a, b]) => {
    const total = raw[a] + raw[b] || 1;
    const winner = raw[a] >= raw[b] ? a : b;
    const pct = Math.round((Math.max(raw[a], raw[b]) / total) * 100);
    return { pair: [a, b], winner, pct, raw: { [a]: raw[a], [b]: raw[b] } };
  });

  // 4. 匹配结果对象
  const result = (quiz.results || []).find(r => r.id === typeCode);

  return { resultId: typeCode, typeCode, raw, biases, result };
}

module.exports = { scoreMBTI };
```

#### `scoreBigFive.js` — 大五连续分数引擎

**算法**：5个维度各自求均值（含反向题处理），结果不是离散类型而是5维分数对象

```javascript
// miniprogram/subpackages/quiz/utils/scoreBigFive.js

function scoreBigFive(quiz, answers) {
  const dimensions = quiz.scoring.dimensions;
  // dimensions = [{id:"O", label:"开放性", reverseItems:["q3","q8"...]}, ...]

  const pool = {}; // { O: [val, val, ...], C: [...], ... }
  dimensions.forEach(d => (pool[d.id] = []));

  answers.forEach(({ questionId, sliderValue }) => {
    const q = (quiz.questions || []).find(q => q.id === questionId);
    if (!q || typeof sliderValue !== "number") return;

    const dimDef = dimensions.find(d => d.id === q.dimension);
    if (!dimDef) return;

    const isReverse = (dimDef.reverseItems || []).includes(questionId);
    const maxScale = quiz.scoring.scale || 5;
    const val = isReverse ? (maxScale + 1 - sliderValue) : sliderValue;

    pool[q.dimension].push(val);
  });

  // 均值 → 归一化到 0–100
  const scores = {};
  const maxScale = quiz.scoring.scale || 5;
  dimensions.forEach(({ id }) => {
    const vals = pool[id];
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 3;
    scores[id] = Math.round(((avg - 1) / (maxScale - 1)) * 100);
  });

  // 每维度映射到 high/mid/low 标签
  const levels = {};
  Object.entries(scores).forEach(([dim, score]) => {
    levels[dim] = score >= 65 ? "high" : score >= 35 ? "mid" : "low";
  });

  return { resultType: "profile", scores, levels };
}

module.exports = { scoreBigFive };
```

### 3.3 对现有 `generic-question.js` 的改造

**改造点 1**：在 `_finish()` 中增加对 `mbti` 和 `big-five` 评分类型的分发

```javascript
// 在 generic-question.js 的 _finish() 方法中，替换现有逻辑：

_finish() {
  const { quiz } = this.data;
  const scoringType = quiz?.scoring?.type;

  let resultId, pendingResult;

  if (scoringType === "mbti") {
    const { scoreMBTI } = require("../../utils/scoreMBTI");
    const { resultId: rid, typeCode, biases } = scoreMBTI(quiz, this._answers);
    resultId = rid;
    pendingResult = { typeCode, biases };

  } else if (scoringType === "big-five") {
    const { scoreBigFive } = require("../../utils/scoreBigFive");
    const { scores, levels } = scoreBigFive(quiz, this._answers);
    resultId = "profile"; // 大五没有离散 resultId，用固定值
    pendingResult = { scores, levels };

  } else {
    // 现有 weighted-dimension 逻辑（不变）
    const { scoreGeneric } = require("../../utils/scoreGeneric");
    const { resultId: rid, normalized, ranked } = scoreGeneric(quiz, this._answers);
    resultId = rid;
    pendingResult = { normalized, ranked };
  }

  getApp().globalData._pendingResult = pendingResult;

  const resultPage = quiz.resultPage ||
    "/subpackages/quiz/pages/generic-result/generic-result";
  wx.redirectTo({
    url: `${resultPage}?quizId=${quiz.id}&resultId=${resultId}`,
  });
},
```

**改造点 2**：Likert-5 交互支持（大五人格用5级量表而非滑块）

在现有 slider 逻辑基础上增加 `interaction: "likert-5"` 类型，渲染5个带文字标签的选项（非常不同意 / 不同意 / 中立 / 同意 / 非常同意），在 WXML 层用条件渲染。

### 3.4 需要新增的页面

#### MBTI 专属结果页：`mbti-result`

复制 `generic-result` 页面目录，修改以下显示逻辑：

- **顶部**：大字展示4字母类型码（INTJ），配色区分4大类型
  - 分析家（NT）：深蓝 / 探险家（SP）：绿 / 外交家（NF）：紫 / 守护者（SJ）：棕
- **维度条**：4组双极条形图，显示 "内倾 ←73%—27%→ 外倾" 的倾向比例
- **结果叙事**：复用现有 `portrait` / `boldQuote` / `strengths` / `weaknesses` 字段
- **分类 Tabs**：核心特质 / 职场表现 / 人际关系 / 成长建议（对应 `career` / `relationships` / `lifeAdvice` 字段）

#### 大五人格专属结果页：`big-five-result`

- **顶部**：不显示类型名，显示 "你的人格画像"
- **主体**：五维雷达图（复用现有 `_renderRadar` 逻辑）+ 每维度 high/mid/low 文字解读
- **详情**：5个维度各自一段解读文案（从 `quiz.results` 里按维度 level 查找对应描述）

---

## 四、数据 Schema 规范

### 4.1 九型人格 JSON 结构

```json
{
  "id": "enneagram-classic",
  "featureId": "psychology",
  "title": "九型人格",
  "subtitle": "在九种人格原型中，找到你真实的驱动内核",
  "eyebrow": "Enneagram",
  "estimatedMinutes": 15,
  "questionCount": 72,
  "isAvailable": true,
  "questionPage": "/subpackages/quiz/pages/generic-question/generic-question",
  "resultPage": "/subpackages/quiz/pages/generic-result/generic-result",
  "scoring": {
    "type": "weighted-dimension",
    "dimensions": ["1号", "2号", "3号", "4号", "5号", "6号", "7号", "8号", "9号"]
  },
  "questions": [
    {
      "id": "q1",
      "text": "当事情没有按照既定计划进行时，你的第一反应通常是：",
      "options": [
        {
          "id": "a",
          "text": "立刻找出问题所在，制定补救方案",
          "scores": { "1号": 2, "3号": 1 }
        },
        {
          "id": "b",
          "text": "先安抚团队情绪，确保大家状态稳定",
          "scores": { "2号": 2, "9号": 1 }
        }
      ]
    }
  ],
  "results": [
    {
      "id": "1号",
      "title": "完美主义者",
      "token": "改革者",
      "boldQuote": "你不是在追求完美，你是在守护一个更好的世界应有的样子。",
      "dimension_profile": {
        "1号": 0.9, "2号": 0.1, "3号": 0.2, "4号": 0.3,
        "5号": 0.2, "6号": 0.4, "7号": 0.1, "8号": 0.2, "9号": 0.3
      },
      "portrait": "...",
      "strengths": [
        { "label": "道德感", "description": "..." },
        { "label": "自律", "description": "..." }
      ],
      "weaknesses": [
        { "label": "批判性过强", "description": "..." }
      ],
      "verse": "吾日三省吾身——为人谋而不忠乎？与朋友交而不信乎？传不习乎？",
      "verseSource": "《论语·学而》"
    }
  ]
}
```

### 4.2 霍兰德 JSON 结构

```json
{
  "id": "holland-riasec",
  "featureId": "psychology",
  "title": "霍兰德职业兴趣",
  "subtitle": "六种兴趣类型，找到你天然擅长的人生赛道",
  "eyebrow": "Holland RIASEC",
  "estimatedMinutes": 12,
  "scoring": {
    "type": "weighted-dimension",
    "dimensions": ["R", "I", "A", "S", "E", "C"],
    "dimensionLabels": {
      "R": "实用型", "I": "研究型", "A": "艺术型",
      "S": "社会型", "E": "企业型", "C": "传统型"
    }
  },
  "questions": [
    {
      "id": "q1",
      "text": "如果可以随意选择，你更愿意在周末做哪件事？",
      "options": [
        { "id": "a", "text": "修理家里坏掉的电器或家具", "scores": { "R": 2 } },
        { "id": "b", "text": "研究一个你好奇已久的科学问题", "scores": { "I": 2 } }
      ]
    }
  ],
  "results": [
    {
      "id": "R",
      "title": "实用型",
      "token": "建造者",
      "boldQuote": "你的双手懂得语言无法表达的事情。",
      "dimension_profile": { "R": 0.9, "I": 0.2, "A": 0.1, "S": 0.1, "E": 0.2, "C": 0.3 },
      "career": "工程师、建筑师、外科医生、飞行员、运动员",
      "portrait": "..."
    }
  ]
}
```

### 4.3 MBTI JSON 结构

```json
{
  "id": "mbti-sixteen",
  "featureId": "psychology",
  "title": "MBTI 十六型人格",
  "subtitle": "四个维度，十六种认知方式，找到你的思维底层操作系统",
  "eyebrow": "Myers-Briggs Type Indicator",
  "estimatedMinutes": 15,
  "questionCount": 70,
  "isAvailable": true,
  "questionPage": "/subpackages/quiz/pages/generic-question/generic-question",
  "resultPage": "/subpackages/quiz/pages/mbti-result/mbti-result",
  "scoring": {
    "type": "bipolar-dimension",
    "pairs": [["E", "I"], ["S", "N"], ["T", "F"], ["J", "P"]],
    "pairLabels": {
      "E": "外倾", "I": "内倾",
      "S": "感觉", "N": "直觉",
      "T": "思考", "F": "情感",
      "J": "判断", "P": "感知"
    }
  },
  "questions": [
    {
      "id": "q1",
      "text": "在一次热闹的聚会结束后，你通常：",
      "options": [
        {
          "id": "a",
          "text": "感到精力充沛，甚至希望聚会能再久一点",
          "scores": { "E": 2 }
        },
        {
          "id": "b",
          "text": "感到疲惫，需要独处才能恢复能量",
          "scores": { "I": 2 }
        }
      ]
    }
  ],
  "results": [
    {
      "id": "INTJ",
      "title": "战略家",
      "token": "INTJ",
      "mbtiGroup": "analyst",
      "boldQuote": "这世界运行有其规律，而你早已看穿并设计好了应对方案。",
      "portrait": "...",
      "strengths": [
        { "label": "战略思维", "description": "..." }
      ],
      "weaknesses": [
        { "label": "情感距离", "description": "..." }
      ],
      "career": "科学家、战略顾问、建筑师、作家、程序员",
      "relationships": "...",
      "lifeAdvice": "...",
      "verse": "运筹帷幄之中，决胜千里之外。",
      "verseSource": "《史记·高祖本纪》"
    }
  ]
}
```

**MBTI 4大类型分组**（用于结果页配色）：

| 分组 | 类型 | 配色 | 中文名 |
|------|------|------|--------|
| `analyst` | NT（INTJ/INTP/ENTJ/ENTP）| 深蓝 `#3a5a8c` | 分析家 |
| `diplomat` | NF（INFJ/INFP/ENFJ/ENFP）| 紫 `#7a5a9c` | 外交家 |
| `sentinel` | SJ（ISTJ/ISFJ/ESTJ/ESFJ）| 棕 `#8c6a3a` | 守护者 |
| `explorer` | SP（ISTP/ISFP/ESTP/ESFP）| 绿 `#3a8c5a` | 探险家 |

### 4.4 大五人格 JSON 结构

```json
{
  "id": "big-five-ocean",
  "featureId": "psychology",
  "title": "大五人格",
  "subtitle": "五个维度，描绘你性格最真实的轮廓",
  "eyebrow": "Big Five OCEAN",
  "estimatedMinutes": 10,
  "questionCount": 44,
  "isAvailable": true,
  "questionPage": "/subpackages/quiz/pages/generic-question/generic-question",
  "resultPage": "/subpackages/quiz/pages/big-five-result/big-five-result",
  "scoring": {
    "type": "big-five",
    "scale": 5,
    "dimensions": [
      {
        "id": "O", "label": "开放性", "description": "好奇心、想象力与对新体验的接受度",
        "reverseItems": ["q5", "q10", "q15", "q20", "q41", "q44"]
      },
      {
        "id": "C", "label": "尽责性", "description": "自律、条理性与目标导向",
        "reverseItems": ["q8", "q13", "q18", "q23", "q28", "q33", "q38", "q43"]
      },
      {
        "id": "E", "label": "外倾性", "description": "社交活力、积极情绪与主动性",
        "reverseItems": ["q6", "q21", "q31"]
      },
      {
        "id": "A", "label": "亲和性", "description": "信任、利他、合作与体谅",
        "reverseItems": ["q2", "q7", "q12", "q17", "q22", "q27", "q37"]
      },
      {
        "id": "N", "label": "神经质", "description": "情绪敏感性（高分=情绪不稳定）",
        "reverseItems": ["q4", "q9", "q14", "q19", "q24", "q29", "q34", "q39"]
      }
    ]
  },
  "questions": [
    {
      "id": "q1",
      "dimension": "E",
      "text": "我健谈，容易与人攀谈",
      "interaction": "likert-5"
    },
    {
      "id": "q2",
      "dimension": "A",
      "text": "我倾向于挑剔别人",
      "interaction": "likert-5"
    }
  ],
  "results": [
    {
      "id": "O-high",
      "dimension": "O",
      "level": "high",
      "title": "高开放性",
      "portrait": "你对未知充满好奇，思维跨界是你的本能……"
    },
    {
      "id": "O-mid",
      "dimension": "O",
      "level": "mid",
      "title": "中等开放性",
      "portrait": "你在传统与创新之间找到了自己的平衡……"
    },
    {
      "id": "O-low",
      "dimension": "O",
      "level": "low",
      "title": "低开放性",
      "portrait": "你相信经过检验的方法，脚踏实地是你的优势……"
    }
  ]
}
```

---

## 五、功能清单（对标市场主流）

### 5.1 基础体验（MVP 必须有，否则用户流失）

- [ ] **分段进度条** — 显示 "当前题 / 总题数"，超过40题的测试显示百分比（当前进度条逻辑已有，验证长题目是否流畅）
- [ ] **题目过渡动画** — 卡片切换动画（现有 `cardEntering` 逻辑已实现）
- [ ] **维度分数可视化** — 雷达图（已有）+ 条形图（已有），MBTI 需改为双极条形
- [ ] **分享结果卡片** — 微信好友/朋友圈分享，携带 resultId（现有 `onShareAppMessage` 已有）
- [ ] **重新测试入口** — 结果页有"再测一次"按钮（现有 `onRetake` 已有）

### 5.2 进阶功能（对标 16personalities，形成留存）

- [ ] **结果收藏/保存** — 将测试结果存入云数据库 `user_results` 集合（openid + quizId + resultId + scores + timestamp），在个人中心可回看
- [ ] **历史测试记录** — 展示用户做过的所有测试，支持对比（"上次你是 INTJ，这次还是 INTJ"）
- [ ] **测试结果名人列表** — 每个 MBTI / 九型 结果页展示3-5个名人示例，增加代入感（直接写入 result 对象的 `famousExamples` 字段）
- [ ] **MBTI 类型兼容性** — 选择另一个类型，查看相处分析（预生成 `compatibility.json`，16×16 共120对，可 AI 批量生成）
- [ ] **结果详情分类 Tabs** — "核心特质 / 职场 / 恋爱 / 成长" 四个 Tab（`career` / `relationships` / `lifeAdvice` 字段已在 schema 中）

### 5.3 云端结果存储（新建云函数或扩展 quizWriter）

```javascript
// 在 quizWriter 中新增 action: "saveResult"
case "saveResult": {
  const { quizId, resultId, scores, meta } = data;
  const { OPENID } = cloud.getWXContext();
  await db.collection("user_results").add({
    data: {
      openid: OPENID,
      quizId,
      resultId,
      scores,      // { normalized } 或 { biases } 或 { levels }
      meta,        // { quizTitle, resultTitle }
      createdAt: db.serverDate(),
    }
  });
  return { success: true };
}
```

---

## 六、上线排期

### Phase 1（第1周）：零前端开发，直接上内容

**目标**：上线九型人格 + 霍兰德 + 荣格12原型

**工作量分解**：

| 任务 | 负责 | 预估工时 |
|------|------|---------|
| 整理九型人格72题题目，情境化改写 | 内容 | 8h |
| 撰写9型结果文案（5层叙事）| 内容 | 12h |
| 生成 `enneagram-classic.json` 并上传 | 技术 | 2h |
| 整理霍兰德60题题目 | 内容 | 4h |
| 撰写6型结果文案 | 内容 | 8h |
| 生成 `holland-riasec.json` 并上传 | 技术 | 2h |
| 整理荣格12原型60题题目，情境化改写 | 内容 | 6h |
| 撰写12原型结果文案 | 内容 | 16h |
| 生成 `jung-archetype.json` 并上传 | 技术 | 2h |

**验证**：使用现有 `upload-quiz.js` 脚本上传，在小程序内测试完整测试流程

---

### Phase 2（第2周）：MBTI 上线

**目标**：上线完整 MBTI 十六型人格

**工作量分解**：

| 任务 | 负责 | 预估工时 |
|------|------|---------|
| 新增 `scoreMBTI.js` 评分引擎 | 技术 | 3h |
| 改造 `generic-question.js` 的 `_finish()` 分发逻辑 | 技术 | 2h |
| 新增 `mbti-result` 页面（复制 generic-result 改造）| 技术 | 8h |
| MBTI 结果页：双极维度条形图组件 | 技术 | 4h |
| MBTI 结果页：4大类型分组配色 | 技术 | 2h |
| 整理70题 IPIP 题目（中文化）| 内容 | 6h |
| 撰写16型结果文案（优先8个高频型）| 内容 | 20h |
| 生成 `mbti-sixteen.json` 并上传 | 技术 | 2h |
| 端到端测试16种类型路径 | 技术 | 4h |

---

### Phase 3（第3周）：大五人格上线

**目标**：上线大五人格（技术复杂度最高）

**工作量分解**：

| 任务 | 负责 | 预估工时 |
|------|------|---------|
| 新增 `scoreBigFive.js` 评分引擎 | 技术 | 3h |
| Likert-5 交互组件（generic-question 扩展）| 技术 | 6h |
| 新增 `big-five-result` 页面 | 技术 | 8h |
| 大五结果页：五维雷达图（复用现有 _renderRadar）| 技术 | 3h |
| 大五结果页：每维度 high/mid/low 文字解读展示 | 技术 | 4h |
| 整理BFI-44题目（中文学术版）| 内容 | 3h |
| 撰写5维度×3级别 = 15段文案 | 内容 | 10h |
| 生成 `big-five-ocean.json` 并上传 | 技术 | 2h |

---

### Phase 4（第4周）：进阶功能

- 云端结果存储（`user_results` 集合 + `saveResult` action）
- 个人中心"我的测试"历史记录页
- MBTI 类型兼容性查看
- 测试间交叉推荐（测完九型推荐MBTI）

---

## 七、差异化策略

### 与 16personalities 的核心差异

| 维度 | 16personalities | mytype |
|------|----------------|--------|
| 结果文案 | 功能性描述，心理学术语 | 文学叙事，5层人格画像 |
| 视觉风格 | 扁平彩色，西方风格 | 中式美学，古典质感 |
| 题目设计 | 情境+量表组合 | 情境化故事题，沉浸感强 |
| 关联内容 | 单测试深度 | 多测试交叉（测完MBTI推荐对应神话生灵）|
| 文化适配 | 翻译腔重 | 原生中文叙事 |

### mytype 专属功能

1. **中文雅称系统** — 给每个MBTI类型起中文诗意名称，如 INTJ = "谋断者"、ENFP = "燃情者"，用 `token` 字段存储，在结果页大字展示

2. **古典诗词配对** — 每个结果配一首诗词（`verse` + `verseSource` 字段已在 schema 中），用于结果页底部装饰和分享文案

3. **测试互联推荐** — 结果页末尾的"你可能也对这个感兴趣"模块，基于测试结果语义关联推荐其他测试（如 INTJ → 推荐"你体内栖居的神话生灵"中的智慧类生灵）

4. **叙事风格一致** — 所有经典测试的结果文案都遵循 mytype 的5层叙事结构，形成统一的高质量内容调性，这是最大的护城河

---

## 附录：文件命名规范

```
scripts/data/
├── enneagram-classic.json      # 九型人格
├── holland-riasec.json         # 霍兰德职业兴趣
├── jung-twelve-archetypes.json # 荣格12原型
├── mbti-sixteen.json           # MBTI十六型
└── big-five-ocean.json         # 大五人格

miniprogram/subpackages/quiz/
├── pages/
│   ├── mbti-result/            # 新增：MBTI专属结果页
│   │   ├── mbti-result.js
│   │   ├── mbti-result.wxml
│   │   ├── mbti-result.wxss
│   │   └── mbti-result.json
│   └── big-five-result/        # 新增：大五专属结果页
│       ├── big-five-result.js
│       ├── big-five-result.wxml
│       ├── big-five-result.wxss
│       └── big-five-result.json
└── utils/
    ├── scoreMBTI.js            # 新增：双极维度引擎
    └── scoreBigFive.js         # 新增：大五连续分数引擎
```

---

*最后更新：2026-03-30*
