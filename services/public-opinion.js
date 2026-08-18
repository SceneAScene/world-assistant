import { commitSceneWorldState, readSceneWorldState } from '../data/sceneworld-store.js';
import {
    buildCanonicalPublicOpinionMessages,
    buildStreetPublicOpinionMessages,
    eligiblePublicOpinionSources,
    publicOpinionSourceFingerprint,
} from '../engine/public-opinion-prompts.js';
import {
    normalizeCanonicalOpinionPayload,
    normalizeStreetWanderPayload,
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

function knownLocationCorpus(state) {
    return [
        state?.world?.location,
        ...(Array.isArray(state?.people) ? state.people.map(person => person?.location) : []),
        ...(Array.isArray(state?.world?.moments) ? state.world.moments.flatMap(item => [item?.title, item?.text]) : []),
        ...(Array.isArray(state?.world?.facts) ? state.world.facts.filter(item => item?.publicity === 'public').flatMap(item => [item?.key, item?.value]) : []),
    ].map(value => String(value ?? '').trim()).filter(Boolean).join('\n');
}

function hardenPlaces(state, places) {
    const corpus = knownLocationCorpus(state);
    return (Array.isArray(places) ? places : []).map(place => ({
        ...place,
        established: Boolean(place?.established && place?.name && corpus.includes(String(place.name))),
    })).slice(0, 5);
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
            streetUpdatedAt: next.publicOpinion?.streetUpdatedAt ?? null,
            street: Array.isArray(next.publicOpinion?.street) ? next.publicOpinion.street : [],
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
        streetUpdatedAt: next.publicOpinion?.streetUpdatedAt ?? null,
        street: Array.isArray(next.publicOpinion?.street) ? next.publicOpinion.street : [],
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

export async function refreshStreetPublicOpinion() {
    const base = ensureState();
    const stateUpdatedAt = String(base.updatedAt || '');
    const generatedAt = new Date().toISOString();
    const messages = buildStreetPublicOpinionMessages(base);
    const raw = await generateWithCurrentConnection(messages, { responseLength: 2200 });
    const payload = parsePublicOpinionResponse(raw);
    const normalized = normalizeStreetWanderPayload(payload, { generatedAt });

    const latest = ensureState();
    // Street wander is non-canon, but do not save it into a different chat/state after a switch or reset.
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
        streetUpdatedAt: generatedAt,
        street: normalized.street,
    };
    next.guidance = next.guidance && typeof next.guidance === 'object' ? next.guidance : { actions: [], places: [] };
    next.guidance.placesUpdatedAt = generatedAt;
    next.guidance.places = hardenPlaces(latest, normalized.places);
    next.guidance.actions = Array.isArray(next.guidance.actions) ? next.guidance.actions : [];
    next.guidance.actionsUpdatedAt = next.guidance.actionsUpdatedAt ?? null;
    next.guidance.actionsSourceMessageId = Number.isInteger(next.guidance.actionsSourceMessageId) ? next.guidance.actionsSourceMessageId : null;
    const saved = await commitSceneWorldState(next);
    return { calledModel: true, state: saved, raw, itemCount: normalized.street.length, placeCount: next.guidance.places.length, baseUpdatedAt: stateUpdatedAt };
}
