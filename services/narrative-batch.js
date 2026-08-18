import { extractNarrativeContent, narrativeFilterSignature } from './narrative-content.js';

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

function latestNarrativeAssistantId(chat, afterId, contentFilter) {
    for (let index = chat.length - 1; index > afterId; index -= 1) {
        if (normalizeAssistantMessage(chat[index], index, contentFilter)) return index;
    }
    return null;
}

function collectAssistantLookback(chat, beforeId, limits, contentFilter) {
    const result = [];
    let characters = 0;
    for (let index = beforeId - 1; index >= 0 && result.length < limits.maxLookbackMessages; index -= 1) {
        const normalized = normalizeAssistantMessage(chat[index], index, contentFilter);
        if (!normalized) continue;
        if (result.length > 0 && characters + normalized.text.length > limits.maxLookbackCharacters) break;
        result.push(normalized);
        characters += normalized.text.length;
    }
    return result.reverse();
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

function emptyBatch({ lastProcessedAssistantMessageId = null, anchorChanged = false, anchorReason = '', contentFilterSignature = '', ignoredAssistantCount = 0 } = {}) {
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
        preContext: [],
        pendingMessages: [],
    });
}

export function buildPendingNarrativeBatchFromChat(chatInput, sync = {}, options = {}) {
    const chat = Array.isArray(chatInput) ? chatInput : [];
    const limits = { ...PENDING_CONTEXT_LIMITS, ...(options?.limits || {}) };
    const contentFilter = {
        tags: Array.isArray(options?.contentFilter?.tags) ? options.contentFilter.tags : ['content'],
        fallbackToWholeMessage: options?.contentFilter?.fallbackToWholeMessage === true,
    };
    const filterSignature = narrativeFilterSignature(contentFilter);
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
            });
        }
        const extractedAnchor = normalizeAssistantMessage(anchor, lastProcessedAssistantMessageId, contentFilter);
        if (!extractedAnchor) {
            // If tags were changed after an older version already settled this floor, do not silently reinterpret it.
            if (previousFilterSignature && previousFilterSignature !== filterSignature) {
                return emptyBatch({
                    lastProcessedAssistantMessageId,
                    anchorChanged: true,
                    anchorReason: '正文标签设置已改变，而上次结算锚点在新标签规则下没有正文。请确认标签后再继续。',
                    contentFilterSignature: filterSignature,
                });
            }
        }
        if (lastProcessedAssistantFingerprint) {
            const extractedFingerprint = extractedAnchor?.fingerprint ?? '';
            const rawFingerprint = fingerprintText(anchor.mes);
            // Legacy alpha.10 and earlier stored the entire assistant message fingerprint. Accept it once for migration.
            const matchesLegacyRaw = !previousFilterSignature && lastProcessedAssistantFingerprint === rawFingerprint;
            if (extractedFingerprint && lastProcessedAssistantFingerprint !== extractedFingerprint && !matchesLegacyRaw) {
                return emptyBatch({
                    lastProcessedAssistantMessageId,
                    anchorChanged: true,
                    anchorReason: '上次已结算的 AI 正文内容发生变化。为避免把旧分支状态和新正文混在一起，当前不会自动继续结算。',
                    contentFilterSignature: filterSignature,
                });
            }
        }
    }

    const scanStart = lastProcessedAssistantMessageId === null ? 0 : lastProcessedAssistantMessageId + 1;
    const endId = latestNarrativeAssistantId(chat, lastProcessedAssistantMessageId ?? -1, contentFilter);
    if (endId === null) {
        const ignored = countIgnoredAssistantMessages(chat, scanStart, chat.length - 1, contentFilter);
        return emptyBatch({ lastProcessedAssistantMessageId, contentFilterSignature: filterSignature, ignoredAssistantCount: ignored });
    }

    const pendingMessages = [];
    let characters = 0;
    for (let index = scanStart; index <= endId; index += 1) {
        // USER messages are ignored completely. AI messages without a complete configured narrative tag are ignored too.
        const normalized = normalizeAssistantMessage(chat[index], index, contentFilter);
        if (!normalized) continue;
        pendingMessages.push(normalized);
        characters += normalized.text.length;
    }
    if (!pendingMessages.length) return emptyBatch({ lastProcessedAssistantMessageId, contentFilterSignature: filterSignature });

    const endMessage = normalizeAssistantMessage(chat[endId], endId, contentFilter);
    const overBudget = characters > limits.maxPendingCharacters;
    const preContext = collectAssistantLookback(chat, pendingMessages[0].id, limits, contentFilter);
    const ignoredAssistantCount = countIgnoredAssistantMessages(chat, scanStart, endId, contentFilter);

    return Object.freeze({
        hasPending: true,
        canSimulate: !overBudget,
        anchorChanged: false,
        anchorReason: '',
        lastProcessedAssistantMessageId,
        startId: pendingMessages[0].id,
        endId,
        endFingerprint: endMessage?.fingerprint ?? '',
        rangeFingerprint: rangeFingerprint(pendingMessages),
        assistantCount: pendingMessages.length,
        ignoredAssistantCount,
        characters,
        overBudget,
        limits,
        contentFilterSignature: filterSignature,
        preContext,
        pendingMessages,
    });
}
