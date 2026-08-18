import { selected_world_info, world_info } from '../../../../world-info.js';
import { getCharaFilename } from '../../../../utils.js';
import { getContextSafe, getSceneWorldSettings } from './sillytavern.js';

const DEFAULT_MAX_ENTRY_CHARS = 4800;
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

function addEntriesFromData(target, seen, data, source, scopes) {
    const rawEntries = data?.entries;
    if (!rawEntries) return;
    const rows = Array.isArray(rawEntries)
        ? rawEntries.map((entry, index) => [entry?.uid ?? entry?.id ?? index, entry])
        : Object.entries(rawEntries);
    for (const [uid, entry] of rows) {
        if (!entry) continue;
        const content = clean(entry.content, DEFAULT_MAX_ENTRY_CHARS);
        if (!content) continue;
        const id = `${source}::${uid}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const disabledInTavern = entry.disable === true || entry.disabled === true;
        target.push({
            id,
            uid: String(uid),
            source,
            scopes: Array.isArray(scopes) ? [...scopes] : [],
            sourceLabel: (Array.isArray(scopes) ? scopes : []).map(scope => SCOPE_LABELS[scope] ?? scope).join(' + '),
            label: clean(entry.comment, 180) || entryKeys(entry).join(', ') || clean(content.split('\n')[0], 80) || `条目 ${uid}`,
            keys: entryKeys(entry),
            secondaryKeys: entrySecondaryKeys(entry),
            content,
            constant: entry.constant === true,
            disabledInTavern,
            vectorized: entry.vectorized === true,
            selective: entry.selective === true,
            order: Number.isFinite(Number(entry.order)) ? Number(entry.order) : 0,
        });
    }
}

async function loadBooks(ctx, books, target, seen) {
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


function isEntrySelected(selection, entry) {
    const source = selection && typeof selection === 'object' && !Array.isArray(selection) ? selection : {};
    if (Object.prototype.hasOwnProperty.call(source, entry.id)) return source[entry.id] === true;
    // 首次发现：跟随酒馆条目“是否启用”作为默认值；之后用户显式选择优先。
    return entry.disabledInTavern !== true;
}

async function loadCurrentWorldEntries() {
    const ctx = getContextSafe();
    const books = getCurrentWorldBooks();
    if (!ctx) return { books, entries: [] };
    const entries = [];
    const seen = new Set();
    await loadBooks(ctx, books, entries, seen);
    addEmbeddedCharacterBook(ctx, new Set(books.map(book => book.name)), entries, seen);
    return { books, entries };
}

export async function getCurrentWorldEntryChoices(purpose = 'simulation') {
    const settings = getSceneWorldSettings();
    const mode = String(purpose ?? '').trim().toLowerCase() === 'observation' ? 'observation' : 'simulation';
    const selection = mode === 'observation'
        ? settings.observationWorldEntrySelection
        : settings.simulationWorldEntrySelection;
    const { books, entries } = await loadCurrentWorldEntries();
    const byBook = books.map(book => ({
        ...book,
        entries: entries
            .filter(entry => entry.source === book.name)
            .sort((a, b) => b.order - a.order || a.id.localeCompare(b.id))
            .map(entry => ({
                ...entry,
                enabled: isEntrySelected(selection, entry),
                purpose: mode,
            })),
    }));
    return byBook;
}

export function selectWorldInfoEntries(entries, maxChars = 16000) {
    const limit = Math.max(2000, Math.min(Number(maxChars) || 16000, 32000));
    const rows = (Array.isArray(entries) ? entries : []).slice().sort((a, b) => b.order - a.order || a.id.localeCompare(b.id));
    const selected = [];
    let used = 0;
    let omittedByBudget = 0;
    for (const entry of rows) {
        const serialized = `【${entry.source}｜${entry.label}】\n${entry.content}`;
        if (used && used + serialized.length > limit) {
            omittedByBudget += 1;
            continue;
        }
        selected.push({ ...entry, activation: 'manual-entry-selection' });
        used += serialized.length;
        if (used >= limit) break;
    }
    return { entries: selected, usedChars: used, budgetChars: limit, omittedByBudget };
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

export async function buildWorldReferenceContext({ purpose = 'simulation' } = {}) {
    const ctx = getContextSafe();
    const settings = getSceneWorldSettings();
    const mode = String(purpose ?? '').trim().toLowerCase() === 'observation' ? 'observation' : 'simulation';
    if (!ctx) return { characterDescription: null, entries: [], stats: { reason: 'no-context', purpose: mode }, settings, purpose: mode };

    const selection = mode === 'observation'
        ? settings.observationWorldEntrySelection
        : settings.simulationWorldEntrySelection;
    const { books, entries } = await loadCurrentWorldEntries();
    const explicitlySelected = entries.filter(entry => isEntrySelected(selection, entry));
    const maxChars = mode === 'observation'
        ? settings.observationWorldInfoMaxChars
        : settings.simulationWorldInfoMaxChars;
    const selectedEntries = selectWorldInfoEntries(explicitlySelected, maxChars);
    const characterDescription = mode === 'simulation'
        ? buildCharacterDescription(ctx, settings.includeCharacterDescription, settings.characterDescriptionMaxChars)
        : null;

    return {
        purpose: mode,
        characterDescription,
        entries: selectedEntries.entries,
        availableBooks: books,
        stats: {
            purpose: mode,
            availableBooks: books.length,
            loadedEntries: entries.length,
            manuallyCheckedEntries: explicitlySelected.length,
            selectedEntries: selectedEntries.entries.length,
            selectedChars: selectedEntries.usedChars,
            omittedByBudget: selectedEntries.omittedByBudget,
            characterDescriptionUsed: !!characterDescription,
            budgetChars: selectedEntries.budgetChars,
            entryLevelSelection: true,
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
        const tavernState = entry.disabledInTavern ? '酒馆中关闭' : (entry.constant ? '酒馆中常驻' : '酒馆中条件触发');
        blocks.push(`【世界书条目｜${entry.source}｜${entry.label}｜${tavernState}｜SceneWorld手动勾选】\n${entry.content}`);
    }
    return blocks.length ? blocks.join('\n\n') : '（本轮没有勾选需要传输的世界书条目）';
}
