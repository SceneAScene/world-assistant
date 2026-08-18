export const SCENEWORLD_SCHEMA_VERSION = 14;

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

function stableId(value, prefix = 'item') {
    const source = text(value, 900).toLowerCase();
    let hash = 2166136261;
    for (let i = 0; i < source.length; i += 1) {
        hash ^= source.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return `${prefix}_${(hash >>> 0).toString(36)}`;
}

function stripOuterDisplayWrappers(value, max = 2000) {
    let out = text(value, max);
    const pairs = [['“','”'], ['「','」'], ['『','』'], ['"','"'], ["'","'"], ['【','】'], ['[',']']];
    let changed = true;
    while (out && changed) {
        changed = false;
        const trimmed = out.trim();
        for (const [left, right] of pairs) {
            if (trimmed.length > left.length + right.length && trimmed.startsWith(left) && trimmed.endsWith(right)) {
                out = trimmed.slice(left.length, trimmed.length - right.length).trim();
                changed = true;
                break;
            }
        }
    }
    return text(out, max);
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


function looksLikeUiStat(value) {
    const valueText = text(value, 900);
    if (!valueText) return false;
    if (/(?:今日|本日|累计).{0,12}次数\s*[:：]?\s*[+-]?\d+(?:\.\d+)?\s*次?/i.test(valueText)) return true;
    if (/(?:好感|亲密|欲望|快感|高潮|HP|MP|SAN|经验值?|属性值?|进度值?|等级|level).{0,12}[:：=]?\s*[+-]?\d/i.test(valueText)) return true;
    if (/^[^。！？!?\n]{1,24}[:：]\s*[+-]?\d+(?:\.\d+)?\s*(?:次|点|级|%|％)?$/i.test(valueText)) return true;
    if (/\b\d+\s*\/\s*\d+\b/.test(valueText)) return true;
    return false;
}

function normalizeDetails(items) {
    if (!Array.isArray(items)) return [];
    const map = new Map();
    for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const label = text(item.label ?? item.key, 80);
        const value = text(item.value ?? item.text, 700);
        if (!label || !value) continue;
        if (looksLikeUiStat(label) || looksLikeUiStat(value) || looksLikeUiStat(`${label}：${value}`)) continue;
        map.set(label, { label, value });
    }
    return [...map.values()].slice(0, 24);
}

function normalizeWorldFacts(items) {
    if (!Array.isArray(items)) return [];
    const validPublicity = new Set(['private', 'trace', 'public']);
    const result = [];
    for (const item of items) {
        let normalized = null;
        if (typeof item === 'string') {
            const value = text(item, 900);
            if (value) normalized = {
                id: stableId(value, 'fact'), key: value.slice(0, 180), value, validity: 'current',
                source: 'legacy', evidence: '', sourceMessageId: null,
                publicity: 'private', publicHint: '', updatedAt: null,
            };
        } else if (item && typeof item === 'object') {
            const publicityRaw = text(item.publicity, 30).toLowerCase();
            normalized = {
                id: text(item.id, 120) || stableId(item.key ?? item.subject ?? item.value ?? item.text, 'fact'),
                key: text(item.key ?? item.subject, 180),
                value: text(item.value ?? item.text, 900),
                validity: text(item.validity, 40) || 'current',
                source: text(item.source, 80) || 'simulation',
                evidence: text(item.evidence, 500),
                sourceMessageId: Number.isInteger(item.sourceMessageId) ? item.sourceMessageId : null,
                publicity: validPublicity.has(publicityRaw) ? publicityRaw : 'private',
                publicHint: text(item.publicHint ?? item.public_hint, 500),
                updatedAt: text(item.updatedAt, 80) || null,
            };
        }
        if (!normalized || (!normalized.key && !normalized.value)) continue;
        const id = normalized.id.toLowerCase();
        const key = normalized.key.replace(/\s+/g, ' ').toLowerCase();
        let index = -1;
        if (id) index = result.findIndex(existing => String(existing.id || '').toLowerCase() === id);
        if (index < 0 && key) index = result.findIndex(existing => String(existing.key || '').replace(/\s+/g, ' ').toLowerCase() === key);
        if (index >= 0) result[index] = { ...result[index], ...normalized, id: result[index].id || normalized.id };
        else result.push(normalized);
    }
    return result.slice(-20);
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
    }).filter(Boolean).slice(-20);
}

function normalizeRecentDynamics(items) {
    if (!Array.isArray(items)) return [];
    return items.map(item => {
        if (!item || typeof item !== 'object') return null;
        const summary = text(item.summary ?? item.text ?? item.value, 1400);
        if (!summary) return null;
        return {
            id: text(item.id, 120) || stableId(`${item.sourceStartMessageId ?? ''}|${item.sourceEndMessageId ?? ''}|${summary}`, 'dynamic'),
            summary,
            sourceStartMessageId: Number.isInteger(item.sourceStartMessageId) ? item.sourceStartMessageId : null,
            sourceEndMessageId: Number.isInteger(item.sourceEndMessageId) ? item.sourceEndMessageId : null,
            createdAt: text(item.createdAt, 80) || null,
        };
    }).filter(Boolean).slice(-5);
}

function legacyMemoryAsFacts(items) {
    if (!Array.isArray(items)) return [];
    return items.map(item => {
        if (typeof item === 'string') {
            const value = text(item, 900);
            return value ? { key: value.slice(0, 180), value, validity: 'persistent', publicity: 'private', source: 'legacy-memory' } : null;
        }
        if (!item || typeof item !== 'object') return null;
        const value = text(item.text ?? item.value, 900);
        if (!value) return null;
        const status = text(item.status, 40);
        return {
            id: text(item.id, 120),
            key: text(item.key ?? item.memoryKey ?? item.memory_key, 180) || value.slice(0, 180),
            value,
            validity: status === '历史' ? 'historical' : (status === '长期' ? 'persistent' : 'current'),
            source: 'legacy-memory',
            evidence: text(item.evidence, 500),
            sourceMessageId: Number.isInteger(item.sourceEndMessageId) ? item.sourceEndMessageId : (Number.isInteger(item.sourceMessageId) ? item.sourceMessageId : null),
            publicity: 'private',
            publicHint: '',
            updatedAt: text(item.updatedAt ?? item.createdAt, 80) || null,
        };
    }).filter(Boolean);
}

function normalizeOpinionNews(items) {
    if (!Array.isArray(items)) return [];
    return items.map(item => {
        if (!item || typeof item !== 'object') return null;
        const headline = text(item.headline ?? item.title, 180);
        const summary = text(item.summary ?? item.text, 900);
        if (!headline || !summary) return null;
        return {
            id: text(item.id, 140),
            category: text(item.category, 60) || '公共消息',
            headline,
            summary,
            source: text(item.source, 120),
            sourceType: text(item.sourceType, 30) || 'unofficial',
            scope: text(item.scope, 100),
            confidence: text(item.confidence, 20) || 'high',
            relatedFactIds: Array.isArray(item.relatedFactIds) ? item.relatedFactIds.map(v => text(v, 120)).filter(Boolean).slice(0, 12) : [],
            generatedAt: text(item.generatedAt, 80) || null,
            canon: item.canon !== false,
        };
    }).filter(Boolean).slice(0, 18);
}

function normalizeOpinionForum(items) {
    if (!Array.isArray(items)) return [];
    return items.map(item => {
        if (!item || typeof item !== 'object') return null;
        const title = text(item.title, 180);
        const summary = text(item.summary ?? item.text, 900);
        if (!title || !summary) return null;
        const replies = Array.isArray(item.replies) ? item.replies.map(reply => {
            if (!reply || typeof reply !== 'object') return null;
            const body = text(reply.text ?? reply.content, 500);
            if (!body) return null;
            return { author: text(reply.author ?? reply.name, 80) || '匿名', text: body };
        }).filter(Boolean).slice(0, 6) : [];
        return {
            id: text(item.id, 140),
            board: text(item.board, 80) || '公共讨论',
            title,
            summary,
            claimStatus: text(item.claimStatus, 20) || 'mixed',
            relatedFactIds: Array.isArray(item.relatedFactIds) ? item.relatedFactIds.map(v => text(v, 120)).filter(Boolean).slice(0, 12) : [],
            replies,
            generatedAt: text(item.generatedAt, 80) || null,
            canon: item.canon !== false,
        };
    }).filter(Boolean).slice(0, 16);
}

function normalizeStreetItems(items) {
    if (!Array.isArray(items)) return [];
    const allowedKinds = new Set(['overheard', 'gossip', 'curiosity', 'local_incident', 'notice', 'slice']);
    return items.map(item => {
        if (!item || typeof item !== 'object') return null;
        const kindRaw = text(item.kind, 30).toLowerCase();
        const kind = allowedKinds.has(kindRaw) ? kindRaw : 'slice';
        const title = stripOuterDisplayWrappers(item.title ?? item.headline ?? item.category, 180);
        const body = stripOuterDisplayWrappers(item.text ?? item.quote ?? item.summary, 900);
        if (!title || !body) return null;
        return {
            id: text(item.id, 140),
            kind,
            category: text(item.category, 60) || '市井闲闻',
            title,
            text: body,
            speaker: kind === 'notice' ? '' : text(item.speaker ?? item.author, 100),
            place: text(item.place ?? item.location, 140),
            note: text(item.note ?? item.context ?? item.summary, 700),
            generatedAt: text(item.generatedAt, 80) || null,
            canon: false,
            nonCanon: true,
        };
    }).filter(Boolean).slice(0, 18);
}

function normalizeGuidanceActions(items) {
    if (!Array.isArray(items)) return [];
    return items.map(item => {
        if (!item || typeof item !== 'object') return null;
        const title = text(item.title, 140);
        const prompt = text(item.prompt ?? item.text, 700);
        if (!title || !prompt) return null;
        return {
            id: text(item.id, 140),
            title,
            prompt,
            reason: text(item.reason, 500),
            tone: text(item.tone, 60),
        };
    }).filter(Boolean).slice(0, 5);
}

function normalizeGuidancePlaces(items) {
    if (!Array.isArray(items)) return [];
    return items.map(item => {
        if (!item || typeof item !== 'object') return null;
        const name = text(item.name ?? item.title, 160);
        const prompt = text(item.prompt ?? item.text, 700);
        if (!name || !prompt) return null;
        return {
            id: text(item.id, 140),
            name,
            type: text(item.type, 80),
            why: text(item.why ?? item.reason, 500),
            prompt,
            established: item.established === true,
        };
    }).filter(Boolean).slice(0, 5);
}

function normalizeChronicle(items) {
    if (!Array.isArray(items)) return [];
    return items.map(item => {
        if (!item || typeof item !== 'object') return null;
        const title = text(item.title, 180);
        const summary = text(item.summary ?? item.text, 1200);
        if (!title && !summary) return null;
        return {
            id: text(item.id, 180),
            title: title || '收藏内容',
            summary,
            sourceType: text(item.sourceType, 40),
            sourceId: text(item.sourceId, 160),
            sourceLabel: text(item.sourceLabel, 80),
            canon: item.canon !== false,
            capturedAt: text(item.capturedAt, 80) || null,
            sourceGeneratedAt: text(item.sourceGeneratedAt, 80) || null,
        };
    }).filter(Boolean).slice(-240);
}

export function createEmptySceneWorldState() {
    const now = nowIso();
    return {
        schemaVersion: SCENEWORLD_SCHEMA_VERSION,
        createdAt: now,
        updatedAt: now,
        sync: {
            lastProcessedAssistantMessageId: null,
            lastProcessedAssistantFingerprint: '',
            lastProcessedAt: null,
            lastProcessedAssistantRangeStartId: null,
            lastProcessedAssistantCount: 0,
            lastProcessedAssistantRangeFingerprint: '',
            lastProcessedAssistantCharacters: 0,
            lastProcessedContentFilterSignature: '',
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
            sourceFingerprint: '',
            news: [],
            forum: [],
            streetUpdatedAt: null,
            street: [],
        },
        continuity: {
            recentDynamics: [],
        },
        chronicle: [],
        guidance: {
            actionsUpdatedAt: null,
            actionsSourceMessageId: null,
            placesUpdatedAt: null,
            actions: [],
            places: [],
        },
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
        sync: (() => {
            const legacy = source.sync && typeof source.sync === 'object' ? source.sync : {};
            return {
                ...empty.sync,
                lastProcessedAssistantMessageId: Number.isInteger(legacy.lastProcessedAssistantMessageId)
                    ? legacy.lastProcessedAssistantMessageId
                    : (Number.isInteger(legacy.lastProcessedMessageId) ? legacy.lastProcessedMessageId : null),
                lastProcessedAssistantFingerprint: text(
                    legacy.lastProcessedAssistantFingerprint ?? legacy.lastProcessedFingerprint,
                    200,
                ),
                lastProcessedAt: legacy.lastProcessedAt ?? null,
                lastProcessedAssistantRangeStartId: Number.isInteger(legacy.lastProcessedAssistantRangeStartId)
                    ? legacy.lastProcessedAssistantRangeStartId
                    : (Number.isInteger(legacy.lastProcessedMessageId) ? legacy.lastProcessedMessageId : null),
                lastProcessedAssistantCount: Number.isFinite(legacy.lastProcessedAssistantCount)
                    ? Math.max(0, Math.trunc(legacy.lastProcessedAssistantCount))
                    : (Number.isInteger(legacy.lastProcessedMessageId) ? 1 : 0),
                lastProcessedAssistantRangeFingerprint: text(legacy.lastProcessedAssistantRangeFingerprint, 200),
                lastProcessedAssistantCharacters: Number.isFinite(legacy.lastProcessedAssistantCharacters)
                    ? Math.max(0, Math.trunc(legacy.lastProcessedAssistantCharacters))
                    : 0,
                lastProcessedContentFilterSignature: text(legacy.lastProcessedContentFilterSignature, 300),
            };
        })(),
        world: {
            ...empty.world,
            ...(source.world && typeof source.world === 'object' ? {
                time: source.world.time ?? null,
                location: text(source.world.location, 300),
                summary: text(source.world.summary, 1600),
            } : {}),
            moments: normalizeMoments(source.world?.moments),
            facts: normalizeWorldFacts([
                ...legacyMemoryAsFacts(Array.isArray(oldMemory.worldline) ? oldMemory.worldline : legacyMemory),
                ...(Array.isArray(source.world?.facts) ? source.world.facts : []),
            ]),
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
                status: looksLikeUiStat(person.status) ? '' : text(person.status, 900),
                details: details.slice(0, 24),
                knowledge: normalizeKnowledge(person.knowledge),
                lastUpdatedMessageId: Number.isInteger(person.lastUpdatedMessageId) ? person.lastUpdatedMessageId : null,
            };
        }).filter(person => person?.name).slice(0, 180) : [],
        publicOpinion: {
            updatedAt: opinion.updatedAt ?? null,
            sourceFingerprint: text(opinion.sourceFingerprint, 200),
            news: normalizeOpinionNews(opinion.news),
            forum: normalizeOpinionForum(Array.isArray(opinion.forum) ? opinion.forum : legacyOpinion),
            streetUpdatedAt: opinion.streetUpdatedAt ?? opinion.casualUpdatedAt ?? null,
            street: normalizeStreetItems(
                Array.isArray(opinion.street)
                    ? opinion.street
                    : (Array.isArray(opinion.casual)
                        ? opinion.casual.map(item => ({
                            ...item,
                            kind: item?.kind === 'forum' ? 'overheard' : 'slice',
                            text: item?.summary ?? item?.text,
                            speaker: item?.speaker ?? '',
                            place: item?.place ?? '',
                            note: item?.summary ?? '',
                        }))
                        : [])
            ),
        },
        continuity: {
            recentDynamics: normalizeRecentDynamics(source.continuity?.recentDynamics),
        },
        chronicle: normalizeChronicle(source.chronicle),
        guidance: (() => {
            const raw = source.guidance && typeof source.guidance === 'object' ? source.guidance : {};
            return {
                actionsUpdatedAt: raw.actionsUpdatedAt ?? raw.updatedAt ?? null,
                actionsSourceMessageId: Number.isInteger(raw.actionsSourceMessageId) ? raw.actionsSourceMessageId : null,
                placesUpdatedAt: raw.placesUpdatedAt ?? raw.updatedAt ?? null,
                actions: normalizeGuidanceActions(raw.actions),
                places: normalizeGuidancePlaces(raw.places),
            };
        })(),
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
