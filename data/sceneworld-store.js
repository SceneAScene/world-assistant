import {
    getCurrentChatId,
    getCurrentChatMetadata,
    hasActiveChat,
    saveCurrentChatMetadata,
} from '../platform/sillytavern.js';
import {
    SCENEWORLD_SCHEMA_VERSION,
    createEmptySceneWorldState,
    normalizeSceneWorldState,
    touchSceneWorldState,
} from './sceneworld-schema.js';

export const SCENEWORLD_DATA_KEY = 'sceneworld';
export const SCENEWORLD_OWNED_CHAT_KEYS = Object.freeze([SCENEWORLD_DATA_KEY]);

function estimateBytes(value) {
    try {
        return new Blob([JSON.stringify(value)]).size;
    } catch {
        try { return JSON.stringify(value).length * 2; } catch { return 0; }
    }
}

function readRaw() {
    const metadata = getCurrentChatMetadata();
    if (!metadata || typeof metadata !== 'object') return null;
    return normalizeSceneWorldState(metadata[SCENEWORLD_DATA_KEY]);
}

// Read path: never creates or mutates chat metadata.
export function readSceneWorldState() {
    return readRaw();
}

export function hasSceneWorldState() {
    return !!readRaw();
}

// Explicit write path only. This is intentionally never called during plugin activation or UI open.
export async function createSceneWorldState() {
    if (!hasActiveChat()) throw new Error('请先打开一个角色聊天或群聊');
    const metadata = getCurrentChatMetadata();
    if (!metadata || typeof metadata !== 'object') throw new Error('当前聊天没有可用的 chatMetadata');

    const existing = readRaw();
    if (existing) return existing;

    const state = createEmptySceneWorldState();
    metadata[SCENEWORLD_DATA_KEY] = state;
    try {
        await saveCurrentChatMetadata();
        return state;
    } catch (error) {
        delete metadata[SCENEWORLD_DATA_KEY];
        throw error;
    }
}

export async function updateSceneWorldState(mutator) {
    if (typeof mutator !== 'function') throw new TypeError('updateSceneWorldState requires a mutator');
    const metadata = getCurrentChatMetadata();
    if (!metadata || typeof metadata !== 'object') throw new Error('当前聊天没有可用的 chatMetadata');
    const current = readRaw();
    if (!current) throw new Error('当前聊天尚未创建 sceneworld 数据');

    const before = typeof structuredClone === 'function' ? structuredClone(current) : JSON.parse(JSON.stringify(current));
    try {
        const result = mutator(current) ?? current;
        touchSceneWorldState(result);
        metadata[SCENEWORLD_DATA_KEY] = result;
        await saveCurrentChatMetadata();
        return result;
    } catch (error) {
        metadata[SCENEWORLD_DATA_KEY] = before;
        throw error;
    }
}

export async function writeSceneWorldSection(section, value) {
    const allowed = new Set(['world', 'people', 'undercurrents', 'echoes', 'publicOpinion', 'memory', 'chronicle', 'assistant', 'snapshots']);
    if (!allowed.has(section)) throw new Error(`未知的 SceneWorld 数据区：${section}`);
    return updateSceneWorldState(state => {
        state[section] = value;
        return state;
    });
}

export async function clearSceneWorldState() {
    const metadata = getCurrentChatMetadata();
    if (!metadata || typeof metadata !== 'object') return false;
    if (!(SCENEWORLD_DATA_KEY in metadata)) return false;

    const previous = metadata[SCENEWORLD_DATA_KEY];
    delete metadata[SCENEWORLD_DATA_KEY];
    try {
        await saveCurrentChatMetadata();
        return true;
    } catch (error) {
        metadata[SCENEWORLD_DATA_KEY] = previous;
        throw error;
    }
}

export function sceneWorldUsage() {
    const state = readRaw();
    if (!state) return {
        exists: false,
        totalBytes: 0,
        sections: {},
    };

    const sections = {};
    for (const key of ['world', 'people', 'undercurrents', 'echoes', 'publicOpinion', 'memory', 'chronicle', 'assistant', 'snapshots']) {
        sections[key] = estimateBytes(state[key]);
    }
    return {
        exists: true,
        totalBytes: estimateBytes(state),
        sections,
    };
}

export function inspectSceneWorldStorage() {
    const metadata = getCurrentChatMetadata();
    const state = readRaw();
    const usage = sceneWorldUsage();
    return Object.freeze({
        chatId: getCurrentChatId(),
        activeChat: hasActiveChat(),
        metadataAvailable: !!metadata,
        dataExists: !!state,
        schemaVersion: state?.schemaVersion ?? null,
        expectedSchemaVersion: SCENEWORLD_SCHEMA_VERSION,
        createdAt: state?.createdAt ?? null,
        updatedAt: state?.updatedAt ?? null,
        totalBytes: usage.totalBytes,
    });
}
