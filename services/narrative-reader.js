import { getCurrentChatMessages } from '../platform/sillytavern.js';
import { buildPendingNarrativeBatchFromChat } from './narrative-batch.js';

export function readPendingNarrativeBatch(sync = {}, options = {}) {
    return buildPendingNarrativeBatchFromChat(getCurrentChatMessages(), sync, options);
}
