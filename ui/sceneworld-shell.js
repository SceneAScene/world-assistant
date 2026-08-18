import {
    clearSceneWorldState,
    createSceneWorldState,
    inspectSceneWorldStorage,
    readSceneWorldState,
    sceneWorldUsage,
} from '../data/sceneworld-store.js';
import { notify } from '../platform/sillytavern.js';

const HOST_ID = 'sceneworld-root';
const TABS = ['此刻', '人物', '暗流', '回声', '舆情', '记忆', '纪事'];

const SECTION_MAP = {
    '人物': ['people', '人物'],
    '暗流': ['undercurrents', '暗流'],
    '回声': ['echoes', '回声'],
    '舆情': ['publicOpinion', '舆情'],
    '记忆': ['memory', '记忆'],
    '纪事': ['chronicle', '纪事'],
};

const STYLES = `
:host {
    all: initial;
    position: fixed;
    inset: 0;
    z-index: 2147483000;
    display: block;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    color: var(--SmartThemeBodyColor, #e8e8e8);
}
*, *::before, *::after { box-sizing: border-box; }
button { font: inherit; }
.backdrop {
    width: 100%; height: 100%;
    display: grid; place-items: center;
    padding: max(14px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(14px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
    background: rgba(0,0,0,.48);
}
.panel {
    width: min(920px, 96vw);
    height: min(760px, 92dvh);
    min-height: 420px;
    overflow: hidden;
    display: grid;
    grid-template-rows: auto 1fr auto;
    border: 1px solid rgba(255,255,255,.14);
    border-radius: 18px;
    background: var(--SmartThemeBlurTintColor, rgba(26,28,31,.97));
    box-shadow: 0 24px 80px rgba(0,0,0,.38);
    color: var(--SmartThemeBodyColor, #e8e8e8);
}
.header {
    min-height: 58px;
    padding: 12px 14px 10px 18px;
    display: flex;
    align-items: center;
    gap: 10px;
    border-bottom: 1px solid rgba(255,255,255,.10);
}
.title { font-size: 18px; font-weight: 720; letter-spacing: .04em; }
.version { font-size: 11px; opacity: .55; }
.spacer { flex: 1; }
.close {
    border: 0; background: transparent; color: inherit;
    width: 38px; height: 38px; border-radius: 10px;
    cursor: pointer; font-size: 22px; line-height: 1;
}
.close:hover { background: rgba(255,255,255,.08); }
.content { overflow: auto; padding: 18px; }
.card {
    max-width: 760px;
    margin: 0 auto;
    border: 1px solid rgba(255,255,255,.10);
    background: rgba(255,255,255,.045);
    border-radius: 14px;
    padding: 16px;
}
.card h2 { margin: 0 0 8px; font-size: 16px; }
.card h3 { margin: 18px 0 8px; font-size: 13px; }
.card p { margin: 7px 0; font-size: 13px; line-height: 1.65; opacity: .82; }
.status-grid {
    margin-top: 14px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
}
.status {
    padding: 11px 12px;
    border-radius: 10px;
    background: rgba(0,0,0,.16);
}
.status b { display: block; font-size: 12px; margin-bottom: 4px; }
.status span { font-size: 12px; opacity: .72; word-break: break-word; }
.actions { margin-top: 14px; display: flex; flex-wrap: wrap; gap: 9px; }
.action {
    min-height: 38px;
    border: 1px solid rgba(255,255,255,.16);
    border-radius: 10px;
    padding: 8px 13px;
    background: rgba(255,255,255,.07);
    color: inherit;
    cursor: pointer;
}
.action:disabled { opacity: .42; cursor: not-allowed; }
.action.danger { border-color: rgba(220,95,95,.45); }
.note {
    margin-top: 12px;
    padding: 10px 12px;
    border-radius: 10px;
    background: rgba(0,0,0,.13);
    font-size: 12px;
    line-height: 1.65;
    opacity: .72;
}
.usage-list { display: grid; gap: 7px; margin-top: 10px; }
.usage-row { display: flex; justify-content: space-between; gap: 14px; font-size: 12px; }
.empty { opacity: .62; }
.nav {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    align-items: stretch;
    border-top: 1px solid rgba(255,255,255,.10);
    background: rgba(0,0,0,.12);
    padding-bottom: env(safe-area-inset-bottom);
}
.nav button {
    min-width: 0;
    min-height: 48px;
    padding: 8px 2px;
    border: 0;
    border-right: 1px solid rgba(255,255,255,.06);
    color: inherit;
    background: transparent;
    font-size: clamp(11px, 2.8vw, 13px);
    font-weight: 620;
    cursor: pointer;
    white-space: nowrap;
}
.nav button:last-child { border-right: 0; }
.nav button[aria-selected="true"] { background: rgba(255,255,255,.09); }
@media (max-width: 620px) {
    .backdrop { padding: 0; place-items: stretch; }
    .panel { width: 100vw; height: 100dvh; min-height: 0; border-radius: 0; border: 0; }
    .header { min-height: 52px; padding-left: 14px; }
    .title { font-size: 17px; }
    .content { padding: 14px 12px; }
    .status-grid { grid-template-columns: 1fr; }
    .actions { display: grid; grid-template-columns: 1fr; }
    .nav button { min-height: 52px; font-size: clamp(11px, 3.1vw, 13px); }
}
`;

function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function countForSection(key, value) {
    if (Array.isArray(value)) return value.length;
    if (!value || typeof value !== 'object') return value ? 1 : 0;
    if (key === 'publicOpinion') return Array.isArray(value.items) ? value.items.length : 0;
    if (key === 'memory') {
        return (Array.isArray(value.shortTerm) ? value.shortTerm.length : 0)
            + (Array.isArray(value.longTerm) ? value.longTerm.length : 0);
    }
    return Object.values(value).some(Boolean) ? 1 : 0;
}

function diagnosticsHtml(version) {
    const info = inspectSceneWorldStorage();
    const usage = sceneWorldUsage();
    const state = readSceneWorldState();
    return `
        <div class="card">
            <h2>2.0 重构 · 阶段 2：数据层</h2>
            <p>这一阶段只验证 sceneworld 的聊天数据结构、持久化、容量统计和安全清理。仍不包含 API、正文读取或世界推演。</p>
            <div class="status-grid">
                <div class="status"><b>插件</b><span>已就绪 · ${version}</span></div>
                <div class="status"><b>当前聊天</b><span>${info.activeChat ? '已检测到聊天' : '未检测到聊天'}</span></div>
                <div class="status"><b>sceneworld 数据</b><span>${info.dataExists ? `已创建 · schema ${info.schemaVersion}` : '未创建'}</span></div>
                <div class="status"><b>当前占用</b><span>${formatBytes(info.totalBytes)}</span></div>
            </div>
            <div class="actions">
                ${info.dataExists
                    ? '<button class="action danger" type="button" data-action="clear">清理当前聊天 sceneworld 数据</button>'
                    : `<button class="action" type="button" data-action="create" ${info.activeChat ? '' : 'disabled'}>创建当前聊天空数据</button>`}
            </div>
            <div class="note">“创建空数据”只建立一个空的 <b>chatMetadata.sceneworld</b> 容器，不读取正文、不调用 API、不推演。插件加载和打开界面本身仍然不会写数据。</div>
            ${state ? `
                <h3>数据区占用</h3>
                <div class="usage-list">
                    ${Object.entries(usage.sections).map(([key, bytes]) => `<div class="usage-row"><span>${key}</span><span>${formatBytes(bytes)}</span></div>`).join('')}
                </div>` : ''}
        </div>`;
}

function sectionHtml(tab) {
    const state = readSceneWorldState();
    const mapping = SECTION_MAP[tab];
    if (!mapping) return '<div class="card"><p>阶段 2 占位页。</p></div>';
    const [key, label] = mapping;
    const value = state?.[key];
    const count = state ? countForSection(key, value) : 0;
    return `<div class="card"><h2>${label}</h2>${state
        ? `<p>数据结构已就绪。当前记录数：<b>${count}</b>。</p><p class="empty">阶段 2 不提供业务编辑；后续阶段由推演引擎和界面功能写入这里。</p>`
        : '<p>当前聊天尚未创建 sceneworld 数据。仅查看页面不会自动创建。</p>'}</div>`;
}

export function createSceneWorldShell({ version, onClose }) {
    let host = document.getElementById(HOST_ID);
    if (host) host.remove();

    host = document.createElement('div');
    host.id = HOST_ID;
    const shadow = host.attachShadow({ mode: 'open' });
    let activeTab = '此刻';
    let busy = false;

    const render = () => {
        shadow.innerHTML = `
            <style>${STYLES}</style>
            <div class="backdrop">
                <section class="panel" role="dialog" aria-modal="true" aria-label="世界动态">
                    <header class="header">
                        <div class="title">世界动态</div>
                        <div class="version">${version}</div>
                        <div class="spacer"></div>
                        <button class="close" type="button" aria-label="关闭">×</button>
                    </header>
                    <main class="content">${activeTab === '此刻' ? diagnosticsHtml(version) : sectionHtml(activeTab)}</main>
                    <nav class="nav" aria-label="世界动态栏目">
                        ${TABS.map(tab => `<button type="button" data-tab="${tab}" aria-selected="${tab === activeTab}">${tab}</button>`).join('')}
                    </nav>
                </section>
            </div>`;

        shadow.querySelector('.close')?.addEventListener('click', () => onClose?.());
        shadow.querySelector('.backdrop')?.addEventListener('click', event => {
            if (event.target === event.currentTarget) onClose?.();
        });
        shadow.querySelectorAll('[data-tab]').forEach(button => {
            button.addEventListener('click', () => {
                activeTab = button.dataset.tab || '此刻';
                render();
            });
        });
        shadow.querySelector('[data-action="create"]')?.addEventListener('click', async () => {
            if (busy) return;
            busy = true;
            try {
                await createSceneWorldState();
                notify('已创建当前聊天的 sceneworld 空数据', 'success');
            } catch (error) {
                console.error('[SceneWorld] create state failed', error);
                notify(`创建数据失败：${error?.message || error}`, 'error');
            } finally {
                busy = false;
                render();
            }
        });
        shadow.querySelector('[data-action="clear"]')?.addEventListener('click', async () => {
            if (busy) return;
            if (!confirm('只删除当前聊天的 chatMetadata.sceneworld 数据。不会删除聊天正文，也不会触碰其他插件数据。确定继续吗？')) return;
            busy = true;
            try {
                const removed = await clearSceneWorldState();
                notify(removed ? '当前聊天的 sceneworld 数据已清理' : '当前聊天没有 sceneworld 数据', 'success');
            } catch (error) {
                console.error('[SceneWorld] clear state failed', error);
                notify(`清理数据失败：${error?.message || error}`, 'error');
            } finally {
                busy = false;
                render();
            }
        });
    };

    shadow.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.stopPropagation();
            onClose?.();
            return;
        }
        const target = event.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
            event.stopPropagation();
        }
    });

    render();
    document.body.appendChild(host);

    return {
        host,
        refresh: render,
        destroy() { host?.remove(); },
    };
}

export function removeSceneWorldShell() {
    document.getElementById(HOST_ID)?.remove();
}
