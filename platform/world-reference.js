import { selected_world_info, world_info } from '../../../../world-info.js';
import { getCharaFilename } from '../../../../utils.js';
import { getContextSafe, getSceneWorldSettings } from './sillytavern.js';

const DEFAULT_MAX_ENTRY_CHARS = 2400;
const SCOPE_LABELS = Object.freeze({ character: '角色世界书', chat: '聊天世界书', global: '全局世界书' });

function clean(value, max = 6000) {
    return String(value ?? '').replace(/\r/g, '').trim().slice(0, max);
}

function uniqueNames(values) {
    return [...new Set((values || []).map(value => clean(value, 180)).filter(Boolean))];
}

function normalizeKeys(value) {
    const result = [];
    const push = item => {
        if (Array.isArray(item)) return item.forEach(push);
        const text = clean(item, 300);
        if (!text) return;
        // 酒馆原始数据通常已经是数组；这里兼容少数导入格式留下的逗号字符串。
        for (const part of text.split(/[,，]/g)) {
            const key = part.trim();
            if (key) result.push(key);
        }
    };
    push(value);
    return [...new Set(result)];
}

function entryKeys(entry) {
    return normalizeKeys(entry?.key);
}

function entrySecondaryKeys(entry) {
    return normalizeKeys(entry?.keysecondary ?? entry?.secondary_keys);
}

function characterField(character, field) {
    return clean(character?.data?.[field] ?? character?.[field], field === 'description' ? 10000 : 4000);
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
    if (embeddedName && !names.size) names.add(embeddedName);
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

function mergeBook(map, name, scope) {
    const safeName = clean(name, 180);
    if (!safeName) return;
    const current = map.get(safeName) ?? { name: safeName, scopes: [] };
    if (!current.scopes.includes(scope)) current.scopes.push(scope);
    map.set(safeName, current);
}

export function getCurrentWorldBooks() {
    const ctx = getContextSafe();
    if (!ctx) return [];
    const map = new Map();
    for (const name of getLinkedWorldNames(ctx)) mergeBook(map, name, 'character');
    for (const name of getChatWorldNames(ctx)) mergeBook(map, name, 'chat');
    for (const name of getGlobalWorldNames(ctx)) mergeBook(map, name, 'global');
    return [...map.values()].map(book => ({
        ...book,
        sourceLabel: book.scopes.map(scope => SCOPE_LABELS[scope] ?? scope).join(' + '),
    }));
}

export function getCurrentWorldBookChoices() {
    const settings = getSceneWorldSettings();
    return getCurrentWorldBooks().map(book => ({
        ...book,
        enabled: settings.worldBookSelection?.[book.name] !== false,
    }));
}

function addEntriesFromData(target, seen, data, source, scopes) {
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
            scopes: Array.isArray(scopes) ? [...scopes] : [],
            sourceLabel: (Array.isArray(scopes) ? scopes : []).map(scope => SCOPE_LABELS[scope] ?? scope).join(' + '),
            label: clean(entry.comment, 180) || entryKeys(entry).join(', ') || `条目 ${uid}`,
            keys: entryKeys(entry),
            secondaryKeys: entrySecondaryKeys(entry),
            content,
            constant: entry.constant === true,
            vectorized: entry.vectorized === true,
            selective: entry.selective === true,
            selectiveLogic: Number.isInteger(Number(entry.selectiveLogic)) ? Number(entry.selectiveLogic) : 0,
            caseSensitive: entry.caseSensitive === true,
            order: Number.isFinite(Number(entry.order)) ? Number(entry.order) : 0,
        });
    }
}

async function loadSelectedBooks(ctx, books, target, seen) {
    for (const book of books) {
        try {
            if (typeof ctx?.loadWorldInfo !== 'function') continue;
            const data = await ctx.loadWorldInfo(book.name);
            addEntriesFromData(target, seen, data, book.name, book.scopes);
        } catch (error) {
            console.warn(`[SceneWorld] 世界书读取已跳过：${book.name}`, error);
        }
    }
}

function addEmbeddedCharacterBook(ctx, allowedBookNames, target, seen) {
    const character = currentCharacter(ctx);
    const book = character?.data?.character_book ?? character?.character_book;
    if (!book?.entries?.length) return;
    const source = clean(book.name, 180) || '角色内置世界书';
    if (!allowedBookNames.has(source)) return;
    addEntriesFromData(target, seen, { entries: book.entries }, source, ['character']);
}

function regexFromKey(key, caseSensitive) {
    const value = String(key ?? '').trim();
    if (!(value.startsWith('/') && value.lastIndexOf('/') > 0)) return null;
    const end = value.lastIndexOf('/');
    const body = value.slice(1, end);
    let flags = value.slice(end + 1);
    if (!caseSensitive && !flags.includes('i')) flags += 'i';
    try { return new RegExp(body, flags); } catch { return null; }
}

function keyMatches(key, corpus, caseSensitive = false) {
    const needle = String(key ?? '').trim();
    if (!needle) return false;
    const regex = regexFromKey(needle, caseSensitive);
    if (regex) return regex.test(corpus);
    return caseSensitive
        ? corpus.includes(needle)
        : corpus.toLocaleLowerCase().includes(needle.toLocaleLowerCase());
}

function greenEntryMatches(entry, corpus) {
    const primary = entry.keys || [];
    if (!primary.length || !primary.some(key => keyMatches(key, corpus, entry.caseSensitive))) return false;
    const secondary = entry.secondaryKeys || [];
    if (!entry.selective || !secondary.length) return true;
    const matches = secondary.map(key => keyMatches(key, corpus, entry.caseSensitive));
    const any = matches.some(Boolean);
    const all = matches.every(Boolean);
    switch (entry.selectiveLogic) {
        case 1: return !all; // NOT ALL
        case 2: return !any; // NOT ANY
        case 3: return all;  // AND ALL
        case 0:
        default: return any; // AND ANY
    }
}

export function selectWorldInfoEntries(entries, corpus, maxChars = 16000) {
    const limit = Math.max(2000, Math.min(Number(maxChars) || 16000, 32000));
    const rows = (Array.isArray(entries) ? entries : []).map(entry => ({
        entry,
        activation: entry.constant ? 'constant' : greenEntryMatches(entry, corpus) ? 'keyword' : '',
    })).filter(row => row.activation);

    rows.sort((a, b) => {
        if (a.activation !== b.activation) return a.activation === 'constant' ? -1 : 1;
        return b.entry.order - a.entry.order || a.entry.id.localeCompare(b.entry.id);
    });

    const selected = [];
    let used = 0;
    let omittedByBudget = 0;
    for (const row of rows) {
        const serialized = `【${row.entry.source}｜${row.entry.label}】\n${row.entry.content}`;
        if (used && used + serialized.length > limit) {
            omittedByBudget += 1;
            continue;
        }
        selected.push({ ...row.entry, activation: row.activation });
        used += serialized.length;
        if (used >= limit) break;
    }
    return {
        entries: selected,
        usedChars: used,
        budgetChars: limit,
        activatedCount: rows.length,
        constantCount: selected.filter(item => item.activation === 'constant').length,
        keywordCount: selected.filter(item => item.activation === 'keyword').length,
        omittedByBudget,
    };
}

function buildCharacterDescription(ctx, enabled, maxChars) {
    if (!enabled) return null;
    const character = currentCharacter(ctx);
    if (!character) return null;
    const description = characterField(character, 'description');
    if (!description) return null;
    return {
        name: clean(ctx?.name2 ?? character?.name, 160),
        description: description.slice(0, Math.max(1000, Math.min(Number(maxChars) || 5000, 10000))),
    };
}

function stateCorpus(state) {
    return [
        state?.world?.time,
        state?.world?.location,
        state?.world?.summary,
        ...(state?.world?.moments ?? []).flatMap(item => [item?.title, item?.text]),
        ...(state?.world?.facts ?? []).flatMap(item => [item?.key, item?.value, item?.publicHint]),
        ...(state?.people ?? []).flatMap(person => [person?.name, ...(person?.aliases ?? []), person?.location, person?.status]),
        ...(state?.continuity?.recentDynamics ?? []).map(item => item?.summary),
    ].map(value => clean(value, 1200)).filter(Boolean).join('\n');
}

export async function buildWorldReferenceContext({ state = null, queryText = '' } = {}) {
    const ctx = getContextSafe();
    const settings = getSceneWorldSettings();
    if (!ctx) return { characterDescription: null, entries: [], stats: { reason: 'no-context' }, settings };

    const availableBooks = getCurrentWorldBooks();
    const selectedBooks = availableBooks.filter(book => settings.worldBookSelection?.[book.name] !== false);
    const entries = [];
    const seen = new Set();
    await loadSelectedBooks(ctx, selectedBooks, entries, seen);
    // 某些卡只保留了卡内嵌世界书而没有可读取的独立文件，作为兼容回退。
    addEmbeddedCharacterBook(ctx, new Set(selectedBooks.map(book => book.name)), entries, seen);

    const corpus = `${clean(queryText, 32000)}\n${stateCorpus(state)}`;
    const selectedEntries = selectWorldInfoEntries(entries, corpus, settings.worldInfoMaxChars);
    const characterDescription = buildCharacterDescription(ctx, settings.includeCharacterDescription, settings.characterDescriptionMaxChars);
    return {
        characterDescription,
        entries: selectedEntries.entries,
        availableBooks,
        selectedBooks,
        stats: {
            availableBooks: availableBooks.length,
            selectedBooks: selectedBooks.length,
            loadedEntries: entries.length,
            selectedEntries: selectedEntries.entries.length,
            constantEntries: selectedEntries.constantCount,
            keywordEntries: selectedEntries.keywordCount,
            selectedChars: selectedEntries.usedChars,
            omittedByBudget: selectedEntries.omittedByBudget,
            characterDescriptionUsed: !!characterDescription,
            budgetChars: selectedEntries.budgetChars,
        },
        settings,
    };
}

export function formatWorldReferenceContext(reference) {
    if (!reference) return '（未提供）';
    const blocks = [];
    if (reference.characterDescription) {
        const item = reference.characterDescription;
        blocks.push(`【角色描述】\n角色：${item.name || '未命名'}\n${item.description}`);
    }
    for (const entry of reference.entries || []) {
        const strategy = entry.activation === 'constant' ? '蓝灯常驻' : '本轮触发';
        blocks.push(`【世界书｜${entry.source}｜${entry.label}｜${strategy}】\n${entry.content}`);
    }
    return blocks.length ? blocks.join('\n\n') : '（本轮没有启用角色描述，也没有可传输的世界书条目）';
}
