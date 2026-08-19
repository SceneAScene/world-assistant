export function createSceneWorldDialogManager({ shadowRoot, escapeHtml = value => String(value ?? '') } = {}) {
    if (!shadowRoot?.appendChild) throw new TypeError('弹窗管理器缺少 Shadow Root');
    let active = null;

    function cancelActive(value = null) {
        if (!active) return false;
        const session = active;
        active = null;
        session.finish(value);
        return true;
    }

    function prepare() {
        cancelActive(null);
        shadowRoot.querySelector('.modal-layer')?.remove();
    }

    function createSession(html, { defaultValue = null } = {}) {
        prepare();
        const overlay = document.createElement('div');
        overlay.className = 'modal-layer';
        overlay.innerHTML = html;
        shadowRoot.appendChild(overlay);
        overlay.scrollTop = 0;

        let done = false;
        let resolvePromise;
        const promise = new Promise(resolve => { resolvePromise = resolve; });
        const finish = value => {
            if (done) return;
            done = true;
            if (active?.overlay === overlay) active = null;
            overlay.remove();
            resolvePromise(value);
        };
        active = { overlay, finish: value => finish(value ?? defaultValue) };

        overlay.addEventListener('click', event => {
            if (event.target === overlay) finish(defaultValue);
        });
        overlay.addEventListener('keydown', event => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            finish(defaultValue);
        });
        // 不自动聚焦输入框，避免移动端软键盘一打开就把整个浮层顶出可视区域。
        overlay.querySelector('.modal-dialog')?.setAttribute('tabindex', '-1');
        return { overlay, finish, promise };
    }

    function confirm({ title = '确认操作', message = '', confirmLabel = '确认', cancelLabel = '取消', danger = false } = {}) {
        const session = createSession(`<section class="modal-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}"><h2>${escapeHtml(title)}</h2><div class="modal-message">${escapeHtml(message)}</div><div class="modal-actions"><button class="action" type="button" data-dialog-cancel>${escapeHtml(cancelLabel)}</button><button class="action ${danger ? 'danger-fill' : 'primary'}" type="button" data-dialog-confirm>${escapeHtml(confirmLabel)}</button></div></section>`, { defaultValue: false });
        session.overlay.querySelector('[data-dialog-cancel]')?.addEventListener('click', () => session.finish(false));
        session.overlay.querySelector('[data-dialog-confirm]')?.addEventListener('click', () => session.finish(true));
        return session.promise;
    }

    function info({ title = '说明', message = '', closeLabel = '知道了' } = {}) {
        const session = createSession(`<section class="modal-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}"><h2>${escapeHtml(title)}</h2><div class="modal-message">${escapeHtml(message)}</div><div class="modal-actions"><button class="action primary" type="button" data-dialog-close>${escapeHtml(closeLabel)}</button></div></section>`, { defaultValue: true });
        session.overlay.querySelector('[data-dialog-close]')?.addEventListener('click', () => session.finish(true));
        return session.promise;
    }

    function text({ title = '修改内容', description = '', label = '内容', value = '', confirmLabel = '保存', multiline = true } = {}) {
        const inputHtml = multiline
            ? `<textarea data-dialog-input>${escapeHtml(value)}</textarea>`
            : `<input type="text" data-dialog-input value="${escapeHtml(value)}">`;
        const session = createSession(`<section class="modal-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}"><h2>${escapeHtml(title)}</h2>${description ? `<p>${escapeHtml(description)}</p>` : ''}<label class="editor-field"><span>${escapeHtml(label)}</span>${inputHtml}</label><div class="dialog-error" data-dialog-error></div><div class="modal-actions"><button class="action" type="button" data-dialog-cancel>取消</button><button class="action primary" type="button" data-dialog-confirm>${escapeHtml(confirmLabel)}</button></div></section>`, { defaultValue: null });
        const input = session.overlay.querySelector('[data-dialog-input]');
        session.overlay.querySelector('[data-dialog-cancel]')?.addEventListener('click', () => session.finish(null));
        session.overlay.querySelector('[data-dialog-confirm]')?.addEventListener('click', () => session.finish(String(input?.value ?? '')));
        return session.promise;
    }

    function form({ title = '编辑', description = '', bodyHtml = '', confirmLabel = '保存', cancelLabel = '取消', className = '', readValue } = {}) {
        const session = createSession(`<section class="modal-dialog ${escapeHtml(className)}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}"><h2>${escapeHtml(title)}</h2>${description ? `<p>${escapeHtml(description)}</p>` : ''}<div class="dialog-form-body">${bodyHtml}</div><div class="dialog-error" data-dialog-error></div><div class="editor-actions"><button class="action" type="button" data-dialog-cancel>${escapeHtml(cancelLabel)}</button><button class="action primary" type="button" data-dialog-confirm>${escapeHtml(confirmLabel)}</button></div></section>`, { defaultValue: null });
        const errorBox = session.overlay.querySelector('[data-dialog-error]');
        const showError = message => {
            if (!errorBox) return;
            errorBox.textContent = String(message ?? '');
            errorBox.hidden = !message;
        };
        showError('');
        session.overlay.addEventListener('input', () => showError(''));
        session.overlay.querySelector('[data-dialog-cancel]')?.addEventListener('click', () => session.finish(null));
        session.overlay.querySelector('[data-dialog-confirm]')?.addEventListener('click', () => {
            try {
                const result = typeof readValue === 'function' ? readValue(session.overlay) : {};
                if (result && typeof result === 'object' && result.ok === false) {
                    showError(result.message || '请检查填写内容');
                    const target = result.focusSelector ? session.overlay.querySelector(result.focusSelector) : null;
                    target?.focus?.({ preventScroll: true });
                    return;
                }
                session.finish(result && typeof result === 'object' && 'value' in result ? result.value : result);
            } catch (error) {
                showError(error?.message || error);
            }
        });
        return session.promise;
    }

    function destroy() {
        cancelActive(null);
        shadowRoot.querySelector('.modal-layer')?.remove();
    }

    return Object.freeze({ confirm, info, text, form, cancelActive, destroy, get active() { return !!active; } });
}
