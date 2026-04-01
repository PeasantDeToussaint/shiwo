#!/usr/bin/env node
/**
 * dispatch-quizzes.js — 批量触发 GitHub Actions 生成测验
 *
 * Usage:
 *   node scripts/dispatch-quizzes.js --list
 *   node scripts/dispatch-quizzes.js --quiz=1,3,12
 *   node scripts/dispatch-quizzes.js --quiz=hogwarts-house-sorting
 *   node scripts/dispatch-quizzes.js --all
 *   node scripts/dispatch-quizzes.js --all --estimate
 *   node scripts/dispatch-quizzes.js --all --no-dry-run
 *   node scripts/dispatch-quizzes.js --all --delay=5000
 */

const { execSync, spawnSync } = require("child_process");

// ── Quiz catalog ─────────────────────────────────────────────────────────────

const QUIZZES = [
  {
    id:         "zootopia-character-match",
    title:      "你是疯狂动物城里的谁？",
    scoring:    "weighted-dimension",
    results:    8,
    dimensions: 4,
    questions:  20,
    hints: [
      "结果角色固定为：朱迪·霍普斯、尼克·王尔德、博戈局长、羊助理市长贝尔韦瑟、克劳豪泽、雅克斯、闪电（树懒）、大象戴恩；每个代表一种都市职场人格",
      "维度为：理想主义vs现实主义、主动开拓vs遵规守位、情绪外显vs内敛、秩序认同vs边缘游走",
      "题目应发生在都市职场、窗口服务、排队、谈判、地铁等疯狂动物城真实场景中，不要脱离世界观",
      "选项用具体行为描述，禁止写「你更喜欢A还是B」这类直白问法",
      "verse 来源必须是角色台词，不得使用任何泛励志名言",
    ],
  },
  {
    id:         "lotr-character-match",
    title:      "你和指环王中的谁最像？",
    scoring:    "weighted-dimension",
    results:    8,
    dimensions: 5,
    questions:  24,
    hints: [
      "结果角色：弗罗多、山姆、甘道夫、阿拉贡、莱戈拉斯、吉姆利、波罗米尔、皮聘；每个代表一种承担使命与代价的方式",
      "维度：承担重量方式（主动/被分配）、智慧与行动比例、对权力与欲望的态度、对同伴的忠诚模式、直面黑暗的内在资源",
      "题目必须沉浸在中土世界的场景里：跋涉、扎营、会议、边境关卡、守夜——让用户真实感受到旅途和使命的重量",
      "关键约束：场景可以是奇幻的，但问题本身不能直接映射到某个角色的标志性行为（比如不要写「你独自弓箭射击」——那只有一个答案）；要测内心反应，不要测行为标签",
      "禁止在题目中出现任何角色名字",
      "verse 必须来自托尔金原著台词或诗歌，标注出处",
    ],
  },
  {
    id:         "big-bang-theory-character-match",
    title:      "你和生活大爆炸中的谁最像？",
    scoring:    "weighted-dimension",
    results:    7,
    dimensions: 4,
    questions:  20,
    hints: [
      "结果角色：谢耳朵、莱纳德、霍华德、拉杰什、佩妮、伯纳黛特、艾米",
      "维度：智识表达方式、社交敏感度、情感处理风格、自我中心程度",
      "题目场景取自日常：宿舍、电梯、约会、朋友圈、外卖讨论——不要写成心理学问卷",
      "禁止写「你是内向还是外向」，改成具体情境里的具体反应",
      "语气有幽默感，像聪明朋友之间说话，但不流于段子",
    ],
  },
  {
    id:         "avengers-hero-match",
    title:      "你是《复仇者联盟》里的哪位英雄？",
    scoring:    "weighted-dimension",
    results:    9,
    dimensions: 5,
    questions:  22,
    hints: [
      "结果角色：钢铁侠、美国队长、雷神、绿巨人/班纳、黑寡妇、鹰眼、蜘蛛侠、奇异博士、黑豹",
      "维度：危机应对方式、情感驱动力来源、对规则与权威的态度、道德边界弹性、权力的使用方式",
      "题目可以设置在漫威宇宙的真实场景中：战略会议、任务前的等待、队伍内部分歧、媒体发布会、独自面对后果的时刻——让用户沉浸在这个世界里做选择",
      "关键约束：不能写只有一个英雄才会做的标志性动作（不要写「你穿上战甲飞出去」——那只有一个答案）；要测驱动力和决策模式，不要测超能力偏好",
      "禁止在题目中出现任何英雄角色名字",
      "verse 来自角色台词，标注角色名",
    ],
  },
  {
    id:         "one-piece-character-match",
    title:      "你和《海贼王》中的谁最像？",
    scoring:    "weighted-dimension",
    results:    9,
    dimensions: 5,
    questions:  22,
    hints: [
      "结果角色：路飞、索隆、娜美、乌索普、山治、乔巴、罗宾、弗兰基、布鲁克",
      "维度：对自由的理解方式、在集体中的角色认同、面对强者的反应、情感表达方式、追梦执行风格",
      "题目必须沉浸在大海和航行的世界里：靠港、航行途中、船员之间的时光、遭遇陌生海域、面对危险前的一刻——让用户真实感受到自由和冒险的气息",
      "关键约束：场景可以是航海冒险的，但不能写只有一个人才会做的标志性动作（不要写「你用橡皮果实的力量」）；要测驱动力和关系模式，不要测能力标签",
      "禁止在题目中出现任何角色名字",
      "verse 必须来自角色台词，不得使用泛励志名言",
    ],
  },
  {
    id:         "detective-conan-character-match",
    title:      "你和《名侦探柯南》中的谁最像？",
    scoring:    "weighted-dimension",
    results:    8,
    dimensions: 4,
    questions:  20,
    hints: [
      "结果角色：柯南/工藤新一、毛利兰、灰原哀、平次、赤井秀一、怪盗基德、园子、目暮警官",
      "维度：推理/直觉倾向、主动发现真相vs维持表面平静、自我暴露意愿、对正义的执行方式",
      "题目可以设置在柯南世界的真实场景里：案发现场周边、跟踪嫌疑人途中、审讯前的等待、被人误解时的沉默——让用户沉浸在推理和隐藏身份的张力中",
      "关键约束：不能写只有一个角色才会做的动作（不要写「你用侦探徽章亮明身份」）；要测信息处理方式和关系选择，不要测推理技能高下",
      "禁止在题目中出现任何角色名字",
    ],
  },
  {
    id:         "pokemon-personality-match",
    title:      "你是哪种精灵宝可梦？",
    scoring:    "weighted-dimension",
    results:    10,
    dimensions: 4,
    questions:  20,
    hints: [
      "结果宝可梦（固定）：皮卡丘（活力社交）、卡比兽（悠然自在）、伊布（多向可能）、耿鬼（神秘边缘）、喷火龙（独立强者）、超梦（孤高智慧）、胖丁（创意表达）、路卡利欧（直觉忠诚）、风速狗（热血行动）、妙蛙种子（稳健支撑）",
      "维度：能量表达方式、社交需求、力量动机、环境适应性",
      "题目完全在现实日常场景中，不出现任何宝可梦世界元素",
      "语气轻快有童心，不过于严肃，适合分享",
    ],
  },
  {
    id:         "luxun-character-match",
    title:      "如果你是鲁迅笔下的角色，你会是谁？",
    scoring:    "weighted-dimension",
    results:    8,
    dimensions: 5,
    questions:  22,
    hints: [
      "结果角色（固定）：阿Q（精神胜利的自我保护者）、祥林嫂（被吞没的反复倾诉者）、孔乙己（自尊与没落的挣扎者）、闰土（被时代遮蔽的沉默者）、狂人（清醒而无人相信的异见者）、吕纬甫（理想退守的妥协者）、魏连殳（孤独抗争直至耗尽的人）、子君（用觉醒换来悲剧的人）",
      "维度：对外部压迫的感知与应对、自我意识的清醒程度、理想的持守与放弃、情感压抑与爆发、在群体中的位置",
      "题目必须重现鲁迅小说里的具体场景，把原著情境还原成第二人称叙述，例如：「酒馆里有人在笑你，你听见了，但装作没听见」、「你站在祠堂门口，所有人都在说同一件事，没有人问你怎么看」、「你把那碗药端给他，他喝了，你没有说话」——不要直接引用原著，把场景活化",
      "场景要涵盖不同作品的处境：咸亨酒店、祥林嫂的反复讲述、狂人的一个夜晚、闰土重逢时的沉默、子君离开后的房间",
      "语气沉着有密度，带鲁迅式冷峻观察感，禁止轻浮口语或现代化表达",
      "verse 必须是鲁迅原著原句（小说、杂文、散文诗均可），不得使用任何他人名言",
    ],
  },
  {
    id:         "buendia-generation-match",
    title:      "你是《百年孤独》里的哪一代布恩迪亚？",
    scoring:    "weighted-dimension",
    results:    7,
    dimensions: 5,
    questions:  22,
    hints: [
      "结果人物（固定）：何塞·阿尔卡蒂奥·布恩迪亚（痴迷探索的创建者）、乌苏拉（用生命撑起一切的人）、奥雷连诺上校（孤独而革命的人）、阿玛兰妲（用恨守护爱的人）、奥雷连诺第二（享乐与混沌中的人）、雷梅苔丝（超越尘世的人）、奥雷连诺·巴比伦尼亚（孤独终结者）",
      "维度：孤独的形态（主动/被动/超脱）、对时间与记忆的态度、与命运的关系（抗争/顺从/超越）、情感的压抑与释放、理想主义的表现形式",
      "题目应带魔幻现实感：梦境与现实交叠，历史重演，不要写成普通心理测验",
      "禁止用「你是内向还是外向」这类问法，要用隐喻性、叙事性情境",
      "语气带宿命感和史诗重量，句子要有密度",
      "verse 必须来自马尔克斯《百年孤独》原文",
    ],
  },
  {
    id:         "classic-book-match",
    title:      "如果你是一本经典名著，你的书名是什么？",
    scoring:    "weighted-dimension",
    results:    9,
    dimensions: 4,
    questions:  20,
    hints: [
      "结果书目（固定）：《百年孤独》《活着》《1984》《小王子》《挪威的森林》《堂吉诃德》《呼啸山庄》《战争与和平》《局外人》；每本代表一种独特的人生态度",
      "维度：内心世界与外部世界的关系、对荒诞/苦难的应对方式、孤独的质感、行动力与沉思的比例",
      "题目不得直接提及任何书名或作者，通过行为、思维模式和情感反应来区分",
      "语气略带文学气息，但不能学院派，让普通用户也感自然",
      "verse 必须是对应书籍的原文金句，标注书名和作者",
    ],
  },
  {
    id:         "coffee-personality-match",
    title:      "你更像哪种咖啡？",
    scoring:    "weighted-dimension",
    results:    8,
    dimensions: 4,
    questions:  16,
    hints: [
      "结果（固定）：意式浓缩（纯粹强烈）、美式（务实简洁）、拿铁（温暖包容）、卡布奇诺（精致平衡）、冷萃（沉静深沉）、玛奇朵（精致利己）、馥芮白（亲密细腻）、手冲（仪式感审美）",
      "维度：强度与温度、社交属性、生活节奏偏好、感官主导方式",
      "题目场景取自早晨、工作间隙、独处时刻，通过行为和偏好自然推导，禁止直接问「你喜欢喝什么咖啡」",
      "语气轻松有质感，略带生活审美",
    ],
  },
  {
    // ★ bipolar-dimension：2 轴 → 4 象限 = 4 个霍格沃茨学院
    id:         "hogwarts-house-sorting",
    title:      "你会加入哈利波特中哪个魔法学院？",
    scoring:    "bipolar-dimension",
    results:    4,
    dimensions: 2,
    questions:  18,
    hints: [
      "结果固定为四院：格兰芬多、斯莱特林、拉文克劳、赫奇帕奇",
      "第一条轴：行动/情感驱动（格兰芬多极）↔ 谋略/利益驱动（斯莱特林极）",
      "第二条轴：智识/个人主义（拉文克劳极）↔ 忠诚/集体主义（赫奇帕奇极）",
      "四个结果对应四个象限组合，在结果描述中明确标注学院名和核心精神",
      "题目可以沉浸在霍格沃茨的世界里：课堂上的抉择、魁地奇赛前的氛围、宿舍里的争论、被老师点名时——让用户真实感受到魔法学校的质感",
      "关键约束：不能写只属于某个学院的标志性场景（不要写「海德薇飞来一封信」——那只属于一个人）；场景要有这个世界的元素，但问题要测价值取向，不要测角色知识",
      "禁止在题目中出现任何角色名字，禁止直接提及学院名称",
      "每个学院的差异通过真实的价值冲突体现，不做成颜色/动物偏好题",
      "用户到结果才知道自己属于哪个学院，制造揭晓感",
    ],
  },
  {
    id:         "jujutsu-kaisen-character-match",
    title:      "你和《咒术回战》中的谁最像？",
    scoring:    "weighted-dimension",
    results:    9,
    dimensions: 5,
    questions:  22,
    hints: [
      "结果角色（固定）：虎杖悠仁、伏黑惠、钉崎野蔷薇、五条悟、夏油杰、乙骨憂太、七海建人、狗卷棘、真人",
      "维度：力量的来源（本能/意志/规则/爱）、对他人痛苦的感知距离、面对不可能时的态度、道德弹性、自我保护方式",
      "题目必须沉浸在咒术回战的世界里：任务前的等待、领取任务时的心理、看着同伴受伤时、独自面对高层领命时——让用户感受到这个世界里力量与代价并存的氛围",
      "关键约束：不能写只有一个角色才会有的标志性行为（不要写「你展开无量空处」）；要测面对代价时的内心选择，不要测战斗风格",
      "禁止在题目中出现任何角色名字，禁止出现术式名称",
      "verse 来自角色台词，标注角色名",
    ],
  },
  {
    id:         "demon-slayer-character-match",
    title:      "你最像《鬼灭之刃》中的谁？",
    scoring:    "weighted-dimension",
    results:    9,
    dimensions: 4,
    questions:  20,
    hints: [
      "结果角色（固定）：炭治郎、善逸、伊之助、煉獄杏寿郎、宇髄天元、甘露寺蜜璃、时透无一郎、悲鸣嶋行冥、伊黒小芭内",
      "维度：情感表达方式（外放/内敛）、对他人苦难的感知、力量来源（情感/意志/技艺/信念）、面对绝境的内在应对",
      "题目必须沉浸在鬼灭之刃的世界里：训练途中、任务前的黎明、队伍休息时、目睹失去时——让用户感受到这个世界里牺牲与信念的质感",
      "关键约束：不能写只有一个角色才会有的标志性动作（不要写「你使出火焰呼吸」）；要测情感处理和力量来源，不要测呼吸法偏好",
      "禁止在题目中出现任何角色名字，禁止出现呼吸法名称",
      "verse 来自角色台词或原作，标注来源",
    ],
  },
  {
    id:         "love-rank-test",
    title:      "你的恋爱等级是青铜还是王者？",
    scoring:    "level-band",
    results:    5,
    dimensions: 4,
    questions:  18,
    hints: [
      "结果五段（固定）：青铜（靠本能行动的恋爱小白）、白银（有感知但不会表达）、黄金（理解自我和对方但偶尔短路）、铂金（情感成熟，能有效沟通）、王者（高自知与共情，能建立深度关系）",
      "维度：情绪觉察、沟通方式、边界感、自我中心程度",
      "题目取自真实恋爱场景：约会、争吵、冷战、表白、日常亲密——通过行为和反应区分等级，不要直接问「你觉得自己情商高吗」",
      "每道题的选项要有明确的成熟度梯度，从冲动反应到有意识回应形成层次",
      "语气活泼有心理深度，适合年轻用户分享",
    ],
  },
  {
    id:         "content-creator-type",
    title:      "你最适合做什么自媒体？",
    scoring:    "weighted-dimension",
    results:    8,
    dimensions: 4,
    questions:  18,
    hints: [
      "结果类型（固定）：生活vlog、深度测评、情感/心理科普、美食探店、穿搭时尚、知识科普、旅行记录、游戏/娱乐直播",
      "维度：内容驱动力（自我表达/帮助他人/娱乐大众/追求审美）、制作风格（即兴/规划）、与观众关系（引领/陪伴/提供服务）、内容节奏",
      "题目取自真实创作心理：你怎么度过下午/你受不了什么/你最在乎粉丝哪种反应——不要写「你更喜欢室内还是户外」",
      "语气轻松有互联网感，适合年轻用户",
    ],
  },
  {
    // ★ bipolar-dimension：3 轴 → 8 象限 = 8 个养老目的地
    id:         "retirement-destination-match",
    title:      "财富自由之后，你最适合去哪里养老？",
    scoring:    "bipolar-dimension",
    results:    8,
    dimensions: 3,
    questions:  18,
    hints: [
      "结果目的地（固定）：大理、京都、成都、巴厘岛、里斯本、新西兰、泰国清迈、冰岛",
      "第一条轴：东方文化认同（大理/京都/成都/泰国清迈极）↔ 西方/全球文化认同（里斯本/新西兰/冰岛极）",
      "第二条轴：烟火城市感（成都/里斯本/巴厘岛极）↔ 自然空旷感（新西兰/冰岛/大理极）",
      "第三条轴：热闹人情（成都/泰国清迈极）↔ 孤独沉静（冰岛/京都/大理极）",
      "8个结果对应3轴8象限，每个地方的象限映射要明确标注在结果描述中",
      "题目通过日常选择流露偏好：一个理想的周二你会做什么/受不了住在哪种地方/什么样的邻居让你崩溃——禁止直接问「你喜欢哪个城市」",
      "语气从容，带对自由生活的向往感",
    ],
  },
  {
    id:         "spending-personality-test",
    title:      "你会为了什么毫不犹豫的掏钱？",
    scoring:    "weighted-dimension",
    results:    8,
    dimensions: 4,
    questions:  16,
    hints: [
      "结果类型（固定）：旅行体验、精致美食、电子产品、书籍/学习、健身运动、居家品质、演出/音乐会、时尚单品",
      "维度：即时满足vs延迟满足、体验vs物品、社交展示vs个人独享、实用vs审美",
      "题目聚焦真实消费心理：钱包见底还选哪个/刚发工资第一件事/朋友推荐但贵你怎么想——不要问「你是冲动消费者吗」",
      "语气轻松有代入感，结果要有被说中的洞察感",
    ],
  },
  {
    id:         "paladin-character-match",
    title:      "你更像《仙剑奇侠传》里的谁？",
    scoring:    "weighted-dimension",
    results:    7,
    dimensions: 5,
    questions:  20,
    hints: [
      "结果角色（固定，横跨仙剑一/三/四）：李逍遥（率性自由、重情重义）、赵灵儿（纯粹善良、命运承担者）、林月如（刚烈执着、理性守护者）、景天（玩世不恭下的深情）、雪见（温柔压抑、自我牺牲）、龙葵（孤独叛逆、渴望被看见）、云天河（守则与情感的撕裂者）",
      "维度：对自由的理解（逍遥/承担）、面对命运方式（抗争/顺应/超脱）、情感压抑与表达、守护方式（主动/牺牲/陪伴）、入世vs出世",
      "题目必须沉浸在仙剑世界的氛围里：山路中遇雨、酒馆里的离别、师门之间的选择、记忆消散前的时刻——让用户真实感受到这个世界里情与命的张力",
      "关键约束：不能写只有一个角色才会做的标志性动作（不要写「你使出水灵剑法」）；要测面对情与义冲突时的内心选择",
      "语气带诗意和宿命感，不现代口语化，句子要有仙剑情感厚度",
      "verse 必须来自仙剑系列原作台词或插曲歌词，不得使用泛古诗词",
    ],
  },
  {
    id:         "spirited-away-character-match",
    title:      "你更像《千与千寻》里的谁？",
    scoring:    "weighted-dimension",
    results:    8,
    dimensions: 4,
    questions:  18,
    hints: [
      "结果角色（固定）：千寻（在陌生世界学会站稳）、白龙（夹在两个世界之间的人）、汤婆婆（用控制表达权力的人）、钱婆婆（隐居智慧的给予者）、小玲（务实但善良的现实主义者）、无脸男（用给予换认同的人）、坊宝宝（被过度保护而未成长的人）、锅炉爷爷（默默劳作的守护者）",
      "维度：在异域/压力环境下的适应方式、对权力关系的感知、自我认同的稳固程度、给予与索取的模式",
      "题目必须沉浸在汤婆婆浴场的世界里：第一天上工的迷失感、浴场里遇到奇怪客人时、帮一个陌生存在做了某件事之后——让用户真实感受到这个世界的神秘与压力",
      "关键约束：不能写只属于某个角色的标志性场景（不要写「一个巨大的无脸男走向你」——那立刻指向一个具体结果）；场景可以有这个世界的元素，但问题要测心理反应，不要测角色知识",
      "禁止在题目中出现任何角色名字",
      "语气温柔有童心，带现实的诗意感",
      "verse 来自电影台词，标注角色名",
    ],
  },
  {
    id:         "flower-personality-match",
    title:      "你是哪一种花？",
    scoring:    "weighted-dimension",
    results:    9,
    dimensions: 4,
    questions:  18,
    hints: [
      "结果（固定）：玫瑰（热烈张扬）、向日葵（明朗温暖）、兰花（内敛清高）、荷花（洁净自持）、薰衣草（疗愈安静）、茉莉（细腻亲近）、樱花（短暂而绚烂）、梅花（孤傲坚韧）、牡丹（丰盈自信）",
      "维度：存在方式（内敛/外放）、力量特质（柔韧/刚强）、社交气质（亲近/疏离）、与时间的关系（短暂/持久）",
      "题目通过日常气质和选择自然流露，不要直接问「你喜欢什么颜色的花」",
      "语气有诗意，轻盈，带审美感；可适当用古典意象，但不要全文言",
    ],
  },
  {
    id:         "tarot-card-match",
    title:      "你是哪种塔罗牌？",
    scoring:    "weighted-dimension",
    results:    10,
    dimensions: 5,
    questions:  20,
    hints: [
      "结果（大阿卡那，固定）：愚者、女祭司、皇帝、隐者、星星、月亮、太阳、力量、正义、世界",
      "维度：行动力（主动/被动）、能量来源（内在/外在）、感知模式（直觉/逻辑）、对变化的态度、与世界的关系（连接/独立）",
      "题目带神秘和象征感，可用隐喻情境，但选项指向真实行为和内心反应",
      "禁止出现任何塔罗牌名称或占卜相关术语",
      "语气神秘有深度，但不让用户感到难以理解——像懂塔罗的朋友在问你问题",
    ],
  },
  {
    id:         "study-abroad-country-match",
    title:      "你最适合去哪个国家留学？",
    scoring:    "weighted-dimension",
    results:    8,
    dimensions: 4,
    questions:  18,
    hints: [
      "结果国家（固定）：英国（传统与批判思维）、美国（多元与竞争）、日本（精工与沉浸）、法国（艺术与思辨）、德国（严谨与工程）、澳大利亚（开放与自然）、加拿大（包容与平衡）、新加坡（效率与亚洲枢纽）",
      "维度：学习风格（结构化/自由探索）、文化适应方式（融入/保持自我）、社交模式、生活环境偏好",
      "题目通过真实场景展开：deadline来了你怎么办/在陌生城市你会先做什么/你最在乎的课堂体验——禁止问「你喜欢哪个国家」",
      "语气轻快实用，适合大学生群体",
    ],
  },
  {
    id:         "cthulhu-deity-match",
    title:      "你是哪种克苏鲁古神？",
    scoring:    "weighted-dimension",
    results:    7,
    dimensions: 5,
    questions:  20,
    hints: [
      "结果古神（固定）：克苏鲁（深渊沉睡者，梦与无意识的化身）、奈亚拉托普（混沌爬行者，智识与操控）、阿撒托斯（盲目痴愚之神，虚无本身）、莎布·尼古拉斯（千面圣母，生命原力）、犹格·索托斯（穿越时空的全知者）、哈斯塔（虚空之王，美学与疯狂）、大衮（海洋古神，沉默与深渊力量）",
      "维度：意识形态（秩序/混沌/虚无）、存在方式（沉眠/活跃/全在）、与人类关系（冷漠/操控/破坏/感知）、宇宙观、力量表达方式",
      "题目带哲学和宇宙恐惧氛围，具体情境在日常生活中：面对虚无时你怎么反应/对知识的代价如何看待/关于睡眠和梦境",
      "面向有亚文化兴趣的用户，语气可带荒诞感和知识密度",
      "禁止在题目中出现任何古神名称或克苏鲁神话术语",
    ],
  },
  {
    id:         "spiritual-homeland-match",
    title:      "哪里是你的精神故乡？",
    scoring:    "weighted-dimension",
    results:    8,
    dimensions: 4,
    questions:  18,
    hints: [
      "结果地方（固定）：京都（古雅与沉静）、大理（自由与隐居）、巴黎（美与思想的交叠）、纽约（速度与多元）、伊斯坦布尔（东西方游离）、布拉格（历史与荒诞感）、冰岛（极致空旷与崇高）、加德满都（混沌与灵性）",
      "维度：对时间与记忆的感受方式、审美偏好（繁复/简洁/古老/当代）、与城市的关系（融入/旁观）、精神补给来源（自然/文化/人群/孤独）",
      "题目通过内心感受和生活方式选择推导，不要直接问「你喜欢哪个城市」",
      "语气有诗意和流动感，像旅人在内心独白，不要旅游攻略语气",
    ],
  },
  {
    id:         "niche-sport-match",
    title:      "有哪些适合你的小众运动？",
    scoring:    "weighted-dimension",
    results:    8,
    dimensions: 4,
    questions:  18,
    hints: [
      "结果运动（固定）：攀岩（垂直挑战、专注当下）、冲浪（顺应自然、律动感知）、击剑（智慧与速度）、射箭（静心专注、内在控制）、桨板（平衡与静观）、马术（人与动物的默契）、武术（内外兼修、文化传承）、山地自行车（耐力与冒险）",
      "维度：风险承受（刺激/稳定）、运动模式（个人/对抗/协同）、身体感知主导（力量/平衡/速度/精准）、内在动力（征服/共处/沉浸/竞技）",
      "题目通过日常性格偏好和行为模式推导，不要直接问运动经历",
      "结果要说清为什么这项运动适合这种性格，让用户感到被看见",
      "语气充满对身体和运动的尊重，带让人想去试试的感召力",
    ],
  },
  {
    id:         "pet-personality-match",
    title:      "你适合养什么宠物？",
    scoring:    "weighted-dimension",
    results:    8,
    dimensions: 4,
    questions:  16,
    hints: [
      "结果宠物（固定）：猫（独立神秘）、狗（忠诚热情）、仓鼠（低维护高可爱密度）、兔子（安静敏感）、鱼（视觉疗愈、极度低互动）、乌龟（长情陪伴、不求回应）、鸟（聪明互动、需要关注）、爬行动物（超小众猎奇型陪伴）",
      "维度：日常节奏（忙碌/规律/随性）、情感需求（主动互动/被动陪伴）、生活空间、对被需要的感受",
      "题目取自真实养宠心理：能忍受宠物弄坏东西吗/期待它主动来找你吗/能坚持每天固定时间喂食吗",
      "禁止直接问「你喜欢什么动物」",
      "语气温暖有趣，带对小生命的热爱感",
    ],
  },
  {
    // ★ bipolar-dimension：3 轴 → 8 象限 = 8 位古代诗人
    id:         "ancient-poet-match",
    title:      "你和哪位古代诗人心有灵犀？",
    scoring:    "bipolar-dimension",
    results:    8,
    dimensions: 3,
    questions:  22,
    hints: [
      "结果诗人（固定）：李白（飘逸自由、洒脱不羁）、杜甫（忧世悲悯、沉郁顿挫）、苏轼（旷达通透、豪放中有柔情）、李清照（婉约细腻、词中见自我）、王维（禅意静美、山水即心境）、陶渊明（归隐自足、不为五斗米折腰）、辛弃疾（壮志未酬的豪放与哀愁）、白居易（平易近人、以诗写世情）",
      "第一条轴：入世/忧世（杜甫/辛弃疾/白居易极）↔ 出世/自足（陶渊明/王维极）",
      "第二条轴：奔放外显（李白/辛弃疾极）↔ 内敛细腻（李清照/王维极）",
      "第三条轴：理想主义/浪漫（李白/苏轼极）↔ 现实/世情（杜甫/白居易极）",
      "8个结果对应3轴8象限，每位诗人的象限坐标要在结果描述中明确",
      "题目必须重现真实诗句里的具体场景，把诗句所描绘的处境还原成第二人称叙述，例如：「床前的月光让你睁开了眼，四周寂静，你想到了很远的地方」、「东篱的菊花开了，南山就在那里，你手里还握着刚摘下来的花」、「船刚过了白帝城，两岸猿声不断，你感觉自己在飞」——不要直接引用诗句原文，而是把场景活化",
      "每道题先用一两句有质感的古典场景描写作情境铺垫，再问用户在这个处境里的感受或选择；场景要涵盖不同诗人的代表情境：饮酒/出征/归田/独居/流放/送别/登临",
      "禁止在题目中出现任何诗人名字或代表作品名，避免用户因知道答案而选择",
      "verse 必须是对应诗人的真实原诗句，选最能代表其人格气质的句子，标注诗名",
      "语气有古典气息但不艰深，像在茶馆里与知己闲谈",
    ],
  },
];

// ── CLI parsing ───────────────────────────────────────────────────────────────

const args     = process.argv.slice(2);
const hasFlag  = (f) => args.includes(f);
const getArg   = (prefix) => (args.find(a => a.startsWith(prefix)) || "").replace(prefix, "");

const showList   = hasFlag("--list");
const runAll     = hasFlag("--all");
const estimate   = hasFlag("--estimate");
const noDryRun   = hasFlag("--no-dry-run");
const dryRun     = !noDryRun;
const skipEval   = hasFlag("--skip-eval");
const sequential = hasFlag("--sequential");
const quizArg    = getArg("--quiz=");
const delayMs    = parseInt(getArg("--delay=") || "3000", 10);

// ── List mode ─────────────────────────────────────────────────────────────────

if (showList) {
  const SCORING_BADGE = { "bipolar-dimension": " ★", "level-band": " ▲", "weighted-dimension": "" };
  console.log("\n 序号  ID                                    标题");
  console.log(" ----  ------------------------------------  ----------------------------------------");
  QUIZZES.forEach((q, i) => {
    const idx  = String(i + 1).padStart(4);
    const id   = q.id.padEnd(36);
    const badge = SCORING_BADGE[q.scoring] || "";
    console.log(` ${idx}  ${id}  ${q.title}${badge}`);
  });
  console.log("\n ★ = bipolar-dimension   ▲ = level-band\n");
  process.exit(0);
}

// ── Select quizzes ────────────────────────────────────────────────────────────

let selected = [];

if (runAll) {
  selected = QUIZZES;
} else if (quizArg) {
  const tokens = quizArg.split(",").map(t => t.trim());
  for (const token of tokens) {
    const byIndex = parseInt(token, 10);
    if (!isNaN(byIndex)) {
      const q = QUIZZES[byIndex - 1];
      if (!q) { console.error(`❌  序号 ${byIndex} 不存在（范围 1–${QUIZZES.length}）`); process.exit(1); }
      selected.push(q);
    } else {
      const q = QUIZZES.find(x => x.id === token);
      if (!q) { console.error(`❌  找不到 id="${token}"`); process.exit(1); }
      selected.push(q);
    }
  }
} else {
  console.log("用法:");
  console.log("  node scripts/dispatch-quizzes.js --list");
  console.log("  node scripts/dispatch-quizzes.js --quiz=1,3,12");
  console.log("  node scripts/dispatch-quizzes.js --quiz=hogwarts-house-sorting");
  console.log("  node scripts/dispatch-quizzes.js --all");
  console.log("  node scripts/dispatch-quizzes.js --all --sequential   # 一个跑完再触发下一个");
  console.log("  node scripts/dispatch-quizzes.js --all --estimate");
  console.log("  node scripts/dispatch-quizzes.js --all --no-dry-run");
  process.exit(0);
}

// ── Confirm before bulk run ───────────────────────────────────────────────────

if (selected.length > 3 && !estimate) {
  const mode = dryRun ? "dry-run（本地生成，不上传）" : "⚠️  真实生成并上传 CloudBase";
  const seqNote = sequential
    ? "  顺序模式：一个跑完再触发下一个"
    : `  ⚠️  并发模式：全部同时触发，Actions 并行运行（API 费用会叠加）\n  建议改用 --sequential 逐个运行`;
  console.log(`\n即将触发 ${selected.length} 个 GitHub Actions workflow：`);
  selected.forEach((q, i) => console.log(`  ${i + 1}. ${q.title}`));
  console.log(`\n模式：${mode}`);
  console.log(seqNote);

  const readline = require("readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question("确认继续？(y/N) ", (ans) => {
    rl.close();
    if (ans.trim().toLowerCase() !== "y") { console.log("已取消。"); process.exit(0); }
    dispatch(selected);
  });
} else {
  dispatch(selected);
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

async function dispatch(quizzes) {
  const ghCheck = spawnSync("gh", ["--version"], { encoding: "utf8" });
  if (ghCheck.error) {
    console.error("❌  找不到 gh CLI。请先安装：https://cli.github.com");
    process.exit(1);
  }

  let branch = "main";
  try { branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim(); } catch (_) {}

  const workflowFile = "generate-quiz-manual.yml";

  for (let i = 0; i < quizzes.length; i++) {
    const q = quizzes[i];
    const hintsJoined = (q.hints || []).join(" || ");

    const fields = [
      `--field=topic=${q.title}`,
      `--field=title=${q.title}`,
      `--field=quiz_id=${q.id}`,
      `--field=scoring=${q.scoring}`,
      `--field=results=${q.results}`,
      `--field=dimensions=${q.dimensions}`,
      `--field=questions=${q.questions}`,
      `--field=provider=zhipu`,
      `--field=dry_run=${dryRun}`,
      `--field=estimate=${estimate}`,
      `--field=skip_eval=${skipEval}`,
    ];
    if (hintsJoined) fields.push(`--field=hints=${hintsJoined}`);

    const cmd = ["gh", "workflow", "run", workflowFile, "--ref", branch, ...fields];

    const scoringBadge = q.scoring === "bipolar-dimension" ? " ★" : q.scoring === "level-band" ? " ▲" : "";
    console.log(`\n[${i + 1}/${quizzes.length}] ${q.title}${scoringBadge}`);
    console.log(`        id=${q.id}  r=${q.results}  d=${q.dimensions}  q=${q.questions}`);

    const result = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8", stdio: "inherit" });

    if (result.status !== 0) {
      console.error(`❌  dispatch 失败（exit ${result.status}）`);
      if (sequential && i < quizzes.length - 1) {
        console.log("  顺序模式：跳过等待，继续下一个...");
      }
    } else {
      console.log(`✅  已触发`);
      if (sequential && i < quizzes.length - 1) {
        await waitForRun(workflowFile, branch);
      }
    }

    if (!sequential && i < quizzes.length - 1) await sleep(delayMs);
  }

  console.log(`\n全部 dispatch 完成。在 GitHub Actions 页面查看进度：`);
  try {
    const remote = execSync("gh repo view --json url -q .url", { encoding: "utf8" }).trim();
    console.log(`${remote}/actions/workflows/${workflowFile}`);
  } catch (_) {
    console.log("（请手动访问 GitHub Actions 页面）");
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Sequential: wait for the latest run to finish ────────────────────────────

async function waitForRun(workflowFile, branch) {
  // Wait a few seconds for GitHub to register the new run
  console.log("  ⏳  等待 Actions run 注册...");
  await sleep(6000);

  // Find the run ID of the most recently triggered run
  let runId = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    const listResult = spawnSync("gh", [
      "run", "list",
      "--workflow", workflowFile,
      "--branch", branch,
      "--limit", "1",
      "--json", "databaseId,status,createdAt",
    ], { encoding: "utf8" });

    if (listResult.status === 0) {
      const runs = JSON.parse(listResult.stdout || "[]");
      if (runs.length > 0 && (runs[0].status === "queued" || runs[0].status === "in_progress" || runs[0].status === "waiting")) {
        runId = runs[0].databaseId;
        break;
      }
    }
    await sleep(3000);
  }

  if (!runId) {
    console.log("  ⚠️  无法找到正在运行的 run，继续触发下一个...");
    return;
  }

  console.log(`  ⏳  等待 run #${runId} 完成（这可能需要 5-15 分钟）...`);

  // Poll until the run completes
  while (true) {
    await sleep(15000);
    const viewResult = spawnSync("gh", [
      "run", "view", String(runId), "--json", "status,conclusion",
    ], { encoding: "utf8" });

    if (viewResult.status !== 0) {
      console.log("  ⚠️  无法查询 run 状态，继续等待...");
      continue;
    }

    const info = JSON.parse(viewResult.stdout || "{}");
    const { status, conclusion } = info;

    if (status === "completed") {
      const icon = conclusion === "success" ? "✅" : "⚠️ ";
      console.log(`  ${icon}  run #${runId} 已完成（${conclusion}），触发下一个`);
      return;
    }

    process.stdout.write(`  ⏳  ${status}...  `);
  }
}
