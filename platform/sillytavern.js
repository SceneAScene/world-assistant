import { getContext, extension_settings } from '../../../../extensions.js';
import { generateRaw, saveSettingsDebounced } from '../../../../../script.js';
export const DEFAULT_SCENEWORLD_SETTINGS = Object.freeze({
    includeCharacterBase: true,
    includeCharacterWorldInfo: true,
    includeChatWorldInfo: true,
    includeGlobalWorldInfo: false,
    characterBaseMaxChars: 5000,
    worldInfoMaxChars: 12000,
});

export function getSceneWorldSettings() {
    const raw = extension_settings?.sceneworld;
    return {
        ...DEFAULT_SCENEWORLD_SETTINGS,
        ...(raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}),
    };
}

export function updateSceneWorldSettings(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return getSceneWorldSettings();
    const current = getSceneWorldSettings();
    const next = { ...current };
    for (const key of ['includeCharacterBase', 'includeCharacterWorldInfo', 'includeChatWorldInfo', 'includeGlobalWorldInfo']) {
        if (key in patch) next[key] = patch[key] === true;
    }
    for (const [key, min, max] of [['characterBaseMaxChars', 1000, 10000], ['worldInfoMaxChars', 1000, 24000]]) {
        if (key in patch && Number.isFinite(Number(patch[key]))) next[key] = Math.max(min, Math.min(max, Math.trunc(Number(patch[key]))));
    }
    extension_settings.sceneworld = next;
    saveSettingsDebounced?.();
    return { ...next };
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
