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
    height: min(800px, 92dvh);
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
.stack { max-width: 780px; margin: 0 auto; display: grid; gap: 12px; }
.card {
    border: 1px solid rgba(255,255,255,.10);
    background: rgba(255,255,255,.045);
    border-radius: 14px;
    padding: 16px;
}
.card h2 { margin: 0 0 8px; font-size: 16px; }
.card h3 { margin: 16px 0 8px; font-size: 13px; }
.card p { margin: 7px 0; font-size: 13px; line-height: 1.65; opacity: .82; }
.status-grid {
    margin-top: 12px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
}
.status { padding: 11px 12px; border-radius: 10px; background: rgba(0,0,0,.16); }
.status b { display: block; font-size: 12px; margin-bottom: 4px; }
.status span { font-size: 12px; opacity: .72; word-break: break-word; }
.actions { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 9px; }
.action {
    min-height: 38px;
    border: 1px solid rgba(255,255,255,.16);
    border-radius: 10px;
    padding: 8px 13px;
    background: rgba(255,255,255,.07);
    color: inherit;
    cursor: pointer;
}
.action.primary { background: rgba(126,115,220,.18); border-color: rgba(157,147,240,.42); }
.action:disabled { opacity: .42; cursor: not-allowed; }
.action.danger { border-color: rgba(220,95,95,.45); }
.note {
    margin-top: 10px;
    padding: 10px 12px;
    border-radius: 10px;
    background: rgba(0,0,0,.13);
    font-size: 12px;
    line-height: 1.65;
    opacity: .76;
}
.preview {
    margin-top: 10px;
    max-height: 220px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    padding: 12px;
    border-radius: 10px;
    background: rgba(0,0,0,.18);
    font-size: 12px;
    line-height: 1.65;
}
.item-list { display: grid; gap: 9px; margin-top: 10px; }
.item { padding: 11px 12px; border-radius: 10px; background: rgba(0,0,0,.15); }
.item b { display: block; font-size: 13px; margin-bottom: 4px; }
.item span, .item p { font-size: 12px; line-height: 1.55; opacity: .76; margin: 0; }
.meta { font-size: 11px; opacity: .56; }
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

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function latestSyncText(state) {
    if (!state?.sync?.lastProcessedMessageId && state?.sync?.lastProcessedMessageId !== 0) return '尚未推演正文';
    return `已推演消息 #${state.sync.lastProcessedMessageId}`;
}

function homeHtml(version, preview) {
    const info = inspectSceneWorldStorage();
    const state = readSceneWorldState();
    const source = preview?.source ?? null;
    const already = !!preview?.alreadyProcessed;
    return `
        <div class="stack">
            <div class="card">
                <h2>2.0 重构 · 阶段 3B：结构化手动推演</h2>
                <p>移除无业务意义的 API 连通性测试。当前只保留“读取正文 → 人工确认 → 真实推演”链路；打开插件、切换栏目和刷新酒馆都不会自动调用模型。</p>
                <div class="status-grid">
                    <div class="status"><b>插件</b><span>已就绪 · ${escapeHtml(version)}</span></div>
                    <div class="status"><b>sceneworld 数据</b><span>${info.dataExists ? `已创建 · ${formatBytes(info.totalBytes)}` : '未创建'}</span></div>
                    <div class="status"><b>正文同步</b><span>${escapeHtml(latestSyncText(state))}</span></div>
                    <div class="status"><b>自动推演</b><span>未加载 · 当前仅手动</span></div>
                </div>
            </div>

            ${state ? `<div class="card">
                <h2>当前世界状态</h2>
                <p>${escapeHtml(state.world?.summary || '尚无世界摘要')}</p>
                <div class="status-grid">
                    <div class="status"><b>世界时间</b><span>${escapeHtml(state.world?.time || '未确定')}</span></div>
                    <div class="status"><b>主要地点</b><span>${escapeHtml(state.world?.location || '未确定')}</span></div>
                    <div class="status"><b>人物</b><span>${Array.isArray(state.people) ? state.people.length : 0} 人</span></div>
                    <div class="status"><b>世界事实</b><span>${Array.isArray(state.world?.facts) ? state.world.facts.length : 0} 条</span></div>
                </div>
            </div>` : ''}

            <div class="card">
                <h2>① 读取最新 AI 正文</h2>
                <p>只在本地读取，不调用模型、不保存数据。先确认读取到的是你希望结算的最新正文。</p>
                <div class="actions">
                    <button class="action" type="button" data-action="read-latest">读取最新 AI 正文</button>
                </div>
                ${source ? `
                    <div class="note">消息 #${source.id} · ${escapeHtml(source.name)} · ${already ? '这条正文已经推演过' : '尚未推演'}</div>
                    <div class="preview">${escapeHtml(source.text)}</div>` : '<div class="note">尚未读取正文。</div>'}
            </div>

            <div class="card">
                <h2>② 手动推演这条正文</h2>
                <p>确认后才调用一次酒馆当前模型。新版本采用“增量结算”：只更新正文真正改变的人物、世界事实、暗流和回声，不再让模型整表重写已有状态。</p>
                <div class="actions">
                    <button class="action primary" type="button" data-action="simulate" ${source && !already ? '' : 'disabled'}>确认并推演这条正文</button>
                    ${info.dataExists ? '<button class="action danger" type="button" data-action="clear">清理当前聊天 sceneworld 数据</button>' : ''}
                    ${!info.dataExists ? '<button class="action" type="button" data-action="create">仅创建空数据（测试用）</button>' : ''}
                </div>
                <div class="note">本阶段新增：稳定对象 ID、人物认知证据、世界事实有效期、暗流状态/可见度、回声状态，以及“无变化就不重复输出”的增量协议。独立 API、自动推演、正文注入、舆情和世界动态助手仍未接入。</div>
            </div>
        </div>`;
}

function peopleHtml(state) {
    if (!state) return emptySection('人物');
    const items = Array.isArray(state.people) ? state.people : [];
    if (!items.length) return listSection('人物', [], () => ({}), '暂无人物状态。');
    return `<div class="stack"><div class="card"><h2>人物</h2><div class="item-list">${items.map(item => {
        const knowledge = Array.isArray(item.knowledge) ? item.knowledge : [];
        const knowledgeHtml = knowledge.length
            ? `<div class="meta">已确认认知：${knowledge.slice(-4).map(k => escapeHtml(typeof k === 'string' ? k : k.text)).join('；')}</div>`
            : '';
        return `<div class="item"><b>${escapeHtml(item.name || '未命名人物')}</b><p>${escapeHtml([item.status, item.location ? `位置：${item.location}` : '', item.goal ? `目标：${item.goal}` : ''].filter(Boolean).join(' · '))}</p>${knowledgeHtml}</div>`;
    }).join('')}</div></div></div>`;
}

function undercurrentsHtml(state) {
    if (!state) return emptySection('暗流');
    return listSection('暗流', state.undercurrents || [], item => ({ title: item.title || '未命名暗流', body: [item.status, item.visibility ? `可见度：${item.visibility}` : '', item.summary].filter(Boolean).join(' · ') }));
}

function echoesHtml(state) {
    if (!state) return emptySection('回声');
    return listSection('回声', state.echoes || [], item => ({ title: item.title || '未命名回声', body: [item.status, item.kind, item.summary].filter(Boolean).join(' · ') }));
}

function opinionHtml(state) {
    if (!state) return emptySection('舆情');
    const items = Array.isArray(state.publicOpinion?.items) ? state.publicOpinion.items : [];
    return listSection('舆情', items, item => ({ title: item.title || item.name || '舆情', body: item.summary || item.text || '' }), '阶段 3B 尚未生成舆情，后续单独接入。');
}

function memoryHtml(state) {
    if (!state) return emptySection('记忆');
    const shortTerm = Array.isArray(state.memory?.shortTerm) ? state.memory.shortTerm : [];
    const longTerm = Array.isArray(state.memory?.longTerm) ? state.memory.longTerm : [];
    return `<div class="stack"><div class="card"><h2>记忆</h2><h3>近期记忆</h3>${stringItems(shortTerm)}<h3>长期记忆</h3>${stringItems(longTerm)}<p class="empty">阶段 3B 只会增量追加近期记忆，长期记忆整理将在后续阶段加入。</p></div></div>`;
}

function chronicleHtml(state) {
    if (!state) return emptySection('纪事');
    return listSection('纪事', [...(state.chronicle || [])].reverse(), item => ({
        title: item.title || '未命名纪事',
        body: [item.time, item.summary].filter(Boolean).join(' · '),
        meta: item.sourceMessageId === undefined ? '' : `来源消息 #${item.sourceMessageId}`,
    }));
}

function emptySection(title) {
    return `<div class="stack"><div class="card"><h2>${title}</h2><p>当前聊天尚未创建 sceneworld 数据。仅查看页面不会自动创建。</p></div></div>`;
}

function stringItems(items) {
    if (!items.length) return '<p class="empty">暂无记录。</p>';
    return `<div class="item-list">${items.map(text => `<div class="item"><p>${escapeHtml(text)}</p></div>`).join('')}</div>`;
}

function listSection(title, items, mapper, emptyText = '暂无记录。') {
    if (!Array.isArray(items) || !items.length) return `<div class="stack"><div class="card"><h2>${title}</h2><p class="empty">${emptyText}</p></div></div>`;
    return `<div class="stack"><div class="card"><h2>${title}</h2><div class="item-list">${items.map(item => {
        const view = mapper(item) || {};
        return `<div class="item"><b>${escapeHtml(view.title || '')}</b>${view.body ? `<p>${escapeHtml(view.body)}</p>` : ''}${view.meta ? `<div class="meta">${escapeHtml(view.meta)}</div>` : ''}</div>`;
    }).join('')}</div></div></div>`;
}

function renderTab(tab, version, preview) {
    const state = readSceneWorldState();
    if (tab === '此刻') return homeHtml(version, preview);
    if (tab === '人物') return peopleHtml(state);
    if (tab === '暗流') return undercurrentsHtml(state);
    if (tab === '回声') return echoesHtml(state);
    if (tab === '舆情') return opinionHtml(state);
    if (tab === '记忆') return memoryHtml(state);
    if (tab === '纪事') return chronicleHtml(state);
    return emptySection(tab);
}

export function createSceneWorldShell({ version, onClose, actions }) {
    let host = document.getElementById(HOST_ID);
    if (host) host.remove();

    host = document.createElement('div');
    host.id = HOST_ID;
    const shadow = host.attachShadow({ mode: 'open' });
    let activeTab = '此刻';
    let busy = false;
    let preview = null;

    const render = () => {
        shadow.innerHTML = `
            <style>${STYLES}</style>
            <div class="backdrop">
                <section class="panel" role="dialog" aria-modal="true" aria-label="世界动态">
                    <header class="header">
                        <div class="title">世界动态</div>
                        <div class="version">${escapeHtml(version)}</div>
                        <div class="spacer"></div>
                        <button class="close" type="button" aria-label="关闭">×</button>
                    </header>
                    <main class="content">${renderTab(activeTab, version, preview)}</main>
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
        shadow.querySelector('[data-action="read-latest"]')?.addEventListener('click', () => {
            try {
                preview = actions?.inspectLatestNarrative?.() ?? null;
                if (!preview?.source) notify('当前聊天没有找到可读取的 AI 正文', 'warning');
            } catch (error) {
                console.error('[SceneWorld] read narrative failed', error);
                notify(`读取正文失败：${error?.message || error}`, 'error');
            }
            render();
        });
        shadow.querySelector('[data-action="simulate"]')?.addEventListener('click', async () => {
            if (busy || !preview?.source) return;
            if (!confirm(`将调用当前 SillyTavern 模型连接推演消息 #${preview.source.id}。只有成功并通过 JSON 校验后才会写入 sceneworld 数据。继续吗？`)) return;
            busy = true;
            try {
                await actions?.simulateLatest?.(preview.source);
                preview = actions?.inspectLatestNarrative?.() ?? preview;
                notify('最新正文已完成手动世界推演', 'success');
            } catch (error) {
                console.error('[SceneWorld] manual simulation failed', error);
                notify(`世界推演失败：${error?.message || error}`, 'error');
            } finally {
                busy = false;
                render();
            }
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
                preview = preview?.source ? actions?.inspectLatestNarrative?.() ?? preview : preview;
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
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) event.stopPropagation();
    });

    render();
    document.body.appendChild(host);

    return {
        host,
        refresh: render,
        onChatChanged() {
            preview = null;
            render();
        },
        destroy() { host?.remove(); },
    };
}

export function removeSceneWorldShell() {
    document.getElementById(HOST_ID)?.remove();
}
