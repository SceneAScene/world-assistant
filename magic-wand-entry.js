const ENTRY_ID = 'world-dynamic-wand-entry';
const POLL_MS = 1800;
let timer = null;

function getMenu() {
    return document.querySelector('#extensionsMenu');
}

function openWorldBackstage() {
    try {
        globalThis.worldDynamicHost?.open?.();
        if (!globalThis.worldDynamicHost?.open) {
            globalThis.toastr?.warning?.('世界动态仍在初始化，请稍后再试。');
        }
    } catch (error) {
        console.error('[世界动态] 打开失败', error);
        globalThis.toastr?.error?.(`世界动态打开失败：${error?.message || error}`);
    }
}

function installEntry() {
    const menu = getMenu();
    if (!menu) return false;

    let entry = document.getElementById(ENTRY_ID);
    if (!entry) {
        entry = document.createElement('div');
        entry.id = ENTRY_ID;
        entry.className = 'list-group-item flex-container flexGap5 interactable';
        entry.setAttribute('role', 'button');
        entry.setAttribute('tabindex', '0');
        entry.setAttribute('title', '打开世界动态');
        entry.innerHTML = '<i class="fa-solid fa-globe" aria-hidden="true"></i><span>世界动态</span>';
        entry.addEventListener('click', event => {
            event.preventDefault();
            openWorldBackstage();
            const jq = globalThis.$;
            if (jq) jq('#extensionsMenu').fadeOut?.(100);
        });
        entry.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            openWorldBackstage();
        });
        menu.appendChild(entry);
    }

    const button = document.querySelector('#extensionsMenuButton');
    if (button instanceof HTMLElement) button.style.display = '';
    return true;
}

function start() {
    installEntry();
    if (timer === null) timer = globalThis.setInterval(installEntry, POLL_MS);
}

export function destroyMagicWandEntry() {
    if (timer !== null) {
        globalThis.clearInterval(timer);
        timer = null;
    }
    document.getElementById(ENTRY_ID)?.remove?.();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
    start();
}
