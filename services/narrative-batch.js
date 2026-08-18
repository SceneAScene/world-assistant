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

function isAssistantNarrativeMessage(message) {
    if (!message || typeof message !== 'object') return false;
    if (message.is_system || message.is_user) return false;
    return cleanText(message.mes).length > 0;
}

function normalizeAssistantMessage(message, id) {
    const text = cleanText(message?.mes);
    return {
        id,
        role: 'assistant',
        name: cleanText(message?.name) || 'Assistant',
        text,
        fingerprint: fingerprintText(text),
        timestamp: message?.send_date ?? null,
    };
}

function rangeFingerprint(messages) {
    const material = messages.map(item => `${item.id}|assistant|${item.name}|${item.text}`).join('\n\n');
    return fingerprintText(material);
}

function latestAssistantId(chat, afterId = -1) {
    for (let index = chat.length - 1; index > afterId; index -= 1) {
        if (isAssistantNarrativeMessage(chat[index])) return index;
    }
    return null;
}

function collectAssistantLookback(chat, beforeId, limits) {
    const result = [];
    let characters = 0;
    for (let index = beforeId - 1; index >= 0 && result.length < limits.maxLookbackMessages; index -= 1) {
        const message = chat[index];
        if (!isAssistantNarrativeMessage(message)) continue;
        const normalized = normalizeAssistantMessage(message, index);
        if (result.length > 0 && characters + normalized.text.length > limits.maxLookbackCharacters) break;
        result.push(normalized);
        characters += normalized.text.length;
    }
    return result.reverse();
}

function emptyBatch({ lastProcessedAssistantMessageId = null, anchorChanged = false, anchorReason = '' } = {}) {
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
    const lastProcessedAssistantMessageId = Number.isInteger(sync?.lastProcessedAssistantMessageId)
        ? sync.lastProcessedAssistantMessageId
        : (Number.isInteger(sync?.lastProcessedMessageId) ? sync.lastProcessedMessageId : null);
    const lastProcessedAssistantFingerprint = cleanText(
        sync?.lastProcessedAssistantFingerprint ?? sync?.lastProcessedFingerprint,
    );

    if (lastProcessedAssistantMessageId !== null) {
        const anchor = chat[lastProcessedAssistantMessageId];
        if (!isAssistantNarrativeMessage(anchor)) {
            return emptyBatch({
                lastProcessedAssistantMessageId,
                anchorChanged: true,
                anchorReason: '上次结算锚点已经不存在或不再是 AI 正文。可能发生了删除、回退或分支切换。',
            });
        }
        if (lastProcessedAssistantFingerprint && fingerprintText(anchor.mes) !== lastProcessedAssistantFingerprint) {
            return emptyBatch({
                lastProcessedAssistantMessageId,
                anchorChanged: true,
                anchorReason: '上次已结算的 AI 正文内容发生变化。为避免把旧分支状态和新正文混在一起，当前不会自动继续结算。',
            });
        }
    }

    const endId = latestAssistantId(chat, lastProcessedAssistantMessageId ?? -1);
    if (endId === null) return emptyBatch({ lastProcessedAssistantMessageId });

    const scanStart = lastProcessedAssistantMessageId === null ? 0 : lastProcessedAssistantMessageId + 1;
    const pendingMessages = [];
    let characters = 0;
    for (let index = scanStart; index <= endId; index += 1) {
        const message = chat[index];
        // USER messages are intentionally ignored completely: not facts, not context, not budget.
        if (!isAssistantNarrativeMessage(message)) continue;
        const normalized = normalizeAssistantMessage(message, index);
        pendingMessages.push(normalized);
        characters += normalized.text.length;
    }
    if (!pendingMessages.length) return emptyBatch({ lastProcessedAssistantMessageId });

    const endMessage = normalizeAssistantMessage(chat[endId], endId);
    const overBudget = characters > limits.maxPendingCharacters;
    const preContext = collectAssistantLookback(chat, pendingMessages[0].id, limits);

    return Object.freeze({
        hasPending: true,
        canSimulate: !overBudget,
        anchorChanged: false,
        anchorReason: '',
        lastProcessedAssistantMessageId,
        startId: pendingMessages[0].id,
        endId,
        endFingerprint: endMessage.fingerprint,
        rangeFingerprint: rangeFingerprint(pendingMessages),
        assistantCount: pendingMessages.length,
        characters,
        overBudget,
        limits,
        preContext,
        pendingMessages,
    });
}
