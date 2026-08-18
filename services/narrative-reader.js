import { getCurrentChatMessages, getSceneWorldSettings } from '../platform/sillytavern.js';
import { buildPendingNarrativeBatchFromChat } from './narrative-batch.js';

export function readPendingNarrativeBatch(sync = {}, options = {}) {
    const settings = getSceneWorldSettings();
    return buildPendingNarrativeBatchFromChat(getCurrentChatMessages(), sync, {
        ...options,
        contentFilter: {
            tags: settings.contentTags,
            fallbackToWholeMessage: settings.contentFallbackToWholeMessage,
        },
    });
}
