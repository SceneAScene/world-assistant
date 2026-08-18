import { readSceneWorldState, updateSceneWorldState } from '../data/sceneworld-store.js';

function clone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

function sourceByType(state, sourceType, sourceId) {
    const opinion = state?.publicOpinion || {};
    const list = sourceType === 'news'
        ? opinion.news
        : sourceType === 'forum'
            ? opinion.forum
            : sourceType === 'street'
                ? opinion.street
                : sourceType === 'casual'
                    ? opinion.casual
                    : [];
    return Array.isArray(list) ? list.find(item => String(item?.id || '') === String(sourceId || '')) : null;
}

export function isOpinionFavorited(state, sourceType, sourceId) {
    return Array.isArray(state?.chronicle) && state.chronicle.some(item => item?.sourceType === sourceType && item?.sourceId === sourceId);
}

export async function favoriteOpinionItem(sourceType, sourceId) {
    const state = readSceneWorldState();
    if (!state) throw new Error('当前聊天没有 sceneworld 数据');
    const source = sourceByType(state, sourceType, sourceId);
    if (!source) throw new Error('要收藏的舆情内容已经不存在，请刷新界面后重试');
    if (isOpinionFavorited(state, sourceType, sourceId)) return state;

    const title = source.headline || source.title || source.category || '收藏内容';
    const summary = source.summary || source.text || source.note || '';
    const sourceLabel = sourceType === 'news' ? '新闻' : sourceType === 'forum' ? '论坛' : sourceType === 'street' ? '市井闲闻' : '生活灵感';
    return updateSceneWorldState(next => {
        const chronicle = Array.isArray(next.chronicle) ? next.chronicle : [];
        chronicle.push({
            id: `favorite:${sourceType}:${sourceId}`,
            title,
            summary,
            sourceType,
            sourceId,
            sourceLabel,
            canon: !['casual', 'street'].includes(sourceType) && source.canon !== false,
            capturedAt: new Date().toISOString(),
            sourceGeneratedAt: source.generatedAt || null,
        });
        next.chronicle = chronicle.slice(-240);
        return next;
    });
}

export async function removeChronicleItem(id) {
    const cleanId = String(id ?? '').trim();
    if (!cleanId) return readSceneWorldState();
    return updateSceneWorldState(next => {
        next.chronicle = (Array.isArray(next.chronicle) ? next.chronicle : []).filter(item => item?.id !== cleanId);
        return next;
    });
}
