import { commitSceneWorldState, readSceneWorldState } from '../data/sceneworld-store.js';

function text(value, max = 900) { return String(value ?? '').trim().slice(0, max); }
function clone(value) { return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }
function manualId(name) {
    const suffix = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`).replace(/[^a-zA-Z0-9_-]/g, '');
    return `person_manual_${suffix}`;
}
function normalizeDetails(items) {
    if (!Array.isArray(items)) return [];
    const map = new Map();
    for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const label = text(item.label, 80);
        const value = text(item.value, 700);
        if (label && value) map.set(label, { label, value });
    }
    return [...map.values()].slice(0, 24);
}
function normalizeKnowledge(items) {
    if (!Array.isArray(items)) return [];
    const seen = new Set();
    const result = [];
    for (const item of items) {
        const value = text(typeof item === 'string' ? item : item?.text, 600);
        if (!value || seen.has(value)) continue;
        seen.add(value);
        result.push({ text: value, evidence: '', sourceMessageId: null });
        if (result.length >= 40) break;
    }
    return result;
}

export async function upsertManualPerson(input = {}) {
    const state = readSceneWorldState();
    if (!state) throw new Error('请先完成一次世界推演，再维护人物');
    const name = text(input.name, 120);
    if (!name) throw new Error('人物名称不能为空');
    const next = clone(state);
    const list = Array.isArray(next.people) ? next.people : [];
    const requestedId = text(input.id, 160);
    let index = requestedId ? list.findIndex(item => item?.id === requestedId) : -1;
    if (index < 0 && !requestedId) index = list.findIndex(item => item?.name === name);
    const existing = index >= 0 ? list[index] : null;
    const person = {
        ...(existing || {}),
        id: existing?.id || requestedId || manualId(name),
        name,
        aliases: Array.isArray(existing?.aliases) ? existing.aliases : [],
        location: text(input.location, 260),
        status: text(input.status, 900),
        details: normalizeDetails(input.details),
        knowledge: normalizeKnowledge(input.knowledge),
        lastUpdatedMessageId: Number.isInteger(existing?.lastUpdatedMessageId) ? existing.lastUpdatedMessageId : null,
        manualEditedAt: new Date().toISOString(),
    };
    if (index >= 0) list[index] = person;
    else list.push(person);
    next.people = list.slice(0, 180);
    return commitSceneWorldState(next);
}

export async function removePerson(id) {
    const state = readSceneWorldState();
    if (!state) throw new Error('当前聊天尚未建立世界动态数据');
    const key = text(id, 160);
    const next = clone(state);
    const before = Array.isArray(next.people) ? next.people.length : 0;
    next.people = (Array.isArray(next.people) ? next.people : []).filter(item => item?.id !== key);
    if (next.people.length === before) throw new Error('人物已经不存在');
    return commitSceneWorldState(next);
}
