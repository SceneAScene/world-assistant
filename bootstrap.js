import './storage-guard.js';
import './mobile-character-search-scroll.js';
import './mobile-ui-polish.js';
import './ui-hotfix.js';
import './token-budget-policy.js';
import './settings-persistence-guard.js';
import './magic-wand-entry.js';
import { initializeWorldBackstage } from './index.js';

function start() {
    try {
        delete globalThis.__worldDynamicInitError;
        initializeWorldBackstage();
    } catch (error) {
        const message = String(error?.message || error || '未知错误');
        globalThis.__worldDynamicInitError = message;
        console.error('[世界动态] 加载失败', error);
        globalThis.toastr?.error?.(`世界动态加载失败：${message}`);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
    start();
}
