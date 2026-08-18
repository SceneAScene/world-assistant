import { updateSceneWorldState } from '../data/sceneworld-store.js';

function clean(value, max = 900) {
    return String(value ?? '').trim().slice(0, max);
}

export async function removeContinuityFact(id) {
    const target = clean(id, 120);
    if (!target) throw new Error('持续性世界事实编号无效');
    return updateSceneWorldState(state => {
        const before = Array.isArray(state.world?.facts) ? state.world.facts : [];
        const after = before.filter(item => clean(item?.id, 120) !== target);
        if (after.length === before.length) throw new Error('这条持续性世界事实已经不存在');
        state.world.facts = after;
        return state;
    });
}

export async function editContinuityFact(id, value) {
    const target = clean(id, 120);
    const nextValue = clean(value, 900);
    if (!target) throw new Error('持续性世界事实编号无效');
    if (!nextValue) throw new Error('持续性世界事实内容不能为空');
    return updateSceneWorldState(state => {
        const facts = Array.isArray(state.world?.facts) ? state.world.facts : [];
        const index = facts.findIndex(item => clean(item?.id, 120) === target);
        if (index < 0) throw new Error('这条持续性世界事实已经不存在');
        facts[index] = {
            ...facts[index],
            value: nextValue,
            source: 'manual',
            evidence: '',
            updatedAt: new Date().toISOString(),
        };
        state.world.facts = facts;
        return state;
    });
}
