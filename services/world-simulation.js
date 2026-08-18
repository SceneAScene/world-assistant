import { createEmptySceneWorldState } from '../data/sceneworld-schema.js';
import { commitSceneWorldState, readSceneWorldState } from '../data/sceneworld-store.js';
import { buildManualSimulationMessages } from '../engine/sceneworld-prompts.js';
import { applySimulationPayload, parseSimulationResponse, summarizeSimulationPayload } from '../engine/simulation-result.js';
import { generateWithCurrentConnection } from '../platform/sillytavern.js';
import { readPendingNarrativeBatch } from './narrative-reader.js';

function batchSource(batch) {
    return Object.freeze({
        id: batch.endId,
        fingerprint: batch.endFingerprint,
        startId: batch.startId,
        endId: batch.endId,
        rangeFingerprint: batch.rangeFingerprint,
        assistantCount: batch.assistantCount,
        characters: batch.characters,
    });
}

export function inspectPendingNarrative() {
    const state = readSceneWorldState();
    const batch = readPendingNarrativeBatch(state?.sync ?? {});
    return { batch, stateExists: !!state };
}

export async function simulatePendingNarrative(expectedBatch = null) {
    const persisted = readSceneWorldState();
    const batch = readPendingNarrativeBatch(persisted?.sync ?? {});

    if (batch.anchorChanged) throw new Error(batch.anchorReason || '上次结算锚点发生变化，当前不能安全继续推演');
    if (!batch.hasPending) throw new Error('当前没有新的 AI 正文需要结算');
    if (batch.overBudget) {
        throw new Error(`待结算剧情约 ${batch.characters} 个字符，超过当前单次安全预算 ${batch.limits.maxPendingCharacters}。本阶段不会静默截断或额外调用模型压缩。`);
    }
    if (expectedBatch) {
        const changed = expectedBatch.startId !== batch.startId
            || expectedBatch.endId !== batch.endId
            || expectedBatch.rangeFingerprint !== batch.rangeFingerprint;
        if (changed) throw new Error('待结算剧情在你预览后发生了变化，请重新读取后再推演');
    }

    const base = persisted ?? createEmptySceneWorldState();
    const messages = buildManualSimulationMessages({ state: base, batch });
    const raw = await generateWithCurrentConnection(messages, { responseLength: 2200 });
    const payload = parseSimulationResponse(raw);
    const changeSummary = summarizeSimulationPayload(payload);
    const source = batchSource(batch);
    const next = applySimulationPayload(base, payload, source);
    const saved = await commitSceneWorldState(next);
    return { batch, source, state: saved, raw, changeSummary };
}
