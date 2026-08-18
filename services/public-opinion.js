import { commitSceneWorldState, readSceneWorldState } from '../data/sceneworld-store.js';
import {
    buildCanonicalPublicOpinionMessages,
    buildCasualPublicOpinionMessages,
    eligiblePublicOpinionSources,
    publicOpinionSourceFingerprint,
} from '../engine/public-opinion-prompts.js';
import {
    normalizeCanonicalOpinionPayload,
    normalizeCasualOpinionPayload,
    parsePublicOpinionResponse,
} from '../engine/public-opinion-result.js';
import { generateWithCurrentConnection } from '../platform/sillytavern.js';

function clone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

function ensureState() {
    const state = readSceneWorldState();
    if (!state) throw new Error('当前聊天尚未建立 sceneworld 状态，请先完成至少一次世界推演');
    return state;
}

export function inspectPublicOpinion() {
    const state = readSceneWorldState();
    if (!state) return { stateExists: false, sourceCount: 0, publicCount: 0, traceCount: 0, sourceFingerprint: '' };
    const sources = eligiblePublicOpinionSources(state);
    return {
        stateExists: true,
        sourceCount: sources.length,
        publicCount: sources.filter(item => item.publicity === 'public').length,
        traceCount: sources.filter(item => item.publicity === 'trace').length,
        sourceFingerprint: publicOpinionSourceFingerprint(state),
    };
}

export async function refreshCanonicalPublicOpinion() {
    const base = ensureState();
    const sources = eligiblePublicOpinionSources(base);
    const sourceFingerprint = publicOpinionSourceFingerprint(base);
    const generatedAt = new Date().toISOString();

    if (!sources.length) {
        const next = clone(base);
        next.publicOpinion = {
            ...(next.publicOpinion || {}),
            updatedAt: generatedAt,
            sourceFingerprint,
            news: [],
            forum: [],
            casualUpdatedAt: next.publicOpinion?.casualUpdatedAt ?? null,
            casual: Array.isArray(next.publicOpinion?.casual) ? next.publicOpinion.casual : [],
        };
        const saved = await commitSceneWorldState(next);
        return { calledModel: false, state: saved, newsCount: 0, forumCount: 0, reason: 'no-public-sources' };
    }

    const messages = buildCanonicalPublicOpinionMessages(base);
    const raw = await generateWithCurrentConnection(messages, { responseLength: 1700 });
    const payload = parsePublicOpinionResponse(raw);
    const normalized = normalizeCanonicalOpinionPayload(payload, { sources, generatedAt });

    const latest = ensureState();
    if (publicOpinionSourceFingerprint(latest) !== sourceFingerprint) {
        throw new Error('生成舆情期间世界公开状态发生了变化，本次结果未保存，请重新刷新');
    }

    const next = clone(latest);
    next.publicOpinion = {
        ...(next.publicOpinion || {}),
        updatedAt: generatedAt,
        sourceFingerprint,
        news: normalized.news,
        forum: normalized.forum,
        casualUpdatedAt: next.publicOpinion?.casualUpdatedAt ?? null,
        casual: Array.isArray(next.publicOpinion?.casual) ? next.publicOpinion.casual : [],
    };
    const saved = await commitSceneWorldState(next);
    return {
        calledModel: true,
        state: saved,
        raw,
        newsCount: normalized.news.length,
        forumCount: normalized.forum.length,
        reason: normalized.news.length || normalized.forum.length ? 'generated' : 'no-significant-opinion',
    };
}

export async function refreshCasualPublicOpinion() {
    const base = ensureState();
    const stateUpdatedAt = String(base.updatedAt || '');
    const generatedAt = new Date().toISOString();
    const messages = buildCasualPublicOpinionMessages(base);
    const raw = await generateWithCurrentConnection(messages, { responseLength: 1600 });
    const payload = parsePublicOpinionResponse(raw);
    const casual = normalizeCasualOpinionPayload(payload, { generatedAt });

    const latest = ensureState();
    // Casual is non-canon, but do not save it into a different chat/state after a switch or reset.
    if (String(latest.createdAt || '') !== String(base.createdAt || '')) {
        throw new Error('生成“随便逛逛”期间当前 sceneworld 状态已切换，本次结果未保存');
    }
    const next = clone(latest);
    next.publicOpinion = {
        ...(next.publicOpinion || {}),
        updatedAt: next.publicOpinion?.updatedAt ?? null,
        sourceFingerprint: next.publicOpinion?.sourceFingerprint ?? '',
        news: Array.isArray(next.publicOpinion?.news) ? next.publicOpinion.news : [],
        forum: Array.isArray(next.publicOpinion?.forum) ? next.publicOpinion.forum : [],
        casualUpdatedAt: generatedAt,
        casual,
    };
    const saved = await commitSceneWorldState(next);
    return { calledModel: true, state: saved, raw, itemCount: casual.length, baseUpdatedAt: stateUpdatedAt };
}
