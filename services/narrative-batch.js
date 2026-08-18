export const PENDING_CONTEXT_LIMITS = Object.freeze({
    maxPendingCharacters: 48000,
    maxLookbackMessages: 4,
    maxLookbackCharacters: 7000,
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

function isNarrativeMessage(message) {
    if (!message || typeof message !== 'object') return false;
    if (message.is_system) return false;
    return cleanText(message.mes).length > 0;
}

function normalizeMessage(message, id) {
    const text = cleanText(message?.mes);
    return {
        id,
        role: message?.is_user ? 'user' : 'assistant',
        name: cleanText(message?.name) || (message?.is_user ? 'User' : 'Assistant'),
        text,
        fingerprint: fingerprintText(text),
        timestamp: message?.send_date ?? null,
    };
}

function rangeFingerprint(messages) {
    const material = messages.map(item => `${item.id}|${item.role}|${item.name}|${item.text}`).join('\n\n');
    return fingerprintText(material);
}

function latestAssistantId(chat, afterId = -1) {
    for (let index = chat.length - 1; index > afterId; index -= 1) {
        const message = chat[index];
        if (!isNarrativeMessage(message) || message.is_user) continue;
        return index;
    }
    return null;
}

function collectLookback(chat, beforeId, limits) {
    const result = [];
    let characters = 0;
    for (let index = beforeId - 1; index >= 0 && result.length < limits.maxLookbackMessages; index -= 1) {
        const message = chat[index];
        if (!isNarrativeMessage(message)) continue;
        const normalized = normalizeMessage(message, index);
        if (result.length > 0 && characters + normalized.text.length > limits.maxLookbackCharacters) break;
        result.push(normalized);
        characters += normalized.text.length;
    }
    return result.reverse();
}

function emptyBatch({ lastProcessedMessageId = null, anchorChanged = false, anchorReason = '' } = {}) {
    return Object.freeze({
        hasPending: false,
        canSimulate: false,
        anchorChanged,
        anchorReason,
        lastProcessedMessageId,
        startId: null,
        endId: null,
        endFingerprint: '',
        rangeFingerprint: '',
        messageCount: 0,
        characters: 0,
        overBudget: false,
        limits: { ...PENDING_CONTEXT_LIMITS },
        preContext: [],
        pendingMessages: [],
    });
}

export function buildPendingNarrativeBatchFromChat(chatInput, sync = {}, options = {}) {
    const chat = Array.isArray(chatInput) ? chatInput : [];
    const limits = { ...PENDING_CONTEXT_LIMITS, ...(options?.limits || {}) };
    const lastProcessedMessageId = Number.isInteger(sync?.lastProcessedMessageId) ? sync.lastProcessedMessageId : null;
    const lastProcessedFingerprint = cleanText(sync?.lastProcessedFingerprint);

    if (lastProcessedMessageId !== null) {
        const anchor = chat[lastProcessedMessageId];
        if (!isNarrativeMessage(anchor) || anchor?.is_user) {
            return emptyBatch({
                lastProcessedMessageId,
                anchorChanged: true,
                anchorReason: '上次结算锚点已经不存在或不再是 AI 正文。可能发生了删除、回退或分支切换。',
            });
        }
        if (lastProcessedFingerprint && fingerprintText(anchor.mes) !== lastProcessedFingerprint) {
            return emptyBatch({
                lastProcessedMessageId,
                anchorChanged: true,
                anchorReason: '上次已结算的 AI 正文内容发生变化。为避免把旧分支状态和新正文混在一起，当前不会自动继续结算。',
            });
        }
    }

    const endId = latestAssistantId(chat, lastProcessedMessageId ?? -1);
    if (endId === null) return emptyBatch({ lastProcessedMessageId });

    const startId = lastProcessedMessageId === null ? 0 : lastProcessedMessageId + 1;
    const pendingMessages = [];
    let characters = 0;
    for (let index = startId; index <= endId; index += 1) {
        const message = chat[index];
        if (!isNarrativeMessage(message)) continue;
        const normalized = normalizeMessage(message, index);
        pendingMessages.push(normalized);
        characters += normalized.text.length;
    }
    if (!pendingMessages.length) return emptyBatch({ lastProcessedMessageId });

    const endMessage = normalizeMessage(chat[endId], endId);
    const overBudget = characters > limits.maxPendingCharacters;
    const preContext = collectLookback(chat, startId, limits);

    return Object.freeze({
        hasPending: true,
        canSimulate: !overBudget,
        anchorChanged: false,
        anchorReason: '',
        lastProcessedMessageId,
        startId: pendingMessages[0].id,
        endId,
        endFingerprint: endMessage.fingerprint,
        rangeFingerprint: rangeFingerprint(pendingMessages),
        messageCount: pendingMessages.length,
        characters,
        overBudget,
        limits,
        preContext,
        pendingMessages,
    });
}
