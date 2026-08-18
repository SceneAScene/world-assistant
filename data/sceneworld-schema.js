export const SCENEWORLD_SCHEMA_VERSION = 1;

function nowIso() {
    return new Date().toISOString();
}

export function createEmptySceneWorldState() {
    const now = nowIso();
    return {
        schemaVersion: SCENEWORLD_SCHEMA_VERSION,
        createdAt: now,
        updatedAt: now,
        world: {
            time: null,
            location: '',
            summary: '',
            facts: [],
        },
        people: [],
        undercurrents: [],
        echoes: [],
        publicOpinion: {
            updatedAt: null,
            items: [],
        },
        memory: {
            shortTerm: [],
            longTerm: [],
        },
        chronicle: [],
        assistant: {
            history: [],
            guidance: [],
        },
        snapshots: [],
    };
}

export function normalizeSceneWorldState(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value;
}

export function touchSceneWorldState(state) {
    if (!state || typeof state !== 'object') return state;
    state.updatedAt = nowIso();
    return state;
}
