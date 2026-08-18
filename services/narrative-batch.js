import { extractNarrativeContent, narrativeFilterSignature } from './narrative-content.js';

export const PENDING_CONTEXT_LIMITS = Object.freeze({
    // 每次世界推演最多处理 10 条 AI 正文，避免高楼层聊天首次启用时整段回灌。
    maxPendingAssistantMessages: 10,
    // 字符预算仍作为第二道保险；即使 10 条正文异常超长，也不会静默截断。
    maxPendingCharacters: 48000,
});

function cleanText(value) {
    return String(value ?? '').replace(/\r\n?/g, '\n').trim();
}

export function fingerprintText(text) {
    const source = cleanText(text);
    let hash = 2166136261;
    for (let i = 0; i < source.length; i += 1) {
        hash ^= source.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}-${source.length}`;
}

function isAssistantMessage(message) {
    if (!message || typeof message !== 'object') return false;
    if (message.is_system || message.is_user) return false;
    return cleanText(message.mes).length > 0;
}

function extractMessage(message, contentFilter) {
    if (!isAssistantMessage(message)) return null;
    const extracted = extractNarrativeContent(message.mes, contentFilter);
    return extracted.text ? extracted : null;
}

function normalizeAssistantMessage(message, id, contentFilter) {
    const extracted = extractNarrativeContent(message?.mes, contentFilter);
    const text = cleanText(extracted.text);
    if (!text) return null;
    return {
        id,
        role: 'assistant',
        name: cleanText(message?.name) || 'Assistant',
        text,
        fingerprint: fingerprintText(text),
        timestamp: message?.send_date ?? null,
        matchedTags: extracted.matchedTags,
        usedFallback: extracted.usedFallback,
    };
}

function rangeFingerprint(messages) {
    const material = messages.map(item => `${item.id}|assistant|${item.name}|${item.text}`).join('\n\n');
    return fingerprintText(material);
}

function normalizeInitialSettlement(options = {}) {
    const rawMode = cleanText(options?.initialSettlement?.mode).toLowerCase();
    const mode = rawMode === 'from_floor' ? 'from_floor' : 'latest';
    const rawFloor = Number(options?.initialSettlement?.startFloor);
    const startFloor = Number.isFinite(rawFloor) ? Math.max(0, Math.trunc(rawFloor)) : 0;
    return { mode, startFloor };
}

function countIgnoredAssistantMessages(chat, start, end, contentFilter) {
    let ignored = 0;
    for (let index = Math.max(0, start); index <= Math.min(end, chat.length - 1); index += 1) {
        const message = chat[index];
        if (!isAssistantMessage(message)) continue;
        if (!extractMessage(message, contentFilter)) ignored += 1;
    }
    return ignored;
}

function findNextNarrativeAssistant(chat, start, contentFilter) {
    for (let index = Math.max(0, start); index < chat.length; index += 1) {
        const normalized = normalizeAssistantMessage(chat[index], index, contentFilter);
        if (normalized) return normalized;
    }
    return null;
}

function findPreviousNarrativeAssistant(chat, before, contentFilter) {
    for (let index = Math.min(before - 1, chat.length - 1); index >= 0; index -= 1) {
        const normalized = normalizeAssistantMessage(chat[index], index, contentFilter);
        if (normalized) return normalized;
    }
    return null;
}

function collectForwardWindow(chat, scanStart, limit, contentFilter) {
    const pendingMessages = [];
    let characters = 0;
    let lastScannedId = Math.max(-1, scanStart - 1);

    for (let index = Math.max(0, scanStart); index < chat.length; index += 1) {
        lastScannedId = index;
        const normalized = normalizeAssistantMessage(chat[index], index, contentFilter);
        if (!normalized) continue;
        pendingMessages.push(normalized);
        characters += normalized.text.length;
        if (pendingMessages.length >= limit) break;
    }

    const endId = pendingMessages.length ? pendingMessages[pendingMessages.length - 1].id : null;
    const hasMoreAfterBatch = endId !== null
        ? Boolean(findNextNarrativeAssistant(chat, endId + 1, contentFilter))
        : false;

    return { pendingMessages, characters, endId, hasMoreAfterBatch, lastScannedId };
}

function collectLatestWindow(chat, limit, contentFilter) {
    const reversed = [];
    let characters = 0;
    for (let index = chat.length - 1; index >= 0 && reversed.length < limit; index -= 1) {
        const normalized = normalizeAssistantMessage(chat[index], index, contentFilter);
        if (!normalized) continue;
        reversed.push(normalized);
        characters += normalized.text.length;
    }
    const pendingMessages = reversed.reverse();
    const startId = pendingMessages.length ? pendingMessages[0].id : null;
    const endId = pendingMessages.length ? pendingMessages[pendingMessages.length - 1].id : null;
    const skippedOlderNarrative = startId !== null
        ? Boolean(findPreviousNarrativeAssistant(chat, startId, contentFilter))
        : false;
    return { pendingMessages, characters, startId, endId, skippedOlderNarrative };
}

function emptyBatch({
    lastProcessedAssistantMessageId = null,
    anchorChanged = false,
    anchorReason = '',
    contentFilterSignature = '',
    ignoredAssistantCount = 0,
    initialMode = 'latest',
    requestedStartFloor = 0,
} = {}) {
    return Object.freeze({
        hasPending: false,
        canSimulate: false,
        anchorChanged,
        anchorReason,
        lastProcessedAssistantMessageId,
        startId: null,
        endId: null,
        endFingerprint: '',
        rangeFingerprint: '',
        assistantCount: 0,
        ignoredAssistantCount,
        characters: 0,
        overBudget: false,
        limits: { ...PENDING_CONTEXT_LIMITS },
        contentFilterSignature,
        pendingMessages: [],
        isInitialBatch: lastProcessedAssistantMessageId === null,
        initialMode,
        requestedStartFloor,
        skippedOlderNarrative: false,
        hasMoreAfterBatch: false,
    });
}

export function buildPendingNarrativeBatchFromChat(chatInput, sync = {}, options = {}) {
    const chat = Array.isArray(chatInput) ? chatInput : [];
    const limits = { ...PENDING_CONTEXT_LIMITS, ...(options?.limits || {}) };
    const maxPendingAssistantMessages = Math.max(1, Math.min(50, Math.trunc(Number(limits.maxPendingAssistantMessages) || 10)));
    limits.maxPendingAssistantMessages = maxPendingAssistantMessages;
    const contentFilter = {
        tags: Array.isArray(options?.contentFilter?.tags) ? options.contentFilter.tags : ['content'],
        fallbackToWholeMessage: options?.contentFilter?.fallbackToWholeMessage === true,
    };
    const filterSignature = narrativeFilterSignature(contentFilter);
    const initialSettlement = normalizeInitialSettlement(options);
    const lastProcessedAssistantMessageId = Number.isInteger(sync?.lastProcessedAssistantMessageId)
        ? sync.lastProcessedAssistantMessageId
        : (Number.isInteger(sync?.lastProcessedMessageId) ? sync.lastProcessedMessageId : null);
    const lastProcessedAssistantFingerprint = cleanText(
        sync?.lastProcessedAssistantFingerprint ?? sync?.lastProcessedFingerprint,
    );
    const previousFilterSignature = cleanText(sync?.lastProcessedContentFilterSignature);

    if (lastProcessedAssistantMessageId !== null) {
        const anchor = chat[lastProcessedAssistantMessageId];
        if (!isAssistantMessage(anchor)) {
            return emptyBatch({
                lastProcessedAssistantMessageId,
                anchorChanged: true,
                anchorReason: '上次结算锚点已经不存在或不再是 AI 回复。可能发生了删除、回退或分支切换。',
                contentFilterSignature: filterSignature,
                initialMode: initialSettlement.mode,
                requestedStartFloor: initialSettlement.startFloor,
            });
        }
        const extractedAnchor = normalizeAssistantMessage(anchor, lastProcessedAssistantMessageId, contentFilter);
        if (!extractedAnchor) {
            if (previousFilterSignature && previousFilterSignature !== filterSignature) {
                return emptyBatch({
                    lastProcessedAssistantMessageId,
                    anchorChanged: true,
                    anchorReason: '正文标签设置已改变，而上次结算锚点在新标签规则下没有正文。请确认标签后再继续。',
                    contentFilterSignature: filterSignature,
                    initialMode: initialSettlement.mode,
                    requestedStartFloor: initialSettlement.startFloor,
                });
            }
        }
        if (lastProcessedAssistantFingerprint) {
            const extractedFingerprint = extractedAnchor?.fingerprint ?? '';
            const rawFingerprint = fingerprintText(anchor.mes);
            const matchesLegacyRaw = !previousFilterSignature && lastProcessedAssistantFingerprint === rawFingerprint;
            if (extractedFingerprint && lastProcessedAssistantFingerprint !== extractedFingerprint && !matchesLegacyRaw) {
                return emptyBatch({
                    lastProcessedAssistantMessageId,
                    anchorChanged: true,
                    anchorReason: '上次已结算的 AI 正文内容发生变化。为避免把旧分支状态和新正文混在一起，当前不会自动继续结算。',
                    contentFilterSignature: filterSignature,
                    initialMode: initialSettlement.mode,
                    requestedStartFloor: initialSettlement.startFloor,
                });
            }
        }
    }

    let pendingMessages = [];
    let characters = 0;
    let startId = null;
    let endId = null;
    let ignoredAssistantCount = 0;
    let skippedOlderNarrative = false;
    let hasMoreAfterBatch = false;
    const isInitialBatch = lastProcessedAssistantMessageId === null;

    if (lastProcessedAssistantMessageId !== null) {
        const scanStart = lastProcessedAssistantMessageId + 1;
        const window = collectForwardWindow(chat, scanStart, maxPendingAssistantMessages, contentFilter);
        pendingMessages = window.pendingMessages;
        characters = window.characters;
        startId = pendingMessages[0]?.id ?? null;
        endId = window.endId;
        hasMoreAfterBatch = window.hasMoreAfterBatch;
        if (endId !== null) ignoredAssistantCount = countIgnoredAssistantMessages(chat, scanStart, endId, contentFilter);
        else ignoredAssistantCount = countIgnoredAssistantMessages(chat, scanStart, chat.length - 1, contentFilter);
    } else if (initialSettlement.mode === 'from_floor') {
        const scanStart = initialSettlement.startFloor;
        const window = collectForwardWindow(chat, scanStart, maxPendingAssistantMessages, contentFilter);
        pendingMessages = window.pendingMessages;
        characters = window.characters;
        startId = pendingMessages[0]?.id ?? null;
        endId = window.endId;
        hasMoreAfterBatch = window.hasMoreAfterBatch;
        if (endId !== null) ignoredAssistantCount = countIgnoredAssistantMessages(chat, scanStart, endId, contentFilter);
        else ignoredAssistantCount = countIgnoredAssistantMessages(chat, scanStart, chat.length - 1, contentFilter);
    } else {
        const window = collectLatestWindow(chat, maxPendingAssistantMessages, contentFilter);
        pendingMessages = window.pendingMessages;
        characters = window.characters;
        startId = window.startId;
        endId = window.endId;
        skippedOlderNarrative = window.skippedOlderNarrative;
        if (startId !== null && endId !== null) ignoredAssistantCount = countIgnoredAssistantMessages(chat, startId, endId, contentFilter);
    }

    if (!pendingMessages.length || startId === null || endId === null) {
        return emptyBatch({
            lastProcessedAssistantMessageId,
            contentFilterSignature: filterSignature,
            ignoredAssistantCount,
            initialMode: initialSettlement.mode,
            requestedStartFloor: initialSettlement.startFloor,
        });
    }

    const endMessage = pendingMessages[pendingMessages.length - 1];
    const overBudget = characters > limits.maxPendingCharacters;

    return Object.freeze({
        hasPending: true,
        canSimulate: !overBudget,
        anchorChanged: false,
        anchorReason: '',
        lastProcessedAssistantMessageId,
        startId,
        endId,
        endFingerprint: endMessage?.fingerprint ?? '',
        rangeFingerprint: rangeFingerprint(pendingMessages),
        assistantCount: pendingMessages.length,
        ignoredAssistantCount,
        characters,
        overBudget,
        limits,
        contentFilterSignature: filterSignature,
        pendingMessages,
        isInitialBatch,
        initialMode: initialSettlement.mode,
        requestedStartFloor: initialSettlement.startFloor,
        skippedOlderNarrative,
        hasMoreAfterBatch,
    });
}
