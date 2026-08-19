import { EventManager } from './event-manager.js';
import { TaskManager } from './task-manager.js';
import { clearSceneWorldSection, inspectSceneWorldStorage } from '../data/sceneworld-store.js';
import { createApiPresetSnapshot, fetchCustomApiModels, getSceneWorldContextLimit, getSceneWorldEventApi, getSceneWorldSettings, putTextIntoChatInput, updateSceneWorldSettings } from '../platform/sillytavern.js';
import { getCurrentWorldEntryChoices } from '../platform/world-reference.js';
import { inspectPendingNarrative, inspectPendingSimulationBudget, simulatePendingNarrative } from '../services/world-simulation.js';
import { inspectPublicOpinion, refreshCanonicalPublicOpinion, refreshStreetPublicOpinion } from '../services/public-opinion.js';
import { favoriteOpinionItem, removeChronicleItem } from '../services/chronicle.js';
import { editContinuityFact, removeContinuityFact } from '../services/continuity.js';
import { removePerson, upsertManualPerson } from '../services/people.js';
import { getBaiBaiBookStatus } from '../platform/baibai-book.js';
import { createSceneWorldShell, removeSceneWorldShell } from '../ui/sceneworld-shell.js';

export function createSceneWorldController({ version }) {
    const events = new EventManager();
    const tasks = new TaskManager();
    let initialized = false;
    let shell = null;
    let publicApi = null;

    function initialize() {
        if (initialized) return;
        initialized = true;

        const { source, types } = getSceneWorldEventApi();
        const chatChanged = types?.CHAT_CHANGED ?? types?.chat_changed;
        if (source && chatChanged) {
            events.onEmitter(source, chatChanged, () => shell?.onChatChanged?.());
        }

        // 记忆插件可能晚于世界动态加载。监听其公开就绪事件，避免设置页永久停在“未检测到”。
        events.listen(window, 'st-baibai-book:ready', () => shell?.onBaiBaiReady?.());

        publicApi = Object.freeze({
            version,
            open,
            close,
            inspect: () => ({
                storage: inspectSceneWorldStorage(),
                listeners: events.size,
                tasks: tasks.size,
            }),
        });
        globalThis.sceneworld = publicApi;
    }

    function open() {
        if (!initialized) initialize();
        shell?.destroy();
        shell = createSceneWorldShell({
            version,
            onClose: close,
            actions: {
                inspectPendingNarrative,
                inspectPendingBudget: expectedBatch => tasks.run('token-budget', () => inspectPendingSimulationBudget(expectedBatch)),
                simulatePending: expectedBatch => tasks.run('manual-simulation', () => simulatePendingNarrative(expectedBatch)),
                inspectPublicOpinion,
                refreshPublicOpinion: () => tasks.run('public-opinion', refreshCanonicalPublicOpinion),
                refreshStreetOpinion: () => tasks.run('public-opinion-street', refreshStreetPublicOpinion),
                putTextIntoChatInput,
                getChatInputText: () => {
                    const target = document.querySelector('#send_textarea')
                        || document.querySelector('textarea[name="send_textarea"]')
                        || document.querySelector('textarea');
                    return String(target?.value ?? '');
                },
                getSettings: getSceneWorldSettings,
                getModelContextLimit: () => getSceneWorldContextLimit(getSceneWorldSettings()),
                getWorldEntries: getCurrentWorldEntryChoices,
                updateSettings: updateSceneWorldSettings,
                fetchCustomApiModels: config => tasks.run('custom-api-models', () => fetchCustomApiModels(config)),
                createApiPreset: createApiPresetSnapshot,
                favoriteOpinion: (sourceType, sourceId) => tasks.run(`favorite:${sourceType}:${sourceId}`, () => favoriteOpinionItem(sourceType, sourceId)),
                removeChronicle: id => tasks.run(`chronicle-remove:${id}`, () => removeChronicleItem(id)),
                getBaiBaiStatus: getBaiBaiBookStatus,
                removeContinuityFact: id => tasks.run(`continuity-remove:${id}`, () => removeContinuityFact(id)),
                editContinuityFact: (id, value) => tasks.run(`continuity-edit:${id}`, () => editContinuityFact(id, value)),
                upsertPerson: person => tasks.run(`person-upsert:${person?.id || person?.name || 'new'}`, () => upsertManualPerson(person)),
                removePerson: id => tasks.run(`person-remove:${id}`, () => removePerson(id)),
                clearSection: section => tasks.run(`clear-section:${section}`, () => clearSceneWorldSection(section)),
                isTaskRunning: key => tasks.isRunning(key),
            },
        });
    }

    function close() {
        shell?.destroy();
        shell = null;
        removeSceneWorldShell();
    }

    function destroy() {
        close();
        events.clear();
        tasks.clear();
        if (globalThis.sceneworld === publicApi) delete globalThis.sceneworld;
        publicApi = null;
        initialized = false;
    }

    return { initialize, open, close, destroy };
}
