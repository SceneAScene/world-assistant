import { createEmptySceneWorldState } from '../data/sceneworld-schema.js';
import { commitSceneWorldState, readSceneWorldState } from '../data/sceneworld-store.js';
import { buildManualSimulationMessages } from '../engine/sceneworld-prompts.js';
import { applySimulationPayload, parseSimulationResponse, summarizeSimulationPayload } from '../engine/simulation-result.js';
import { generateWithCurrentConnection } from '../platform/sillytavern.js';
import { readLatestAssistantNarrative, readRecentNarrativeContext } from './narrative-reader.js';

export function inspectLatestNarrative() {
    const source = readLatestAssistantNarrative();
    if (!source) return { source: null, alreadyProcessed: false };
    const state = readSceneWorldState();
    const alreadyProcessed = state?.sync?.lastProcessedMessageId === source.id
        && state?.sync?.lastProcessedFingerprint === source.fingerprint;
    return { source, alreadyProcessed };
}

export async function simulateLatestNarrative(expectedSource = null) {
    const source = readLatestAssistantNarrative();
    if (!source) throw new Error('当前聊天没有可推演的 AI 正文');
    if (expectedSource && (expectedSource.id !== source.id || expectedSource.fingerprint !== source.fingerprint)) {
        throw new Error('最新正文在你预览后发生了变化，请重新读取确认后再推演');
    }

    const persisted = readSceneWorldState();
    if (persisted?.sync?.lastProcessedMessageId === source.id
        && persisted?.sync?.lastProcessedFingerprint === source.fingerprint) {
        throw new Error('最新 AI 正文已经完成推演，不会重复调用模型');
    }

    const base = persisted ?? createEmptySceneWorldState();
    const contextMessages = readRecentNarrativeContext({ endMessageId: source.id, maxMessages: 8, maxCharacters: 14000 });
    const messages = buildManualSimulationMessages({ state: base, source, contextMessages });
    const raw = await generateWithCurrentConnection(messages, { responseLength: 1700 });
    const payload = parseSimulationResponse(raw);
    const changeSummary = summarizeSimulationPayload(payload);
    const next = applySimulationPayload(base, payload, source);
    const saved = await commitSceneWorldState(next);
    return { source, state: saved, raw, changeSummary };
}
