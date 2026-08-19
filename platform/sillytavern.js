import { getContext, extension_settings } from '../../../../extensions.js';
import { generateRaw, saveSettingsDebounced } from '../../../../../script.js';
import { parseCustomApiCompletion } from './custom-api-response.js';

export const DEFAULT_SCENEWORLD_SETTINGS = Object.freeze({
    includeCharacterDescription: true,
    characterDescriptionMaxChars: 5000,
    simulationWorldEntrySelection: Object.freeze({}),
    observationWorldEntrySelection: Object.freeze({}),
    simulationWorldInfoMaxChars: 16000,
    observationWorldInfoMaxChars: 16000,
    contentTags: Object.freeze(['content']),
    contentFallbackToWholeMessage: false,
    initialSettlementMode: 'latest',
    initialStartFloor: 0,
    maxPendingAssistantMessages: 10,
    simulationUseBaiBaiBook: false,
    observationUseBaiBaiBook: false,
    baibaiHistoryMaxChars: 8000,

    // alpha.30 起，100% 就是 alpha.29 用户看到约 115% 时的实际字号。
    // 独立于 SillyTavern 全局字号，范围 80%～130%。
    uiScalePercent: 100,
    uiFontUrl: '',
    uiFontFamily: '',
    glassEffect: 'off', // off | soft | strong

    modelConnectionMode: 'tavern', // tavern | custom
    customApiUrl: '',
    customApiKey: '',
    customApiModel: '',
    customApiTimeoutSec: 180,
    // API 配置库：命名快照。载入只填回表单，用户点击“保存模型设置”后才真正生效。
    apiPresets: Object.freeze([]),
    apiPresetActiveId: '',
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
    const source = Array.isArray(value) ? value : String(value ?? '').split(/[\n,，;；]+/g);
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

function normalizeEntrySelection(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const result = {};
    for (const [id, enabled] of Object.entries(source)) {
        const key = String(id ?? '').trim();
        if (key) result[key] = enabled === true;
    }
    return result;
}

function clampStep(value, min, max, step = 1, fallback = min) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, Math.round(number / step) * step));
}

function makePresetId(seed = '') {
    const source = `${Date.now()}|${Math.random()}|${seed}`;
    let hash = 2166136261;
    for (let i = 0; i < source.length; i += 1) {
        hash ^= source.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return `api_${(hash >>> 0).toString(36)}_${Date.now().toString(36)}`;
}

function normalizeApiPresets(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const result = [];
    for (const raw of value) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const name = String(raw.name ?? '').trim().slice(0, 80);
        const url = String(raw.url ?? raw.apiUrl ?? '').trim();
        const key = String(raw.key ?? raw.apiKey ?? '');
        const model = String(raw.model ?? raw.apiModel ?? '').trim();
        if (!name || !url) continue;
        let id = String(raw.id ?? '').trim();
        if (!id || seen.has(id)) id = makePresetId(name);
        seen.add(id);
        result.push({
            id,
            name,
            url,
            key,
            model,
            timeoutSec: Math.max(30, Math.min(600, Math.trunc(Number(raw.timeoutSec ?? raw.timeout) || 180))),
        });
        if (result.length >= 24) break;
    }
    return result;
}

export function getSceneWorldSettings() {
    const raw = extension_settings?.sceneworld;
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const merged = { ...DEFAULT_SCENEWORLD_SETTINGS, ...source };
    const contentTags = normalizeContentTags(merged.contentTags);

    const includeCharacterDescription = 'includeCharacterDescription' in source
        ? source.includeCharacterDescription !== false
        : source.includeCharacterBase !== false;
    const characterDescriptionMaxChars = Number.isFinite(Number(source.characterDescriptionMaxChars))
        ? Math.max(1000, Math.min(10000, Math.trunc(Number(source.characterDescriptionMaxChars))))
        : Math.max(1000, Math.min(10000, Math.trunc(Number(source.characterBaseMaxChars) || DEFAULT_SCENEWORLD_SETTINGS.characterDescriptionMaxChars)));
    const initialSettlementMode = String(merged.initialSettlementMode ?? '').trim().toLowerCase() === 'from_floor' ? 'from_floor' : 'latest';
    const initialStartFloor = Number.isFinite(Number(merged.initialStartFloor)) ? Math.max(0, Math.trunc(Number(merged.initialStartFloor))) : 0;
    const maxPendingAssistantMessages = Number(merged.maxPendingAssistantMessages) === 5 ? 5 : 10;

    const legacyWorldInfoMaxChars = Number(source.worldInfoMaxChars);
    const simulationWorldInfoMaxChars = Math.max(2000, Math.min(32000, Math.trunc(Number(merged.simulationWorldInfoMaxChars) || legacyWorldInfoMaxChars || DEFAULT_SCENEWORLD_SETTINGS.simulationWorldInfoMaxChars)));
    const observationWorldInfoMaxChars = Math.max(2000, Math.min(32000, Math.trunc(Number(merged.observationWorldInfoMaxChars) || legacyWorldInfoMaxChars || DEFAULT_SCENEWORLD_SETTINGS.observationWorldInfoMaxChars)));

    const simulationUseBaiBaiBook = 'simulationUseBaiBaiBook' in source ? source.simulationUseBaiBaiBook === true : source.useBaiBaiBook === true;
    const observationUseBaiBaiBook = 'observationUseBaiBaiBook' in source ? source.observationUseBaiBaiBook === true : false;

    // 旧 uiFontScale 的“115%”在 alpha.30 中映射为新的“100%”，实际视觉大小保持不变。
    let uiScalePercent = DEFAULT_SCENEWORLD_SETTINGS.uiScalePercent;
    if (Number.isFinite(Number(source.uiScalePercent))) {
        uiScalePercent = clampStep(source.uiScalePercent, 80, 130, 5, 100);
    } else if (Number.isFinite(Number(source.uiFontScale))) {
        uiScalePercent = clampStep(Number(source.uiFontScale) - 15, 80, 130, 5, 100);
    } else if (Number.isFinite(Number(source.uiFontAdjust))) {
        const legacy = Math.max(-1, Math.min(2, Math.trunc(Number(source.uiFontAdjust))));
        const legacyScale = ({ '-1': 90, '0': 100, '1': 110, '2': 120 })[String(legacy)] || 115;
        uiScalePercent = clampStep(legacyScale - 15, 80, 130, 5, 100);
    }

    const apiPresets = normalizeApiPresets(source.apiPresets);
    const activeId = String(source.apiPresetActiveId ?? '').trim();

    return {
        ...merged,
        includeCharacterDescription,
        characterDescriptionMaxChars,
        simulationWorldEntrySelection: normalizeEntrySelection(source.simulationWorldEntrySelection),
        observationWorldEntrySelection: normalizeEntrySelection(source.observationWorldEntrySelection),
        simulationWorldInfoMaxChars,
        observationWorldInfoMaxChars,
        contentTags: contentTags.length ? contentTags : ['content'],
        contentFallbackToWholeMessage: merged.contentFallbackToWholeMessage === true,
        initialSettlementMode,
        initialStartFloor,
        maxPendingAssistantMessages,
        simulationUseBaiBaiBook,
        observationUseBaiBaiBook,
        baibaiHistoryMaxChars: Math.max(2000, Math.min(20000, Math.trunc(Number(merged.baibaiHistoryMaxChars) || DEFAULT_SCENEWORLD_SETTINGS.baibaiHistoryMaxChars))),
        uiScalePercent,
        uiFontUrl: String(source.uiFontUrl ?? '').trim(),
        uiFontFamily: String(source.uiFontFamily ?? '').trim(),
        glassEffect: ['soft', 'strong'].includes(String(source.glassEffect ?? '').toLowerCase()) ? String(source.glassEffect).toLowerCase() : 'off',
        modelConnectionMode: String(merged.modelConnectionMode || '').toLowerCase() === 'custom' ? 'custom' : 'tavern',
        customApiUrl: String(merged.customApiUrl || '').trim(),
        customApiKey: String(merged.customApiKey || ''),
        customApiModel: String(merged.customApiModel || '').trim(),
        customApiTimeoutSec: Math.max(30, Math.min(600, Math.trunc(Number(merged.customApiTimeoutSec) || DEFAULT_SCENEWORLD_SETTINGS.customApiTimeoutSec))),
        apiPresets,
        apiPresetActiveId: apiPresets.some(item => item.id === activeId) ? activeId : '',
    };
}

export function updateSceneWorldSettings(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return getSceneWorldSettings();
    const current = getSceneWorldSettings();
    const next = {
        ...current,
        simulationWorldEntrySelection: { ...current.simulationWorldEntrySelection },
        observationWorldEntrySelection: { ...current.observationWorldEntrySelection },
        apiPresets: current.apiPresets.map(item => ({ ...item })),
    };

    for (const key of ['includeCharacterDescription', 'contentFallbackToWholeMessage', 'simulationUseBaiBaiBook', 'observationUseBaiBaiBook']) {
        if (key in patch) next[key] = patch[key] === true;
    }
    for (const [key, min, max] of [
        ['characterDescriptionMaxChars', 1000, 10000],
        ['simulationWorldInfoMaxChars', 2000, 32000],
        ['observationWorldInfoMaxChars', 2000, 32000],
        ['baibaiHistoryMaxChars', 2000, 20000],
        ['customApiTimeoutSec', 30, 600],
    ]) {
        if (key in patch && Number.isFinite(Number(patch[key]))) next[key] = Math.max(min, Math.min(max, Math.trunc(Number(patch[key]))));
    }
    if ('maxPendingAssistantMessages' in patch) next.maxPendingAssistantMessages = Number(patch.maxPendingAssistantMessages) === 5 ? 5 : 10;
    if ('uiScalePercent' in patch && Number.isFinite(Number(patch.uiScalePercent))) next.uiScalePercent = clampStep(patch.uiScalePercent, 80, 130, 5, 100);
    if ('initialSettlementMode' in patch) next.initialSettlementMode = String(patch.initialSettlementMode ?? '').trim().toLowerCase() === 'from_floor' ? 'from_floor' : 'latest';
    if ('initialStartFloor' in patch && Number.isFinite(Number(patch.initialStartFloor))) next.initialStartFloor = Math.max(0, Math.trunc(Number(patch.initialStartFloor)));
    if ('modelConnectionMode' in patch) next.modelConnectionMode = String(patch.modelConnectionMode || '').toLowerCase() === 'custom' ? 'custom' : 'tavern';
    for (const key of ['customApiUrl', 'customApiKey', 'customApiModel', 'uiFontUrl', 'uiFontFamily']) {
        if (key in patch) next[key] = String(patch[key] ?? '').trim();
    }
    if ('glassEffect' in patch) next.glassEffect = ['soft', 'strong'].includes(String(patch.glassEffect ?? '').toLowerCase()) ? String(patch.glassEffect).toLowerCase() : 'off';

    if ('apiPresets' in patch) next.apiPresets = normalizeApiPresets(patch.apiPresets);
    if ('apiPresetActiveId' in patch) {
        const id = String(patch.apiPresetActiveId ?? '').trim();
        next.apiPresetActiveId = next.apiPresets.some(item => item.id === id) ? id : '';
    }

    const normalizeIncomingSelection = value => normalizeEntrySelection(value);
    if ('simulationWorldEntrySelection' in patch) next.simulationWorldEntrySelection = normalizeIncomingSelection(patch.simulationWorldEntrySelection);
    if ('observationWorldEntrySelection' in patch) next.observationWorldEntrySelection = normalizeIncomingSelection(patch.observationWorldEntrySelection);
    if ('worldEntryId' in patch) {
        const id = String(patch.worldEntryId ?? '').trim();
        const purpose = String(patch.worldEntryPurpose ?? '').trim().toLowerCase() === 'observation' ? 'observation' : 'simulation';
        if (id) next[purpose === 'observation' ? 'observationWorldEntrySelection' : 'simulationWorldEntrySelection'][id] = patch.worldEntryEnabled === true;
    }
    if ('worldEntryIds' in patch && Array.isArray(patch.worldEntryIds)) {
        const purpose = String(patch.worldEntryPurpose ?? '').trim().toLowerCase() === 'observation' ? 'observation' : 'simulation';
        const key = purpose === 'observation' ? 'observationWorldEntrySelection' : 'simulationWorldEntrySelection';
        const enabled = patch.worldEntryEnabled === true;
        for (const rawId of patch.worldEntryIds) {
            const id = String(rawId ?? '').trim();
            if (id) next[key][id] = enabled;
        }
    }
    if ('contentTags' in patch) {
        const tags = normalizeContentTags(patch.contentTags);
        next.contentTags = tags.length ? tags : ['content'];
    }

    // 清理旧字段，避免新旧字号语义并存。
    for (const key of [
        'includeCharacterBase', 'includeCharacterWorldInfo', 'includeChatWorldInfo', 'includeGlobalWorldInfo',
        'characterBaseMaxChars', 'worldBookSelection', 'simulationWorldBookSelection', 'observationWorldBookSelection',
        'worldInfoMaxChars', 'useBaiBaiBook', 'uiFontAdjust', 'uiFontScale',
    ]) delete next[key];

    extension_settings.sceneworld = next;
    saveSettingsDebounced?.();
    return {
        ...next,
        contentTags: [...next.contentTags],
        simulationWorldEntrySelection: { ...next.simulationWorldEntrySelection },
        observationWorldEntrySelection: { ...next.observationWorldEntrySelection },
        apiPresets: next.apiPresets.map(item => ({ ...item })),
    };
}

export function createApiPresetSnapshot({ name, url, key, model, timeoutSec = 180, id = '' } = {}) {
    const presetName = String(name ?? '').trim().slice(0, 80);
    const apiUrl = String(url ?? '').trim();
    if (!presetName) throw new Error('API 配置名称不能为空');
    if (!apiUrl) throw new Error('API 地址不能为空');
    return {
        id: String(id ?? '').trim() || makePresetId(presetName),
        name: presetName,
        url: apiUrl,
        key: String(key ?? ''),
        model: String(model ?? '').trim(),
        timeoutSec: Math.max(30, Math.min(600, Math.trunc(Number(timeoutSec) || 180))),
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

function normalizeCustomApiUrl(value) {
    const raw = String(value ?? '').trim().replace(/\/+$/, '');
    if (!raw) return '';
    if (/\/chat\/completions$/i.test(raw)) return raw.replace(/\/chat\/completions$/i, '');
    if (/^https?:\/\/[^/?#]+$/i.test(raw)) return `${raw}/v1`;
    return raw;
}

function mapCustomApiError(status, raw) {
    const text = String(raw ?? '').trim();
    if (status === 400) return `请求参数不兼容（400）：${text.slice(0, 140) || '请检查模型名称或接口兼容性'}`;
    if (status === 401 || status === 403) return 'API Key 无效或当前 Key 没有权限（401/403）';
    if (status === 404) return '接口地址不正确（404）。请检查 Base URL，通常应填写到 /v1';
    if (status === 429) return '接口触发限流（429），请稍后再试';
    if (status >= 500) return `上游服务暂时异常（${status}），请稍后再试`;
    return text ? `HTTP ${status}: ${text.slice(0, 160)}` : `HTTP ${status}`;
}

async function generateWithCustomApi(messages, { responseLength = 1800 } = {}) {
    if (!Array.isArray(messages) || messages.length === 0) throw new Error('生成请求没有可用提示词');
    const settings = getSceneWorldSettings();
    const url = normalizeCustomApiUrl(settings.customApiUrl);
    const key = String(settings.customApiKey || '').trim();
    const model = String(settings.customApiModel || '').trim();
    if (!url || !key || !model) throw new Error('自定义 API 尚未配置完整，请在“设置 → 模型”填写地址、Key 和模型名称');
    const context = getContextSafe();
    if (!context?.getRequestHeaders) throw new Error('当前 SillyTavern 版本未提供代理请求头接口');
    const controller = new AbortController();
    const timeoutSec = Math.max(30, Math.min(600, Number(settings.customApiTimeoutSec) || 180));
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutSec * 1000);
    try {
        const body = {
            chat_completion_source: 'openai',
            reverse_proxy: url,
            proxy_password: key,
            model,
            messages,
            stream: false,
            max_tokens: Math.max(256, Math.min(32000, Math.trunc(Number(responseLength) || 1800))),
        };
        const res = await fetch('/api/backends/chat-completions/generate', {
            method: 'POST',
            headers: context.getRequestHeaders(),
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        if (!res.ok) {
            const raw = await res.text().catch(() => '');
            throw new Error(mapCustomApiError(res.status, raw));
        }
        const data = await res.json();
        return parseCustomApiCompletion(data).content;
    } catch (error) {
        if (timedOut) throw new Error(`自定义 API 请求超时（超过 ${timeoutSec} 秒）`);
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

export async function generateSceneWorldText(messages, options = {}) {
    const settings = getSceneWorldSettings();
    if (settings.modelConnectionMode === 'custom') {
        return generateWithCustomApi(messages, options);
    }
    return generateWithCurrentConnection(messages, options);
}

export async function fetchCustomApiModels({ url, key } = {}) {
    const base = normalizeCustomApiUrl(url);
    const apiKey = String(key ?? '').trim();
    if (!base || !apiKey) throw new Error('请先填写 API 地址和 Key');
    const context = getContextSafe();
    if (!context?.getRequestHeaders) throw new Error('当前 SillyTavern 版本未提供模型列表代理接口');
    const res = await fetch('/api/backends/chat-completions/status', {
        method: 'POST',
        headers: context.getRequestHeaders(),
        body: JSON.stringify({
            chat_completion_source: 'openai',
            reverse_proxy: base,
            proxy_password: apiKey,
        }),
    });
    if (!res.ok) {
        const raw = await res.text().catch(() => '');
        throw new Error(mapCustomApiError(res.status, raw));
    }
    const data = await res.json();
    if (data?.error) throw new Error(String(data.error?.message || data.error));
    const models = (data?.data || data?.models || [])
        .map(item => typeof item === 'string' ? item : item?.id)
        .map(item => String(item ?? '').trim())
        .filter(Boolean);
    return [...new Set(models)].sort((a, b) => a.localeCompare(b));
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

function resolveChatInput() {
    const target = document.querySelector('#send_textarea')
        || document.querySelector('textarea[name="send_textarea"]')
        || document.querySelector('textarea');
    if (!target || !(target instanceof HTMLTextAreaElement)) {
        throw new Error('没有找到 SillyTavern 聊天输入框');
    }
    return target;
}

export function getChatInputText() {
    return String(resolveChatInput().value ?? '');
}

export function putTextIntoChatInput(text, { overwrite = false } = {}) {
    const value = String(text ?? '').trim();
    if (!value) throw new Error('没有可写入酒馆输入框的文本');
    const target = resolveChatInput();
    const existing = String(target.value ?? '').trim();
    if (existing && existing !== value && !overwrite) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (setter) setter.call(target, value);
    else target.value = value;
    target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    target.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    target.focus();
    try { target.setSelectionRange(value.length, value.length); } catch { /* ignore */ }
    return true;
}
