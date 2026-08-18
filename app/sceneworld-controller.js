import { EventManager } from './event-manager.js';
import { TaskManager } from './task-manager.js';
import { inspectSceneWorldStorage } from '../data/sceneworld-store.js';
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

        // Runtime namespace only. No SillyTavern settings/chat data are created here.
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
        shell = createSceneWorldShell({ version, onClose: close });
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
