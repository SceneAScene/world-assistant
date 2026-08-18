function cleanText(value, max = 2000) {
    return String(value ?? '').trim().slice(0, max);
}

function stringArray(value, { maxItems = 80, maxLength = 600 } = {}) {
    if (!Array.isArray(value)) return [];
    const result = [];
    const seen = new Set();
    for (const item of value) {
        const text = cleanText(item, maxLength);
        if (!text || seen.has(text)) continue;
        seen.add(text);
        result.push(text);
        if (result.length >= maxItems) break;
    }
    return result;
}

function objectArray(value, mapper, maxItems = 120) {
    if (!Array.isArray(value)) return [];
    const result = [];
    for (const item of value) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
        const mapped = mapper(item);
        if (mapped) result.push(mapped);
        if (result.length >= maxItems) break;
    }
    return result;
}

function balancedObjectFrom(text, start) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
        const char = text[index];
        if (inString) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') inString = false;
            continue;
        }
        if (char === '"') { inString = true; continue; }
        if (char === '{') depth += 1;
        else if (char === '}') {
            depth -= 1;
            if (depth === 0) return text.slice(start, index + 1);
        }
    }
    return null;
}

function extractJsonText(raw) {
    const text = String(raw ?? '').trim();
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    const candidates = fenced ? [fenced, text] : [text];
    for (const candidate of candidates) {
        for (let start = candidate.indexOf('{'); start >= 0; start = candidate.indexOf('{', start + 1)) {
            const objectText = balancedObjectFrom(candidate, start);
            if (!objectText) continue;
            try { JSON.parse(objectText); return objectText; } catch { /* try next */ }
        }
    }
    throw new Error('模型返回中没有找到可解析的完整 JSON 对象');
}

export function parseSimulationResponse(raw) {
    let payload;
    try {
        payload = JSON.parse(extractJsonText(raw));
    } catch (error) {
        throw new Error(`无法解析世界推演 JSON：${error?.message || error}`);
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('世界推演结果不是 JSON 对象');
    return payload;
}

function slug(value, prefix) {
    const text = cleanText(value, 220).toLowerCase();
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return `${prefix}_${(hash >>> 0).toString(36)}`;
}

function validChoice(value, allowed, fallback) {
    const text = cleanText(value, 80);
    return allowed.includes(text) ? text : fallback;
}

function normalizeKnowledgeAdd(value, sourceId) {
    return objectArray(value, item => {
        const text = cleanText(item.text ?? item.value, 600);
        if (!text) return null;
        return {
            text,
            evidence: cleanText(item.evidence, 500),
            sourceMessageId: sourceId,
        };
    }, 30);
}

function uniqueKnowledge(previous, incoming, maxItems = 80) {
    const map = new Map();
    for (const item of [...(Array.isArray(previous) ? previous : []), ...(Array.isArray(incoming) ? incoming : [])]) {
        const normalized = typeof item === 'string' ? { text: cleanText(item, 600), evidence: '', sourceMessageId: null } : item;
        if (!normalized?.text) continue;
        map.set(normalized.text, normalized);
    }
    return [...map.values()].slice(-maxItems);
}

function upsertByIdentity(previous, incoming, identity) {
    const result = Array.isArray(previous) ? previous.map(item => ({ ...item })) : [];
    for (const item of incoming) {
        const key = identity(item);
        if (!key) continue;
        const index = result.findIndex(existing => identity(existing) === key);
        if (index >= 0) result[index] = { ...result[index], ...item };
        else result.push(item);
    }
    return result;
}

function normalizeFact(item, source) {
    const key = cleanText(item.key ?? item.subject, 180);
    const value = cleanText(item.value ?? item.text, 900);
    if (!key && !value) return null;
    return {
        id: cleanText(item.id, 120) || slug(`${key}|${value}`, 'fact'),
        key: key || value.slice(0, 80),
        value,
        validity: validChoice(item.validity, ['current', 'upcoming', 'historical', 'persistent'], 'current'),
        source: 'simulation',
        evidence: cleanText(item.evidence, 500),
        sourceMessageId: source.id,
    };
}

function normalizePerson(item, source, existing) {
    const name = cleanText(item.name, 120);
    if (!name) return null;
    const id = cleanText(item.id, 120) || existing?.id || slug(name, 'person');
    return {
        ...(existing || {}),
        id,
        name,
        aliases: stringArray(item.aliases ?? existing?.aliases, { maxItems: 20, maxLength: 120 }),
        location: cleanText(item.location, 260) || existing?.location || '',
        status: cleanText(item.status, 900) || existing?.status || '',
        goal: cleanText(item.goal, 700) || existing?.goal || '',
        knowledge: uniqueKnowledge(existing?.knowledge, normalizeKnowledgeAdd(item.knowledge_add ?? item.knowledgeAdd, source.id)),
        lastUpdatedMessageId: source.id,
    };
}

function normalizeUndercurrent(item, source, existing) {
    const title = cleanText(item.title, 180);
    if (!title) return null;
    return {
        ...(existing || {}),
        id: cleanText(item.id, 120) || existing?.id || slug(title, 'flow'),
        title,
        status: validChoice(item.status, ['open', 'developing', 'resolved', 'cancelled'], existing?.status || 'open'),
        summary: cleanText(item.summary, 1400) || existing?.summary || '',
        participants: stringArray(item.participants ?? existing?.participants, { maxItems: 30, maxLength: 120 }),
        visibility: validChoice(item.visibility, ['hidden', 'approaching', 'visible'], existing?.visibility || 'hidden'),
        lastUpdatedMessageId: source.id,
    };
}

function normalizeEcho(item, source, existing) {
    const title = cleanText(item.title, 180);
    if (!title) return null;
    return {
        ...(existing || {}),
        id: cleanText(item.id, 120) || existing?.id || slug(title, 'echo'),
        title,
        status: validChoice(item.status, ['active', 'resolved'], existing?.status || 'active'),
        kind: validChoice(item.kind, ['relationship', 'object', 'promise', 'conflict', 'clue', 'consequence', 'other'], existing?.kind || 'other'),
        summary: cleanText(item.summary, 1200) || existing?.summary || '',
        lastUpdatedMessageId: source.id,
    };
}

function mergeUniqueStrings(previous, incoming, maxItems = 100) {
    const result = [];
    const seen = new Set();
    for (const item of [...(Array.isArray(previous) ? previous : []), ...(Array.isArray(incoming) ? incoming : [])]) {
        const text = cleanText(typeof item === 'string' ? item : item?.text, 600);
        if (!text || seen.has(text)) continue;
        seen.add(text);
        result.push(text);
    }
    return result.slice(-maxItems);
}

export function applySimulationPayload(baseState, payload, source) {
    const next = typeof structuredClone === 'function' ? structuredClone(baseState) : JSON.parse(JSON.stringify(baseState));

    const patch = payload.world_patch && typeof payload.world_patch === 'object' && !Array.isArray(payload.world_patch)
        ? payload.world_patch : {};
    next.world = next.world && typeof next.world === 'object' ? next.world : { time: null, location: '', summary: '', facts: [] };
    if (patch.time !== undefined && patch.time !== '') next.world.time = patch.time === null ? null : cleanText(patch.time, 120);
    if (cleanText(patch.location, 300)) next.world.location = cleanText(patch.location, 300);
    if (cleanText(patch.summary, 1600)) next.world.summary = cleanText(patch.summary, 1600);

    const incomingFacts = objectArray(payload.world_facts_upsert, item => normalizeFact(item, source), 40);
    next.world.facts = upsertByIdentity(next.world.facts, incomingFacts, item => cleanText(item?.id, 120) || cleanText(item?.key, 180)).slice(-160);

    const previousPeople = Array.isArray(next.people) ? next.people : [];
    const personUpdates = objectArray(payload.people_upsert, item => {
        const id = cleanText(item.id, 120);
        const name = cleanText(item.name, 120);
        const existing = previousPeople.find(p => (id && p.id === id) || (!id && name && p.name === name));
        return normalizePerson(item, source, existing);
    }, 80);
    next.people = upsertByIdentity(previousPeople, personUpdates, item => cleanText(item?.id, 120) || cleanText(item?.name, 120)).slice(0, 180);

    const previousFlows = Array.isArray(next.undercurrents) ? next.undercurrents : [];
    const flowUpdates = objectArray(payload.undercurrents_upsert, item => {
        const id = cleanText(item.id, 120);
        const title = cleanText(item.title, 180);
        const existing = previousFlows.find(x => (id && x.id === id) || (!id && title && x.title === title));
        return normalizeUndercurrent(item, source, existing);
    }, 60);
    next.undercurrents = upsertByIdentity(previousFlows, flowUpdates, item => cleanText(item?.id, 120) || cleanText(item?.title, 180)).slice(0, 140);

    const previousEchoes = Array.isArray(next.echoes) ? next.echoes : [];
    const echoUpdates = objectArray(payload.echoes_upsert, item => {
        const id = cleanText(item.id, 120);
        const title = cleanText(item.title, 180);
        const existing = previousEchoes.find(x => (id && x.id === id) || (!id && title && x.title === title));
        return normalizeEcho(item, source, existing);
    }, 60);
    next.echoes = upsertByIdentity(previousEchoes, echoUpdates, item => cleanText(item?.id, 120) || cleanText(item?.title, 180)).slice(-160);

    next.memory = next.memory && typeof next.memory === 'object' ? next.memory : { shortTerm: [], longTerm: [] };
    next.memory.shortTerm = mergeUniqueStrings(next.memory.shortTerm, stringArray(payload.memory_short_term_add, { maxItems: 30, maxLength: 600 }), 120);
    next.memory.longTerm = Array.isArray(next.memory.longTerm) ? next.memory.longTerm : [];

    const rawEntry = payload.chronicle_entry;
    if (rawEntry && typeof rawEntry === 'object' && !Array.isArray(rawEntry)) {
        const entry = {
            time: cleanText(rawEntry.time, 120),
            title: cleanText(rawEntry.title, 220),
            summary: cleanText(rawEntry.summary, 1800),
            sourceMessageId: source.id,
            sourceFingerprint: source.fingerprint,
            recordedAt: new Date().toISOString(),
        };
        if (entry.title || entry.summary) {
            next.chronicle = Array.isArray(next.chronicle) ? next.chronicle : [];
            const existingIndex = next.chronicle.findIndex(item => item?.sourceMessageId === source.id && item?.sourceFingerprint === source.fingerprint);
            if (existingIndex >= 0) next.chronicle[existingIndex] = entry;
            else next.chronicle = [...next.chronicle, entry].slice(-300);
        }
    }

    next.sync = {
        ...(next.sync && typeof next.sync === 'object' ? next.sync : {}),
        lastProcessedMessageId: source.id,
        lastProcessedFingerprint: source.fingerprint,
        lastProcessedAt: new Date().toISOString(),
    };
    return next;
}
