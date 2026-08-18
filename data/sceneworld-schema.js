export const SCENEWORLD_SCHEMA_VERSION = 5;

function nowIso() {
    return new Date().toISOString();
}

function clone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

function text(value, max = 2000) {
    return String(value ?? '').trim().slice(0, max);
}

function normalizeKnowledge(items) {
    if (!Array.isArray(items)) return [];
    return items.map(item => {
        if (typeof item === 'string') return { text: text(item, 600), evidence: '', sourceMessageId: null };
        if (!item || typeof item !== 'object') return null;
        return {
            text: text(item.text ?? item.value, 600),
            evidence: text(item.evidence, 500),
            sourceMessageId: Number.isInteger(item.sourceMessageId) ? item.sourceMessageId : null,
        };
    }).filter(item => item?.text);
}

function normalizeDetails(items) {
    if (!Array.isArray(items)) return [];
    const map = new Map();
    for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const label = text(item.label ?? item.key, 80);
        const value = text(item.value ?? item.text, 700);
        if (!label || !value) continue;
        map.set(label, { label, value });
    }
    return [...map.values()].slice(0, 24);
}

function normalizeWorldFacts(items) {
    if (!Array.isArray(items)) return [];
    return items.map(item => {
        if (typeof item === 'string') {
            return {
                id: '', key: text(item, 180), value: text(item, 900), validity: 'current',
                source: 'legacy', evidence: '', sourceMessageId: null,
            };
        }
        if (!item || typeof item !== 'object') return null;
        return {
            id: text(item.id, 120),
            key: text(item.key ?? item.subject, 180),
            value: text(item.value ?? item.text, 900),
            validity: text(item.validity, 40) || 'current',
            source: text(item.source, 80) || 'simulation',
            evidence: text(item.evidence, 500),
            sourceMessageId: Number.isInteger(item.sourceMessageId) ? item.sourceMessageId : null,
        };
    }).filter(item => item && (item.key || item.value)).slice(-160);
}

function normalizeMoments(items) {
    if (!Array.isArray(items)) return [];
    return items.map(item => {
        if (!item || typeof item !== 'object') return null;
        const title = text(item.title ?? item.label, 140);
        const body = text(item.text ?? item.value ?? item.summary, 1200);
        if (!title || !body) return null;
        return {
            id: text(item.id, 120),
            title,
            text: body,
            sourceMessageId: Number.isInteger(item.sourceMessageId) ? item.sourceMessageId : null,
        };
    }).filter(Boolean).slice(-80);
}

function normalizeWorldlineMemory(items) {
    if (!Array.isArray(items)) return [];
    return items.map(item => {
        if (typeof item === 'string') {
            const value = text(item, 700);
            return value ? { id: '', text: value, reason: 'legacy', evidence: '', sourceMessageId: null, recordedAt: null } : null;
        }
        if (!item || typeof item !== 'object') return null;
        const value = text(item.text ?? item.value, 700);
        if (!value) return null;
        return {
            id: text(item.id, 120),
            text: value,
            reason: text(item.reason, 300),
            evidence: text(item.evidence, 500),
            sourceMessageId: Number.isInteger(item.sourceMessageId) ? item.sourceMessageId : null,
            recordedAt: text(item.recordedAt, 80) || null,
        };
    }).filter(Boolean).slice(-120);
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
            lastProcessedRangeStartId: null,
            lastProcessedMessageCount: 0,
            lastProcessedRangeFingerprint: '',
            lastProcessedCharacters: 0,
        },
        world: {
            time: null,
            location: '',
            summary: '',
            moments: [],
            facts: [],
        },
        people: [],
        publicOpinion: {
            updatedAt: null,
            news: [],
            forum: [],
            casual: [],
        },
        memory: {
            worldline: [],
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
    const source = clone(value);
    const empty = createEmptySceneWorldState();

    const oldMemory = source.memory && typeof source.memory === 'object' ? source.memory : {};
    const legacyMemory = [
        ...(Array.isArray(oldMemory.shortTerm) ? oldMemory.shortTerm : []),
        ...(Array.isArray(oldMemory.longTerm) ? oldMemory.longTerm : []),
    ];
    const opinion = source.publicOpinion && typeof source.publicOpinion === 'object' ? source.publicOpinion : {};
    const legacyOpinion = Array.isArray(opinion.items) ? opinion.items : [];

    return {
        schemaVersion: SCENEWORLD_SCHEMA_VERSION,
        createdAt: source.createdAt || empty.createdAt,
        updatedAt: source.updatedAt || empty.updatedAt,
        sync: {
            ...empty.sync,
            ...(source.sync && typeof source.sync === 'object' ? source.sync : {}),
        },
        world: {
            ...empty.world,
            ...(source.world && typeof source.world === 'object' ? {
                time: source.world.time ?? null,
                location: text(source.world.location, 300),
                summary: text(source.world.summary, 1600),
            } : {}),
            moments: normalizeMoments(source.world?.moments),
            facts: normalizeWorldFacts(source.world?.facts),
        },
        people: Array.isArray(source.people) ? source.people.map(person => {
            if (!person || typeof person !== 'object') return null;
            const details = normalizeDetails(person.details);
            const legacyGoal = text(person.goal, 700);
            if (legacyGoal && !details.some(item => item.label === '目标')) details.push({ label: '目标', value: legacyGoal });
            return {
                id: text(person.id, 120),
                name: text(person.name, 120),
                aliases: Array.isArray(person.aliases) ? person.aliases.map(v => text(v, 120)).filter(Boolean).slice(0, 20) : [],
                location: text(person.location, 260),
                status: text(person.status, 900),
                details: details.slice(0, 24),
                knowledge: normalizeKnowledge(person.knowledge),
                lastUpdatedMessageId: Number.isInteger(person.lastUpdatedMessageId) ? person.lastUpdatedMessageId : null,
            };
        }).filter(person => person?.name).slice(0, 180) : [],
        publicOpinion: {
            updatedAt: opinion.updatedAt ?? null,
            news: Array.isArray(opinion.news) ? opinion.news : [],
            forum: Array.isArray(opinion.forum) ? opinion.forum : legacyOpinion,
            casual: Array.isArray(opinion.casual) ? opinion.casual : [],
        },
        memory: {
            worldline: normalizeWorldlineMemory(
                Array.isArray(oldMemory.worldline) ? oldMemory.worldline : legacyMemory,
            ),
        },
        chronicle: Array.isArray(source.chronicle) ? source.chronicle : [],
        assistant: {
            ...empty.assistant,
            ...(source.assistant && typeof source.assistant === 'object' ? source.assistant : {}),
            history: Array.isArray(source.assistant?.history) ? source.assistant.history : [],
            guidance: Array.isArray(source.assistant?.guidance) ? source.assistant.guidance : [],
        },
        snapshots: Array.isArray(source.snapshots) ? source.snapshots : [],
    };
}

export function touchSceneWorldState(state) {
    if (!state || typeof state !== 'object') return state;
    state.schemaVersion = SCENEWORLD_SCHEMA_VERSION;
    state.updatedAt = nowIso();
    return state;
}
