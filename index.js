import { createSceneWorldController } from './app/sceneworld-controller.js';
import { mountWandEntry, unmountWandEntry } from './ui/wand-entry.js';
import { notify } from './platform/sillytavern.js';

const VERSION = '2.0.0-alpha.9';
let controller = null;
let activated = false;

function ensureController() {
    if (!controller) controller = createSceneWorldController({ version: VERSION });
    return controller;
}

function openFromWand() {
    try {
        ensureController().open();
    } catch (error) {
        console.error('[SceneWorld] open failed', error);
        notify(`世界动态打开失败：${error?.message || error}`, 'error');
    }
}

export function onActivate() {
    if (activated) return;
    try {
        ensureController().initialize();
        mountWandEntry(openFromWand);
        activated = true;
        console.info(`[SceneWorld] ${VERSION} activated (phase 4B world info and guidance)`);
    } catch (error) {
        activated = false;
        console.error('[SceneWorld] activation failed', error);
        notify(`世界动态加载失败：${error?.message || error}`, 'error');
    }
}

function shutdown() {
    unmountWandEntry();
    controller?.destroy();
    controller = null;
    activated = false;
}

export function onDisable() {
    shutdown();
}

export function onDelete() {
    shutdown();
}
