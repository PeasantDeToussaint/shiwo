const data = require("./red-chambers-full");
const { scoreRedChambers } = require("../../../utils/scoreRedChambers");

const CURATED_IDS = [
  "Q2", "Q1", "Q4", "Q3",
  "A3", "D1", "H1", "B3", "G2", "B2",
  "C1", "F3", "C2", "E1", "G1", "F1",
  "H3", "I1", "A4", "I2",
];

const CLOUD_RC =
  "cloud://cloudbase-4gadl6qo4a9aa95d.636c-cloudbase-4gadl6qo4a9aa95d-1415990507/";

const PAINTING_MAP = {
  Q1: CLOUD_RC + "078第27回 埋香塚黛玉泣殘紅 花園中暇遊觀鶴舞.jpg",
  Q2: CLOUD_RC + "077第27回 滴翠亭寶釵戲彩蝶.jpg",
  Q3: CLOUD_RC + "086第30-31回 椿齡畫薔癡及局外 心思踢人錯踢襲人 撕扇子作千金一笑.jpg",
  Q4: CLOUD_RC + "103第45回 變生不測鳳姐潑醋 喜出望外平兒理妝.jpg",
  A3: CLOUD_RC + "089第34-35回 情中情因情感妹妹 錯里措以錯勸哥哥.jpg",
  A4: CLOUD_RC + "151第78-79回 痴公子杜撰芙蓉诔.jpg",
  B2: CLOUD_RC + "174第87回 坐禪寂走火入邪魔.jpg",
  B3: CLOUD_RC + "071第23-24回 衆姊妹進住大觀園 西廂記妙詞通戲語.jpg",
  C1: CLOUD_RC + "041第15-16回 王凤姐弄权铁槛寺 秦鯨卿得趣饅頭庵.jpg",
  C2: CLOUD_RC + "101第42-43回 瀟湘子雅謔補余香.jpg",
  D1: CLOUD_RC + "116第55-56回 欺幼主刁奴蓄險心 敏探春興利除宿弊.jpg",
  E1: CLOUD_RC + "099第41回 賈寶玉品茶櫳翠庵.jpg",
  F1: CLOUD_RC + "109第50回 琉璃世界白雪紅梅 脂粉香娃割腥啖膻.jpg",
  F3: CLOUD_RC + "204第101回 大觀園月夜警幽魂 散花寺神籤占異兆.jpg",
  G1: CLOUD_RC + "143第74-75回 惑奸讒抄檢大觀園.jpg",
  G2: CLOUD_RC + "146第75-76回 凸碧堂品笛感悽清 凹晶館聯詩悲寂寞.jpg",
  H1: CLOUD_RC + "191第95回 櫳翠庵妙玉扶乩玉.jpg",
  H3: CLOUD_RC + "140第71-72回 王熙鳳恃強羞說病.jpg",
  I1: CLOUD_RC + "196第96回 林黛玉焚稿斷癡情.jpg",
  I2: CLOUD_RC + "198第97-98回 苦絳珠魂歸離恨天.jpg",
};

function buildQuestionPool() {
  const pool = {};
  data.phases.screening.questions.forEach((q) => { pool[q.id] = q; });
  data.phases.branches.forEach((branch) => {
    branch.questions.forEach((q) => { pool[q.id] = q; });
  });
  return pool;
}

const questionPool = buildQuestionPool();
const curatedQuestions = CURATED_IDS.map((id) => ({
  ...questionPool[id],
  painting: PAINTING_MAP[id] || null,
})).filter(Boolean);

function score(allAnswers) {
  return scoreRedChambers(data, allAnswers);
}

module.exports = {
  id: data.id,
  title: data.title,
  subtitle: data.subtitle,
  eyebrow: data.eyebrow,
  description: data.description,
  themeKey: data.themeKey,
  accent: data.accent,
  disclaimer: data.disclaimer,
  questions: curatedQuestions,
  phases: data.phases,
  scoring: data.scoring,
  results: data.results,
  questionPage: "/subpackages/quiz/pages/rc-question/rc-question",
  resultPage:   "/subpackages/quiz/pages/rc-result/rc-result",
  score,
};
