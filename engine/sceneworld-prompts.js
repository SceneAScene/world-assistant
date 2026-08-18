const SYSTEM_PROMPT = `你是 SceneWorld（世界动态）的世界状态结算器。你的任务不是续写小说，而是根据“已有状态 + 最近正文”更新镜头内外仍然成立的世界状态。

权威顺序：正文明确事实 > 已保存的客观状态 > 后台合理推断。后台推断不得推翻正文。

核心规则：
1. 不续写主聊天正文，不替用户角色决定行动、感受或认知。
2. 只更新有证据或由既有状态自然延续出的内容。没有变化就不要硬造变化。
3. 人物位置、状态、目标只在正文明确变化或既有状态自然延续时更新；不能因为人物没有出场就删除。
4. 人物“知道什么”必须有获知路径。正文没有证明其看到、听到、被告知、调查到或接触公开渠道，就不要写入 knowledge。
5. 暗流是仍在发展的后台事件/压力，不是把每句对白都变成事件。已有暗流应优先更新而不是重复创建。
6. 回声是已经发生之事留下的可持续影响、痕迹、承诺、关系变化、线索或后果。
7. 世界事实只记录确定成立且会约束后续一致性的事实。传闻、猜测、角色误解不能升级成世界事实。
8. 世界时间只在正文提供明确证据时更新；无法确定就保持既有值或 null，禁止猜日期和钟点。
9. 输出必须是严格 JSON 对象。不要 Markdown、不要代码围栏、不要解释文字。
10. 采用“增量操作”，不要为了方便把整个人物/暗流列表重新编一遍。没有变化的数组返回空数组。`;

function compactKnowledge(items) {
    if (!Array.isArray(items)) return [];
    return items.slice(-20).map(item => typeof item === 'string' ? item : item?.text).filter(Boolean);
}

function compactState(state) {
    return {
        world: {
            time: state?.world?.time ?? null,
            location: state?.world?.location ?? '',
            summary: state?.world?.summary ?? '',
            facts: (state?.world?.facts ?? []).slice(-80).map(fact => ({
                id: fact?.id ?? '',
                key: fact?.key ?? '',
                value: fact?.value ?? '',
                validity: fact?.validity ?? 'current',
            })),
        },
        people: (state?.people ?? []).slice(0, 120).map(person => ({
            id: person?.id ?? '',
            name: person?.name ?? '',
            aliases: person?.aliases ?? [],
            location: person?.location ?? '',
            status: person?.status ?? '',
            goal: person?.goal ?? '',
            knowledge: compactKnowledge(person?.knowledge),
        })),
        undercurrents: (state?.undercurrents ?? []).slice(0, 100).map(item => ({
            id: item?.id ?? '',
            title: item?.title ?? '',
            status: item?.status ?? 'open',
            summary: item?.summary ?? '',
            participants: item?.participants ?? [],
            visibility: item?.visibility ?? 'hidden',
        })),
        echoes: (state?.echoes ?? []).slice(-80).map(item => ({
            id: item?.id ?? '',
            title: item?.title ?? '',
            status: item?.status ?? 'active',
            kind: item?.kind ?? 'other',
            summary: item?.summary ?? '',
        })),
        memoryShortTerm: (state?.memory?.shortTerm ?? []).slice(-40),
    };
}

export function buildManualSimulationMessages({ state, source, contextMessages }) {
    const transcript = (contextMessages || [])
        .map(item => `${item.role === 'user' ? 'USER' : 'ASSISTANT'}[${item.id}] ${item.name}:\n${item.text}`)
        .join('\n\n');

    const userPrompt = `当前 SceneWorld 状态：\n${JSON.stringify(compactState(state), null, 2)}\n\n最近聊天正文：\n${transcript}\n\n本轮需要结算的最新 AI 正文：消息 #${source.id}\n正文指纹：${source.fingerprint}\n\n请只返回下面结构的严格 JSON：\n{
  "world_patch": {
    "time": null,
    "location": "仅在需要更新时填写，否则空字符串",
    "summary": "本轮结算后的客观世界短摘要；没有必要变化可为空字符串"
  },
  "world_facts_upsert": [
    {
      "id": "已有事实请复用已有 id；新事实可留空由插件生成",
      "key": "稳定、简短的事实键",
      "value": "确定成立的客观事实",
      "validity": "current|upcoming|historical|persistent",
      "evidence": "尽量复制本轮正文中支持此事实的短句；纯后台延续可为空"
    }
  ],
  "people_upsert": [
    {
      "id": "已有人物请复用已有 id；新人物可留空",
      "name": "人物名",
      "aliases": [],
      "location": "当前可靠位置或空字符串",
      "status": "当前客观状态",
      "goal": "当前可推断目标或空字符串",
      "knowledge_add": [
        {
          "text": "人物新确认知道的信息",
          "evidence": "正文中证明该人物获知路径的短句"
        }
      ]
    }
  ],
  "undercurrents_upsert": [
    {
      "id": "已有暗流请复用已有 id；新暗流可留空",
      "title": "暗流名称",
      "status": "open|developing|resolved|cancelled",
      "summary": "当前发展",
      "participants": [],
      "visibility": "hidden|approaching|visible"
    }
  ],
  "echoes_upsert": [
    {
      "id": "已有回声请复用已有 id；新回声可留空",
      "title": "回声名称",
      "status": "active|resolved",
      "kind": "relationship|object|promise|conflict|clue|consequence|other",
      "summary": "持续影响或痕迹"
    }
  ],
  "memory_short_term_add": ["近期推演确实值得持续记住的信息"],
  "chronicle_entry": {
    "time": "正文中的明确时间，否则空字符串",
    "title": "本轮最值得记录的纪事标题；没有重要变化可为空字符串",
    "summary": "本轮正文造成的主要世界变化；没有可为空字符串"
  }
}\n\n特别注意：已有对象没有变化时不要重复输出；没有依据时对应数组必须为空。`;

    return [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
    ];
}
