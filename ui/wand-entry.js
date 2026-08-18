const ENTRY_ID = 'sceneworld-open-wand';
let observer = null;
let clickHandler = null;

function findMenu() {
    return document.getElementById('extensionsMenu');
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
    return item;
}

function tryMount() {
    const menu = findMenu();
    if (!menu) return false;

    const existing = document.getElementById(ENTRY_ID);
    if (existing) existing.remove();

    const item = createEntry();
    const invoke = event => {
        if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        clickHandler?.();
    };
    item.addEventListener('click', invoke);
    item.addEventListener('keydown', invoke);
    item.__sceneworldCleanup = () => {
        item.removeEventListener('click', invoke);
        item.removeEventListener('keydown', invoke);
    };
    menu.appendChild(item);
    return true;
}

export function mountWandEntry(onOpen) {
    clickHandler = typeof onOpen === 'function' ? onOpen : null;
    observer?.disconnect();
    observer = null;

    if (tryMount()) return;

    observer = new MutationObserver(() => {
        if (!tryMount()) return;
        observer?.disconnect();
        observer = null;
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
}

export function unmountWandEntry() {
    observer?.disconnect();
    observer = null;
    clickHandler = null;
    const item = document.getElementById(ENTRY_ID);
    try { item?.__sceneworldCleanup?.(); } catch {}
    item?.remove();
}
