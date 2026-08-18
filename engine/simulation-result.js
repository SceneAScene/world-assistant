function cleanText(value, max = 2000) {
    return String(value ?? '').trim().slice(0, max);
}

const NO_CHANGE_TEXT = new Set([
    '无', '暂无', '无变化', '暂无变化', '没有变化', '无显著变化', '暂无显著变化',
    '无重要变化', '暂无重要变化', '无新增', '暂无新增', '一切正常', '局势稳定',
]);

function meaningfulText(value, max = 2000) {
    const text = cleanText(value, max);
    return !text || NO_CHANGE_TEXT.has(text) ? '' : text;
}

function stringArray(value, { maxItems = 80, maxLength = 600 } = {}) {
    if (!Array.isArray(value)) return [];
    const result = [];
    const seen = new Set();
    for (const item of value) {
        const text = meaningfulText(item, maxLength);
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
    try { payload = JSON.parse(extractJsonText(raw)); }
    catch (error) { throw new Error(`无法解析世界推演 JSON：${error?.message || error}`); }
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
        const text = meaningfulText(item.text ?? item.value, 600);
        if (!text) return null;
        return { text, evidence: meaningfulText(item.evidence, 500), sourceMessageId: sourceId };
    }, 30);
}

function uniqueKnowledge(previous, incoming, maxItems = 80) {
    const map = new Map();
    for (const item of [...(Array.isArray(previous) ? previous : []), ...(Array.isArray(incoming) ? incoming : [])]) {
        const normalized = typeof item === 'string'
            ? { text: meaningfulText(item, 600), evidence: '', sourceMessageId: null }
            : item;
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
    const key = meaningfulText(item.key ?? item.subject, 180);
    const value = meaningfulText(item.value ?? item.text, 900);
    if (!key && !value) return null;
    return {
        id: cleanText(item.id, 120) || slug(key || value.slice(0, 80), 'fact'),
        key: key || value.slice(0, 80),
        value,
        validity: validChoice(item.validity, ['current', 'upcoming', 'historical', 'persistent'], 'current'),
        source: 'simulation',
        evidence: meaningfulText(item.evidence, 500),
        sourceMessageId: source.id,
    };
}

function normalizeMoment(item, source) {
    const title = meaningfulText(item.title ?? item.label, 140);
    const text = meaningfulText(item.text ?? item.value ?? item.summary, 1200);
    if (!title || !text) return null;
    return {
        id: cleanText(item.id, 120) || slug(title, 'moment'),
        title,
        text,
        sourceMessageId: source.id,
    };
}

function detailsMap(items) {
    const map = new Map();
    for (const item of Array.isArray(items) ? items : []) {
        if (!item || typeof item !== 'object') continue;
        const label = meaningfulText(item.label ?? item.key, 80);
        const value = meaningfulText(item.value ?? item.text, 700);
        if (label && value) map.set(label, { label, value });
    }
    return map;
}

function normalizePerson(item, source, existing) {
    const name = meaningfulText(item.name, 120) || existing?.name || '';
    if (!name) return null;
    const id = cleanText(item.id, 120) || existing?.id || slug(name, 'person');
    const details = detailsMap(existing?.details);
    for (const label of stringArray(item.details_remove, { maxItems: 20, maxLength: 80 })) details.delete(label);
    for (const [label, value] of detailsMap(item.details_upsert)) details.set(label, value);

    const location = meaningfulText(item.location, 260);
    const status = meaningfulText(item.status, 900);
    return {
        ...(existing || {}),
        id,
        name,
        aliases: Array.isArray(item.aliases) && item.aliases.length
            ? stringArray(item.aliases, { maxItems: 20, maxLength: 120 })
            : (Array.isArray(existing?.aliases) ? existing.aliases : []),
        location: location || existing?.location || '',
        status: status || existing?.status || '',
        details: [...details.values()].slice(0, 24),
        knowledge: uniqueKnowledge(existing?.knowledge, normalizeKnowledgeAdd(item.knowledge_add ?? item.knowledgeAdd, source.id)),
        lastUpdatedMessageId: source.id,
    };
}

function normalizeWorldlineMemory(item, source) {
    const text = meaningfulText(item.text ?? item.value, 700);
    if (!text) return null;
    return {
        id: cleanText(item.id, 120) || slug(text, 'memory'),
        text,
        reason: meaningfulText(item.reason, 300),
        evidence: meaningfulText(item.evidence, 500),
        sourceMessageId: source.id,
        recordedAt: new Date().toISOString(),
    };
}

function mergeWorldlineMemory(previous, incoming, maxItems = 120) {
    const map = new Map();
    for (const item of [...(Array.isArray(previous) ? previous : []), ...incoming]) {
        if (!item?.text) continue;
        const key = item.id || item.text;
        map.set(key, item);
    }
    return [...map.values()].slice(-maxItems);
}

export function summarizeSimulationPayload(payload) {
    const patch = payload?.world_patch && typeof payload.world_patch === 'object' && !Array.isArray(payload.world_patch)
        ? payload.world_patch : {};
    return {
        worldPatch: Boolean(meaningfulText(patch.location, 300) || meaningfulText(patch.summary, 1600) || (patch.time !== undefined && patch.time !== '' && patch.time !== null)),
        momentsUpsert: Array.isArray(payload?.moment_items_upsert) ? payload.moment_items_upsert.length : 0,
        momentsRemove: Array.isArray(payload?.moment_items_remove_ids) ? payload.moment_items_remove_ids.length : 0,
        facts: Array.isArray(payload?.world_facts_upsert) ? payload.world_facts_upsert.length : 0,
        people: Array.isArray(payload?.people_upsert) ? payload.people_upsert.length : 0,
        memory: Array.isArray(payload?.worldline_memory_add) ? payload.worldline_memory_add.length : 0,
    };
}

export function applySimulationPayload(baseState, payload, source) {
    const next = typeof structuredClone === 'function' ? structuredClone(baseState) : JSON.parse(JSON.stringify(baseState));
    next.world = next.world && typeof next.world === 'object'
        ? next.world : { time: null, location: '', summary: '', moments: [], facts: [] };

    const patch = payload.world_patch && typeof payload.world_patch === 'object' && !Array.isArray(payload.world_patch)
        ? payload.world_patch : {};
    if (patch.time !== undefined && patch.time !== null && patch.time !== '') {
        const time = meaningfulText(patch.time, 120);
        if (time) next.world.time = time;
    }
    const location = meaningfulText(patch.location, 300);
    const summary = meaningfulText(patch.summary, 1600);
    if (location) next.world.location = location;
    if (summary) next.world.summary = summary;

    const removeMomentIds = new Set(stringArray(payload.moment_items_remove_ids, { maxItems: 60, maxLength: 120 }));
    const previousMoments = (Array.isArray(next.world.moments) ? next.world.moments : []).filter(item => !removeMomentIds.has(cleanText(item?.id, 120)));
    const incomingMoments = objectArray(payload.moment_items_upsert, item => normalizeMoment(item, source), 40);
    next.world.moments = upsertByIdentity(previousMoments, incomingMoments, item => cleanText(item?.id, 120) || cleanText(item?.title, 140)).slice(-80);

    const incomingFacts = objectArray(payload.world_facts_upsert, item => normalizeFact(item, source), 40);
    next.world.facts = upsertByIdentity(next.world.facts, incomingFacts, item => cleanText(item?.id, 120) || cleanText(item?.key, 180)).slice(-160);

    const previousPeople = Array.isArray(next.people) ? next.people : [];
    const personUpdates = objectArray(payload.people_upsert, item => {
        const id = cleanText(item.id, 120);
        const name = meaningfulText(item.name, 120);
        const existing = previousPeople.find(person => (id && person.id === id) || (!id && name && person.name === name));
        return normalizePerson(item, source, existing);
    }, 80);
    next.people = upsertByIdentity(previousPeople, personUpdates, item => cleanText(item?.id, 120) || cleanText(item?.name, 120)).slice(0, 180);

    next.memory = next.memory && typeof next.memory === 'object' ? next.memory : { worldline: [] };
    const incomingMemory = objectArray(payload.worldline_memory_add, item => normalizeWorldlineMemory(item, source), 24);
    next.memory.worldline = mergeWorldlineMemory(next.memory.worldline, incomingMemory, 120);

    next.sync = {
        ...(next.sync && typeof next.sync === 'object' ? next.sync : {}),
        lastProcessedAssistantMessageId: source.id,
        lastProcessedAssistantFingerprint: source.fingerprint,
        lastProcessedAt: new Date().toISOString(),
        lastProcessedAssistantRangeStartId: Number.isInteger(source.startId) ? source.startId : source.id,
        lastProcessedAssistantCount: Number.isInteger(source.assistantCount) ? source.assistantCount : 1,
        lastProcessedAssistantRangeFingerprint: String(source.rangeFingerprint ?? ''),
        lastProcessedAssistantCharacters: Number.isFinite(source.characters) ? Math.max(0, Math.trunc(source.characters)) : 0,
    };
    return next;
}
