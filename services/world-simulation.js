import { createEmptySceneWorldState } from '../data/sceneworld-schema.js';
import { commitSceneWorldState, readSceneWorldState } from '../data/sceneworld-store.js';
import { buildManualSimulationMessages } from '../engine/sceneworld-prompts.js';
import { applySimulationPayload, parseSimulationResponse, summarizeSimulationPayload } from '../engine/simulation-result.js';
import { generateSceneWorldText, updateSceneWorldSettings } from '../platform/sillytavern.js';
import { buildWorldReferenceContext, formatWorldReferenceContext } from '../platform/world-reference.js';
import { buildBaiBaiBookHistoryContext } from '../platform/baibai-book.js';
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
        contentFilterSignature: batch.contentFilterSignature || '',
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
    const reference = await buildWorldReferenceContext({
        state: base,
        queryText: (batch.pendingMessages || []).map(item => item?.text || '').join('\n'),
        purpose: 'simulation',
    });
    const baibai = buildBaiBaiBookHistoryContext({ purpose: 'simulation' });
    const longTermHistoryNote = baibai.stats?.enabled && baibai.stats?.available && baibai.stats?.complete === false
        ? '注意：柏宝书报告长期历史存在摘要缺口，只能作为不完整参考。'
        : '';
    const messages = buildManualSimulationMessages({
        state: base,
        batch,
        worldReferenceText: formatWorldReferenceContext(reference),
        longTermHistoryText: baibai.text,
        longTermHistoryNote,
    });
    const raw = await generateSceneWorldText(messages, { responseLength: 2200 });
    const payload = parseSimulationResponse(raw);
    const changeSummary = summarizeSimulationPayload(payload);
    const source = batchSource(batch);
    const next = applySimulationPayload(base, payload, source);
    const saved = await commitSceneWorldState(next);
    // 指定楼层只用于启动首次回溯。成功建立锚点后自动恢复“从当前开始”，
    // 后续仍会沿锚点每批最多 10 条顺序结算，也避免下一个新聊天误用旧起点。
    if (batch.isInitialBatch && batch.initialMode === 'from_floor') {
        updateSceneWorldSettings({ initialSettlementMode: 'latest' });
    }
    return { batch, source, state: saved, raw, changeSummary, worldReference: reference.stats, baibai: baibai.stats };
}
