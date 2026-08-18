import { inspectSceneWorldStorage } from '../data/sceneworld-store.js';

const HOST_ID = 'sceneworld-root';
const TABS = ['此刻', '人物', '暗流', '回声', '舆情', '记忆', '纪事'];

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
    max-width: 720px;
    margin: 0 auto;
    border: 1px solid rgba(255,255,255,.10);
    background: rgba(255,255,255,.045);
    border-radius: 14px;
    padding: 16px;
}
.card h2 { margin: 0 0 8px; font-size: 16px; }
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
.phase-note { margin-top: 12px; font-size: 12px; opacity: .62; }
@media (max-width: 620px) {
    .backdrop { padding: 0; place-items: stretch; }
    .panel { width: 100vw; height: 100dvh; min-height: 0; border-radius: 0; border: 0; }
    .header { min-height: 52px; padding-left: 14px; }
    .title { font-size: 17px; }
    .content { padding: 14px 12px; }
    .status-grid { grid-template-columns: 1fr; }
    .nav button { min-height: 52px; font-size: clamp(11px, 3.1vw, 13px); }
}
`;

function diagnosticsHtml(version) {
    const info = inspectSceneWorldStorage();
    return `
        <div class="card">
            <h2>2.0 重构 · 阶段 1</h2>
            <p>当前版本只验证插件骨架和界面生命周期，不包含 API、正文读取、世界推演、助手或数据写入功能。</p>
            <div class="status-grid">
                <div class="status"><b>插件</b><span>已就绪 · ${version}</span></div>
                <div class="status"><b>当前聊天</b><span>${info.chatId ? '已检测到聊天' : '未检测到聊天'}</span></div>
                <div class="status"><b>sceneworld 数据</b><span>${info.dataExists ? '已存在（来自其他测试）' : '未创建'}</span></div>
                <div class="status"><b>API / 推演</b><span>阶段 1 未加载</span></div>
            </div>
            <p class="phase-note">点击下方栏目只切换本地占位页面，不会保存任何聊天数据。</p>
        </div>`;
}

function placeholderHtml(tab) {
    return `<div class="card"><h2>${tab}</h2><p>该功能将在后续重构阶段迁移。当前阶段不会创建或修改 sceneworld 数据。</p></div>`;
}

export function createSceneWorldShell({ version, onClose }) {
    let host = document.getElementById(HOST_ID);
    if (host) host.remove();

    host = document.createElement('div');
    host.id = HOST_ID;
    const shadow = host.attachShadow({ mode: 'open' });
    let activeTab = '此刻';

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
                    <main class="content">${activeTab === '此刻' ? diagnosticsHtml(version) : placeholderHtml(activeTab)}</main>
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
        destroy() { host?.remove(); },
    };
}

export function removeSceneWorldShell() {
    document.getElementById(HOST_ID)?.remove();
}
