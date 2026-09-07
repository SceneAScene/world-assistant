import { mountWandEntry, unmountWandEntry } from './ui/wand-entry.js';

const VERSION = '2.2.0';
let controller = null;
let controllerPromise = null;
let activated = false;

function fallbackNotify(message, level = 'error') {
    try {
        const toastr = globalThis.toastr;
        if (toastr && typeof toastr[level] === 'function') {
            toastr[level](message);
            return;
        }
    } catch {}
    const fn = level === 'error' ? console.error : console.warn;
    fn(`[SceneWorld] ${message}`);
}

async function ensureController() {
    if (controller) return controller;
    if (!controllerPromise) {
        // 入口模块与主体模块解耦：即使主体某个可选模块加载失败，魔法棒入口仍可注册并保留。
        controllerPromise = import('./app/sceneworld-controller.js')
            .then(module => {
                if (typeof module.createSceneWorldController !== 'function') {
                    throw new Error('世界动态控制器导出不可用');
                }
                controller = module.createSceneWorldController({ version: VERSION });
                return controller;
            })
            .catch(error => {
                controllerPromise = null;
                throw error;
            });
    }
    return controllerPromise;
}

async function openFromWand() {
    try {
        const instance = await ensureController();
        instance.open();
    } catch (error) {
        console.error('[SceneWorld] open failed', error);
        fallbackNotify(`世界动态打开失败：${error?.message || error}`, 'error');
    }
}

export function onActivate() {
    if (activated) return;
    activated = true;

    // 先注册并持续守护入口，再异步加载主体。入口不再依赖控制器/世界书/记忆插件是否初始化成功。
    mountWandEntry(openFromWand);

    void ensureController()
        .then(instance => {
            if (!activated) return;
            instance.initialize();
            console.info(`[SceneWorld] ${VERSION} activated (stability refactor)`);
        })
        .catch(error => {
            console.error('[SceneWorld] controller initialization failed', error);
            fallbackNotify(`世界动态主体初始化失败；入口仍保留，可稍后再次打开重试：${error?.message || error}`, 'error');
        });
}

function shutdown() {
    activated = false;
    unmountWandEntry();
    if (controller) {
        try { controller.destroy(); } catch (error) { console.warn('[SceneWorld] destroy failed', error); }
    }
    controller = null;
    // 已在进行中的动态 import 无法取消；完成后若插件仍关闭，立即销毁。
    const pending = controllerPromise;
    controllerPromise = null;
    if (pending) {
        void pending.then(instance => {
            if (activated) return;
            if (controller === instance) controller = null;
            try { instance.destroy(); } catch {}
        }).catch(() => {});
    }
}

export function onDisable() {
    shutdown();
}

export function onDelete() {
    shutdown();
}
