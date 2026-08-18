import { getCurrentChatId, getCurrentChatMetadata } from '../platform/sillytavern.js';

export const SCENEWORLD_DATA_KEY = 'sceneworld';
export const SCENEWORLD_SCHEMA_VERSION = 2;

// Phase 1 is intentionally read-only. Reading must never create metadata.
export function readSceneWorldState() {
    const metadata = getCurrentChatMetadata();
    if (!metadata || typeof metadata !== 'object') return null;
    const value = metadata[SCENEWORLD_DATA_KEY];
    return value && typeof value === 'object' ? value : null;
}

export function inspectSceneWorldStorage() {
    const metadata = getCurrentChatMetadata();
    const state = readSceneWorldState();
    return Object.freeze({
        chatId: getCurrentChatId(),
        metadataAvailable: !!metadata,
        dataExists: !!state,
        schemaVersion: state?.schemaVersion ?? null,
    });
}
