#!/usr/bin/env node
/**
 * Rewrites quiz-level title / subtitle / displayTitleZh / eyebrow for clearer list cards.
 * Patches: scripts/data/live_audit/*.json (except catalog + risk reports), then catalog.json.
 *
 * Usage: node scripts/patch-all-quiz-titles.js
 */

const fs = require("fs");
const path = require("path");

const LIVE_AUDIT = path.join(__dirname, "data/live_audit");

/** title + subtitle required; displayTitleZh defaults to title; eyebrow optional */
const TITLE_MAP = {
  "tang-poets": {
    title: "盛唐诗人里，谁的诗心更像你？",
    subtitle: "从气质与表达习惯，贴近李白、杜甫、王维等一路",
    eyebrow: "唐诗人格",
  },
  "red-chambers": {
    title: "《红楼梦》气质画像：你更像哪位女子？",
    subtitle: "借大观园里的选择与心境，照见你的情感与坚持",
    eyebrow: "红楼人物",
  },
  dialect: {
    title: "听你的用词习惯，你更像哪片方言气质？",
    subtitle: "用语选择映射地域亲缘（趣味溯源，非严谨语言学鉴定）",
    eyebrow: "方言气质",
  },
  temple: {
    title: "你的内心气质，更贴近哪一座庙的意境？",
    subtitle: "禅意小测，仅供文化与自我觉察",
    eyebrow: "寺庙意境",
  },
  city: {
    title: "中国哪座城市，最适合你生活？",
    subtitle: "从节奏、气候、物价与人际偏好，一步步缩小答案",
    eyebrow: "城市匹配",
  },
  "inner-voice-whisper": {
    title: "静下来时，内心的声音在推你怎么选？",
    subtitle: "测内在动机与自我对话方式（娱乐向，非心理诊断）",
    eyebrow: "内在声音",
  },
  "love-level-test": {
    title: "恋爱里，你容易卡在哪一关？",
    subtitle: "从沟通、边界与安全感看亲密模式",
    eyebrow: "恋爱模式",
  },
  "study-abroad-fit-test": {
    title: "去留学的话，哪种环境更适合你长大？",
    subtitle: "学习风格与生活、社交节奏的综合匹配",
    eyebrow: "留学匹配",
  },
  "post-apocalypse-role": {
    title: "末世设定下，你更可能站哪种生存位？",
    subtitle: "资源、信任与规则崩坏时的默认反应",
    eyebrow: "末世设定",
  },
  "media-niche-test": {
    title: "你的创作习惯，更适合哪类自媒体方向？",
    subtitle: "表达、深度与受众连接三维匹配",
    eyebrow: "自媒体方向",
  },
  "career-aptitude": {
    title: "霍兰德六型：你的职业兴趣更像哪一类？",
    subtitle: "现实、研究、艺术、社会、经营、事务倾向（趣味版）",
    eyebrow: "职业兴趣",
  },
  "big-five-ocean": {
    title: "大五人格：五个维度上你长什么样？",
    subtitle: "开放性、尽责、外向、宜人、情绪敏感（科普自测）",
    eyebrow: "大五人格",
  },
  "enneagram-classic": {
    title: "九型人格：压力下你默认启用哪种模式？",
    subtitle: "看见动机主型与压力反应（趣味版，非诊疗）",
    eyebrow: "九型人格",
  },
  "mbti-16personalities": {
    title: "十六型偏好：你的能量与决策更像哪一类？",
    subtitle: "MBTI 四轴娱乐自测（非医疗或职业结论）",
    eyebrow: "十六型",
  },
  "your-perfect-perfume-type": {
    title: "若用一支香水形容你，会是什么气质？",
    subtitle: "从日常选择映射香调与性格侧写",
    eyebrow: "气质香型",
  },
  "spiritual-homeland": {
    title: "哪里最让你有「精神返乡」的感觉？",
    subtitle: "空间、人情与节奏里的心灵落点",
    eyebrow: "精神故乡",
  },
  "qing-nian-xiang-si": {
    title: "《庆余年》里，你最像哪位角色？",
    subtitle: "权谋与情义之间，你的取舍更像谁",
    eyebrow: "庆余年",
  },
  "three-kingdoms-strategist-match": {
    title: "三国谋士里，你最像谁的谋略风格？",
    subtitle: "信息、风险与道义之间的决策偏好",
    eyebrow: "三国谋士",
  },
  "literary-soul-resonance": {
    title: "你与哪位世界文豪最像？",
    subtitle: "从文风、处境与价值感对照文学巨匠",
    eyebrow: "文豪对照",
  },
  "tang-song-masters": {
    title: "唐宋八大家里，你更接近哪一位？",
    subtitle: "文脉气质与入世方式的粗测",
    eyebrow: "唐宋八大家",
  },
  "shanhaijing-shenshou": {
    title: "你是《山海经》里的哪种神兽？",
    subtitle: "从反应与气质映射神话原型",
    eyebrow: "山海经",
  },
  "disney-princess-archetype": {
    title: "十二位迪士尼公主里，你更像哪一位？",
    subtitle: "勇气、自洽与亲密关系里的默认模式",
    eyebrow: "迪士尼公主",
  },
  "greek-mythology-deity": {
    title: "希腊神话里，你是哪位神的气质？",
    subtitle: "欲望、秩序与命运观映射奥林匹斯原型",
    eyebrow: "希腊神话",
  },
  "republican-women-personality-test": {
    title: "民国知识女性里，你最像谁？",
    subtitle: "独立、才情与时代夹缝中的自我姿态",
    eyebrow: "民国女性",
  },
  "miyazaki-character-archetype": {
    title: "宫崎骏动画里，你最像谁？",
    subtitle: "飞行、成长与自然观里的选择",
    eyebrow: "宫崎骏宇宙",
  },
  "little-prince-character-match": {
    title: "《小王子》里，你更像书中哪位？",
    subtitle: "玫瑰、狐狸与飞行员式的孤独与眷恋",
    eyebrow: "小王子",
  },
  "wangjiawei-character": {
    title: "王家卫电影里，你最像哪位角色？",
    subtitle: "时间、疏离与执念的都市心境",
    eyebrow: "王家卫电影",
  },
  "sherlock-character-match": {
    title: "《神探夏洛克》里，你更像谁？",
    subtitle: "推理节奏、社交距离与冒险感",
    eyebrow: "神夏角色",
  },
  "zhifou-character-match": {
    title: "《知否》里，你在盛家最像谁？",
    subtitle: "家族棋局中的分寸、隐忍与底线",
    eyebrow: "知否",
  },
  "he-li-hua-ting-character-match": {
    title: "《鹤唳华亭》里，你像哪位角色？",
    subtitle: "权谋与情义对撞时的你",
    eyebrow: "鹤唳华亭",
  },
  "gatsby-character-match": {
    title: "《了不起的盖茨比》里，你像他笔下的谁？",
    subtitle: "欲望、阶级面具与幻灭感",
    eyebrow: "盖茨比",
  },
  "doraemon-character-match": {
    title: "《哆啦A梦》里，你更像谁？",
    subtitle: "友谊、怯懦与勇气里的站位",
    eyebrow: "哆啦A梦",
  },
  "jin-female-archetypes": {
    title: "金庸笔下的奇女子，你最像谁？",
    subtitle: "刚柔、情义与江湖规训之间的你",
    eyebrow: "金庸武侠",
  },
  "zhenhuan-character-match": {
    title: "《甄嬛传》里，你像哪位嫔妃？",
    subtitle: "深宫处境中的生存策略与真心",
    eyebrow: "甄嬛传",
  },
  "life-philosophy-archetype": {
    title: "如果选一种哲学底色，你更站哪一派？",
    subtitle: "存在主义、斯多葛、荒诞感与超越感（趣味）",
    eyebrow: "人生哲学",
  },
  "love-show-personality": {
    title: "恋爱真人秀里，你会是哪种人设？",
    subtitle: "镜头、规则与修罗场下的亲密反应",
    eyebrow: "恋综设定",
  },
  "martial-arts-sect": {
    title: "金庸武侠八大门派，你最适合哪一派？",
    subtitle: "心法、招式观与江湖道义偏好",
    eyebrow: "金庸门派",
  },
  "career-archetype-test": {
    title: "职场里，你更像哪种工作原型？",
    subtitle: "协作方式、目标感与风险承受侧写",
    eyebrow: "职场原型",
  },
  "gem-personality": {
    title: "若用一颗宝石形容你，会是哪一种？",
    subtitle: "稳定、通透与锋芒等人格维度的隐喻",
    eyebrow: "宝石隐喻",
  },
  "ming-dynasty-persona": {
    title: "明末乱世的夹缝里，你更可能变成谁？",
    subtitle: "权力、生存与道义撕扯下的选择",
    eyebrow: "明末乱世",
  },
  "graduate-school-fit": {
    title: "你适合读研这条路吗？",
    subtitle: "从思辨方式到节奏与抗压，看你和长期学术训练是否合拍",
    eyebrow: "读研适配",
  },
  自媒体赛道人格测验: {
    title: "你适合哪条自媒体赛道？",
    subtitle: "按表达、深度与互动习惯，看哪类内容方向更顺手",
    eyebrow: "赛道匹配",
  },
  自媒体人格原型: {
    title: "做自媒体，你更像哪种创作原型？",
    subtitle: "打法、受众与变现气质，测你更贴近哪一类创作者",
    eyebrow: "自媒体人格",
  },
  "lovecraftian-monster-domination": {
    title: "面对不可名状的未知，你是哪种反应类型？",
    subtitle: "借克苏鲁式情境，照见面对未知与失控时的心智反应（娱乐向）",
    eyebrow: "宇宙恐怖情境",
  },
};

function shouldPatchQuizObject(obj) {
  if (!obj || typeof obj !== "object" || !obj.id || !TITLE_MAP[obj.id]) return false;
  const id = obj.id;
  if (id === "city" && Array.isArray(obj.provinces)) return true;
  if (id === "red-chambers" && obj.phases) return true;
  if (Array.isArray(obj.questions) && obj.questions.length > 0) return true;
  return false;
}

function applyPatch(obj) {
  const p = TITLE_MAP[obj.id];
  obj.title = p.title;
  obj.subtitle = p.subtitle;
  obj.displayTitleZh = p.displayTitleZh !== undefined ? p.displayTitleZh : p.title;
  if (p.eyebrow !== undefined) obj.eyebrow = p.eyebrow;
}

function walkPatch(node) {
  if (!node || typeof node !== "object") return;
  if (shouldPatchQuizObject(node)) applyPatch(node);
  if (Array.isArray(node)) {
    node.forEach(walkPatch);
    return;
  }
  for (const k of Object.keys(node)) walkPatch(node[k]);
}

const SKIP = new Set([
  "catalog.json",
  "high-risk-shortlist.json",
  "weighted-risk-report.json",
]);

function patchLiveAuditFile(filePath) {
  const name = path.basename(filePath);
  if (SKIP.has(name)) return false;
  const raw = fs.readFileSync(filePath, "utf8");
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return false;
  }
  walkPatch(data);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
  return true;
}

function patchCatalog() {
  const p = path.join(LIVE_AUDIT, "catalog.json");
  const catalog = JSON.parse(fs.readFileSync(p, "utf8"));
  for (const row of catalog) {
    const m = TITLE_MAP[row.id];
    if (!m) continue;
    row.title = m.title;
    row.subtitle = m.subtitle;
    row.displayTitleZh = m.displayTitleZh !== undefined ? m.displayTitleZh : m.title;
    if (m.eyebrow !== undefined) row.eyebrow = m.eyebrow;
  }
  fs.writeFileSync(p, JSON.stringify(catalog, null, 2) + "\n", "utf8");
}

function patchRiskReports() {
  for (const rep of ["high-risk-shortlist.json", "weighted-risk-report.json"]) {
    const fp = path.join(LIVE_AUDIT, rep);
    if (!fs.existsSync(fp)) continue;
    const data = JSON.parse(fs.readFileSync(fp, "utf8"));
    const list = Array.isArray(data) ? data : data.items || data.rows;
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      const m = TITLE_MAP[row.id];
      if (m && row.title !== undefined) row.title = m.title;
    }
    fs.writeFileSync(fp, JSON.stringify(data, null, 2) + "\n", "utf8");
  }
}

function main() {
  const files = fs.readdirSync(LIVE_AUDIT).filter((f) => f.endsWith(".json"));
  let n = 0;
  for (const f of files) {
    if (SKIP.has(f)) continue;
    if (patchLiveAuditFile(path.join(LIVE_AUDIT, f))) n += 1;
  }
  patchCatalog();
  patchRiskReports();
  console.log(`Patched quiz objects in ${n} live_audit JSON files + catalog.json + risk reports.`);
}

main();
