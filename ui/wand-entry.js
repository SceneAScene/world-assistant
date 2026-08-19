const ENTRY_ID = 'sceneworld-open-wand';
const MENU_IDS = ['sp_wand_container', 'extensionsMenu'];
let observer = null;
let clickHandler = null;
let repairQueued = false;
let mountedEntry = null;
let active = false;

function findMenu() {
    for (const id of MENU_IDS) {
        const menu = document.getElementById(id);
        if (menu) return menu;
    }
    return null;
}

function invokeOpen(event) {
    if (event?.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    clickHandler?.();
}

function createEntry() {
    const item = document.createElement('div');
    item.id = ENTRY_ID;
    item.className = 'list-group-item flex-container flexGap5';
    item.setAttribute('role', 'button');
    item.tabIndex = 0;

    const icon = document.createElement('div');
    icon.className = 'fa-solid fa-earth-asia extensionsMenuExtensionButton';
    icon.title = '打开世界动态';

    const label = document.createElement('span');
    label.textContent = '世界动态';

    item.append(icon, label);
    item.addEventListener('click', invokeOpen);
    item.addEventListener('keydown', invokeOpen);
    item.__sceneworldCleanup = () => {
        item.removeEventListener('click', invokeOpen);
        item.removeEventListener('keydown', invokeOpen);
    };
    return item;
}

function ensureMounted() {
    if (!active) return false;
    const menu = findMenu();
    if (!menu) return false;

    let item = document.getElementById(ENTRY_ID);
    if (item && item.parentElement !== menu) {
        try { item.__sceneworldCleanup?.(); } catch {}
        item.remove();
        item = null;
    }
    if (!item) {
        item = createEntry();
        menu.appendChild(item);
    }
    mountedEntry = item;
    return true;
}

function queueRepair() {
    if (repairQueued) return;
    repairQueued = true;
    const run = () => {
        repairQueued = false;
        if (!active) return;
        ensureMounted();
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 0);
}

export function mountWandEntry(onOpen) {
    active = true;
    clickHandler = typeof onOpen === 'function' ? onOpen : null;
    ensureMounted();

    // 酒馆会在切换布局/重绘扩展菜单时替换菜单 DOM。观察器持续存活，只做幂等修复，
    // 不再“挂上一次就断开”，避免入口在后续重绘中消失。
    observer?.disconnect();
    if (typeof MutationObserver === 'function') {
        observer = new MutationObserver(() => {
            if (!active) return;
            const menu = findMenu();
            const item = document.getElementById(ENTRY_ID);
            if (menu && item && item.parentElement === menu) return;
            queueRepair();
        });
        const root = document.documentElement || document.body;
        if (root) observer.observe(root, { childList: true, subtree: true });
    }
}

export function repairWandEntry() {
    return ensureMounted();
}

export function unmountWandEntry() {
    active = false;
    observer?.disconnect();
    observer = null;
    repairQueued = false;
    clickHandler = null;
    const item = document.getElementById(ENTRY_ID) || mountedEntry;
    try { item?.__sceneworldCleanup?.(); } catch {}
    item?.remove?.();
    mountedEntry = null;
}
