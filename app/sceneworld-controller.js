import { EventManager } from './event-manager.js';
import { TaskManager } from './task-manager.js';
import { inspectSceneWorldStorage } from '../data/sceneworld-store.js';
import { getSceneWorldEventApi, getSceneWorldSettings, putTextIntoChatInput, updateSceneWorldSettings } from '../platform/sillytavern.js';
import { getCurrentWorldEntryChoices } from '../platform/world-reference.js';
import { inspectPendingNarrative, simulatePendingNarrative } from '../services/world-simulation.js';
import { inspectPublicOpinion, refreshCanonicalPublicOpinion, refreshStreetPublicOpinion } from '../services/public-opinion.js';
import { favoriteOpinionItem, removeChronicleItem } from '../services/chronicle.js';
import { editContinuityFact, removeContinuityFact } from '../services/continuity.js';
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
                simulatePending: expectedBatch => tasks.run('manual-simulation', () => simulatePendingNarrative(expectedBatch)),
                inspectPublicOpinion,
                refreshPublicOpinion: () => tasks.run('public-opinion', refreshCanonicalPublicOpinion),
                refreshStreetOpinion: () => tasks.run('public-opinion-street', refreshStreetPublicOpinion),
                putTextIntoChatInput,
                getSettings: getSceneWorldSettings,
                getWorldEntries: getCurrentWorldEntryChoices,
                updateSettings: updateSceneWorldSettings,
                favoriteOpinion: (sourceType, sourceId) => tasks.run(`favorite:${sourceType}:${sourceId}`, () => favoriteOpinionItem(sourceType, sourceId)),
                removeChronicle: id => tasks.run(`chronicle-remove:${id}`, () => removeChronicleItem(id)),
                getBaiBaiStatus: getBaiBaiBookStatus,
                removeContinuityFact: id => tasks.run(`continuity-remove:${id}`, () => removeContinuityFact(id)),
                editContinuityFact: (id, value) => tasks.run(`continuity-edit:${id}`, () => editContinuityFact(id, value)),
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
