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
        initializeWorldBackstage();
    } catch (error) {
        console.error('[世界背面] 初始化失败', error);
        globalThis.toastr?.error?.(`世界背面初始化失败：${error?.message || error}`);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
    start();
}
