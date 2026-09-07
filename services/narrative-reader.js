import { getCurrentChatMessages, getSceneWorldSettings } from '../platform/sillytavern.js';
import { buildPendingNarrativeBatchFromChat } from './narrative-batch.js';

export function readPendingNarrativeBatch(sync = {}, options = {}) {
    const settings = getSceneWorldSettings();
    return buildPendingNarrativeBatchFromChat(getCurrentChatMessages(), sync, {
        ...options,
        contentFilter: {
            mode: settings.contentReadMode,
            tags: settings.contentTags,
            excludedTags: settings.excludedContentTags,
        },
        initialSettlement: {
            mode: settings.initialSettlementMode,
            startFloor: settings.initialStartFloor,
        },
        limits: {
            maxPendingAssistantMessages: settings.maxPendingAssistantMessages,
        },
    });
}
