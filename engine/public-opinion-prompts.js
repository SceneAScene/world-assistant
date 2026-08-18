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
            key: cleanText(item.key, 180),
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

export function buildCanonicalPublicOpinionMessages(state) {
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

    const prompt = `当前世界时间：${cleanText(state?.world?.time, 120) || '未明确'}
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

export function buildCasualPublicOpinionMessages(state) {
    const context = {
        time: cleanText(state?.world?.time, 120),
        location: cleanText(state?.world?.location, 240),
        worldToneHint: cleanText(state?.world?.summary, 700),
    };
    const system = `你是 SceneWorld（世界动态）的“随便逛逛”生成器。这是纯娱乐、NON-CANON 沙盒，用来制造这个世界里普通人生活的质感。

规则：
- 生成日常轻新闻、闲聊、水帖、小广告、生活八卦、奇怪热帖、无关主线的小消息。
- 所有内容都不是世界事实，不写入人物认知、世界线记忆或正文因果。
- 只能借 context 判断语言气质、时代感和生活环境；不得续写主线，不得使用角色私事、隐藏秘密或把当前剧情事件换皮重写。
- 现代/古风/中世纪/科幻等都自然适配世界语境，不要硬套现代互联网词汇。
- 内容应以小事、琐事、普通生活为主，不要每条都制造灾难、阴谋或大事件。
- 只输出严格 JSON。`;
    const prompt = `环境提示：
${JSON.stringify(context, null, 2)}

请返回：
{
  "news": [{"category":"生活/本地/趣闻/商业/其他","headline":"","summary":"","source":""}],
  "forums": [{"board":"","title":"","summary":"","replies":[{"author":"","text":""}]}]
}

请生成 1～2 条轻新闻和 2～4 个闲聊主题，每个主题最多 4 条代表回复。`;
    return [{ role: 'system', content: system }, { role: 'user', content: prompt }];
}
