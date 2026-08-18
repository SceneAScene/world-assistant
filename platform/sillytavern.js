import { getContext, extension_settings } from '../../../../extensions.js';
import { generateRaw, saveSettingsDebounced } from '../../../../../script.js';
export const DEFAULT_SCENEWORLD_SETTINGS = Object.freeze({
    // 世界推演可以额外读取当前角色的“角色描述（Description）”。见闻不读取角色描述。
    includeCharacterDescription: true,
    characterDescriptionMaxChars: 5000,
    // 世界推演与见闻分别维护世界书白名单。这里保存的是“整本世界书是否允许 SceneWorld 读取”，
    // 与酒馆本轮有没有激活其中条目无关。未出现过的当前世界书默认允许，用户取消后保存 false。
    simulationWorldBookSelection: Object.freeze({}),
    observationWorldBookSelection: Object.freeze({}),
    simulationWorldInfoMaxChars: 16000,
    observationWorldInfoMaxChars: 16000,
    // Only text inside these complete assistant-message tags is treated as narrative canon.
    // This intentionally excludes status panels, chain-of-thought blocks, action menus and mini-theaters outside the body tag.
    contentTags: Object.freeze(['content']),
    contentFallbackToWholeMessage: false,
    // 首次在一个旧聊天中启用世界动态时，默认只从当前附近开始：取最近最多 10 条 AI 正文。
    // 若用户明确选择从某楼层回溯，则从指定楼层起每批最多向后结算 10 条。
    initialSettlementMode: 'latest',
    initialStartFloor: 0,
    // 柏宝书长期历史也分开控制。世界推演和见闻可独立启用。
    simulationUseBaiBaiBook: false,
    observationUseBaiBaiBook: false,
    baibaiHistoryMaxChars: 8000,
});

function normalizeContentTagName(value) {
    let text = String(value ?? '').trim();
    if (!text) return '';
    const pair = text.match(/^<\s*([A-Za-z][\w:.-]*)\s*>\s*<\/\s*\1\s*>$/i);
    if (pair) text = pair[1];
    else {
        const opening = text.match(/^<\s*([A-Za-z][\w:.-]*)[^>]*>$/i);
        if (opening) text = opening[1];
        const closing = text.match(/^<\/\s*([A-Za-z][\w:.-]*)\s*>$/i);
        if (closing) text = closing[1];
    }
    return /^[A-Za-z][\w:.-]*$/.test(text) ? text.toLowerCase() : '';
}

function normalizeContentTags(value) {
    const source = Array.isArray(value)
        ? value
        : String(value ?? '').split(/[\n,，;；]+/g);
    const seen = new Set();
    const result = [];
    for (const item of source) {
        const name = normalizeContentTagName(item);
        if (!name || seen.has(name)) continue;
        seen.add(name);
        result.push(name);
        if (result.length >= 12) break;
    }
    return result;
}

export function getSceneWorldSettings() {
    const raw = extension_settings?.sceneworld;
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const merged = {
        ...DEFAULT_SCENEWORLD_SETTINGS,
        ...source,
    };
    const contentTags = normalizeContentTags(merged.contentTags);

    const normalizeBookSelection = value => {
        const sourceSelection = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        const result = {};
        for (const [name, enabled] of Object.entries(sourceSelection)) {
            const key = String(name ?? '').trim();
            if (!key) continue;
            result[key] = enabled !== false;
        }
        return result;
    };

    // alpha.15 以前只有一份 worldBookSelection。升级时同时继承给“世界推演”和“见闻”，
    // 之后两份选择各自独立保存，互不影响。
    const legacyWorldBookSelection = normalizeBookSelection(source.worldBookSelection);
    const simulationWorldBookSelection = 'simulationWorldBookSelection' in source
        ? normalizeBookSelection(source.simulationWorldBookSelection)
        : { ...legacyWorldBookSelection };
    const observationWorldBookSelection = 'observationWorldBookSelection' in source
        ? normalizeBookSelection(source.observationWorldBookSelection)
        : { ...legacyWorldBookSelection };

    // alpha.11 以前叫 includeCharacterBase；升级后只保留角色描述，不再发送性格/场景字段。
    const includeCharacterDescription = 'includeCharacterDescription' in source
        ? source.includeCharacterDescription !== false
        : source.includeCharacterBase !== false;
    const characterDescriptionMaxChars = Number.isFinite(Number(source.characterDescriptionMaxChars))
        ? Math.max(1000, Math.min(10000, Math.trunc(Number(source.characterDescriptionMaxChars))))
        : Math.max(1000, Math.min(10000, Math.trunc(Number(source.characterBaseMaxChars) || DEFAULT_SCENEWORLD_SETTINGS.characterDescriptionMaxChars)));
    const initialSettlementMode = String(merged.initialSettlementMode ?? '').trim().toLowerCase() === 'from_floor' ? 'from_floor' : 'latest';
    const initialStartFloor = Number.isFinite(Number(merged.initialStartFloor))
        ? Math.max(0, Math.trunc(Number(merged.initialStartFloor)))
        : 0;

    const legacyWorldInfoMaxChars = Number(source.worldInfoMaxChars);
    const simulationWorldInfoMaxChars = Math.max(2000, Math.min(32000, Math.trunc(
        Number(merged.simulationWorldInfoMaxChars) || legacyWorldInfoMaxChars || DEFAULT_SCENEWORLD_SETTINGS.simulationWorldInfoMaxChars,
    )));
    const observationWorldInfoMaxChars = Math.max(2000, Math.min(32000, Math.trunc(
        Number(merged.observationWorldInfoMaxChars) || legacyWorldInfoMaxChars || DEFAULT_SCENEWORLD_SETTINGS.observationWorldInfoMaxChars,
    )));

    // 旧 useBaiBaiBook 过去只实际用于核心世界推演，因此迁移时只继承给世界推演；见闻默认关闭。
    const simulationUseBaiBaiBook = 'simulationUseBaiBaiBook' in source
        ? source.simulationUseBaiBaiBook === true
        : source.useBaiBaiBook === true;
    const observationUseBaiBaiBook = 'observationUseBaiBaiBook' in source
        ? source.observationUseBaiBaiBook === true
        : false;

    return {
        ...merged,
        includeCharacterDescription,
        characterDescriptionMaxChars,
        simulationWorldBookSelection,
        observationWorldBookSelection,
        simulationWorldInfoMaxChars,
        observationWorldInfoMaxChars,
        contentTags: contentTags.length ? contentTags : ['content'],
        contentFallbackToWholeMessage: merged.contentFallbackToWholeMessage === true,
        initialSettlementMode,
        initialStartFloor,
        simulationUseBaiBaiBook,
        observationUseBaiBaiBook,
        baibaiHistoryMaxChars: Math.max(2000, Math.min(20000, Math.trunc(Number(merged.baibaiHistoryMaxChars) || DEFAULT_SCENEWORLD_SETTINGS.baibaiHistoryMaxChars))),
    };
}

export function updateSceneWorldSettings(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return getSceneWorldSettings();
    const current = getSceneWorldSettings();
    const next = {
        ...current,
        simulationWorldBookSelection: { ...current.simulationWorldBookSelection },
        observationWorldBookSelection: { ...current.observationWorldBookSelection },
    };
    for (const key of ['includeCharacterDescription', 'contentFallbackToWholeMessage', 'simulationUseBaiBaiBook', 'observationUseBaiBaiBook']) {
        if (key in patch) next[key] = patch[key] === true;
    }
    for (const [key, min, max] of [
        ['characterDescriptionMaxChars', 1000, 10000],
        ['simulationWorldInfoMaxChars', 2000, 32000],
        ['observationWorldInfoMaxChars', 2000, 32000],
        ['baibaiHistoryMaxChars', 2000, 20000],
    ]) {
        if (key in patch && Number.isFinite(Number(patch[key]))) next[key] = Math.max(min, Math.min(max, Math.trunc(Number(patch[key]))));
    }
    if ('initialSettlementMode' in patch) {
        next.initialSettlementMode = String(patch.initialSettlementMode ?? '').trim().toLowerCase() === 'from_floor' ? 'from_floor' : 'latest';
    }
    if ('initialStartFloor' in patch && Number.isFinite(Number(patch.initialStartFloor))) {
        next.initialStartFloor = Math.max(0, Math.trunc(Number(patch.initialStartFloor)));
    }

    const normalizeIncomingSelection = value => {
        const normalized = {};
        if (!value || typeof value !== 'object' || Array.isArray(value)) return normalized;
        for (const [name, enabled] of Object.entries(value)) {
            const key = String(name ?? '').trim();
            if (!key) continue;
            normalized[key] = enabled !== false;
        }
        return normalized;
    };
    if ('simulationWorldBookSelection' in patch) {
        next.simulationWorldBookSelection = normalizeIncomingSelection(patch.simulationWorldBookSelection);
    }
    if ('observationWorldBookSelection' in patch) {
        next.observationWorldBookSelection = normalizeIncomingSelection(patch.observationWorldBookSelection);
    }
    if ('worldBookName' in patch) {
        const name = String(patch.worldBookName ?? '').trim();
        const purpose = String(patch.worldBookPurpose ?? '').trim().toLowerCase() === 'observation' ? 'observation' : 'simulation';
        if (name) {
            const key = purpose === 'observation' ? 'observationWorldBookSelection' : 'simulationWorldBookSelection';
            next[key][name] = patch.worldBookEnabled !== false;
        }
    }
    if ('contentTags' in patch) {
        const tags = normalizeContentTags(patch.contentTags);
        next.contentTags = tags.length ? tags : ['content'];
    }

    // 清理已经废弃的旧设置，避免后续误以为仍参与逻辑。
    delete next.includeCharacterBase;
    delete next.includeCharacterWorldInfo;
    delete next.includeChatWorldInfo;
    delete next.includeGlobalWorldInfo;
    delete next.characterBaseMaxChars;
    delete next.worldBookSelection;
    delete next.worldInfoMaxChars;
    delete next.useBaiBaiBook;

    extension_settings.sceneworld = next;
    saveSettingsDebounced?.();
    return {
        ...next,
        contentTags: [...next.contentTags],
        simulationWorldBookSelection: { ...next.simulationWorldBookSelection },
        observationWorldBookSelection: { ...next.observationWorldBookSelection },
    };
}

export function getContextSafe() {
    try {
        return getContext?.() ?? globalThis.SillyTavern?.getContext?.() ?? null;
    } catch (error) {
        console.warn('[SceneWorld] unable to read SillyTavern context', error);
        return null;
    }
}

export function getCurrentChatMetadata() {
    return getContextSafe()?.chatMetadata ?? null;
}

export function getCurrentChatMessages() {
    const chat = getContextSafe()?.chat;
    return Array.isArray(chat) ? chat : [];
}

export function getCurrentChatId() {
    const context = getContextSafe();
    try {
        return context?.chatId ?? context?.getCurrentChatId?.() ?? null;
    } catch {
        return context?.chatId ?? null;
    }
}

export function hasActiveChat() {
    const context = getContextSafe();
    if (!context || !context.chatMetadata) return false;
    return Boolean(
        getCurrentChatId()
        || context.groupId
        || (context.characterId !== null && context.characterId !== undefined && Number(context.characterId) >= 0)
    );
}

export async function saveCurrentChatMetadata() {
    const context = getContextSafe();
    if (!context) throw new Error('无法获取 SillyTavern 当前聊天上下文');
    if (typeof context.saveMetadata === 'function') {
        await context.saveMetadata();
        return;
    }
    if (typeof context.saveMetadataDebounced === 'function') {
        context.saveMetadataDebounced();
        return;
    }
    throw new Error('当前 SillyTavern 版本未提供聊天元数据保存接口');
}

export function getSceneWorldEventApi() {
    const context = getContextSafe();
    return {
        source: context?.eventSource ?? null,
        types: context?.eventTypes ?? context?.event_types ?? null,
    };
}

export async function generateWithCurrentConnection(messages, { responseLength = 1800 } = {}) {
    if (!Array.isArray(messages) || messages.length === 0) throw new Error('生成请求没有可用提示词');
    const result = await generateRaw({
        prompt: messages,
        responseLength,
        trimNames: false,
    });
    const text = String(result ?? '').trim();
    if (!text) throw new Error('模型没有返回内容，请检查 SillyTavern 当前连接与模型设置');
    return text;
}

export function notify(message, level = 'info') {
    const toastr = globalThis.toastr;
    if (toastr && typeof toastr[level] === 'function') {
        toastr[level](String(message));
        return;
    }
    const fn = level === 'error' ? console.error : level === 'warning' ? console.warn : console.info;
    fn(`[SceneWorld] ${message}`);
}

export function putTextIntoChatInput(text) {
    const value = String(text ?? '').trim();
    if (!value) throw new Error('没有可写入酒馆输入框的文本');
    const target = document.querySelector('#send_textarea')
        || document.querySelector('textarea[name="send_textarea"]')
        || document.querySelector('textarea');
    if (!target || !(target instanceof HTMLTextAreaElement)) {
        throw new Error('没有找到 SillyTavern 聊天输入框');
    }
    const existing = String(target.value ?? '').trim();
    if (existing && existing !== value && !confirm('SillyTavern 输入框里已经有内容。要用这条建议替换现有内容吗？')) {
        return false;
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (setter) setter.call(target, value);
    else target.value = value;
    target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    target.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    target.focus();
    try { target.setSelectionRange(value.length, value.length); } catch { /* ignore */ }
    return true;
}
