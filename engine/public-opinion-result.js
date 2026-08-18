function cleanText(value, max = 2000) {
    return String(value ?? '').trim().slice(0, max);
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
            try { JSON.parse(objectText); return objectText; } catch { /* keep searching */ }
        }
    }
    throw new Error('模型返回中没有找到可解析的完整 JSON 对象');
}

export function parsePublicOpinionResponse(raw) {
    let payload;
    try { payload = JSON.parse(extractJsonText(raw)); }
    catch (error) { throw new Error(`无法解析见闻 JSON：${error?.message || error}`); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('见闻结果不是 JSON 对象');
    return payload;
}

function hash(value, prefix) {
    const text = cleanText(value, 2000).toLowerCase();
    let state = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
        state ^= text.charCodeAt(i);
        state = Math.imul(state, 16777619);
    }
    return `${prefix}_${(state >>> 0).toString(36)}`;
}

function uniqueStrings(value, allowedIds, max = 12) {
    if (!Array.isArray(value)) return [];
    const result = [];
    const seen = new Set();
    for (const raw of value) {
        const id = cleanText(raw, 120);
        if (!id || seen.has(id) || (allowedIds && !allowedIds.has(id))) continue;
        seen.add(id);
        result.push(id);
        if (result.length >= max) break;
    }
    return result;
}

function normalizeReplies(value) {
    if (!Array.isArray(value)) return [];
    return value.map(reply => {
        if (!reply || typeof reply !== 'object') return null;
        const text = cleanText(reply.text ?? reply.content, 500);
        if (!text) return null;
        return { author: cleanText(reply.author ?? reply.name, 80) || '匿名', text };
    }).filter(Boolean).slice(0, 6);
}

export function normalizeCanonicalOpinionPayload(payload, { sources, generatedAt = new Date().toISOString() } = {}) {
    const sourceList = Array.isArray(sources) ? sources : [];
    const publicIds = new Set(sourceList.filter(item => item.publicity === 'public').map(item => item.id));
    const forumIds = new Set(sourceList.filter(item => item.publicity === 'public' || item.publicity === 'trace').map(item => item.id));

    const news = (Array.isArray(payload?.news) ? payload.news : []).map((item, index) => {
        if (!item || typeof item !== 'object') return null;
        const headline = cleanText(item.headline ?? item.title, 180);
        const summary = cleanText(item.summary ?? item.text, 900);
        const relatedFactIds = uniqueStrings(item.relatedFactIds ?? item.related_fact_ids, publicIds);
        if (!headline || !summary || !relatedFactIds.length) return null;
        return {
            id: hash(`${generatedAt}|news|${index}|${headline}`, 'news'),
            category: cleanText(item.category, 60) || '公共消息',
            headline,
            summary,
            source: cleanText(item.source, 120) || '公开信息',
            sourceType: ['official', 'unofficial'].includes(cleanText(item.sourceType, 30)) ? cleanText(item.sourceType, 30) : 'unofficial',
            scope: cleanText(item.scope, 100),
            confidence: ['high', 'medium'].includes(cleanText(item.confidence, 20)) ? cleanText(item.confidence, 20) : 'high',
            relatedFactIds,
            generatedAt,
            canon: true,
        };
    }).filter(Boolean).slice(0, 8);

    const forum = (Array.isArray(payload?.forum ?? payload?.forums) ? (payload.forum ?? payload.forums) : []).map((item, index) => {
        if (!item || typeof item !== 'object') return null;
        const title = cleanText(item.title, 180);
        const summary = cleanText(item.summary ?? item.text, 900);
        const relatedFactIds = uniqueStrings(item.relatedFactIds ?? item.related_fact_ids, forumIds);
        if (!title || !summary || !relatedFactIds.length) return null;
        const statusRaw = cleanText(item.claimStatus ?? item.claim_status, 20);
        const referencesTrace = relatedFactIds.some(id => sourceList.find(source => source.id === id)?.publicity === 'trace');
        const claimStatus = referencesTrace
            ? (statusRaw === 'rumor' ? 'rumor' : 'mixed')
            : (['fact', 'mixed', 'rumor'].includes(statusRaw) ? statusRaw : 'mixed');
        return {
            id: hash(`${generatedAt}|forum|${index}|${title}`, 'forum'),
            board: cleanText(item.board, 80) || '公共讨论',
            title,
            summary,
            claimStatus,
            relatedFactIds,
            replies: normalizeReplies(item.replies),
            generatedAt,
            canon: true,
        };
    }).filter(Boolean).slice(0, 8);

    return { news, forum };
}

export function normalizeStreetOpinionPayload(payload, { generatedAt = new Date().toISOString() } = {}) {
    const allowedKinds = new Set(['overheard', 'gossip', 'curiosity', 'local_incident', 'notice', 'slice']);
    const items = [];
    for (const [index, item] of (Array.isArray(payload?.street) ? payload.street : []).entries()) {
        if (!item || typeof item !== 'object') continue;
        const title = cleanText(item.title ?? item.category, 180);
        const text = cleanText(item.text ?? item.quote ?? item.summary, 900);
        if (!title || !text) continue;
        const kindRaw = cleanText(item.kind, 30).toLowerCase();
        items.push({
            id: hash(`${generatedAt}|street|${index}|${title}|${text}`, 'street'),
            kind: allowedKinds.has(kindRaw) ? kindRaw : 'slice',
            category: cleanText(item.category, 60) || '市井闲闻',
            title,
            text,
            speaker: cleanText(item.speaker ?? item.author, 100),
            place: cleanText(item.place ?? item.location, 140),
            note: cleanText(item.note ?? item.context, 700),
            generatedAt,
            canon: false,
            nonCanon: true,
        });
    }
    return items.slice(0, 12);
}

export function normalizeStreetWanderPayload(payload, { generatedAt = new Date().toISOString() } = {}) {
    const street = normalizeStreetOpinionPayload(payload, { generatedAt });
    const places = (Array.isArray(payload?.places) ? payload.places : []).map((item, index) => {
        if (!item || typeof item !== 'object') return null;
        const name = cleanText(item.name ?? item.title, 160);
        const prompt = cleanText(item.prompt ?? item.text, 700);
        if (!name || !prompt) return null;
        return {
            id: hash(`${generatedAt}|place|${index}|${name}|${prompt}`, 'place'),
            name,
            type: cleanText(item.type, 80),
            why: cleanText(item.why ?? item.reason, 500),
            prompt,
            established: item.established === true,
        };
    }).filter(Boolean).slice(0, 5);
    return { street, places };
}
