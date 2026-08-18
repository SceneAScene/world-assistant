import { getCurrentChatMessages } from '../platform/sillytavern.js';

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

export function readLatestAssistantNarrative() {
    const chat = getCurrentChatMessages();
    for (let index = chat.length - 1; index >= 0; index -= 1) {
        const message = chat[index];
        if (!isNarrativeMessage(message) || message.is_user) continue;
        const text = cleanText(message.mes);
        return Object.freeze({
            id: index,
            name: cleanText(message.name) || 'Assistant',
            text,
            fingerprint: fingerprintText(text),
            timestamp: message.send_date ?? null,
        });
    }
    return null;
}

export function readRecentNarrativeContext({ endMessageId = null, maxMessages = 8, maxCharacters = 14000 } = {}) {
    const chat = getCurrentChatMessages();
    const end = Number.isInteger(endMessageId) ? Math.min(endMessageId, chat.length - 1) : chat.length - 1;
    const picked = [];
    let characters = 0;

    for (let index = end; index >= 0 && picked.length < maxMessages; index -= 1) {
        const message = chat[index];
        if (!isNarrativeMessage(message)) continue;
        const text = cleanText(message.mes);
        if (!text) continue;
        if (picked.length > 0 && characters + text.length > maxCharacters) break;
        picked.push({
            id: index,
            role: message.is_user ? 'user' : 'assistant',
            name: cleanText(message.name) || (message.is_user ? 'User' : 'Assistant'),
            text,
        });
        characters += text.length;
    }

    return picked.reverse();
}
