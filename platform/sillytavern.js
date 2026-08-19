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

    modelConnectionMode: 'tavern', // tavern | custom
    customApiUrl: '',
    customApiKey: '',
    customApiModel: '',
    customApiTimeoutSec: 180,

    // 最大输出只控制模型回复长度，不限制输入正文。
    modelMaxOutputTokens: 8000,

    // API 配置库只保存地址、Key 与模型，便于快速切换来源。
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
        result.push({ id, name, url, key, model });
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

    const normalized = {
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
        modelConnectionMode: String(merged.modelConnectionMode || '').toLowerCase() === 'custom' ? 'custom' : 'tavern',
        customApiUrl: String(merged.customApiUrl || '').trim(),
        customApiKey: String(merged.customApiKey || ''),
        customApiModel: String(merged.customApiModel || '').trim(),
        customApiTimeoutSec: Math.max(30, Math.min(600, Math.trunc(Number(merged.customApiTimeoutSec) || DEFAULT_SCENEWORLD_SETTINGS.customApiTimeoutSec))),
        modelMaxOutputTokens: Math.max(1024, Math.min(65536, Math.trunc(Number(merged.modelMaxOutputTokens) || DEFAULT_SCENEWORLD_SETTINGS.modelMaxOutputTokens))),
        apiPresets,
        apiPresetActiveId: apiPresets.some(item => item.id === activeId) ? activeId : '',
    };
    delete normalized.uiFontUrl;
    delete normalized.uiFontFamily;
    return normalized;
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
        ['modelMaxOutputTokens', 1024, 65536],
    ]) {
        if (key in patch && Number.isFinite(Number(patch[key]))) next[key] = Math.max(min, Math.min(max, Math.trunc(Number(patch[key]))));
    }
    if ('maxPendingAssistantMessages' in patch) next.maxPendingAssistantMessages = Number(patch.maxPendingAssistantMessages) === 5 ? 5 : 10;
    if ('uiScalePercent' in patch && Number.isFinite(Number(patch.uiScalePercent))) next.uiScalePercent = clampStep(patch.uiScalePercent, 80, 130, 5, 100);
    if ('initialSettlementMode' in patch) next.initialSettlementMode = String(patch.initialSettlementMode ?? '').trim().toLowerCase() === 'from_floor' ? 'from_floor' : 'latest';
    if ('initialStartFloor' in patch && Number.isFinite(Number(patch.initialStartFloor))) next.initialStartFloor = Math.max(0, Math.trunc(Number(patch.initialStartFloor)));
    if ('modelConnectionMode' in patch) next.modelConnectionMode = String(patch.modelConnectionMode || '').toLowerCase() === 'custom' ? 'custom' : 'tavern';
    for (const key of ['customApiUrl', 'customApiKey', 'customApiModel']) {
        if (key in patch) next[key] = String(patch[key] ?? '').trim();
    }

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
        'worldInfoMaxChars', 'useBaiBaiBook', 'uiFontAdjust', 'uiFontScale', 'uiFontUrl', 'uiFontFamily', 'glassEffect', 'modelContextMode', 'modelContextTokens',
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

export function createApiPresetSnapshot({
    name,
    url,
    key,
    model,
    id = '',
} = {}) {
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

export function getCurrentChatIdentity() {
    const context = getContextSafe();
    if (!context) return '';
    const chatId = getCurrentChatId();
    const groupId = context.groupId ?? '';
    const characterId = context.characterId ?? '';
    if (!chatId && !groupId && (characterId === '' || characterId === null || characterId === undefined)) return '';
    return JSON.stringify({
        chatId: String(chatId ?? ''),
        groupId: String(groupId ?? ''),
        characterId: String(characterId ?? ''),
    });
}

export function assertCurrentChatIdentity(expected) {
    const wanted = String(expected ?? '');
    const current = getCurrentChatIdentity();
    if (!wanted || !current || wanted !== current) {
        const error = new Error('任务执行期间当前聊天已经切换，本次结果未保存');
        error.code = 'SCENEWORLD_CHAT_CHANGED';
        throw error;
    }
    return current;
}

function throwIfTaskCancelled(signal) {
    if (!signal?.aborted) return;
    const error = new Error(String(signal.reason || '世界动态任务已取消'));
    error.name = 'SceneWorldTaskCancelledError';
    error.code = 'SCENEWORLD_TASK_CANCELLED';
    throw error;
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

function flattenPromptMessages(messages) {
    return (Array.isArray(messages) ? messages : []).map(message => {
        const role = String(message?.role ?? 'user');
        const content = Array.isArray(message?.content)
            ? message.content.map(part => typeof part === 'string' ? part : String(part?.text ?? '')).join('\n')
            : String(message?.content ?? '');
        return `${role}:\n${content}`;
    }).join('\n\n');
}

function fallbackTokenEstimate(text) {
    let cjk = 0;
    let ascii = 0;
    let other = 0;
    for (const ch of String(text ?? '')) {
        const code = ch.codePointAt(0) ?? 0;
        const isCjk = (code >= 0x3400 && code <= 0x9fff)
            || (code >= 0xf900 && code <= 0xfaff)
            || (code >= 0x3040 && code <= 0x30ff)
            || (code >= 0xac00 && code <= 0xd7af);
        if (isCjk) cjk += 1;
        else if (code <= 0x7f) ascii += /\s/.test(ch) ? 0.25 : 1;
        else other += 1;
    }
    return Math.max(1, Math.ceil(cjk * 1.08 + ascii / 3.4 + other * 0.9));
}

export async function estimateSceneWorldMessageTokens(messages) {
    const promptText = flattenPromptMessages(messages);
    const context = getContextSafe();
    const counter = context?.getTokenCountAsync;
    if (typeof counter === 'function') {
        try {
            const counted = Number(await counter(promptText, 0));
            if (Number.isFinite(counted) && counted > 0) {
                return {
                    tokens: Math.ceil(counted + Math.max(8, (Array.isArray(messages) ? messages.length : 0) * 4)),
                    method: 'tavern-tokenizer',
                };
            }
        } catch (error) {
            console.warn('[SceneWorld] SillyTavern token counter failed, using fallback estimate', error);
        }
    }
    return {
        tokens: fallbackTokenEstimate(promptText) + Math.max(8, (Array.isArray(messages) ? messages.length : 0) * 6),
        method: 'fallback-estimate',
    };
}

export function getSceneWorldContextLimit(settings = getSceneWorldSettings()) {
    // 自定义 API 的上下文窗口通常无法从通用模型列表可靠取得。
    // 未知时只做输入估算，不要求用户手动填写技术参数，也不阻断调用。
    if (settings.modelConnectionMode === 'custom') {
        return { tokens: null, source: 'unknown-custom' };
    }
    const context = getContextSafe();
    const current = Number(context?.maxContext);
    if (Number.isFinite(current) && current > 0) {
        return { tokens: Math.trunc(current), source: 'tavern' };
    }
    return { tokens: null, source: 'unknown' };
}

export async function inspectSceneWorldTokenBudget(messages) {
    const settings = getSceneWorldSettings();
    const estimate = await estimateSceneWorldMessageTokens(messages);
    const outputTokens = Math.max(1024, Math.min(65536, Math.trunc(Number(settings.modelMaxOutputTokens) || 8000)));
    const context = getSceneWorldContextLimit(settings);
    const totalTokens = estimate.tokens + outputTokens;
    // 自定义 API 的分词器可能与酒馆当前连接不同，因此使用更保守的 10% 余量。
    const safetyRatio = settings.modelConnectionMode === 'custom' ? 0.90 : 0.95;
    const safetyLimit = context.tokens ? Math.floor(context.tokens * safetyRatio) : null;
    let status = 'unknown';
    if (safetyLimit) {
        if (totalTokens > safetyLimit) status = 'blocked';
        else if (totalTokens > Math.floor(safetyLimit * 0.82)) status = 'near';
        else status = 'safe';
    }
    return Object.freeze({
        inputTokens: estimate.tokens,
        outputTokens,
        totalTokens,
        contextTokens: context.tokens,
        safetyLimit,
        status,
        canProceed: status !== 'blocked',
        tokenMethod: estimate.method,
        contextSource: context.source,
        safetyRatio,
    });
}

export async function generateWithCurrentConnection(messages, { responseLength = 1800, signal = null } = {}) {
    if (!Array.isArray(messages) || messages.length === 0) throw new Error('生成请求没有可用提示词');
    throwIfTaskCancelled(signal);
    const result = await generateRaw({
        prompt: messages,
        responseLength,
        trimNames: false,
    });
    // 当前酒馆连接返回后仍需检查任务状态，防止禁用/切换聊天后的旧结果落盘。
    throwIfTaskCancelled(signal);
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

async function generateWithCustomApi(messages, { responseLength = 1800, signal = null } = {}) {
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
    const abortFromTask = () => {
        try { controller.abort(signal?.reason || '世界动态任务已取消'); } catch {}
    };
    if (signal?.aborted) abortFromTask();
    else signal?.addEventListener?.('abort', abortFromTask, { once: true });
    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutSec * 1000);
    try {
        throwIfTaskCancelled(signal);
        const body = {
            chat_completion_source: 'openai',
            reverse_proxy: url,
            proxy_password: key,
            model,
            messages,
            stream: false,
            max_tokens: Math.max(256, Math.min(65536, Math.trunc(Number(responseLength) || 1800))),
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
        throwIfTaskCancelled(signal);
        return parseCustomApiCompletion(data).content;
    } catch (error) {
        if (timedOut) throw new Error(`自定义 API 请求超时（超过 ${timeoutSec} 秒）`);
        if (signal?.aborted) throwIfTaskCancelled(signal);
        throw error;
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener?.('abort', abortFromTask);
    }
}

export async function generateSceneWorldText(messages, options = {}) {
    const settings = getSceneWorldSettings();
    const resolved = {
        ...options,
        responseLength: Number.isFinite(Number(options.responseLength))
            ? Math.max(1024, Math.min(65536, Math.trunc(Number(options.responseLength))))
            : Math.max(1024, Math.min(65536, Math.trunc(Number(settings.modelMaxOutputTokens) || 8000))),
    };
    if (settings.modelConnectionMode === 'custom') {
        return generateWithCustomApi(messages, resolved);
    }
    return generateWithCurrentConnection(messages, resolved);
}

export async function fetchCustomApiModels({ url, key, signal = null } = {}) {
    const base = normalizeCustomApiUrl(url);
    const apiKey = String(key ?? '').trim();
    if (!base || !apiKey) throw new Error('请先填写 API 地址和 Key');
    const context = getContextSafe();
    if (!context?.getRequestHeaders) throw new Error('当前 SillyTavern 版本未提供模型列表代理接口');
    throwIfTaskCancelled(signal);
    const res = await fetch('/api/backends/chat-completions/status', {
        method: 'POST',
        headers: context.getRequestHeaders(),
        body: JSON.stringify({
            chat_completion_source: 'openai',
            reverse_proxy: base,
            proxy_password: apiKey,
        }),
        signal: signal || undefined,
    });
    throwIfTaskCancelled(signal);
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
