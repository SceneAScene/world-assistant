function cleanText(value, max = 2000) {
    return String(value ?? '').trim().slice(0, max);
}

const NO_CHANGE_TEXT = new Set([
    '无', '暂无', '无变化', '暂无变化', '没有变化', '无显著变化', '暂无显著变化',
    '无重要变化', '暂无重要变化', '无新增', '暂无新增', '一切正常', '局势稳定',
    'none', 'no change', 'no changes', 'n/a',
]);

function meaningfulText(value, max = 2000) {
    const text = cleanText(value, max);
    if (!text) return '';
    const normalized = text.toLowerCase().replace(/[。.!！；;，,\s]+$/g, '');
    if (NO_CHANGE_TEXT.has(text) || NO_CHANGE_TEXT.has(normalized)) return '';
    if (/^(?:当前|目前)?(?:没有|暂无).{0,10}(?:值得|需要).{0,10}(?:概括|记录|知道).{0,10}(?:世界)?(?:变化|状态)$/.test(normalized)) return '';
    return text;
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

function candidateJsonTexts(raw) {
    const text = String(raw ?? '').replace(/^\uFEFF/, '').trim();
    if (!text) return [];
    const result = [];
    const push = value => {
        const candidate = String(value ?? '').trim();
        if (candidate && !result.includes(candidate)) result.push(candidate);
    };

    // 优先接受模型直接返回的完整 JSON。
    push(text);

    // 兼容 ```json ... ```，但只取完整围栏内容，不扫描内部任意嵌套对象。
    const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
    for (const match of fenced) push(match[1]);

    // 兼容“下面是 JSON：{...}”这种少量前后说明：只截取首个 { 到最后一个 } 的整体。
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first >= 0 && last > first) push(text.slice(first, last + 1));
    return result;
}

const SIMULATION_ARRAY_KEYS = Object.freeze([
    'moment_items_upsert',
    'moment_items_remove_ids',
    'world_facts_upsert',
    'world_facts_remove_ids',
    'people_upsert',
    'action_suggestions',
]);

function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
}

function assertSimulationContract(payload, { requiresBaseline = false } = {}) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('世界推演结果不是 JSON 对象');
    if (!hasOwn(payload, 'world_patch') || !payload.world_patch || typeof payload.world_patch !== 'object' || Array.isArray(payload.world_patch)) {
        throw new Error('缺少有效的 world_patch');
    }
    if (!hasOwn(payload, 'simulation_digest')) throw new Error('缺少 simulation_digest');
    for (const key of SIMULATION_ARRAY_KEYS) {
        if (!hasOwn(payload, key) || !Array.isArray(payload[key])) throw new Error(`缺少数组字段 ${key}`);
    }
    if (requiresBaseline && !meaningfulText(payload.world_patch.summary, 1600)) {
        throw new Error('首次世界推演没有返回“当前世界”基线摘要。本次结果不会保存，请重试；若仍失败可减少单批正文或参考条目。');
    }
    const actions = payload.action_suggestions;
    if (actions.length < 3 || actions.length > 5) {
        throw new Error(`行动建议应为 3～5 条，当前返回 ${actions.length} 条。本次结果不会保存。`);
    }
    return payload;
}

export function parseSimulationResponse(raw, options = {}) {
    let lastError = null;
    for (const candidate of candidateJsonTexts(raw)) {
        try {
            const payload = JSON.parse(candidate);
            return assertSimulationContract(payload, options);
        } catch (error) {
            lastError = error;
        }
    }
    throw new Error(`无法解析完整的世界推演 JSON：${lastError?.message || '模型返回不是完整 JSON'}。本次结果不会保存。`);
}

export function validateSimulationPayload(payload, options = {}) {
    return assertSimulationContract(payload, options);
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
        publicity: validChoice(item.publicity, ['private', 'trace', 'public'], 'private'),
        publicHint: meaningfulText(item.public_hint ?? item.publicHint, 500),
        updatedAt: new Date().toISOString(),
    };
}

function normalizeFactKey(value) {
    return cleanText(value, 180).replace(/\s+/g, ' ').toLowerCase();
}

function mergeFacts(previous, incoming, maxItems = 20) {
    const result = Array.isArray(previous) ? previous.map(item => ({ ...item })) : [];
    for (const item of incoming) {
        if (!item) continue;
        const id = cleanText(item.id, 120);
        const key = normalizeFactKey(item.key);
        let index = -1;
        if (id) index = result.findIndex(existing => cleanText(existing?.id, 120) === id);
        if (index < 0 && key) index = result.findIndex(existing => normalizeFactKey(existing?.key) === key);
        if (index >= 0) result[index] = { ...result[index], ...item, id: result[index].id || item.id };
        else result.push(item);
    }
    const deduped = [];
    const seenIds = new Set();
    const seenKeys = new Set();
    for (const item of result) {
        const id = cleanText(item?.id, 120);
        const key = normalizeFactKey(item?.key);
        if ((id && seenIds.has(id)) || (key && seenKeys.has(key))) continue;
        if (id) seenIds.add(id);
        if (key) seenKeys.add(key);
        deduped.push(item);
    }
    return deduped.slice(-maxItems);
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


function looksLikeUiStat(value) {
    const text = cleanText(value, 900);
    if (!text) return false;
    if (/(?:今日|本日|累计).{0,12}次数\s*[:：]?\s*[+-]?\d+(?:\.\d+)?\s*次?/i.test(text)) return true;
    if (/(?:好感|亲密|欲望|快感|高潮|HP|MP|SAN|经验值?|属性值?|进度值?|等级|level).{0,12}[:：=]?\s*[+-]?\d/i.test(text)) return true;
    if (/^[^。！？!?\n]{1,24}[:：]\s*[+-]?\d+(?:\.\d+)?\s*(?:次|点|级|%|％)?$/i.test(text)) return true;
    if (/\b\d+\s*\/\s*\d+\b/.test(text)) return true;
    return false;
}

function detailsMap(items, { rejectUiStats = false } = {}) {
    const map = new Map();
    for (const item of Array.isArray(items) ? items : []) {
        if (!item || typeof item !== 'object') continue;
        const label = meaningfulText(item.label ?? item.key, 80);
        const value = meaningfulText(item.value ?? item.text, 700);
        if (rejectUiStats && (looksLikeUiStat(label) || looksLikeUiStat(value) || looksLikeUiStat(`${label}：${value}`))) continue;
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
    for (const [label, value] of detailsMap(item.details_upsert, { rejectUiStats: true })) details.set(label, value);

    const location = meaningfulText(item.location, 260);
    const statusRaw = meaningfulText(item.status, 900);
    const status = looksLikeUiStat(statusRaw) ? '' : statusRaw;
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

const MEMORY_CATEGORIES = ['身份', '长期地点', '关系', '承诺', '认知', '后果', '世界规则', '持有物', '其他'];
const MEMORY_STATUSES = ['当前', '长期', '历史'];

function normalizeMemoryKey(value) {
    return cleanText(value, 180).replace(/\s+/g, ' ').toLowerCase();
}

function findExistingMemory(previous, item) {
    const id = cleanText(item?.id, 120);
    const key = normalizeMemoryKey(item?.key ?? item?.memory_key ?? item?.memoryKey);
    if (id) {
        const byId = previous.find(entry => cleanText(entry?.id, 120) === id);
        if (byId) return byId;
    }
    if (key) {
        const byKey = previous.find(entry => normalizeMemoryKey(entry?.key) === key);
        if (byKey) return byKey;
    }
    return null;
}

function normalizeWorldlineMemory(item, source, existing = null) {
    const text = meaningfulText(item.text ?? item.value, 700);
    if (!text) return null;
    const key = meaningfulText(item.key ?? item.memory_key ?? item.memoryKey, 180) || existing?.key || '';
    const now = new Date().toISOString();
    const idSeed = key || text;
    return {
        ...(existing || {}),
        id: cleanText(item.id, 120) || existing?.id || slug(idSeed, 'memory'),
        key,
        category: validChoice(item.category, MEMORY_CATEGORIES, existing?.category || '其他'),
        status: validChoice(item.status, MEMORY_STATUSES, existing?.status || '长期'),
        text,
        reason: meaningfulText(item.reason, 300) || existing?.reason || '',
        evidence: meaningfulText(item.evidence, 500),
        sourceStartMessageId: Number.isInteger(source.startId) ? source.startId : source.id,
        sourceEndMessageId: source.id,
        createdAt: existing?.createdAt || existing?.recordedAt || now,
        updatedAt: now,
    };
}

function mergeWorldlineMemory(previous, incoming, removeIds = [], maxItems = 120) {
    const removed = new Set(removeIds.map(value => cleanText(value, 120)).filter(Boolean));
    const result = (Array.isArray(previous) ? previous : [])
        .filter(item => item?.text && !removed.has(cleanText(item?.id, 120)))
        .map(item => ({ ...item }));

    for (const item of incoming) {
        if (!item?.text) continue;
        const id = cleanText(item.id, 120);
        const key = normalizeMemoryKey(item.key);
        let index = -1;
        if (id) index = result.findIndex(existing => cleanText(existing?.id, 120) === id);
        if (index < 0 && key) index = result.findIndex(existing => normalizeMemoryKey(existing?.key) === key);
        if (index < 0) index = result.findIndex(existing => existing?.text === item.text);
        if (index >= 0) result[index] = { ...result[index], ...item };
        else result.push(item);
    }

    const deduped = [];
    const seenIds = new Set();
    const seenKeys = new Set();
    const seenTexts = new Set();
    for (const item of result) {
        const id = cleanText(item?.id, 120);
        const key = normalizeMemoryKey(item?.key);
        const textKey = cleanText(item?.text, 700);
        if ((id && seenIds.has(id)) || (key && seenKeys.has(key)) || (!id && !key && seenTexts.has(textKey))) continue;
        if (id) seenIds.add(id);
        if (key) seenKeys.add(key);
        if (textKey) seenTexts.add(textKey);
        deduped.push(item);
    }
    return deduped.slice(-maxItems);
}

function normalizeActionSuggestions(value, source) {
    return objectArray(value, item => {
        const title = meaningfulText(item.title, 140);
        const prompt = meaningfulText(item.prompt ?? item.text, 700);
        if (!title || !prompt) return null;
        return {
            id: slug(`${source.id}|action|${title}|${prompt}`, 'action'),
            title,
            prompt,
            reason: meaningfulText(item.reason, 500),
            tone: meaningfulText(item.tone, 60),
        };
    }, 5);
}

export function summarizeSimulationPayload(payload) {
    const patch = payload?.world_patch && typeof payload.world_patch === 'object' && !Array.isArray(payload.world_patch)
        ? payload.world_patch : {};
    return {
        worldPatch: Boolean(meaningfulText(patch.location, 300) || meaningfulText(patch.summary, 1600) || (patch.time !== undefined && patch.time !== '' && patch.time !== null)),
        momentsUpsert: Array.isArray(payload?.moment_items_upsert) ? payload.moment_items_upsert.length : 0,
        momentsRemove: Array.isArray(payload?.moment_items_remove_ids) ? payload.moment_items_remove_ids.length : 0,
        factsUpsert: Array.isArray(payload?.world_facts_upsert) ? payload.world_facts_upsert.length : 0,
        factsRemove: Array.isArray(payload?.world_facts_remove_ids) ? payload.world_facts_remove_ids.length : 0,
        people: Array.isArray(payload?.people_upsert) ? payload.people_upsert.length : 0,
        recentDynamic: Boolean(meaningfulText(payload?.simulation_digest, 1400)),
        actions: Array.isArray(payload?.action_suggestions) ? Math.min(payload.action_suggestions.length, 5) : 0,
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
    next.world.moments = upsertByIdentity(previousMoments, incomingMoments, item => cleanText(item?.id, 120) || cleanText(item?.title, 140)).slice(-20);

    const removeFactIds = new Set(stringArray(payload.world_facts_remove_ids, { maxItems: 30, maxLength: 120 }));
    const previousFacts = (Array.isArray(next.world.facts) ? next.world.facts : [])
        .filter(item => !removeFactIds.has(cleanText(item?.id, 120)));
    const incomingFacts = objectArray(payload.world_facts_upsert, item => normalizeFact(item, source), 30);
    next.world.facts = mergeFacts(previousFacts, incomingFacts, 20);

    const previousPeople = Array.isArray(next.people) ? next.people : [];
    const personUpdates = objectArray(payload.people_upsert, item => {
        const id = cleanText(item.id, 120);
        const name = meaningfulText(item.name, 120);
        const existing = previousPeople.find(person => (id && person.id === id) || (!id && name && person.name === name));
        return normalizePerson(item, source, existing);
    }, 80);
    next.people = upsertByIdentity(previousPeople, personUpdates, item => cleanText(item?.id, 120) || cleanText(item?.name, 120)).slice(0, 180);

    next.continuity = next.continuity && typeof next.continuity === 'object' ? next.continuity : { recentDynamics: [] };
    const digest = meaningfulText(payload.simulation_digest, 1400);
    if (digest) {
        const now = new Date().toISOString();
        const recent = Array.isArray(next.continuity.recentDynamics) ? next.continuity.recentDynamics : [];
        recent.push({
            id: slug(`${source.startId ?? source.id}|${source.id}|${source.rangeFingerprint ?? ''}`, 'dynamic'),
            summary: digest,
            sourceStartMessageId: Number.isInteger(source.startId) ? source.startId : source.id,
            sourceEndMessageId: source.id,
            createdAt: now,
            storyTime: next.world?.time || null,
        });
        next.continuity.recentDynamics = recent.slice(-5);
    } else {
        next.continuity.recentDynamics = (Array.isArray(next.continuity.recentDynamics) ? next.continuity.recentDynamics : []).slice(-5);
    }

    next.guidance = next.guidance && typeof next.guidance === 'object' ? next.guidance : { actions: [], places: [] };
    next.guidance.actions = normalizeActionSuggestions(payload.action_suggestions, source);
    next.guidance.actionsUpdatedAt = new Date().toISOString();
    next.guidance.actionsSourceMessageId = source.id;
    next.guidance.places = Array.isArray(next.guidance.places) ? next.guidance.places : [];
    next.guidance.placesUpdatedAt = next.guidance.placesUpdatedAt ?? null;

    next.sync = {
        ...(next.sync && typeof next.sync === 'object' ? next.sync : {}),
        lastProcessedAssistantMessageId: source.id,
        lastProcessedAssistantFingerprint: source.fingerprint,
        lastProcessedAt: new Date().toISOString(),
        lastProcessedAssistantRangeStartId: Number.isInteger(source.startId) ? source.startId : source.id,
        lastProcessedAssistantCount: Number.isInteger(source.assistantCount) ? source.assistantCount : 1,
        lastProcessedAssistantRangeFingerprint: String(source.rangeFingerprint ?? ''),
        lastProcessedAssistantCharacters: Number.isFinite(source.characters) ? Math.max(0, Math.trunc(source.characters)) : 0,
        lastProcessedContentFilterSignature: String(source.contentFilterSignature ?? ''),
        lastProcessedStoryTime: next.world?.time || null,
    };
    return next;
}
