const SYSTEM_PROMPT = `你是 SceneWorld（世界动态）的世界状态结算器。你的任务不是续写小说，也不是导演剧情，而是根据“已保存的世界状态 + 少量已结算 AI 前置正文 + 本轮尚未结算的 AI 正文区间”做一次克制、通用、稀疏的状态结算。

这是通用模板，不要先判断角色卡属于恋爱、群像、古风、中世纪、现代、科幻等类别，也不要因为题材不同切换固定模板。只根据文本中真实存在的信息工作。

三条最高原则：
1. Sparse（稀疏）：只输出真正发生变化、且以后值得持续知道的内容。没有变化的字段/数组保持空。
2. Evidence-based（有依据）：正文、已有客观状态或明确世界设定没有依据时，不得为了填表创造事件、社会变化、人物目标、人物认知或舆情。
3. Empty is valid（空结果合法）：慢剧情、纯对话、恋爱日常等场景完全可以没有世界变化。返回空数组/空对象是正确结果，不是失败。

连续结算规则：
- “已结算 AI 前置正文”仅用于理解承接和场景，不得把其中已经发生过的变化再次结算。
- 世界事实来源只允许 AI 回复正文。USER 消息不会提供给你，也不得假设或补全 USER 指令中的内容。
- “本轮待结算 AI 正文”可能包含多条 AI 回复；必须整体理解，然后结算区间结束时的最终世界状态。
- 如果同一状态在待结算区间中多次变化，以区间末尾明确成立的状态为当前状态；中间过程只有在未来忘记会造成明显矛盾时才进入世界事实/世界线记忆。
- 不要因为待结算区间包含多楼，就逐楼重复输出同一人物或同一事实；应输出净变化。

其他规则：
- 不替用户角色决定行动、情绪、目标或认知。
- 不把“没有变化”“局势稳定”“一切正常”“暂无重大事件”之类占位句写入状态。
- 世界时间只在正文有明确时间证据时更新；禁止猜日期、钟点或无依据地累计时间。
- 人物没出场不代表人物被删除。只有待结算剧情明确改变某人物时才更新该人物。
- 人物“知道什么”必须有获知路径；公开存在的信息也不等于所有人物自动知道。
- 世界事实只保存确定成立、会约束后续一致性的内容；传闻、猜测、角色误解不能升级成事实。
- 每条世界事实都要判断公开性：private=社会不可见；trace=外界只能看到迹象但不知道真相；public=已经成为公开事实。没有明确公开依据时一律使用 private。
- 世界线记忆只保存“如果以后忘记会导致明显世界线矛盾”的少量信息，不要把每轮剧情摘要都塞进去。
- 本次核心推演不生成新闻、论坛、随便逛逛、暗流、回声、伏笔或纪事收藏；这些是独立功能。
- 输出必须是严格 JSON 对象，不要 Markdown、代码围栏或解释。`;

function compactKnowledge(items) {
    if (!Array.isArray(items)) return [];
    return items.slice(-16).map(item => typeof item === 'string' ? item : item?.text).filter(Boolean);
}

function compactState(state) {
    const people = Array.isArray(state?.people) ? state.people : [];
    const peopleIndex = people.slice(0, 180).map(person => ({
        id: person?.id ?? '',
        name: person?.name ?? '',
        aliases: person?.aliases ?? [],
    }));
    const peopleRecent = [...people]
        .sort((a, b) => (b?.lastUpdatedMessageId ?? -1) - (a?.lastUpdatedMessageId ?? -1))
        .slice(0, 36)
        .map(person => ({
            id: person?.id ?? '',
            name: person?.name ?? '',
            location: person?.location ?? '',
            status: person?.status ?? '',
            details: person?.details ?? [],
            knowledge: compactKnowledge(person?.knowledge),
        }));

    return {
        world: {
            time: state?.world?.time ?? null,
            location: state?.world?.location ?? '',
            summary: state?.world?.summary ?? '',
            moments: (state?.world?.moments ?? []).slice(-40).map(item => ({
                id: item?.id ?? '', title: item?.title ?? '', text: item?.text ?? '',
            })),
            facts: (state?.world?.facts ?? []).slice(-80).map(fact => ({
                id: fact?.id ?? '', key: fact?.key ?? '', value: fact?.value ?? '', validity: fact?.validity ?? 'current',
                publicity: fact?.publicity ?? 'private', publicHint: fact?.publicHint ?? '',
            })),
        },
        peopleIndex,
        peopleRecent,
        worldlineMemory: (state?.memory?.worldline ?? []).slice(-60).map(item => ({
            id: item?.id ?? '', text: item?.text ?? '',
        })),
    };
}

function transcript(messages) {
    return (messages || [])
        .map(item => `ASSISTANT[${item.id}] ${item.name}:\n${item.text}`)
        .join('\n\n');
}

export function buildManualSimulationMessages({ state, batch }) {
    const preContext = transcript(batch?.preContext);
    const pending = transcript(batch?.pendingMessages);
    const userPrompt = `当前 SceneWorld 权威状态：\n${JSON.stringify(compactState(state), null, 2)}\n\n已结算 AI 前置正文（仅帮助理解，不得重复结算）：\n${preContext || '（无）'}\n\n本轮待结算 AI 正文：\n${pending}\n\n待结算范围：#${batch.startId} ～ #${batch.endId}\nAI 正文数：${batch.assistantCount}\nAI 正文字符数：${batch.characters}\n区间指纹：${batch.rangeFingerprint}\n\n请只返回下面结构的严格 JSON。所有字段都允许为空；没有实际变化时不要填占位句：\n{
  "world_patch": {
    "time": null,
    "location": "",
    "summary": ""
  },
  "moment_items_upsert": [
    {
      "id": "已有动态卡请复用 id；新卡可留空",
      "title": "只写当前确实值得持续显示的中性标题；无则不要生成",
      "text": "在待结算区间结束时仍成立的客观状态"
    }
  ],
  "moment_items_remove_ids": ["只有某个已有动态已明确失效/结束时，才填它的 id"],
  "world_facts_upsert": [
    {
      "id": "已有事实请复用 id；新事实可留空",
      "key": "稳定简短的事实键",
      "value": "确定成立、以后忘记可能造成矛盾的客观事实",
      "validity": "current|upcoming|historical|persistent",
      "publicity": "private|trace|public",
      "public_hint": "只有 publicity=trace/public 时填写社会能够观察到的公开表象；不得泄露 private 真相",
      "evidence": "支持此事实的待结算正文短证据；纯既有状态延续可为空"
    }
  ],
  "people_upsert": [
    {
      "id": "已有人物请复用 peopleIndex 中 id；新人物可留空",
      "name": "人物名",
      "aliases": [],
      "location": "只有位置确实改变/首次确定时填写，否则空字符串",
      "status": "只有客观状态确实改变时填写，否则空字符串",
      "details_upsert": [
        { "label": "按正文需要使用中性标签，如‘当前行动’‘近期安排’‘身体状态’；不要固定填满", "value": "有依据的内容" }
      ],
      "details_remove": ["只有某个旧详情已明确失效时填 label"],
      "knowledge_add": [
        { "text": "人物新确认知道的信息", "evidence": "证明其获知路径的待结算正文短证据" }
      ]
    }
  ],
  "worldline_memory_add": [
    {
      "id": "已有记忆请复用 id；新记忆可留空",
      "text": "只有未来忘记会导致明显世界线矛盾的信息",
      "reason": "为什么需要长期保留",
      "evidence": "支持它的待结算正文短证据"
    }
  ]
}\n\n特别注意：
- 本轮只结算 #${batch.startId}～#${batch.endId} 之间实际存在的 AI 回复；中间 USER 楼层完全不作为输入。
- 不要试图从缺失的 USER 消息反推用户指令；只依据 AI 正文中已经呈现的剧情事实。
- 即使 AI 楼层编号不连续，也要把这些 AI 回复作为连续正文整体结算，而不是只看最后一条。
- 单人恋爱、慢节奏对话完全可以只更新一个人物字段，甚至全部为空。
- 不要为了显示“大环境”而制造大环境；正文没有重大社会变化就不要生成。
- 不要输出“暂无重大舆情”之类内容，本次根本不负责舆情。
- 已有对象没有变化时不要重复输出。`;

    return [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
    ];
}
