import { createEmptySceneWorldState } from '../data/sceneworld-schema.js';
import { commitSceneWorldState, readSceneWorldState } from '../data/sceneworld-store.js';
import { buildManualSimulationMessages } from '../engine/sceneworld-prompts.js';
import { applySimulationPayload, parseSimulationResponse, summarizeSimulationPayload } from '../engine/simulation-result.js';
import { generateSceneWorldText, inspectSceneWorldTokenBudget, updateSceneWorldSettings } from '../platform/sillytavern.js';
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

function hasWorldBaseline(state) {
    return Boolean(String(state?.world?.summary ?? '').trim());
}

function syncForPendingRead(state) {
    // alpha.29 曾可能在模型截断时错误推进锚点却没有建立“当前世界”。
    // 没有世界基线时把它视为尚未完成首次推演，允许从当前附近重新建立，而不是被坏锚点锁死。
    return hasWorldBaseline(state) ? (state?.sync ?? {}) : {};
}

function assertBatchReady(batch, expectedBatch = null) {
    if (batch.anchorChanged) throw new Error(batch.anchorReason || '上次结算锚点发生变化，当前不能安全继续推演');
    if (!batch.hasPending) throw new Error('当前没有新的 AI 正文需要推演');
    if (expectedBatch) {
        const changed = expectedBatch.startId !== batch.startId
            || expectedBatch.endId !== batch.endId
            || expectedBatch.rangeFingerprint !== batch.rangeFingerprint;
        if (changed) throw new Error('待推演剧情在预览后发生了变化，请重新读取后再推演');
    }
}

async function prepareSimulationRequest(expectedBatch = null) {
    const persisted = readSceneWorldState();
    const baselineEstablished = hasWorldBaseline(persisted);
    const batch = readPendingNarrativeBatch(syncForPendingRead(persisted));
    assertBatchReady(batch, expectedBatch);

    const incompleteLegacyCommit = Boolean(persisted)
        && !baselineEstablished
        && Number.isInteger(persisted?.sync?.lastProcessedAssistantMessageId);
    // alpha.29 的截断回归可能留下“已推进锚点但没有当前世界基线”的半份状态。
    // 重建首次基线时从干净状态开始，避免把截断片段误当事实。
    const base = incompleteLegacyCommit ? createEmptySceneWorldState() : (persisted ?? createEmptySceneWorldState());
    const reference = await buildWorldReferenceContext({
        state: base,
        queryText: (batch.pendingMessages || []).map(item => item?.text || '').join('\n'),
        purpose: 'simulation',
    });
    const baibai = buildBaiBaiBookHistoryContext({ purpose: 'simulation' });
    const longTermHistoryNote = baibai.stats?.enabled && baibai.stats?.available && baibai.stats?.complete === false
        ? '注意：记忆插件报告长期历史存在摘要缺口，只能作为不完整参考。'
        : '';
    const messages = buildManualSimulationMessages({
        state: base,
        batch,
        worldReferenceText: formatWorldReferenceContext(reference),
        longTermHistoryText: baibai.text,
        longTermHistoryNote,
    });
    const tokenBudget = await inspectSceneWorldTokenBudget(messages);
    return { persisted, baselineEstablished, batch, base, reference, baibai, messages, tokenBudget };
}

export function inspectPendingNarrative() {
    const state = readSceneWorldState();
    const batch = readPendingNarrativeBatch(syncForPendingRead(state));
    return { batch, stateExists: !!state };
}

export async function inspectPendingSimulationBudget(expectedBatch = null) {
    const prepared = await prepareSimulationRequest(expectedBatch);
    return {
        batch: prepared.batch,
        tokenBudget: prepared.tokenBudget,
        worldReference: prepared.reference.stats,
        baibai: prepared.baibai.stats,
    };
}

export async function simulatePendingNarrative(expectedBatch = null) {
    const prepared = await prepareSimulationRequest(expectedBatch);
    const {
        baselineEstablished,
        batch,
        base,
        reference,
        baibai,
        messages,
        tokenBudget,
    } = prepared;

    if (!tokenBudget.canProceed) {
        throw new Error(`本轮预计需要约 ${tokenBudget.totalTokens} Token（输入约 ${tokenBudget.inputTokens} + 输出上限 ${tokenBudget.outputTokens}），超过当前上下文安全预算 ${tokenBudget.safetyLimit}。不会静默截断正文；请减少单批楼层、减少参考条目，或切换上下文更充足的模型。`);
    }

    // 最大输出 Token 统一从“设置 → 模型 → 高级设置”读取。
    // 对推理模型要留出足够空间，因为隐藏推理也可能消耗输出预算。
    const raw = await generateSceneWorldText(messages);
    const payload = parseSimulationResponse(raw, { requiresBaseline: !baselineEstablished });
    const changeSummary = summarizeSimulationPayload(payload);
    const source = batchSource(batch);
    const next = applySimulationPayload(base, payload, source);
    const saved = await commitSceneWorldState(next);
    // 指定楼层只用于启动首次回溯。成功建立锚点后自动恢复“从当前开始”。
    if (batch.isInitialBatch && batch.initialMode === 'from_floor') {
        updateSceneWorldSettings({ initialSettlementMode: 'latest' });
    }
    return {
        batch,
        source,
        state: saved,
        raw,
        changeSummary,
        worldReference: reference.stats,
        baibai: baibai.stats,
        tokenBudget,
    };
}
