// 体验目录：首页发现流的内容基础。
// 每条是一个可一键进入的探索种子——标题、摘要、进入时的输入、
// 分类、标签、封面色相与热度。目录是静态内容资产，
// 呈现层负责让它"活"（轮换、搜索、热度排序）。

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
  },
];
