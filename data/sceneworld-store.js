import {
    assertCurrentChatIdentity,
    getCurrentChatIdentity,
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

function clone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

function estimateBytes(value) {
    try { return new Blob([JSON.stringify(value)]).size; }
    catch {
        try { return JSON.stringify(value).length * 2; }
        catch { return 0; }
    }
}

function readRaw() {
    const metadata = getCurrentChatMetadata();
    if (!metadata || typeof metadata !== 'object') return null;
    return normalizeSceneWorldState(metadata[SCENEWORLD_DATA_KEY]);
}

// Read path is pure: never creates or mutates chat metadata.
export function readSceneWorldState() {
    return readRaw();
}

export function hasSceneWorldState() {
    return !!readRaw();
}

// Explicit test/manual write path only. Normal simulation does not call this beforehand.
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

export async function commitSceneWorldState(nextState, { expectedChatIdentity = '' } = {}) {
    if (expectedChatIdentity) assertCurrentChatIdentity(expectedChatIdentity);
    if (!hasActiveChat()) throw new Error('请先打开一个角色聊天或群聊');
    const metadata = getCurrentChatMetadata();
    if (!metadata || typeof metadata !== 'object') throw new Error('当前聊天没有可用的 chatMetadata');
    const normalized = normalizeSceneWorldState(nextState);
    if (!normalized) throw new Error('准备保存的 sceneworld 状态无效');
    touchSceneWorldState(normalized);

    const hadPrevious = Object.prototype.hasOwnProperty.call(metadata, SCENEWORLD_DATA_KEY);
    const previous = hadPrevious ? clone(metadata[SCENEWORLD_DATA_KEY]) : undefined;
    metadata[SCENEWORLD_DATA_KEY] = normalized;
    try {
        await saveCurrentChatMetadata();
        return normalizeSceneWorldState(normalized);
    } catch (error) {
        if (hadPrevious) metadata[SCENEWORLD_DATA_KEY] = previous;
        else delete metadata[SCENEWORLD_DATA_KEY];
        throw error;
    }
}

export async function updateSceneWorldState(mutator) {
    if (typeof mutator !== 'function') throw new TypeError('updateSceneWorldState requires a mutator');
    const originChatIdentity = getCurrentChatIdentity();
    if (!originChatIdentity) throw new Error('请先打开一个角色聊天或群聊');
    const current = readRaw();
    if (!current) throw new Error('当前聊天尚未创建 sceneworld 数据');
    const working = clone(current);
    return commitSceneWorldState(mutator(working) ?? working, { expectedChatIdentity: originChatIdentity });
}

export async function writeSceneWorldSection(section, value) {
    const allowed = new Set(['world', 'people', 'publicOpinion', 'continuity', 'chronicle', 'guidance', 'assistant', 'snapshots']);
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

export async function clearSceneWorldSection(section) {
    const allowed = new Set(['people', 'observation', 'continuity', 'chronicle', 'guidance']);
    if (!allowed.has(section)) throw new Error(`未知的 SceneWorld 清理分区：${section}`);
    const current = readRaw();
    if (!current) return false;
    const empty = createEmptySceneWorldState();
    await updateSceneWorldState(state => {
        if (section === 'people') state.people = [];
        else if (section === 'observation') {
            state.publicOpinion = clone(empty.publicOpinion);
            state.guidance = state.guidance && typeof state.guidance === 'object' ? state.guidance : clone(empty.guidance);
            state.guidance.places = [];
            state.guidance.placesUpdatedAt = null;
        } else if (section === 'continuity') {
            state.world = state.world && typeof state.world === 'object' ? state.world : clone(empty.world);
            state.world.facts = [];
            state.continuity = clone(empty.continuity);
        } else if (section === 'chronicle') state.chronicle = [];
        else if (section === 'guidance') {
            state.guidance = state.guidance && typeof state.guidance === 'object' ? state.guidance : clone(empty.guidance);
            state.guidance.actions = [];
            state.guidance.actionsUpdatedAt = null;
            state.guidance.actionsSourceMessageId = null;
        }
        return state;
    });
    return true;
}

export function sceneWorldUsage() {
    const state = readRaw();
    if (!state) return { exists: false, totalBytes: 0, sections: {} };
    const sections = {};
    for (const key of ['sync', 'world', 'people', 'publicOpinion', 'continuity', 'chronicle', 'guidance', 'assistant', 'snapshots']) {
        sections[key] = estimateBytes(state[key]);
    }
    return { exists: true, totalBytes: estimateBytes(state), sections };
}

export function inspectSceneWorldStorage() {
    const metadata = getCurrentChatMetadata();
    const usage = sceneWorldUsage();
    return {
        schemaVersion: SCENEWORLD_SCHEMA_VERSION,
        metadataAvailable: !!metadata,
        dataExists: usage.exists,
        totalBytes: usage.totalBytes,
        sections: usage.sections,
        ownedChatKeys: [...SCENEWORLD_OWNED_CHAT_KEYS],
    };
}
