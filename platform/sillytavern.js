export function getContextSafe() {
    try {
        return globalThis.SillyTavern?.getContext?.() ?? null;
    } catch (error) {
        console.warn('[SceneWorld] unable to read SillyTavern context', error);
        return null;
    }
}

export function getCurrentChatMetadata() {
    return getContextSafe()?.chatMetadata ?? null;
}

export function getCurrentChatId() {
    const context = getContextSafe();
    return context?.chatId ?? null;
}

export function notify(message, level = 'info') {
    const toastr = globalThis.toastr;
    if (toastr && typeof toastr[level] === 'function') {
        toastr[level](String(message));
        return;
    }
    const fn = level === 'error' ? console.error : level === 'warning' ? console.warn : console.info;
    fn(`[SceneWorld] ${message}`);
}
