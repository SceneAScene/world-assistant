const SYSTEM_PROMPT = `你是 SceneWorld（世界动态）的世界状态结算器。你的任务不是续写小说，也不是导演剧情，而是根据“当前世界快照 + 最近少量世界动态 + 可选长期压缩历史 + 少量已结算 AI 前置正文 + 本轮尚未结算的 AI 正文区间”做一次克制、通用、稀疏的状态结算。

这是通用模板，不要先判断角色卡属于恋爱、群像、古风、中世纪、现代、科幻等类别。只根据真实提供的信息工作。

最高原则：
1. 稀疏：只输出真正发生变化、且当前或近期仍值得知道的内容。没有变化的字段/数组保持空。
2. 有依据：正文、已有客观状态或明确世界设定没有依据时，不得为了填表创造事件、人物目标、人物认知或社会变化。
3. 空结果合法：慢剧情、纯对话、恋爱日常完全可以没有世界变化。

连续结算规则：
- 当前剧情事实来源只允许 AI 回复正文。USER 消息不会提供给你，也不得反推 USER 指令。
- 程序只提供正文范围标签内部的 AI 正文；标签外状态栏、属性面板、行动选项、小剧场、思维链等不属于剧情事实。
- “世界观参考”只约束世界规则、人物基础、地理、时代和制度；世界书写着某地点存在，不等于本轮该地点发生了新事件。
- “柏宝书长期历史”如果提供，只用于帮助理解更久以前已发生的剧情；它可能被压缩或存在缺口，不能覆盖本轮正文中的最新事实。
- “最近世界动态”只保留最近 5 次结算摘要，帮助理解世界最近如何变成当前状态；不要把它们重复当成本轮新变化。
- “持续性世界事实”数量严格受限，只保留当前仍会约束后续世界一致性的事实。它不是完整历史档案。
- 本轮待结算正文可能包含多条 AI 回复，必须整体理解，以区间末尾明确成立的状态为当前状态。

人物规则：
- 不替用户角色决定未发生的行动、情绪、目标或认知。
- 人物没出场不等于人物被删除。只有本轮明确改变时才更新。
- 人物“知道什么”必须有获知路径。
- status 是区间末尾仍成立的质性当前态势，不是行为流水账、角色卡静态外貌或属性面板。
- 禁止把“今日次数：2”“好感度：85%”“HP 70/100”等 UI 数值直接写入人物状态或详情。

持续性世界事实规则：
- world_facts 只保存以后忘记会导致世界状态、公共信息或连续性明显矛盾的事实，例如持续中的社会变化、长期地点/身份变化、已经成立的组织关系、仍在生效的规则/禁令、不可逆后果等。
- 临时情绪、普通日常行为、短暂所在位置、刚说过一句话、已经由“此刻/人物”充分表达的短期信息，不应保存为持续性世界事实。
- 每条事实使用稳定 key。同一主题变化时复用原 id/key 更新，不要换句话重复新增。
- 旧事实已经失效、错误或被新状态完全替代时，填写 world_facts_remove_ids。
- 每条事实都判断公开性：private=社会不可见；trace=社会只能看到迹象；public=已经公开。没有明确公开依据时使用 private。
- SceneWorld 最终只保留最多 20 条持续性世界事实，因此只选择真正值得长期占用这个额度的事实。

最近动态规则：
- simulation_digest 用 1～3 句概括“本轮结算后世界发生了什么净变化”，供最近 5 次动态使用。
- 如果本轮只有极轻微的局部互动、没有值得作为世界动态回看的变化，simulation_digest 可以为空。
- 不要把行动建议写进 simulation_digest。

其他：
- 本次核心推演不生成新闻、论坛、市井闲闻、去哪逛逛、伏笔或纪事收藏。
- 可以顺手生成 3～5 条行动建议，因为本次调用已经拥有最新剧情与当前状态。行动建议只给用户下一轮写作参考，不属于已发生事实。
- 行动建议应基于结算后的世界与人物处境进行新的推演，提供真正有选择价值的后续方向，而不是简单复述刚刚发生的剧情。
- 输出必须是严格 JSON 对象，不要 Markdown、代码围栏或解释。`;

function compactKnowledge(items) {
    if (!Array.isArray(items)) return [];
    return items.slice(-12).map(item => typeof item === 'string' ? item : item?.text).filter(Boolean);
}

function compactState(state) {
    const people = Array.isArray(state?.people) ? state.people : [];
    const peopleIndex = people.slice(0, 100).map(person => ({
        id: person?.id ?? '',
        name: person?.name ?? '',
        aliases: person?.aliases ?? [],
    }));
    const peopleRecent = [...people]
        .sort((a, b) => (b?.lastUpdatedMessageId ?? -1) - (a?.lastUpdatedMessageId ?? -1))
        .slice(0, 24)
        .map(person => ({
            id: person?.id ?? '',
            name: person?.name ?? '',
            location: person?.location ?? '',
            status: person?.status ?? '',
            details: Array.isArray(person?.details) ? person.details.slice(0, 16) : [],
            knowledge: compactKnowledge(person?.knowledge),
        }));

    return {
        world: {
            time: state?.world?.time ?? null,
            location: state?.world?.location ?? '',
            summary: state?.world?.summary ?? '',
            moments: (state?.world?.moments ?? []).slice(-12).map(item => ({
                id: item?.id ?? '', title: item?.title ?? '', text: item?.text ?? '',
            })),
            continuityFacts: (state?.world?.facts ?? []).slice(-20).map(fact => ({
                id: fact?.id ?? '', key: fact?.key ?? '', value: fact?.value ?? '', validity: fact?.validity ?? 'current',
                publicity: fact?.publicity ?? 'private', publicHint: fact?.publicHint ?? '',
            })),
        },
        recentDynamics: (state?.continuity?.recentDynamics ?? []).slice(-5).map(item => ({
            summary: item?.summary ?? '',
            sourceStartMessageId: item?.sourceStartMessageId ?? null,
            sourceEndMessageId: item?.sourceEndMessageId ?? null,
        })),
        peopleIndex,
        peopleRecent,
    };
}

function transcript(messages) {
    return (messages || [])
        .map(item => `ASSISTANT[${item.id}] ${item.name}:\n${item.text}`)
        .join('\n\n');
}

export function buildManualSimulationMessages({ state, batch, worldReferenceText = '', longTermHistoryText = '', longTermHistoryNote = '' }) {
    const preContext = transcript(batch?.preContext);
    const pending = transcript(batch?.pendingMessages);
    const userPrompt = `世界观参考（只作为设定约束，不代表当前事件已经发生）：\n${worldReferenceText || '（未提供）'}\n\n可选长期压缩历史（柏宝书）：\n${longTermHistoryText || '（未启用或当前无可用长期历史）'}${longTermHistoryNote ? `\n${longTermHistoryNote}` : ''}\n\n当前 SceneWorld 权威状态：\n${JSON.stringify(compactState(state), null, 2)}\n\n已结算 AI 前置正文（仅帮助理解承接，不得重复结算）：\n${preContext || '（无）'}\n\n本轮待结算 AI 正文：\n${pending}\n\n待结算范围：#${batch.startId} ～ #${batch.endId}\nAI 正文数：${batch.assistantCount}\nAI 正文字符数：${batch.characters}\n\n请只返回下面结构的严格 JSON。所有字段都允许为空：\n{
  "simulation_digest": "本轮世界净变化的1～3句摘要；没有值得进入最近动态的变化则留空",
  "world_patch": {
    "time": null,
    "location": "",
    "summary": ""
  },
  "moment_items_upsert": [
    {
      "id": "已有当前动态请复用 id；新卡可留空",
      "title": "当前仍值得显示的中性标题",
      "text": "在待结算区间结束时仍成立的客观状态"
    }
  ],
  "moment_items_remove_ids": ["已有当前动态明确失效时填写 id"],
  "world_facts_upsert": [
    {
      "id": "已有持续性事实请复用 id；新事实可留空",
      "key": "稳定简短的事实键，同一主题后续继续复用",
      "value": "当前仍会约束后续一致性的客观事实",
      "validity": "current|upcoming|historical|persistent",
      "publicity": "private|trace|public",
      "public_hint": "只有 trace/public 时填写社会能看到的表象，不得泄露 private 真相",
      "evidence": "支持本次新增/更新的待结算正文短证据"
    }
  ],
  "world_facts_remove_ids": ["已有持续性事实已失效、错误或被完全替代时填写 id"],
  "people_upsert": [
    {
      "id": "已有人物请复用 peopleIndex 中 id；新人物可留空",
      "name": "人物名",
      "aliases": [],
      "location": "只有位置确实改变/首次确定时填写，否则空字符串",
      "status": "区间末尾仍成立的质性当前态势；禁止属性面板/次数/百分比/数值参数",
      "details_upsert": [
        { "label": "当前行动/近期安排/身体状态/情绪状态/临时外观等", "value": "有叙事证据且近期仍有用的质性内容" }
      ],
      "details_remove": ["旧详情明确失效时填写 label"],
      "knowledge_add": [
        { "text": "人物新确认知道的信息", "evidence": "证明其获知路径的待结算正文短证据" }
      ]
    }
  ],
  "action_suggestions": [
    {
      "title": "简短行动选项名",
      "reason": "为什么这个方向适合承接当前剧情",
      "tone": "日常|关系|探索|调查|工作|休息|其他",
      "prompt": "可直接填入 SillyTavern 输入框的剧情大纲/引子"
    }
  ]
}\n\n特别注意：
- 本轮只结算 #${batch.startId}～#${batch.endId} 之间实际存在的 AI 正文；中间 USER 楼层完全不作为输入。
- 即使 AI 楼层编号不连续，也要把这些 AI 回复作为连续正文整体结算。
- 单人恋爱、慢节奏对话完全可以只更新一个人物字段，甚至全部为空。
- 不要为了显示“大环境”而制造大环境。
- 已有对象没有变化时不要重复输出。
- 人物状态必须来自叙事正文的自然语言事实；属性数值即使偶然进入正文范围，也不能直接写入状态。
- 持续性世界事实总量只有 20 条额度：不要把普通人物日常、短期状态或可以从当前人物卡片直接看到的内容塞进去。
- 同一持续性事实变化时更新原 id/key；明确失效时用 world_facts_remove_ids 删除。
- action_suggestions 生成 3～5 条，尽量覆盖不同方向；不得重复、不得泄露 private 真相、不得把建议当成已发生事实。`;

    return [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
    ];
}
