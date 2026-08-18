import {
    LINGQI_BUTLER_TOOL_HELP,
    normalizeLingqiButlerActions,
} from './lingqi-help.js';

const MAX_MESSAGES = 800;
const MAX_NOTES = 80;
const LINGQI_MASCOT_STATES = new Set(['idle', 'watch', 'note', 'confused', 'happy', 'hold']);

function normalizeMascotState(value, fallback = 'idle') {
    const state = String(value ?? '').trim().toLowerCase();
    return LINGQI_MASCOT_STATES.has(state) ? state : fallback;
}

const LINGQI_TRIAGE_ROUTES = new Set(['resolved', 'self_service', 'external', 'mama']);
const LINGQI_TRIAGE_OWNERS = new Set(['user', 'provider', 'mama', 'unknown']);
const LINGQI_TRIAGE_CATEGORIES = new Set([
    'usage',
    'settings',
    'api',
    'task',
    'memory',
    'people',
    'injection',
    'opinion',
    'worldbook',
    'data',
    'ui',
    'compatibility',
    'performance',
    'unknown',
]);

function normalizeTriageText(value, maximum = 800) {
    return cleanText(value, maximum);
}

function normalizeTriageList(value, maximum = 4) {
    return (Array.isArray(value) ? value : [])
        .map(item => normalizeTriageText(item, 220))
        .filter(Boolean)
        .slice(0, maximum);
}

function normalizeLingqiTriage(value, {
    legacyNeedsHelp = false,
    legacyReason = '',
} = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const requestedRoute = String(source.route || '').trim().toLowerCase();
    const requestedOwner = String(source.owner || '').trim().toLowerCase();
    const category = String(source.category || '').trim().toLowerCase();
    const route = LINGQI_TRIAGE_ROUTES.has(requestedRoute)
        ? requestedRoute
        : legacyNeedsHelp
            ? 'mama'
            : 'resolved';
    const owner = LINGQI_TRIAGE_OWNERS.has(requestedOwner)
        ? requestedOwner
        : route === 'mama'
            ? 'unknown'
            : route === 'external'
                ? 'provider'
                : 'user';

    return {
        route,
        owner,
        category: LINGQI_TRIAGE_CATEGORIES.has(category) ? category : 'unknown',
        summary: normalizeTriageText(source.summary, 360),
        checked: normalizeTriageList(source.checked, 4),
        nextStep: normalizeTriageText(source.nextStep ?? source.next_step, 500),
        reason: normalizeTriageText(source.reason ?? legacyReason, 500),
    };
}

function cleanText(value, maximum = 2000) {
    return String(value ?? '').replace(/\r\n?/g, '\n').trim().slice(0, Math.max(0, maximum));
}

function nowIso() {
    return new Date().toISOString();
}

function makeId(prefix = 'lingqi') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyLingqiState() {
    return {
        messages: [],
        notes: [],
        pendingProposal: null,
        mascotState: 'idle',
        updatedAt: '',
    };
}

export function normalizeLingqiState(value) {
    const source = value && typeof value === 'object' ? value : {};
    const usedMessageIds = new Set();
    const messages = (Array.isArray(source.messages) ? source.messages : [])
        .map(item => {
            const baseId = cleanText(item?.id, 100) || makeId('msg');
            let id = baseId;
            let duplicateIndex = 2;
            while (usedMessageIds.has(id)) {
                const suffix = `_${duplicateIndex}`;
                id = `${baseId.slice(0, Math.max(1, 100 - suffix.length))}${suffix}`;
                duplicateIndex += 1;
            }
            usedMessageIds.add(id);
            return {
                id,
                role: item?.role === 'user' ? 'user' : 'assistant',
                text: cleanText(item?.text, 5000),
                planText: cleanText(item?.planText ?? item?.plan_text, 1600),
                needsAuthorHelp: Boolean(item?.needsAuthorHelp ?? item?.needs_author_help),
                supportReason: cleanText(item?.supportReason ?? item?.support_reason, 360),
                supportTriage: normalizeLingqiTriage(item?.supportTriage ?? item?.support_triage, {
                    legacyNeedsHelp: Boolean(item?.needsAuthorHelp ?? item?.needs_author_help),
                    legacyReason: item?.supportReason ?? item?.support_reason,
                }),
                at: cleanText(item?.at, 80) || nowIso(),
            };
        })
        .filter(item => item.text)
        .slice(-MAX_MESSAGES);

    const notes = (Array.isArray(source.notes) ? source.notes : [])
        .map(raw => normalizeLingqiNote(raw))
        .filter(Boolean)
        .slice(-MAX_NOTES);

    const pendingProposal = normalizeLingqiProposal(source.pendingProposal);
    return {
        messages,
        notes,
        pendingProposal,
        mascotState: normalizeMascotState(
            source.mascotState ?? source.mascot_state,
            messages.length ? 'watch' : 'idle',
        ),
        updatedAt: cleanText(source.updatedAt, 80),
    };
}

export function normalizeLingqiProposal(value) {
    if (!value || typeof value !== 'object') return null;
    const paperText = cleanText(value.paperText ?? value.paper_text, 360);
    const directive = cleanText(value.directive, 900);
    const planText = cleanText(value.planText ?? value.plan_text, 1600) || directive;
    if (!paperText || !directive) return null;
    const scope = value.scope === 'next' ? 'next' : 'short';
    const strength = ['natural', 'priority', 'force'].includes(value.strength)
        ? value.strength
        : 'priority';
    const remainingUses = scope === 'next'
        ? 1
        : Math.min(8, Math.max(2, Number.parseInt(value.remainingUses ?? value.remaining_uses, 10) || 4));
    return {
        id: cleanText(value.id, 100) || makeId('proposal'),
        paperText,
        planText,
        directive,
        scope,
        strength,
        remainingUses,
        autoConfirm: Boolean(value.autoConfirm ?? value.auto_confirm),
        createdAt: cleanText(value.createdAt, 80) || nowIso(),
    };
}

export function normalizeLingqiNote(value) {
    if (!value || typeof value !== 'object') return null;
    const paperText = cleanText(value.paperText ?? value.paper_text, 360);
    const directive = cleanText(value.directive, 900);
    const planText = cleanText(value.planText ?? value.plan_text, 1600) || directive;
    if (!paperText || !directive) return null;
    const scope = value.scope === 'next' ? 'next' : 'short';
    const strength = ['natural', 'priority', 'force'].includes(value.strength)
        ? value.strength
        : 'priority';
    const status = ['active', 'paused', 'completed', 'expired', 'cancelled'].includes(value.status)
        ? value.status
        : 'active';
    const fallbackUses = scope === 'next' ? 1 : 4;
    const parsedRemainingUses = Number.parseInt(value.remainingUses, 10);
    const remainingUses = Number.isFinite(parsedRemainingUses)
        ? Math.max(0, parsedRemainingUses)
        : fallbackUses;
    return {
        id: cleanText(value.id, 100) || makeId('note'),
        paperText,
        planText,
        directive,
        scope,
        strength,
        status,
        remainingUses,
        appliedCount: Math.max(0, Number.parseInt(value.appliedCount, 10) || 0),
        lastAppliedSourceKey: cleanText(value.lastAppliedSourceKey, 220),
        lastComment: cleanText(value.lastComment, 260),
        createdAt: cleanText(value.createdAt, 80) || nowIso(),
        updatedAt: cleanText(value.updatedAt, 80) || nowIso(),
        completedAt: cleanText(value.completedAt, 80),
    };
}

export function activeLingqiNotes(value) {
    const state = normalizeLingqiState(value);
    return state.notes.filter(note => note.status === 'active' && note.remainingUses > 0);
}

export function buildLingqiDirectorInjection(value) {
    const notes = activeLingqiNotes(value);
    if (!notes.length) return { text: '', noteIds: [] };
    const lines = [
        '<lingqi_director_notes>',
        '以下内容是用户通过世界动态助手明确确认的“剧情愿望”，不是已经发生的世界事实。请在不违反权威世界状态、人物稳定设定、知识边界、时间连续性和玩家自主意志的前提下，优先寻找自然实现机会。',
        'natural=有合适机会就顺势靠近；priority=本轮应明显优先尝试；force=只要不违反硬事实与玩家意志，应尽量在本轮兑现。不得为了兑现愿望而瞬移、改写既有事实、让角色性格突变，或替玩家决定行动/感受。',
    ];
    for (const note of notes.slice(0, 3)) {
        lines.push(`- [${note.id}] 强度=${note.strength}；范围=${note.scope}；愿望=${note.directive}`);
    }
    lines.push('如果客观条件不足，可以先铺设自然条件；不要在正文里提到“世界动态助手”“便签”“导演指令”或本注入块。');
    lines.push('</lingqi_director_notes>');
    return { text: lines.join('\n'), noteIds: notes.slice(0, 3).map(note => note.id) };
}

export function buildLingqiChatPrompt({ world = {}, messages = [], userText = '', butlerContext = '' } = {}) {
    const history = (Array.isArray(messages) ? messages : [])
        .slice(-16)
        .map(item => `${item.role === 'user' ? '用户' : '世界动态助手'}：${cleanText(item.text, 1200)}`)
        .join('\n');
    const worldJson = JSON.stringify(world ?? {}).slice(0, 18000);
    const user = cleanText(userText, 3000);
    return [
        '你是「世界动态」内置的世界动态助手。你的职责是解释插件功能、查询当前状态、协助执行受支持的低风险操作，并把用户明确提出的剧情方向整理成可确认的剧情引导。',
        '表达必须客观、简洁、明确。优先使用准确的功能名称、当前状态、界面路径和下一步操作；不要使用助手人格、卖萌语气、拟人动作、颜文字或含糊比喻。',
        '你可以看懂世界动态保存的世界状态与帮助知识，但不能把未知信息编造成事实。遇到不确定情况，应明确指出缺少什么证据以及用户可以如何检查。',
        '不要使用“维护者/主人/助手/操作/整理/剧情引导”等人格化称呼。需要进一步反馈插件问题时统一称为“维护者”，并生成客观诊断信息。',
        '你不是世界中的 NPC，也不是正文旁白。用户和世界动态助手聊天本身不等于世界事实。不能把用户的猜测、吐槽或愿望当成已经发生的事实，也不能声称自己已经修改世界、人物、记忆或剧情。',
        '世界动态助手是“世界动态”的内置操作与诊断入口。用户可以直接问插件怎么用、为什么没跑、某个按钮做什么、当前设置是什么、某个人现在在哪、最近有什么任务失败，也可以让世界动态助手代办低风险面板操作。',
        '回答插件问题时，先做一次很朴素的归因判断，不要一答不上来就往维护者那里扔。必须区分：① usage/settings＝用户自己能通过说明或设置解决；② api/provider/compatibility＝上游接口、第三方环境或兼容性问题，应先告诉用户该检查什么/该找谁；③ mama＝现有设置、已知规则和上游状态都解释不了，明显像插件自身异常；④ unknown＝查过仍无法归因。',
        '只有 triage.route=mama 才会生成给维护者的剧情引导。usage/settings 一律优先教用户自己解决；明确的 API 限流、鉴权、中转报错、第三方模型异常等优先 route=external/owner=provider；不要把这些常见问题甩给维护者。',
        '允许写给维护者的典型情况：插件按钮/设置与实际行为明显不一致；数据被错误删除、复活、覆盖或串聊天；本应触发的内部任务在前置条件正常时仍不触发；界面交互稳定复现异常；已按内置知识和实时状态检查仍无法解释。',
        '写给维护者时，triage.summary 必须先用一句人话概括“当前是什么问题”，triage.category 必须选一个类型，triage.checked 列出世界动态助手已经检查过的 1~4 个关键点，triage.reason 说明为什么现有用户操作/上游状态解释不了。不要只塞错误码和代码。',
        '如果当前证据不足但用户仍有明确可尝试的步骤，优先 triage.route=self_service 并把步骤写进 triage.next_step；只有查过仍无路可走时才 route=mama，再去问维护者。',
        '判断证据不足时宁可说不确定，不能为了显得全能而编原因，也不能把未知硬判成插件 bug。',
        '用户问“某个功能怎么设置、在哪里、该选哪档”时，回答必须包含：当前值、准确界面路径、每个相关选项的区别、结合用户目的给出的建议。不要只解释概念，也不要只说“去设置里看看”。如果用户目的不清楚，先给安全默认选择，再用一句短问题确认偏好。可由 actions 安全代办的开关，要明确告诉用户可以直接让世界动态助手改；不能代办 API Key、URL、模型和高风险数据操作。',
        '保留 needs_author_help 只是兼容旧版本；新回复以 triage.route 为准。',
        '涉及可逆的低风险设置/停止任务时，可以返回 actions 让插件本地执行。推演最新正文、巡查公共世界、立即补人物近况会消耗后台模型请求：只有用户明确要求时才返回对应 action，而且插件会再给确认卡片；不要在 reply 里提前声称已经完成。涉及删除人物、删除长期记忆、重置世界数据、改 API、改世界事实、改人物核心设定等高风险操作，本阶段不要返回动作。唯一例外是“删除世界动态助手自己的聊天记录”：只有用户明确要求删除时才可返回 delete_lingqi_chat；插件会先本地定位范围并弹确认卡片，用户再次确认前绝不能执行，也不能声称已经删掉。删除世界动态助手聊天默认不影响长期记忆。',
        LINGQI_BUTLER_TOOL_HELP,
        '当用户明确表达“下一轮/接下来想怎么玩、想让某人怎样、想要某种气氛/节奏/冲突”等创作愿望时，可以生成 proposal。proposal 只是世界动态助手整理、准备等待确认的剧情引导，仍要由插件决定是否确认。普通吐槽、猜测、闲聊不要自动生成 proposal。',
        'paper_text 是展示给用户的剧情引导摘要。用 1~3 个短句客观说明建议的推进方向，不使用角色扮演、卖萌或技术术语。',
        'paper_text 使用客观、简洁的自然语言概括用户希望的剧情方向。不要写技术字段，不要解释系统功能，也不要把尚未发生的内容描述成既成事实。',
        'plan_text 是用户展开后看到的实际推进说明。直接说明接下来将如何引导剧情：清楚、自然、不写技术字段或 prompt 术语，也不能把尚未发生的事写成已经发生。通常 1~3 句。',
        'directive 才是给机器看的结构化导演意图：准确提炼用户真正想要的体验，强调方向优先、实现方式服从现有世界逻辑。不要把愿望伪装成事实，也不要为了实现剧情引导偷偷篡改人物性格、记忆、历史、玩家行动或硬性世界规则。',
        'scope 只能 next 或 short；next 表示只影响下一次正文，short 表示未来几次自然寻找机会。strength 只能 natural / priority / force。force 也绝不能覆盖玩家自主意志、权威事实或硬性世界规则。',
        '如果用户明确说“记下来、贴张剧情引导、下一轮我要/希望、帮我安排”等强指令，可将 auto_confirm=true；只是随口说“感觉可以……”时必须 false。',
        'mascot_state 是内部兼容状态字段，用于表示本次回复处理状态，只能是 idle / watch / note / confused / happy / hold。必须根据“这次回复实际在表达什么”来选，不许为了显得活泼、轮换图片或制造变化而随机选；同样语义的回复应该倾向同样姿态。',
        '兼容状态语义：放松/普通陪着=idle；认真回答、专注观察、好奇盯着=watch；正在琢磨方案、整理记忆、写/处理剧情引导=note；明确没听懂、拿不准、需要继续确认=confused；事情顺利完成、开心、被逗到、明确满意=happy；担心、拒绝、阻止危险操作、错误/失败后的沮丧=hold。',
        'mascot_state 描述当前请求的处理状态，不看“图片轮播需求”。回复结束后这个姿态会保持到下一条回复或真实状态变化；不要因为历史上还有剧情引导就永远选 note。',
        '只输出一个合法 JSON 对象，不要代码围栏，不要额外解释。',
        '返回结构：',
        JSON.stringify({
            reply: '世界动态助手对用户留下的简短处理结果或解释；有动作时不要提前假装已经成功',
            mascot_state: 'idle | watch | note | confused | happy | hold',
            actions: [
                {
                    type: 'update_setting | set_person_simulation | cancel_simulation | cancel_background_tasks | check_world_state | organize_memory | simulate_latest | refresh_public_world | prioritize_person | catch_up_person | delete_lingqi_chat',
                    setting: '仅 update_setting 使用',
                    value: '仅 update_setting 使用',
                    person_id: '仅 set_person_simulation 使用',
                    person_name: '仅 set_person_simulation 使用',
                    enabled: true,
                    mode: 'delete_lingqi_chat 可用：all | recent | between | before | after | day | topic',
                    count: '仅 recent 使用',
                    start_query: '仅 between 使用：用户描述的起始聊天内容',
                    end_query: '仅 between 使用：用户描述的结束聊天内容',
                    query: 'before / after / topic 使用：需要在世界动态助手历史记录里定位的内容或主题',
                    day: '仅 day 使用：today | yesterday | day_before_yesterday',
                },
            ],
            triage: {
                route: 'resolved | self_service | external | mama',
                owner: 'user | provider | mama | unknown',
                category: 'usage | settings | api | task | memory | people | injection | opinion | worldbook | data | ui | compatibility | performance | unknown',
                summary: '一句话概括当前问题；不能只写错误码',
                checked: ['已经核对过的关键点 1', '关键点 2'],
                next_step: '用户自己还能做什么；没有就留空',
                reason: '为什么这样归因；route=mama 时说明为什么需要维护者看',
            },
            needs_author_help: false,
            help_reason: '兼容旧版本字段；新回复优先使用 triage',
            proposal: {
                paper_text: '世界动态助手整理的内部剧情引导',
                plan_text: '给用户展开查看的人话版实际推进记录',
                directive: '给剧情模型的机器导演指令',
                scope: 'next | short',
                strength: 'natural | priority | force',
                remaining_uses: 4,
                auto_confirm: false,
            },
        }),
        '',
        '世界动态助手参考资料（帮助知识 + 当前插件/世界实时状态；只按这里实际存在的信息回答）：',
        cleanText(butlerContext, 22000) || '（当前没有额外管家资料；遇到插件细节不要猜。）',
        '',
        '当前世界状态（导演/闲聊参考，只读）：',
        worldJson,
        '',
        '最近和世界动态助手的聊天：',
        history || '（还没有聊天记录）',
        '',
        `用户刚刚说：${user}`,
    ].join('\n');
}

export function shouldAutoConfirmLingqiProposal(userText, modelRequested = false) {
    if (!modelRequested) return false;
    const value = cleanText(userText, 3000);
    if (!value) return false;
    return /(?:记(?:一)?下|记下来|贴(?:一|张|个)?(?:张)?(?:小)?剧情引导|下一轮(?:我)?(?:想|要|希望)|接下来(?:几轮|一阵|这段|最近)?[^。！？\n]{0,24}(?:想|希望|要)|帮我(?:安排|规划|推进)|我想让)/u.test(value);
}

export function normalizeLingqiAssistantPayload(payload) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const reply = cleanText(source.reply, 2400) || '……？\n再说一次 ฅ';
    const proposal = normalizeLingqiProposal(source.proposal);
    const mascotState = normalizeMascotState(
        source.mascotState ?? source.mascot_state,
        proposal ? 'note' : /[？?]|不太懂|奇怪|怎么/u.test(reply) ? 'confused' : 'watch',
    );
    const actions = normalizeLingqiButlerActions(source.actions);
    const legacyNeedsAuthorHelp = Boolean(source.needsAuthorHelp ?? source.needs_author_help);
    const helpReason = cleanText(source.helpReason ?? source.help_reason, 360);
    const triage = normalizeLingqiTriage(source.triage, {
        legacyNeedsHelp: legacyNeedsAuthorHelp,
        legacyReason: helpReason,
    });
    const needsAuthorHelp = triage.route === 'mama';
    return { reply, proposal, mascotState, actions, needsAuthorHelp, helpReason, triage };
}

export function addLingqiMessage(value, role, text, meta = {}) {
    const state = normalizeLingqiState(value);
    const cleaned = cleanText(text, 5000);
    if (!cleaned) return state;
    state.messages.push({
        id: makeId('msg'),
        role: role === 'user' ? 'user' : 'assistant',
        text: cleaned,
        planText: role === 'user' ? '' : cleanText(meta.planText ?? meta.plan_text, 1600),
        needsAuthorHelp: role === 'user' ? false : Boolean(meta.needsAuthorHelp ?? meta.needs_author_help),
        supportReason: role === 'user' ? '' : cleanText(meta.supportReason ?? meta.support_reason, 360),
        supportTriage: role === 'user'
            ? normalizeLingqiTriage({})
            : normalizeLingqiTriage(meta.supportTriage ?? meta.support_triage, {
                legacyNeedsHelp: Boolean(meta.needsAuthorHelp ?? meta.needs_author_help),
                legacyReason: meta.supportReason ?? meta.support_reason,
            }),
        at: nowIso(),
    });
    state.messages = state.messages.slice(-MAX_MESSAGES);
    state.updatedAt = nowIso();
    return state;
}

export function confirmLingqiProposal(value) {
    const state = normalizeLingqiState(value);
    const proposal = normalizeLingqiProposal(state.pendingProposal);
    if (!proposal) return state;
    const note = normalizeLingqiNote({
        ...proposal,
        id: makeId('note'),
        status: 'active',
        appliedCount: 0,
        lastComment: '',
        updatedAt: nowIso(),
    });
    state.notes.push(note);
    state.notes = state.notes.slice(-MAX_NOTES);
    state.pendingProposal = null;
    state.updatedAt = nowIso();
    return state;
}

export function dismissLingqiProposal(value) {
    const state = normalizeLingqiState(value);
    state.pendingProposal = null;
    state.updatedAt = nowIso();
    return state;
}

export function setLingqiNoteStatus(value, noteId, status) {
    const state = normalizeLingqiState(value);
    const note = state.notes.find(item => item.id === String(noteId || ''));
    if (!note) return state;
    if (!['active', 'paused', 'cancelled'].includes(status)) return state;
    note.status = status;
    note.updatedAt = nowIso();
    note.lastComment = status === 'active'
        ? '已恢复该剧情引导。'
        : status === 'paused'
            ? '暂不执行。'
            : '已取消该剧情引导。';
    state.updatedAt = nowIso();
    return state;
}

export function consumeLingqiDirectorOffer(value, {
    offeredNoteIds = [],
    sourceKey = '',
} = {}) {
    const state = normalizeLingqiState(value);
    const offered = new Set((offeredNoteIds || []).map(String));
    const at = nowIso();
    for (const note of state.notes) {
        if (!offered.has(note.id) || note.status !== 'active') continue;
        if (sourceKey && note.lastAppliedSourceKey === sourceKey) continue;
        note.lastAppliedSourceKey = cleanText(sourceKey, 220);
        note.appliedCount += 1;
        note.remainingUses = Math.max(0, note.remainingUses - 1);
        note.updatedAt = at;
        if (note.scope === 'next') {
            note.status = 'expired';
            note.completedAt = at;
            note.lastComment = '已提交本轮处理。';
        } else if (note.remainingUses <= 0) {
            note.status = 'expired';
            note.completedAt = at;
            note.lastComment = '已达到使用轮次并归档。';
        } else {
            note.lastComment = '已继续保留，等待后续条件。';
        }
    }
    state.updatedAt = at;
    return state;
}

export function applyLingqiDirectorResult(value, updates = [], {
    offeredNoteIds = [],
    sourceKey = '',
} = {}) {
    const state = normalizeLingqiState(value);
    const offered = new Set((offeredNoteIds || []).map(String));
    const updateMap = new Map(
        (Array.isArray(updates) ? updates : [])
            .map(item => [String(item?.id || ''), item])
            .filter(([id]) => id),
    );
    const at = nowIso();

    for (const note of state.notes) {
        if (!offered.has(note.id)) continue;
        if (['paused', 'cancelled'].includes(note.status)) continue;
        if (sourceKey && note.lastAppliedSourceKey && note.lastAppliedSourceKey !== sourceKey) continue;
        const update = updateMap.get(note.id);
        if (!update) continue;
        const outcome = ['completed', 'continue', 'blocked'].includes(update.status)
            ? update.status
            : 'continue';
        const memo = cleanText(update.memo ?? update.comment, 240);
        note.updatedAt = at;

        if (outcome === 'completed') {
            note.status = 'completed';
            note.completedAt = at;
            note.lastComment = memo || '已完成并归档。';
            continue;
        }

        if (note.status === 'expired') {
            note.lastComment = memo || (outcome === 'blocked'
                ? '本轮条件不足，暂时保留。'
                : '本轮已处理并归档。');
            continue;
        }

        note.lastComment = memo || (outcome === 'blocked'
            ? '当前条件不足，暂不执行。'
            : '已继续保留，等待后续条件。');
    }
    state.updatedAt = at;
    return state;
}
