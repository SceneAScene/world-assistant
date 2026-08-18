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
import { buildWorldReferenceContext, formatWorldReferenceContext } from '../platform/world-reference.js';
import { buildBaiBaiBookHistoryContext } from '../platform/baibai-book.js';

function clone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

function hasSuccessfulSimulation(state) {
    return Number.isInteger(state?.sync?.lastProcessedAssistantMessageId);
}

function ensureState() {
    const state = readSceneWorldState();
    if (!state || !hasSuccessfulSimulation(state)) {
        throw new Error('请先完成至少一次世界推演，建立当前世界状态后再生成见闻');
    }
    return state;
}

function observationStateContext(state) {
    const facts = (Array.isArray(state?.world?.facts) ? state.world.facts : [])
        .slice(-20)
        .filter(item => item?.publicity === 'public' || item?.publicity === 'trace')
        .map(item => ({
            id: item?.id ?? '',
            key: item?.publicity === 'public' ? item?.key ?? '' : '',
            value: item?.publicity === 'public' ? item?.value ?? '' : '',
            publicity: item?.publicity ?? 'private',
            publicHint: item?.publicHint ?? '',
            validity: item?.validity ?? 'current',
        }));
    const payload = {
        world: {
            time: state?.world?.time ?? null,
            location: state?.world?.location ?? '',
            summary: state?.world?.summary ?? '',
            moments: (Array.isArray(state?.world?.moments) ? state.world.moments : []).slice(-20).map(item => ({
                title: item?.title ?? '',
                text: item?.text ?? '',
            })),
        },
        recentDynamics: (Array.isArray(state?.continuity?.recentDynamics) ? state.continuity.recentDynamics : []).slice(-5).map(item => ({
            summary: item?.summary ?? '',
            sourceStartMessageId: item?.sourceStartMessageId ?? null,
            sourceEndMessageId: item?.sourceEndMessageId ?? null,
        })),
        continuityFacts: facts,
    };
    return JSON.stringify(payload, null, 2);
}

function knownLocationCorpus(state) {
    return [
        state?.world?.location,
        ...(Array.isArray(state?.people) ? state.people.map(person => person?.location) : []),
        ...(Array.isArray(state?.world?.moments) ? state.world.moments.flatMap(item => [item?.title, item?.text]) : []),
        ...(Array.isArray(state?.world?.facts) ? state.world.facts.filter(item => item?.publicity === 'public').flatMap(item => [item?.key, item?.value]) : []),
    ].map(value => String(value ?? '').trim()).filter(Boolean).join('\n');
}

function hardenPlaces(state, places, reference = null) {
    const referenceCorpus = [
        reference?.characterDescription?.description,
        ...(Array.isArray(reference?.entries) ? reference.entries.map(entry => entry?.content) : []),
    ].map(value => String(value ?? '').trim()).filter(Boolean).join('\n');
    const corpus = `${knownLocationCorpus(state)}\n${referenceCorpus}`;
    return (Array.isArray(places) ? places : []).map(place => ({
        ...place,
        established: Boolean(place?.established && place?.name && corpus.includes(String(place.name))),
    })).slice(0, 5);
}

export function inspectPublicOpinion() {
    const state = readSceneWorldState();
    if (!state) return { stateExists: false, simulationReady: false, sourceCount: 0, publicCount: 0, traceCount: 0, sourceFingerprint: '' };
    const sources = eligiblePublicOpinionSources(state);
    return {
        stateExists: true,
        simulationReady: hasSuccessfulSimulation(state),
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

    const reference = await buildWorldReferenceContext({ state: base, queryText: knownLocationCorpus(base), purpose: 'observation' });
    const baibai = buildBaiBaiBookHistoryContext({ purpose: 'observation' });
    const longTermHistoryNote = baibai.stats?.enabled && baibai.stats?.available && baibai.stats?.complete === false
        ? '注意：柏宝书报告长期历史存在摘要缺口，只能作为不完整的较早背景。'
        : '';
    const messages = buildCanonicalPublicOpinionMessages(base, {
        worldReferenceText: formatWorldReferenceContext(reference),
        observationStateText: observationStateContext(base),
        longTermHistoryText: baibai.text,
        longTermHistoryNote,
    });
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
        worldReference: reference.stats,
        baibai: baibai.stats,
    };
}

export async function refreshStreetPublicOpinion() {
    const base = ensureState();
    const stateUpdatedAt = String(base.updatedAt || '');
    const generatedAt = new Date().toISOString();
    const reference = await buildWorldReferenceContext({ state: base, queryText: knownLocationCorpus(base), purpose: 'observation' });
    const baibai = buildBaiBaiBookHistoryContext({ purpose: 'observation' });
    const longTermHistoryNote = baibai.stats?.enabled && baibai.stats?.available && baibai.stats?.complete === false
        ? '注意：柏宝书报告长期历史存在摘要缺口，只能作为不完整的较早背景。'
        : '';
    const messages = buildStreetPublicOpinionMessages(base, {
        worldReferenceText: formatWorldReferenceContext(reference),
        observationStateText: observationStateContext(base),
        longTermHistoryText: baibai.text,
        longTermHistoryNote,
    });
    const raw = await generateWithCurrentConnection(messages, { responseLength: 2200 });
    const payload = parsePublicOpinionResponse(raw);
    const normalized = normalizeStreetWanderPayload(payload, { generatedAt });

    const latest = ensureState();
    // Street wander is non-canon, but do not save it into a different chat/state after a switch or reset.
    if (String(latest.createdAt || '') !== String(base.createdAt || '')) {
        throw new Error('生成“街巷漫游”期间当前 sceneworld 状态已切换，本次结果未保存');
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
    next.guidance.places = hardenPlaces(latest, normalized.places, reference);
    next.guidance.actions = Array.isArray(next.guidance.actions) ? next.guidance.actions : [];
    next.guidance.actionsUpdatedAt = next.guidance.actionsUpdatedAt ?? null;
    next.guidance.actionsSourceMessageId = Number.isInteger(next.guidance.actionsSourceMessageId) ? next.guidance.actionsSourceMessageId : null;
    const saved = await commitSceneWorldState(next);
    return { calledModel: true, state: saved, raw, itemCount: normalized.street.length, placeCount: next.guidance.places.length, baseUpdatedAt: stateUpdatedAt, worldReference: reference.stats, baibai: baibai.stats };
}
