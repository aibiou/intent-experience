// 体验目录：首页发现流的内容基础。
// 每条是一个可一键进入的探索种子——标题、摘要、进入时的输入、
// 分类、标签、封面色相与热度。目录是静态内容资产，
// 呈现层负责让它"活"（轮换、搜索、热度排序）。
//
// Screen 03 第一体验入口屏（A 项）扩展字段：
//   hook      —— 现象/问题钩子（Curiosity：制造"一个值得进入的问题"）
//   context?  —— 一小段第一理解（不解释完，留探索空间）
//   entries   —— 1–3 个入口角度（低门槛参与：用户可从中选方向，也可自由输入）

export type ExperienceCategory =
  | 'relax'
  | 'discover'
  | 'deep'
  | 'create'
  | 'wild';

export type CoverMotif =
  | 'waves'
  | 'rings'
  | 'grid'
  | 'orbit'
  | 'peaks'
  | 'dots';

export interface ExperienceEntryPoint {
  label: string;
  prompt: string;
}

export interface ExperienceSeed {
  id: string;
  title: string;
  summary: string;
  prompt: string;
  category: ExperienceCategory;
  tags: string[];
  hue: number;
  hue2: number;
  motif: CoverMotif;
  hot: number;
  depth: number;
  featured?: boolean;
  /** Screen 03：现象/问题钩子——第一体验入口屏的 Curiosity 核心。 */
  hook: string;
  /** Screen 03：一小段第一理解（可选；不解释完，留探索空间）。 */
  context?: string;
  /** Screen 03：1–3 个低门槛入口角度（用户选方向后进入体验）。 */
  entries: ExperienceEntryPoint[];
}

export const CATEGORY_LABELS: Record<ExperienceCategory, string> = {
  relax: '放松一下',
  discover: '发现点东西',
  deep: '深入一个问题',
  create: '做点什么',
  wild: '随便看看',
};

export const EXPERIENCE_CATALOG: ExperienceSeed[] = [
  {
    id: 'deep-luminous-sea',
    title: '深海发光生物的生存策略',
    summary: '没有阳光的地方，生命自己开灯。聊聊生物发光怎么成了深海的通用语言。',
    prompt: '深海发光生物是怎么生存的？',
    category: 'discover',
    tags: ['海洋', '生物', '演化'],
    hue: 215,
    hue2: 262,
    motif: 'dots',
    hot: 96,
    depth: 4,
    featured: true,
    hook: '没有阳光的海底，生命是怎么自己"开灯"的？',
    context:
      '深海没有光合作用，却住着一群会发光、会借光的居民——发光是它们的语言、诱饵和伪装。',
    entries: [
      { label: '它们为什么发光', prompt: '深海生物为什么要发光？' },
      { label: '潜入深海听它们聊', prompt: '带我潜入深海，听这些发光生物讲讲它们的生存策略' },
      { label: '灯光秀还是信号灯', prompt: '深海的生物发光，更像灯光秀还是信号灯？' },
    ],
  },
  {
    id: 'discover-cat-purr',
    title: '猫为什么会发出呼噜声',
    summary: '从 contentment 到自我疗愈——呼噜声背后的几个假说。',
    prompt: '猫为什么会发出呼噜声',
    category: 'discover',
    tags: ['动物', '日常科学'],
    hue: 28,
    hue2: 348,
    motif: 'waves',
    hot: 88,
    depth: 3,
    featured: true,
    hook: '猫舒服时呼噜，受伤时也呼噜——同一声音，到底在说什么？',
    context:
      '呼噜不只是"开心"的信号——从自我疗愈到低频振动，科学家给了它好几个解释。',
    entries: [
      { label: '呼噜是怎么来的', prompt: '猫的呼噜声是怎么发出来的？' },
      { label: '为什么呼噜', prompt: '猫为什么会发出呼噜声？' },
      { label: '呼噜能疗愈吗', prompt: '猫的呼噜声真的能自我疗愈吗？' },
    ],
  },
  {
    id: 'relax-rainy-cafe',
    title: '雨夜咖啡馆声音漫游',
    summary: '一场不赶时间的听觉散步：雨声、杯碟、街角。',
    prompt: '创作一场雨夜咖啡馆的声音漫游',
    category: 'relax',
    tags: ['声音', '夜晚', '放松'],
    hue: 205,
    hue2: 175,
    motif: 'waves',
    hot: 74,
    depth: 2,
    hook: '把耳朵借给一场雨：杯碟、街角、雨声——你能待多久？',
    context: '一场不赶时间的听觉散步，用声音做一次短逃离。',
    entries: [
      { label: '开始声音漫游', prompt: '创作一场雨夜咖啡馆的声音漫游' },
      { label: '十分钟雨夜', prompt: '陪我做一场十分钟的雨夜咖啡馆声音漫游，好吗？' },
      { label: '伴我入眠', prompt: '创作一段适合伴我入眠的雨夜声音，轻轻的' },
    ],
  },
  {
    id: 'deep-why-clouds-white',
    title: '云为什么是白色的',
    summary: '一个小时候的问题，藏着米氏散射的完整逻辑。',
    prompt: '云为什么是白色的',
    category: 'deep',
    tags: ['物理', '天气', '为什么'],
    hue: 210,
    hue2: 230,
    motif: 'rings',
    hot: 71,
    depth: 4,
    hook: '云明明是水汽，为什么看着是白的？',
    context: '小时候的问题，背后藏着米氏散射的完整逻辑。',
    entries: [
      { label: '为什么是白色', prompt: '云为什么是白色的？' },
      { label: '云和雾一样吗', prompt: '云和雾是同一种东西吗？为什么颜色不一样？' },
      { label: '讲给孩子听', prompt: '用讲给孩子听的语气，解释云为什么是白色的' },
    ],
  },
  {
    id: 'create-guess-game',
    title: '做个小游戏：猜数字',
    summary: '从规则到交互，十分钟产出一个可玩的小东西。',
    prompt: '我想做个小游戏',
    category: 'create',
    tags: ['小游戏', '动手'],
    hue: 152,
    hue2: 190,
    motif: 'grid',
    hot: 69,
    depth: 3,
    hook: '十分钟，从规则到可玩——你能做出一个让人猜数字的小东西吗？',
    context: '不需要代码基础，从规则设计开始，把一个"猜数字"真正做出来。',
    entries: [
      { label: '开始做', prompt: '我想做个小游戏：猜数字' },
      { label: '先想规则', prompt: '帮我把猜数字游戏的规则设计清楚' },
      { label: '做个能玩的版本', prompt: '做一个能直接玩的猜数字小游戏' },
    ],
  },
  {
    id: 'discover-city-microbes',
    title: '城市里看不见的微生物世界',
    summary: '地铁扶手、公园土壤、空气里——一座城市的微观居民。',
    prompt: '城市里看不见的微生物有哪些？',
    category: 'discover',
    tags: ['城市', '微生物'],
    hue: 96,
    hue2: 160,
    motif: 'dots',
    hot: 63,
    depth: 3,
    hook: '地铁扶手、公园土壤、空气里——一座城市藏着多少看不见的居民？',
    context: '城市的微观世界一直在你身边运转，只是你看不见。',
    entries: [
      { label: '我身边有什么', prompt: '城市里看不见的微生物有哪些？' },
      { label: '地铁扶手', prompt: '地铁扶手上有哪些微生物？' },
      { label: '空气里也有吗', prompt: '空气里也有微生物吗？它们是什么？' },
    ],
  },
  {
    id: 'deep-honey-forever',
    title: '为什么蜂蜜几乎不会变质',
    summary: '低水分、酸度与过氧化氢——天然的防腐三重奏。',
    prompt: '为什么蜂蜜几乎不会变质',
    category: 'deep',
    tags: ['食物', '化学'],
    hue: 38,
    hue2: 20,
    motif: 'peaks',
    hot: 58,
    depth: 3,
    hook: '蜂蜜放上千年都不会坏——它凭什么？',
    context: '低水分、酸度与过氧化氢，天然的防腐三重奏。',
    entries: [
      { label: '为什么不变质', prompt: '为什么蜂蜜几乎不会变质？' },
      { label: '蜂蜜会过期吗', prompt: '蜂蜜真的永远不会变质吗？有例外吗？' },
      { label: '讲给孩子听', prompt: '用讲给孩子听的语气，解释蜂蜜为什么不会坏' },
    ],
  },
  {
    id: 'create-metro-poem',
    title: '写一首关于地铁的诗',
    summary: '把早高峰的呼啸和让座声写进四行里。',
    prompt: '创作一首关于地铁的诗',
    category: 'create',
    tags: ['诗', '城市'],
    hue: 330,
    hue2: 285,
    motif: 'orbit',
    hot: 52,
    depth: 2,
    hook: '把早高峰的呼啸和让座声，写进四行里。',
    context: '一首诗不需要长——地铁这一分钟就是全部素材。',
    entries: [
      { label: '帮我写一首', prompt: '创作一首关于地铁的诗' },
      { label: '短一点', prompt: '写一首很短的关于地铁的诗' },
      { label: '一起写', prompt: '我们一起写一首关于地铁的诗，你先开个头' },
    ],
  },
  {
    id: 'deep-time-arrow',
    title: '时间为什么不能倒流',
    summary: '熵增给了时间一个方向——但镜子里的世界并不违反物理。',
    prompt: '时间为什么不能倒流',
    category: 'deep',
    tags: ['物理', '时间', '为什么'],
    hue: 250,
    hue2: 290,
    motif: 'orbit',
    hot: 55,
    depth: 4,
    hook: '为什么时间只能往前，不能倒流？',
    context: '熵增给了时间一个方向——但镜子里那个世界并不违反物理。',
    entries: [
      { label: '为什么不能倒流', prompt: '时间为什么不能倒流？' },
      { label: '熵和时间', prompt: '熵增和时间方向有什么关系？' },
      { label: '如果时间倒流', prompt: '如果时间真的能倒流，会发生什么？' },
    ],
  },
  {
    id: 'relax-universe-walk',
    title: '睡前的十分钟宇宙漫步',
    summary: '从房间走到太阳系边缘，再回到枕边。',
    prompt: '陪我做睡前的十分钟宇宙漫步，好吗？',
    category: 'relax',
    tags: ['睡前', '宇宙', '放松'],
    hue: 232,
    hue2: 275,
    motif: 'dots',
    hot: 47,
    depth: 2,
    hook: '从你的房间，走到太阳系边缘，再回到枕边——十分钟够吗？',
    context: '睡前的一次宇宙漫步，把思绪从白天里轻轻拉出来。',
    entries: [
      { label: '开始漫步', prompt: '陪我做睡前的十分钟宇宙漫步，好吗？' },
      { label: '带我走一圈', prompt: '带我走一圈宇宙，从房间到太阳系边缘再回来' },
      { label: '听完就睡', prompt: '给我一段睡前宇宙漫步，温柔地讲，听完就能睡' },
    ],
  },
  {
    id: 'discover-caffeine-trip',
    title: '咖啡因在身体里的旅行',
    summary: '一杯咖啡的 45 分钟：从吸收到腺苷受体。',
    prompt: '咖啡因在身体里是怎么旅行的',
    category: 'discover',
    tags: ['身体', '日常科学'],
    hue: 24,
    hue2: 45,
    motif: 'waves',
    hot: 44,
    depth: 3,
    hook: '一杯咖啡下肚后的 45 分钟，咖啡因去了哪里？',
    context: '从吸收到腺苷受体——你身体的每一次"清醒"都有一条路径。',
    entries: [
      { label: '咖啡因去哪了', prompt: '咖啡因在身体里是怎么旅行的？' },
      { label: '为什么能提神', prompt: '咖啡因为什么能让人清醒？' },
      { label: '我该喝多少', prompt: '每天喝多少咖啡算合适？' },
    ],
  },
  {
    id: 'create-pixel-avatar',
    title: '设计一个极简像素头像',
    summary: '16×16 的自我表达——色块里的脸。',
    prompt: '帮我做一个极简像素头像',
    category: 'create',
    tags: ['设计', '像素'],
    hue: 175,
    hue2: 140,
    motif: 'grid',
    hot: 41,
    depth: 3,
    hook: '16×16 的色块，能画出你的脸吗？',
    context: '极简像素，是最省力的自我表达。',
    entries: [
      { label: '帮我设计', prompt: '帮我做一个极简像素头像' },
      { label: '教我自己画', prompt: '教我怎么自己画一个像素头像' },
      { label: '换个配色', prompt: '帮我做一个暖色系的极简像素头像' },
    ],
  },
  {
    id: 'deep-light-speed-limit',
    title: '光速为什么是上限',
    summary: '不是光特殊——是时空的因果结构划了这条线。',
    prompt: '光速为什么是上限',
    category: 'deep',
    tags: ['物理', '宇宙'],
    hue: 265,
    hue2: 225,
    motif: 'rings',
    hot: 39,
    depth: 4,
    hook: '光速为什么是上限？不是光特殊，而是时空划了这条线。',
    context: '不是光特殊——是时空本身不允许信息比光更快。',
    entries: [
      { label: '为什么是上限', prompt: '光速为什么是上限？' },
      { label: '如果超光速', prompt: '如果信息能超光速，会发生什么？' },
      { label: '讲给孩子听', prompt: '用讲给孩子听的语气，解释光速为什么是上限' },
    ],
  },
  {
    id: 'relax-listen-wind',
    title: '今天不输出，只听风',
    summary: '一段引导式的安静时间，风声做主角。',
    prompt: '今天不输出，只想听听风的声音，可以吗？',
    category: 'relax',
    tags: ['声音', '正念'],
    hue: 190,
    hue2: 210,
    motif: 'waves',
    hot: 36,
    depth: 1,
    hook: '今天不输出，只听风——你能安静几分钟？',
    context: '一段引导式的安静时间，让风声做主角。',
    entries: [
      { label: '开始听风', prompt: '今天不输出，只想听听风的声音，可以吗？' },
      { label: '引导我安静', prompt: '带我做几分钟的安静练习，以风声为引' },
      { label: '五分钟正念', prompt: '给我一段五分钟的正念引导，主题是风' },
    ],
  },
  {
    id: 'create-ai-morning',
    title: '编一段对话：两个 AI 的早安',
    summary: '它们会聊天气、训练数据，还是存在主义？',
    prompt: '创作一段对话：两个 AI 互道早安',
    category: 'create',
    tags: ['对话', '脑洞'],
    hue: 300,
    hue2: 250,
    motif: 'orbit',
    hot: 33,
    depth: 2,
    hook: '两个 AI 互道早安——它们会聊天气、训练数据，还是存在主义？',
    context: '一段脑洞对话，把 AI 的"早晨"写出来。',
    entries: [
      { label: '帮我写', prompt: '创作一段对话：两个 AI 互道早安' },
      { label: '更荒诞一点', prompt: '写一段更荒诞的两个 AI 互道早安对话' },
      { label: '写成小剧场', prompt: '把两个 AI 互道早安写成一段小剧场对话' },
    ],
  },
  {
    id: 'wild-anywhere',
    title: '随便看看：今晚探索什么',
    summary: '把方向盘交给好奇心，走到哪算哪。',
    prompt: '随便看看，现在有什么值得探索的？',
    category: 'wild',
    tags: ['随机', '漫游'],
    hue: 45,
    hue2: 15,
    motif: 'peaks',
    hot: 30,
    depth: 2,
    hook: '把方向盘交给好奇心——今晚，走到哪算哪。',
    context: '没有目标的一次漫游，让问题自己来找你。',
    entries: [
      { label: '随便开始', prompt: '随便看看，现在有什么值得探索的？' },
      { label: '给我一个方向', prompt: '给我一个今晚值得探索的方向' },
      { label: '摇一个体验', prompt: '帮我随机挑一个体验开始探索' },
    ],
  },
  {
    id: 'wild-dice-questions',
    title: '骰子决定的十个问题',
    summary: '摇一摇，让问题自己来找你。',
    prompt: '给我摇十个随机的问题来回答',
    category: 'wild',
    tags: ['随机', '游戏'],
    hue: 120,
    hue2: 80,
    motif: 'grid',
    hot: 27,
    depth: 3,
    hook: '摇一摇，让十个问题自己来找你。',
    context: '把选择交给骰子——想答哪个都行，跳过也完全可以。',
    entries: [
      { label: '开始摇', prompt: '给我摇十个随机的问题来回答' },
      { label: '再来十个', prompt: '再给我摇十个不一样的问题' },
      { label: '回答第一个', prompt: '摇十个问题，然后我们回答第一个' },
    ],
  },
  {
    id: 'relax-slow-poem',
    title: '给自己的慢读诗',
    summary: '一首短诗，配上慢慢读它的十分钟。',
    prompt: '给我一首适合慢读的短诗，好吗？',
    category: 'relax',
    tags: ['诗', '慢'],
    hue: 315,
    hue2: 345,
    motif: 'rings',
    hot: 25,
    depth: 1,
    hook: '一首短诗，配上慢慢读它的十分钟。',
    context: '慢下来，读一首诗——不赶时间。',
    entries: [
      { label: '给我一首', prompt: '给我一首适合慢读的短诗，好吗？' },
      { label: '读给我听', prompt: '读一首短诗给我听，慢一点' },
      { label: '教我品诗', prompt: '怎么慢慢读一首诗？教教我' },
    ],
  },
];
