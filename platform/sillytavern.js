import { getContext, extension_settings } from '../../../../extensions.js';
import { generateRaw, saveSettingsDebounced } from '../../../../../script.js';
export const DEFAULT_SCENEWORLD_SETTINGS = Object.freeze({
    // 世界观参考：只额外提供当前角色的“角色描述（Description）”。
    includeCharacterDescription: true,
    characterDescriptionMaxChars: 5000,
    // 世界书采用“当前聊天正在使用的世界书 + 用户逐本勾选”的白名单方式。
    // 未出现过的世界书默认允许；用户取消勾选后会在这里留下 false 覆盖值。
    worldBookSelection: Object.freeze({}),
    worldInfoMaxChars: 16000,
    // Only text inside these complete assistant-message tags is treated as narrative canon.
    // This intentionally excludes status panels, chain-of-thought blocks, action menus and mini-theaters outside the body tag.
    contentTags: Object.freeze(['content']),
    contentFallbackToWholeMessage: false,
    // 可选读取柏宝书公开只读接口提供的压缩长期历史。默认关闭，避免用户未确认就增加上下文。
    useBaiBaiBook: false,
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
    const rawSelection = merged.worldBookSelection && typeof merged.worldBookSelection === 'object' && !Array.isArray(merged.worldBookSelection)
        ? merged.worldBookSelection
        : {};
    const worldBookSelection = {};
    for (const [name, enabled] of Object.entries(rawSelection)) {
        const key = String(name ?? '').trim();
        if (!key) continue;
        worldBookSelection[key] = enabled !== false;
    }
    // alpha.11 以前叫 includeCharacterBase；升级后只保留角色描述，不再发送性格/场景字段。
    const includeCharacterDescription = 'includeCharacterDescription' in source
        ? source.includeCharacterDescription !== false
        : source.includeCharacterBase !== false;
    const characterDescriptionMaxChars = Number.isFinite(Number(source.characterDescriptionMaxChars))
        ? Math.max(1000, Math.min(10000, Math.trunc(Number(source.characterDescriptionMaxChars))))
        : Math.max(1000, Math.min(10000, Math.trunc(Number(source.characterBaseMaxChars) || DEFAULT_SCENEWORLD_SETTINGS.characterDescriptionMaxChars)));
    return {
        ...merged,
        includeCharacterDescription,
        characterDescriptionMaxChars,
        worldBookSelection,
        worldInfoMaxChars: Math.max(2000, Math.min(32000, Math.trunc(Number(merged.worldInfoMaxChars) || DEFAULT_SCENEWORLD_SETTINGS.worldInfoMaxChars))),
        contentTags: contentTags.length ? contentTags : ['content'],
        contentFallbackToWholeMessage: merged.contentFallbackToWholeMessage === true,
        useBaiBaiBook: merged.useBaiBaiBook === true,
        baibaiHistoryMaxChars: Math.max(2000, Math.min(20000, Math.trunc(Number(merged.baibaiHistoryMaxChars) || DEFAULT_SCENEWORLD_SETTINGS.baibaiHistoryMaxChars))),
    };
}

export function updateSceneWorldSettings(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return getSceneWorldSettings();
    const current = getSceneWorldSettings();
    const next = { ...current, worldBookSelection: { ...current.worldBookSelection } };
    for (const key of ['includeCharacterDescription', 'contentFallbackToWholeMessage', 'useBaiBaiBook']) {
        if (key in patch) next[key] = patch[key] === true;
    }
    for (const [key, min, max] of [['characterDescriptionMaxChars', 1000, 10000], ['worldInfoMaxChars', 2000, 32000], ['baibaiHistoryMaxChars', 2000, 20000]]) {
        if (key in patch && Number.isFinite(Number(patch[key]))) next[key] = Math.max(min, Math.min(max, Math.trunc(Number(patch[key]))));
    }
    if ('worldBookSelection' in patch && patch.worldBookSelection && typeof patch.worldBookSelection === 'object' && !Array.isArray(patch.worldBookSelection)) {
        const normalizedSelection = {};
        for (const [name, enabled] of Object.entries(patch.worldBookSelection)) {
            const key = String(name ?? '').trim();
            if (!key) continue;
            normalizedSelection[key] = enabled !== false;
        }
        next.worldBookSelection = normalizedSelection;
    }
    if ('worldBookName' in patch) {
        const name = String(patch.worldBookName ?? '').trim();
        if (name) next.worldBookSelection[name] = patch.worldBookEnabled !== false;
    }
    if ('contentTags' in patch) {
        const tags = normalizeContentTags(patch.contentTags);
        next.contentTags = tags.length ? tags : ['content'];
    }
    // 清理旧版四开关，防止后续误以为它们仍参与世界书选择。
    delete next.includeCharacterBase;
    delete next.includeCharacterWorldInfo;
    delete next.includeChatWorldInfo;
    delete next.includeGlobalWorldInfo;
    delete next.characterBaseMaxChars;
    extension_settings.sceneworld = next;
    saveSettingsDebounced?.();
    return { ...next, contentTags: [...next.contentTags], worldBookSelection: { ...next.worldBookSelection } };
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
