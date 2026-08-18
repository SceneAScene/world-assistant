export const SCENEWORLD_SCHEMA_VERSION = 3;

function nowIso() {
    return new Date().toISOString();
}

function clone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

export function createEmptySceneWorldState() {
    const now = nowIso();
    return {
        schemaVersion: SCENEWORLD_SCHEMA_VERSION,
        createdAt: now,
        updatedAt: now,
        sync: {
            lastProcessedMessageId: null,
            lastProcessedFingerprint: '',
            lastProcessedAt: null,
        },
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

function normalizeKnowledge(items) {
    if (!Array.isArray(items)) return [];
    return items.map(item => {
        if (typeof item === 'string') return { text: item, evidence: '', sourceMessageId: null };
        if (!item || typeof item !== 'object') return null;
        return {
            text: String(item.text ?? item.value ?? '').trim(),
            evidence: String(item.evidence ?? '').trim(),
            sourceMessageId: Number.isInteger(item.sourceMessageId) ? item.sourceMessageId : null,
        };
    }).filter(item => item?.text);
}

function normalizeWorldFacts(items) {
    if (!Array.isArray(items)) return [];
    return items.map(item => {
        if (typeof item === 'string') {
            return {
                id: '',
                key: item,
                value: item,
                validity: 'current',
                source: 'legacy',
                evidence: '',
                sourceMessageId: null,
            };
        }
        if (!item || typeof item !== 'object') return null;
        return {
            id: String(item.id ?? '').trim(),
            key: String(item.key ?? item.subject ?? '').trim(),
            value: String(item.value ?? item.text ?? '').trim(),
            validity: String(item.validity ?? 'current').trim() || 'current',
            source: String(item.source ?? 'simulation').trim() || 'simulation',
            evidence: String(item.evidence ?? '').trim(),
            sourceMessageId: Number.isInteger(item.sourceMessageId) ? item.sourceMessageId : null,
        };
    }).filter(item => item && (item.key || item.value));
}

export function normalizeSceneWorldState(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const next = clone(value);
    const empty = createEmptySceneWorldState();

    next.schemaVersion = SCENEWORLD_SCHEMA_VERSION;
    next.createdAt = next.createdAt || empty.createdAt;
    next.updatedAt = next.updatedAt || empty.updatedAt;
    next.sync = {
        ...empty.sync,
        ...(next.sync && typeof next.sync === 'object' ? next.sync : {}),
    };
    next.world = {
        ...empty.world,
        ...(next.world && typeof next.world === 'object' ? next.world : {}),
        facts: normalizeWorldFacts(next.world?.facts),
    };
    next.people = Array.isArray(next.people) ? next.people.map(person => {
        if (!person || typeof person !== 'object') return null;
        return {
            ...person,
            id: String(person.id ?? '').trim(),
            name: String(person.name ?? '').trim(),
            aliases: Array.isArray(person.aliases) ? person.aliases.map(v => String(v).trim()).filter(Boolean) : [],
            location: String(person.location ?? '').trim(),
            status: String(person.status ?? '').trim(),
            goal: String(person.goal ?? '').trim(),
            knowledge: normalizeKnowledge(person.knowledge),
            lastUpdatedMessageId: Number.isInteger(person.lastUpdatedMessageId) ? person.lastUpdatedMessageId : null,
        };
    }).filter(person => person?.name) : [];
    next.undercurrents = Array.isArray(next.undercurrents) ? next.undercurrents.filter(Boolean) : [];
    next.echoes = Array.isArray(next.echoes) ? next.echoes.filter(Boolean) : [];
    next.publicOpinion = {
        ...empty.publicOpinion,
        ...(next.publicOpinion && typeof next.publicOpinion === 'object' ? next.publicOpinion : {}),
        items: Array.isArray(next.publicOpinion?.items) ? next.publicOpinion.items : [],
    };
    next.memory = {
        ...empty.memory,
        ...(next.memory && typeof next.memory === 'object' ? next.memory : {}),
        shortTerm: Array.isArray(next.memory?.shortTerm) ? next.memory.shortTerm : [],
        longTerm: Array.isArray(next.memory?.longTerm) ? next.memory.longTerm : [],
    };
    next.chronicle = Array.isArray(next.chronicle) ? next.chronicle : [];
    next.assistant = {
        ...empty.assistant,
        ...(next.assistant && typeof next.assistant === 'object' ? next.assistant : {}),
        history: Array.isArray(next.assistant?.history) ? next.assistant.history : [],
        guidance: Array.isArray(next.assistant?.guidance) ? next.assistant.guidance : [],
    };
    next.snapshots = Array.isArray(next.snapshots) ? next.snapshots : [];
    return next;
}

export function touchSceneWorldState(state) {
    if (!state || typeof state !== 'object') return state;
    state.schemaVersion = SCENEWORLD_SCHEMA_VERSION;
    state.updatedAt = nowIso();
    return state;
}
