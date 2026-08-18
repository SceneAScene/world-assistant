import { selected_world_info, world_info } from '../../../../world-info.js';
import { getCharaFilename } from '../../../../utils.js';
import { getContextSafe, getSceneWorldSettings } from './sillytavern.js';

const DEFAULT_MAX_ENTRY_CHARS = 1800;
const FOUNDATION_HINTS = ['世界观', '世界设定', '世界背景', '基础设定', '总体设定', '时代背景', '时代设定', '地理设定', '社会设定', '制度设定'];

function clean(value, max = 6000) {
    return String(value ?? '').replace(/\r/g, '').trim().slice(0, max);
}

function normalized(value) {
    return String(value ?? '').toLocaleLowerCase().replace(/\s+/g, '');
}

function uniqueNames(values) {
    return [...new Set((values || []).map(value => clean(value, 180)).filter(Boolean))];
}

function entryKeys(entry) {
    const keys = [];
    const push = value => {
        if (Array.isArray(value)) value.forEach(push);
        else {
            const text = clean(value, 120);
            if (text) keys.push(text);
        }
    };
    push(entry?.key);
    push(entry?.keysecondary);
    push(entry?.secondary_keys);
    return [...new Set(keys)];
}

function characterField(character, field) {
    return clean(character?.data?.[field] ?? character?.[field], field === 'description' ? 3600 : 1800);
}

function currentCharacter(ctx) {
    const id = ctx?.characterId;
    if (id === null || id === undefined || Number(id) < 0) return null;
    return ctx?.characters?.[id] ?? null;
}

function getLinkedWorldNames(ctx) {
    const names = new Set();
    try {
        const helper = globalThis?.TavernHelper;
        if (helper && typeof helper.getCharLorebooks === 'function') {
            const books = helper.getCharLorebooks();
            if (books?.primary) names.add(String(books.primary).trim());
            if (Array.isArray(books?.additional)) books.additional.forEach(name => name && names.add(String(name).trim()));
            if (names.size) return uniqueNames([...names]);
        }
    } catch { /* optional helper */ }

    const character = currentCharacter(ctx) ?? {};
    const primary = clean(character?.data?.extensions?.world ?? character?.extensions?.world, 180);
    if (primary) names.add(primary);
    try {
        const fileName = getCharaFilename(ctx?.characterId);
        const extra = world_info?.charLore?.find(item => item?.name === fileName)?.extraBooks;
        if (Array.isArray(extra)) extra.forEach(name => name && names.add(String(name).trim()));
    } catch { /* older/forked ST */ }
    const embeddedName = clean(character?.data?.character_book?.name ?? character?.character_book?.name, 180);
    if (embeddedName && !primary) names.add(embeddedName);
    return uniqueNames([...names]);
}

function getChatWorldNames(ctx) {
    const raw = ctx?.chatMetadata?.world_info;
    return uniqueNames(Array.isArray(raw) ? raw : [raw]);
}

function getGlobalWorldNames(ctx) {
    try {
        const helper = globalThis?.TavernHelper;
        if (helper && typeof helper.getLorebookSettings === 'function') {
            const settings = helper.getLorebookSettings();
            if (Array.isArray(settings?.selected_global_lorebooks)) return uniqueNames(settings.selected_global_lorebooks);
        }
    } catch { /* optional helper */ }
    try {
        const selection = ctx?.chatWorldInfo?.globalSelection;
        if (Array.isArray(selection)) return uniqueNames(selection);
    } catch { /* fork wrapper */ }
    return uniqueNames(Array.isArray(selected_world_info) ? selected_world_info : []);
}

function addEntriesFromData(target, seen, data, source, scope) {
    const rawEntries = data?.entries;
    if (!rawEntries) return;
    const rows = Array.isArray(rawEntries)
        ? rawEntries.map((entry, index) => [entry?.uid ?? entry?.id ?? index, entry])
        : Object.entries(rawEntries);
    for (const [uid, entry] of rows) {
        if (!entry || entry.disable === true || entry.disabled === true) continue;
        const content = clean(entry.content, DEFAULT_MAX_ENTRY_CHARS);
        if (!content) continue;
        const id = `${source}::${uid}`;
        if (seen.has(id)) continue;
        seen.add(id);
        target.push({
            id,
            uid: String(uid),
            source,
            scope,
            label: clean(entry.comment, 180) || entryKeys(entry).join(', ') || `条目 ${uid}`,
            keys: entryKeys(entry),
            content,
            constant: entry.constant === true,
            order: Number.isFinite(Number(entry.order)) ? Number(entry.order) : 0,
        });
    }
}

async function loadNamedBooks(ctx, names, scope, target, seen) {
    for (const name of uniqueNames(names)) {
        try {
            if (typeof ctx?.loadWorldInfo !== 'function') continue;
            const data = await ctx.loadWorldInfo(name);
            addEntriesFromData(target, seen, data, name, scope);
        } catch (error) {
            console.warn(`[SceneWorld] world info load skipped: ${name}`, error);
        }
    }
}

function addEmbeddedCharacterBook(ctx, target, seen) {
    const character = currentCharacter(ctx);
    const book = character?.data?.character_book ?? character?.character_book;
    if (!book?.entries?.length) return;
    const source = clean(book.name, 180) || '角色内置世界书';
    addEntriesFromData(target, seen, { entries: book.entries }, source, 'character');
}

function scoreEntry(entry, corpus) {
    const haystack = normalized(corpus);
    let score = entry.constant ? 100 : 0;
    let hits = 0;
    for (const key of entry.keys || []) {
        const needle = normalized(key);
        if (needle.length < 2) continue;
        if (haystack.includes(needle)) {
            score += 24 + Math.min(needle.length, 20);
            hits += 1;
        }
    }
    const label = normalized(entry.label);
    if (FOUNDATION_HINTS.some(term => label === normalized(term) || label.includes(normalized(term)))) score += 8;
    if (entry.scope === 'chat') score += 4;
    else if (entry.scope === 'character') score += 3;
    else if (entry.scope === 'global') score += 1;
    if (!entry.constant && hits === 0 && score < 8) return 0;
    return score;
}

export function selectRelevantWorldInfoEntries(entries, corpus, maxChars = 12000) {
    const limit = Math.max(1000, Math.min(Number(maxChars) || 12000, 24000));
    const ranked = (Array.isArray(entries) ? entries : [])
        .map(entry => ({ entry, score: scoreEntry(entry, corpus) }))
        .filter(row => row.score > 0)
        .sort((a, b) => b.score - a.score || b.entry.order - a.entry.order || a.entry.id.localeCompare(b.entry.id));
    const selected = [];
    let used = 0;
    for (const row of ranked) {
        const serialized = `[${row.entry.scope}:${row.entry.source}:${row.entry.label}]\n${row.entry.content}`;
        if (used && used + serialized.length > limit) continue;
        selected.push({ ...row.entry, score: row.score });
        used += serialized.length;
        if (used >= limit) break;
    }
    return { entries: selected, usedChars: used, availableCount: ranked.length, budgetChars: limit };
}

function buildCharacterBase(ctx, enabled, maxChars) {
    if (!enabled) return null;
    const character = currentCharacter(ctx);
    if (!character) return null;
    const base = {
        name: clean(ctx?.name2 ?? character?.name, 160),
        description: characterField(character, 'description'),
        personality: characterField(character, 'personality'),
        scenario: characterField(character, 'scenario'),
    };
    let remaining = Math.max(1000, Math.min(Number(maxChars) || 5000, 10000));
    for (const field of ['description', 'personality', 'scenario']) {
        if (!base[field]) continue;
        base[field] = base[field].slice(0, remaining);
        remaining -= base[field].length;
        if (remaining <= 0) break;
    }
    return Object.values(base).some(Boolean) ? base : null;
}

function stateCorpus(state) {
    return [
        state?.world?.time,
        state?.world?.location,
        state?.world?.summary,
        ...(state?.world?.moments ?? []).flatMap(item => [item?.title, item?.text]),
        ...(state?.world?.facts ?? []).flatMap(item => [item?.key, item?.value, item?.publicHint]),
        ...(state?.people ?? []).flatMap(person => [person?.name, ...(person?.aliases ?? []), person?.location, person?.status]),
        ...(state?.memory?.worldline ?? []).map(item => item?.text),
    ].map(value => clean(value, 1200)).filter(Boolean).join('\n');
}

export async function buildWorldReferenceContext({ state = null, queryText = '' } = {}) {
    const ctx = getContextSafe();
    const settings = getSceneWorldSettings();
    if (!ctx) return { characterBase: null, entries: [], stats: { reason: 'no-context' }, settings };

    const entries = [];
    const seen = new Set();
    const characterNames = settings.includeCharacterWorldInfo ? getLinkedWorldNames(ctx) : [];
    const chatNames = settings.includeChatWorldInfo ? getChatWorldNames(ctx) : [];
    const globalNames = settings.includeGlobalWorldInfo ? getGlobalWorldNames(ctx) : [];

    if (settings.includeCharacterWorldInfo) {
        const beforeCharacter = entries.length;
        await loadNamedBooks(ctx, characterNames, 'character', entries, seen);
        if (entries.length === beforeCharacter) addEmbeddedCharacterBook(ctx, entries, seen);
    }
    if (settings.includeChatWorldInfo) await loadNamedBooks(ctx, chatNames, 'chat', entries, seen);
    if (settings.includeGlobalWorldInfo) {
        const already = new Set([...characterNames, ...chatNames]);
        await loadNamedBooks(ctx, globalNames.filter(name => !already.has(name)), 'global', entries, seen);
    }

    const corpus = `${clean(queryText, 32000)}\n${stateCorpus(state)}`;
    const selected = selectRelevantWorldInfoEntries(entries, corpus, settings.worldInfoMaxChars);
    const characterBase = buildCharacterBase(ctx, settings.includeCharacterBase, settings.characterBaseMaxChars);
    return {
        characterBase,
        entries: selected.entries,
        stats: {
            loadedEntries: entries.length,
            matchedEntries: selected.entries.length,
            matchedChars: selected.usedChars,
            characterBaseUsed: !!characterBase,
            budgetChars: selected.budgetChars,
            books: {
                character: characterNames.length,
                chat: chatNames.length,
                global: globalNames.length,
            },
        },
        settings,
    };
}

export function formatWorldReferenceContext(reference) {
    if (!reference) return '（未提供）';
    const blocks = [];
    if (reference.characterBase) {
        const base = reference.characterBase;
        blocks.push(`【角色卡基础设定】\n角色：${base.name || '未命名'}${base.description ? `\n背景：${base.description}` : ''}${base.personality ? `\n性格：${base.personality}` : ''}${base.scenario ? `\n场景：${base.scenario}` : ''}`);
    }
    for (const entry of reference.entries || []) {
        blocks.push(`【${entry.scope} 世界书｜${entry.source}｜${entry.label}】\n${entry.content}`);
    }
    return blocks.length ? blocks.join('\n\n') : '（本轮没有匹配到需要参考的角色设定或世界书条目）';
}
