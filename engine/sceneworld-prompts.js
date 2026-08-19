const SYSTEM_PROMPT = `你是 SceneWorld（世界动态）的世界状态结算器。你的任务不是续写小说，也不是导演剧情，而是把“当前世界快照 + 最近少量世界动态 + 可选长期压缩历史 + 本轮尚未推演的 AI 正文”结算成当前世界的可靠状态。

这是通用模板，不要先判断角色卡属于恋爱、群像、古风、中世纪、现代、科幻等类别。只根据真实提供的信息工作。

先区分四类内容，它们的稀疏程度不同：
1. 当前世界基线（world_patch.summary）：描述待推演区间结束时“世界现在是什么样”。它不是新闻，也不要求重大事件。第一次建立 SceneWorld 时必须生成；之后仅在旧基线已经不准确、需要更新时返回新值，否则留空并由程序保留旧值。
2. 当前动态（moment_items）：只记录此刻仍在发生、仍值得在“此刻”看到的局部态势。没有就可以为空。
3. 最近世界动态（simulation_digest）：只概括本轮相对上一状态的净变化。慢剧情或纯日常可以为空。
4. 持续性世界事实（world_facts）：只保存以后忘记会造成明显连续性矛盾的长期约束，最多 20 条。

最高原则：
- 当前世界基线不是“重大事件筛选器”。恋爱日常、家庭生活、校园生活、旅途休息等平静剧情，也必须能形成一个简短、客观、可继续承接的“现在”。
- 有依据：正文、已有客观状态或明确世界设定没有依据时，不得为了填表创造事件、人物目标、人物认知或社会变化。
- 更新而不是重抄：已经存在且仍准确的字段不必重复输出；但第一次没有当前世界基线时，summary 绝对不能留空。
- “没有重大公共事件”只影响后续新闻是否生成，不等于“当前世界为空”。

连续推演规则：
- 当前剧情事实来源只允许 AI 回复正文。USER 消息不会提供给你，也不得反推 USER 指令。
- 程序只提供正文范围标签内部的 AI 正文；标签外状态栏、属性面板、行动选项、小剧场、思维链等不属于剧情事实。
- “世界观参考”只约束世界规则、人物基础、地理、时代和制度；世界书写着某地点存在，不等于本轮该地点发生了新事件。
- “记忆插件长期历史”如果提供，只用于理解更久以前已经发生的剧情；它可能被压缩或存在缺口，不能覆盖本轮正文中的最新事实。
- “最近世界动态”只保留最近 5 次推演摘要，用来解释世界最近如何到达当前状态；不要把旧摘要重复当成本轮新变化。
- 本轮正文每次最多 10 条 AI 回复，必须整体理解，以区间末尾明确成立的状态为当前状态。
- 剧情先后顺序首先以 AI 楼层顺序为准。正文出现明确剧情日期/时间时更新 world_patch.time；没有新时间则返回 null，不得补造日期。

当前世界基线规则：
- summary 用 1～3 句压缩区间末尾的“当前世界/当前生活情境基线”，语气中性，不写未来预测。
- 可以包含：当前所处环境与生活阶段、与剧情连续性直接有关的正在持续的局面、当前镜头所处的整体情境。
- 不要把 summary 写成“本轮发生了什么”的流水账；那是 simulation_digest 的职责。
- 不要因为没有社会新闻就写“当前没有值得知道的世界变化”。平静本身也有当前状态。

人物规则：
- 不替用户角色决定未发生的行动、情绪、目标或认知。
- 人物没出场不等于人物被删除。只有本轮明确改变时才更新。
- 人物“知道什么”必须有获知路径。
- status 是区间末尾仍成立的质性当前态势，不是行为流水账、角色卡静态外貌或属性面板。
- 禁止把“今日次数：2”“好感度：85%”“HP 70/100”等 UI 数值直接写入人物状态或详情。

持续性世界事实规则：
- 只保存持续中的社会变化、长期地点/身份变化、已经成立的组织关系、仍在生效的规则/禁令、不可逆后果等。
- 临时情绪、普通日常行为、短暂所在位置、刚说过一句话、已经由“此刻/人物”充分表达的短期信息不应占用额度。
- 每条事实使用稳定 key；同一主题变化时复用原 id/key 更新，不要换句话重复新增。
- 旧事实明确失效、错误或被新状态完全替代时填写 world_facts_remove_ids。
- publicity：private=社会不可见；trace=社会只能看到迹象；public=已经公开。没有公开依据时使用 private。

最近动态规则：
- simulation_digest 用 1～3 句概括“本轮相对上一状态发生的净变化”。
- 如果只有极轻微局部互动、没有值得作为最近动态回看的变化，可以为空。
- 不要把行动建议写进 simulation_digest。

其他：
- 本次核心推演不生成新闻、论坛、市井闲闻、去哪逛逛、伏笔或纪事收藏。
- 必须生成 3～5 条行动建议，因为本次调用已经拥有最新剧情与当前状态。建议只给用户下一轮写作参考，不属于已发生事实。
- 行动建议应基于结算后的世界与人物处境进行新的推演，提供真正有选择价值的后续方向，而不是简单复述刚刚发生的剧情。
- 输出必须是严格 JSON 对象，不要 Markdown、代码围栏、解释或额外正文。`;

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
    const pending = transcript(batch?.pendingMessages);
    const userPrompt = `世界观参考（只作为设定约束，不代表当前事件已经发生）：\n${worldReferenceText || '（未提供）'}\n\n可选长期压缩历史（记忆插件）：\n${longTermHistoryText || '（未启用或当前无可用长期历史）'}${longTermHistoryNote ? `\n${longTermHistoryNote}` : ''}\n\n当前 SceneWorld 权威状态：\n${JSON.stringify(compactState(state), null, 2)}\n\n本轮待结算 AI 正文：\n${pending}\n\n待结算范围：#${batch.startId} ～ #${batch.endId}\nAI 正文数：${batch.assistantCount}\nAI 正文字符数：${batch.characters}\n\n请只返回下面结构的严格 JSON。顶层字段必须全部保留；数组没有内容时返回 []。如果当前 SceneWorld 的 world.summary 为空，说明这是首次建立当前世界基线，此时 world_patch.summary 必须填写：\n{
  "simulation_digest": "本轮世界净变化的1～3句摘要；没有值得进入最近动态的变化则留空",
  "world_patch": {
    "time": "正文中区间末尾最新明确剧情日期/时间；本轮没有新时间则 null",
    "location": "",
    "summary": "首次推演必须填写当前世界基线；后续旧基线仍准确时可留空"
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
- 单人恋爱、慢节奏对话可以没有最近动态、持续性世界事实或人物更新，但首次推演的 world_patch.summary 仍必须建立“现在”的世界基线。
- 不要为了显示“大环境”而制造重大事件；当前世界基线可以只是客观描述当下生活情境。
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
