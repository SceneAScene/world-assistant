function cleanText(value) {
    return String(value ?? '').replace(/\r\n?/g, '\n').trim();
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeNarrativeTagNames(value) {
    const source = Array.isArray(value) ? value : String(value ?? '').split(/[\n,，;；]+/g);
    const result = [];
    const seen = new Set();
    for (const raw of source) {
        let name = String(raw ?? '').trim();
        if (!name) continue;
        const pair = name.match(/^<\s*([A-Za-z][\w:.-]*)\s*>\s*<\/\s*\1\s*>$/i);
        const opening = name.match(/^<\s*([A-Za-z][\w:.-]*)[^>]*>$/i);
        const closing = name.match(/^<\/\s*([A-Za-z][\w:.-]*)\s*>$/i);
        name = String(pair?.[1] ?? opening?.[1] ?? closing?.[1] ?? name).toLowerCase();
        if (!/^[a-z][\w:.-]*$/.test(name) || seen.has(name)) continue;
        seen.add(name);
        result.push(name);
        if (result.length >= 12) break;
    }
    return result;
}

export function normalizeNarrativeReadMode(value) {
    return String(value ?? '').trim().toLowerCase() === 'exclude_tags' ? 'exclude_tags' : 'include_tags';
}

export function narrativeFilterSignature({ mode = 'include_tags', tags = ['content'], excludedTags = [] } = {}) {
    const normalizedMode = normalizeNarrativeReadMode(mode);
    const normalizedTags = normalizeNarrativeTagNames(tags);
    const normalizedExcludedTags = normalizeNarrativeTagNames(excludedTags);
    if (normalizedMode === 'exclude_tags') {
        return `mode:exclude_tags|exclude:${normalizedExcludedTags.join(',')}`;
    }
    return `mode:include_tags|include:${normalizedTags.join(',')}`;
}

function removalRangesForTag(text, tag) {
    const escaped = escapeRegExp(tag);
    const tokenRe = new RegExp(`<\\s*(\\/?)\\s*${escaped}(?=[\\s/>])[^>]*>`, 'gi');
    const ranges = [];
    let depth = 0;
    let blockStart = null;
    let match;

    while ((match = tokenRe.exec(text)) !== null) {
        const token = match[0];
        const closing = match[1] === '/';
        const selfClosing = !closing && /\/\s*>$/.test(token);

        if (selfClosing) {
            if (depth === 0) ranges.push([match.index, match.index + token.length]);
        } else if (!closing) {
            if (depth === 0) blockStart = match.index;
            depth += 1;
        } else if (depth > 0) {
            depth -= 1;
            if (depth === 0 && blockStart !== null) {
                ranges.push([blockStart, match.index + token.length]);
                blockStart = null;
            }
        }

        if (token.length === 0) tokenRe.lastIndex += 1;
    }

    // 未闭合的起始标签不删除，避免一次格式错误把后续真实正文整段吞掉。
    return ranges;
}

function removeRanges(text, ranges) {
    if (!ranges.length) return text;
    const sorted = ranges
        .map(([start, end]) => [Math.max(0, start), Math.max(start, end)])
        .sort((a, b) => b[0] - a[0]);
    let result = text;
    for (const [start, end] of sorted) result = `${result.slice(0, start)}${result.slice(end)}`;
    return result;
}

function removeExcludedTagBlocks(raw, excludedTags) {
    let text = raw;
    const matchedTags = [];
    for (const tag of excludedTags) {
        const ranges = removalRangesForTag(text, tag);
        if (!ranges.length) continue;
        text = removeRanges(text, ranges);
        matchedTags.push(tag);
    }
    // 删除标签块后只压缩过多空行，不改写其余正文内容。
    text = cleanText(text.replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n'));
    return { text, matchedTags };
}

export function extractNarrativeContent(rawText, { mode = 'include_tags', tags = ['content'], excludedTags = [] } = {}) {
    const raw = cleanText(rawText);
    const normalizedMode = normalizeNarrativeReadMode(mode);
    const normalizedTags = normalizeNarrativeTagNames(tags);
    const normalizedExcludedTags = normalizeNarrativeTagNames(excludedTags);
    const signature = narrativeFilterSignature({ mode: normalizedMode, tags: normalizedTags, excludedTags: normalizedExcludedTags });

    if (!raw) {
        return { text: '', matchedTags: [], usedFallback: false, mode: normalizedMode, signature };
    }

    if (normalizedMode === 'exclude_tags') {
        const excluded = removeExcludedTagBlocks(raw, normalizedExcludedTags);
        return {
            text: excluded.text,
            matchedTags: excluded.matchedTags,
            usedFallback: false,
            mode: normalizedMode,
            signature,
        };
    }

    const effectiveTags = normalizedTags.length ? normalizedTags : ['content'];
    const chunks = [];
    const matchedTags = [];
    for (const tag of effectiveTags) {
        const escaped = escapeRegExp(tag);
        const re = new RegExp(`<\\s*${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/\\s*${escaped}\\s*>`, 'gi');
        let match;
        while ((match = re.exec(raw)) !== null) {
            const body = cleanText(match[1]);
            if (body) chunks.push({ index: match.index, body, tag });
            if (!matchedTags.includes(tag)) matchedTags.push(tag);
            if (match[0].length === 0) re.lastIndex += 1;
        }
    }
    chunks.sort((a, b) => a.index - b.index);
    const text = chunks.map(item => item.body).join('\n\n').trim();
    return { text, matchedTags, usedFallback: false, mode: normalizedMode, signature };
}
