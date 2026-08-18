function cleanText(value, max = 2000) {
    return String(value ?? '').trim().slice(0, max);
}

export function eligiblePublicOpinionSources(state) {
    const facts = Array.isArray(state?.world?.facts) ? state.world.facts : [];
    return [...facts]
        .filter(item => item && item.id && (item.publicity === 'public' || item.publicity === 'trace'))
        .sort((a, b) => (b?.sourceMessageId ?? -1) - (a?.sourceMessageId ?? -1))
        .slice(0, 28)
        .map(item => ({
            id: cleanText(item.id, 120),
            key: item.publicity === 'public' ? cleanText(item.key, 180) : '',
            value: item.publicity === 'public' ? cleanText(item.value, 900) : '',
            validity: cleanText(item.validity, 40) || 'current',
            publicity: item.publicity,
            publicHint: cleanText(item.publicHint, 500),
            sourceMessageId: Number.isInteger(item.sourceMessageId) ? item.sourceMessageId : null,
        }));
}

function fnv(value) {
    const text = String(value ?? '');
    let state = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
        state ^= text.charCodeAt(i);
        state = Math.imul(state, 16777619);
    }
    return (state >>> 0).toString(36);
}

export function publicOpinionSourceFingerprint(state) {
    return fnv(JSON.stringify({
        time: state?.world?.time ?? null,
        location: state?.world?.location ?? '',
        sources: eligiblePublicOpinionSources(state),
    }));
}

export function buildCanonicalPublicOpinionMessages(state, { worldReferenceText = '' } = {}) {
    const sources = eligiblePublicOpinionSources(state);
    const system = `你是 SceneWorld（世界动态）的公共舆情整理器。你只负责把“社会已经能够接触到的信息”整理成新闻与公共讨论，不创造新的世界事实，也不续写剧情。

最高规则：
1. 新闻只允许使用 publicity=public 的来源。publicity=trace 的隐藏真相绝对不能写成新闻。
2. 论坛可以讨论 public，也可以围绕 trace 的“公开迹象”猜测；但对 trace 只能看到 publicHint，不得泄露真实 value，不得猜中后台真相后把猜测写成事实。
3. 没有值得形成新闻/讨论的内容时，news/forum 可以完全为空。不要为了填满数量硬编。
4. 输出形式要适配当前世界本身：现代可以是媒体/网络论坛，古风可以是邸报、告示、茶馆议论，中世纪可以是城门公告、教堂消息、酒馆闲谈。不要先分类题材，只使用与现有世界语境相符的表达。
5. 新闻和论坛都只能描述“当前公开面”，不能修改 SceneWorld 状态、人物认知、世界线记忆。
6. 论坛允许误解、传闻、立场冲突和普通人的猜测；必须用 claimStatus=fact|mixed|rumor 标识。
7. 只输出严格 JSON，不要 Markdown 或解释。`;

    const prompt = `世界观参考（只用于时代、地点、组织和表达形式，不是新闻事实来源）：\n${worldReferenceText || '（未提供）'}\n\n当前世界时间：${cleanText(state?.world?.time, 120) || '未明确'}
当前地点/范围：${cleanText(state?.world?.location, 240) || '未明确'}

可用于舆情的公开来源：
${JSON.stringify(sources, null, 2)}

请返回：
{
  "news": [
    {
      "category": "与世界语境相符的类别",
      "headline": "标题",
      "summary": "只基于 public 来源的公开内容",
      "source": "与世界语境相符的信息来源",
      "sourceType": "official|unofficial",
      "scope": "传播范围/地区，可空",
      "confidence": "high|medium",
      "relatedFactIds": ["必须引用 publicity=public 的 fact id"]
    }
  ],
  "forum": [
    {
      "board": "与世界语境相符的讨论场所/板块",
      "title": "讨论标题",
      "summary": "社会讨论的概括",
      "claimStatus": "fact|mixed|rumor",
      "relatedFactIds": ["可以引用 public 或 trace 的 fact id"],
      "replies": [{"author":"称呼/匿名身份","text":"代表性回复"}]
    }
  ]
}

数量不是目标：新闻 0～5 条，论坛 0～5 条，每个论坛 0～5 条回复。没有合适内容就返回空数组。`;
    return [{ role: 'system', content: system }, { role: 'user', content: prompt }];
}

export function buildStreetPublicOpinionMessages(state, { worldReferenceText = '' } = {}) {
    const context = {
        time: cleanText(state?.world?.time, 120),
        location: cleanText(state?.world?.location, 240),
        worldToneHint: cleanText(state?.world?.summary, 700),
    };
    const system = `你是 SceneWorld（世界动态）的“街巷漫游”生成器。一次调用同时生成两类内容：A. NON-CANON 市井闲闻；B. 去哪逛逛地点建议。它们用于帮助用户观察和探索世界，不是论坛，也不修改世界事实。

规则：
1. 只生成“街上、邻里、商铺、茶馆、酒馆、市集、社区、路边”等生活空间里可能碰到的小消息。
2. 内容类型应混合：路人耳语、小道消息、市井闲谈、生活琐事、本地趣闻、偶发小事件、告示/招贴、无伤大雅的怪事。
3. 重点写成“一个人当面说的一句话 / 路过听见的一句抱怨 / 一个简短现场见闻”，不要写成帖子 + 多层评论，不要模拟论坛楼层。
4. 例如：隔壁王大爷抱怨楼上太吵；路边小贩讲东街某户最近动静很大；有人路过被偷了钱包；某家铺子突然改了营业时间。
5. 所有内容都是 NON-CANON 灵感，不写入世界事实、人物认知、世界线记忆，也不能当成已经发生的主线。
6. 只能借 context 判断时代感、语言气质和生活环境；不得泄露角色私事、隐藏秘密、private/trace 真相，也不得把当前主线换皮重写。
7. 现代、古风、中世纪、科幻等自然适配语境，不要硬套现代互联网词汇。
8. 内容以小事、琐事和生活质感为主，允许偶尔出现治安、物价、天气等地方性消息，但不要每条都升级成大事件。
9. text 字段不要自行包裹任何外层引号、书名号或方括号；程序会统一渲染：有 speaker 的说话内容使用一对中文双引号“”；没有 speaker 的公告/描述/现场见闻使用一对【】。
10. 去哪逛逛必须给 3～5 个地点建议；优先已有或自然可达地点，也可给符合世界语境的普通场所灵感，但灵感地点必须 established=false。
11. 地点 prompt 要写成可直接填入 SillyTavern 输入框的简短剧情引子，不得宣称结果已经发生。
12. 只输出严格 JSON。`;
    const prompt = `世界观参考（只用于时代、地理、生活方式与已有场所约束；不能把其中的背景内容宣称为本轮已发生事件）：\n${worldReferenceText || '（未提供）'}\n\n环境提示：\n${JSON.stringify(context, null, 2)}

请返回：
{
  "street": [
    {
      "kind": "overheard|gossip|curiosity|local_incident|notice|slice",
      "category": "市井闲谈/小道消息/本地趣闻/生活琐事/偶发事件/告示",
      "speaker": "可为空，例如隔壁王大爷/路边小贩/巡夜人/酒馆老板",
      "place": "可为空，例如楼下/东街/市集/酒馆",
      "title": "一句短标题",
      "text": "核心内容；有说话人时优先写成一句自然口语，没有说话人时写成简短现场见闻",
      "note": "可选，最多一两句背景补充；不要写评论串"
    }
  ],
  "places": [
    {
      "name": "地点名或地点类型",
      "type": "与当前世界语境相符的地点类型",
      "why": "为什么值得去",
      "established": true,
      "prompt": "可直接填入 SillyTavern 输入框的探索引子"
    }
  ]
}

市井闲闻生成 3～7 条；places 必须生成 3～5 条。类型尽量有差异。不要返回 replies/forums/news。`;
    return [{ role: 'system', content: system }, { role: 'user', content: prompt }];
}
