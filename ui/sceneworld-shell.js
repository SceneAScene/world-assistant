import {
    clearSceneWorldState,
    inspectSceneWorldStorage,
    readSceneWorldState,
} from '../data/sceneworld-store.js';
import { notify } from '../platform/sillytavern.js';

const HOST_ID = 'sceneworld-root';
const TABS = ['此刻', '人物', '舆情', '记忆', '纪事'];

const STYLES = `
:host { all: initial; position: fixed; inset: 0; z-index: 2147483000; display: block; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; color: var(--SmartThemeBodyColor,#e8e8e8); }
*,*::before,*::after{box-sizing:border-box} button{font:inherit}
.backdrop{width:100%;height:100%;display:grid;place-items:center;padding:max(14px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(14px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));background:rgba(0,0,0,.48)}
.panel{width:min(920px,96vw);height:min(800px,92dvh);min-height:420px;overflow:hidden;display:grid;grid-template-rows:auto 1fr auto;border:1px solid rgba(255,255,255,.14);border-radius:18px;background:var(--SmartThemeBlurTintColor,rgba(26,28,31,.97));box-shadow:0 24px 80px rgba(0,0,0,.38);color:var(--SmartThemeBodyColor,#e8e8e8)}
.header{min-height:58px;padding:12px 14px 10px 18px;display:flex;align-items:center;gap:10px;border-bottom:1px solid rgba(255,255,255,.10)}
.title{font-size:18px;font-weight:720;letter-spacing:.04em}.version{font-size:11px;opacity:.55}.spacer{flex:1}
.close{border:0;background:transparent;color:inherit;width:38px;height:38px;border-radius:10px;cursor:pointer;font-size:22px;line-height:1}.close:hover{background:rgba(255,255,255,.08)}
.content{overflow:auto;padding:18px}.stack{max-width:780px;margin:0 auto;display:grid;gap:12px}
.card{border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.045);border-radius:14px;padding:16px}.card h2{margin:0 0 8px;font-size:16px}.card h3{margin:15px 0 8px;font-size:13px}.card p{margin:7px 0;font-size:13px;line-height:1.65;opacity:.82}
.status-grid{margin-top:12px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.status{padding:11px 12px;border-radius:10px;background:rgba(0,0,0,.16)}.status b{display:block;font-size:12px;margin-bottom:4px}.status span{font-size:12px;opacity:.72;word-break:break-word}
.actions{margin-top:12px;display:flex;flex-wrap:wrap;gap:9px}.action{min-height:38px;border:1px solid rgba(255,255,255,.16);border-radius:10px;padding:8px 13px;background:rgba(255,255,255,.07);color:inherit;cursor:pointer}.action.primary{background:rgba(126,115,220,.18);border-color:rgba(157,147,240,.42)}.action:disabled{opacity:.42;cursor:not-allowed}.action.danger{border-color:rgba(220,95,95,.45)}
.note{margin-top:10px;padding:10px 12px;border-radius:10px;background:rgba(0,0,0,.13);font-size:12px;line-height:1.65;opacity:.76}.preview{margin-top:10px;max-height:220px;overflow:auto;white-space:pre-wrap;word-break:break-word;padding:12px;border-radius:10px;background:rgba(0,0,0,.18);font-size:12px;line-height:1.65}
.item-list{display:grid;gap:9px;margin-top:10px}.item{padding:11px 12px;border-radius:10px;background:rgba(0,0,0,.15)}.item b{display:block;font-size:13px;margin-bottom:4px}.item span,.item p{font-size:12px;line-height:1.55;opacity:.76;margin:0}.meta{font-size:11px;opacity:.56;margin-top:5px}.empty{opacity:.62}.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}.chip{font-size:11px;padding:4px 7px;border-radius:999px;background:rgba(255,255,255,.07);opacity:.78}
.nav{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));align-items:stretch;border-top:1px solid rgba(255,255,255,.10);background:rgba(0,0,0,.12);padding-bottom:env(safe-area-inset-bottom)}.nav button{min-width:0;min-height:48px;padding:8px 2px;border:0;border-right:1px solid rgba(255,255,255,.06);color:inherit;background:transparent;font-size:clamp(12px,3vw,14px);font-weight:620;cursor:pointer;white-space:nowrap}.nav button:last-child{border-right:0}.nav button[aria-selected="true"]{background:rgba(255,255,255,.09)}
@media(max-width:620px){.backdrop{padding:0;place-items:stretch}.panel{width:100vw;height:100dvh;min-height:0;border-radius:0;border:0}.header{min-height:52px;padding-left:14px}.title{font-size:17px}.content{padding:14px 12px}.status-grid{grid-template-columns:1fr}.actions{display:grid;grid-template-columns:1fr}.nav button{min-height:52px;font-size:clamp(12px,3.4vw,14px)}}`;

function escapeHtml(value) {
    return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
}
function formatBytes(bytes){const n=Number(bytes)||0;if(n<1024)return`${n} B`;if(n<1024*1024)return`${(n/1024).toFixed(1)} KB`;return`${(n/1024/1024).toFixed(2)} MB`}
function latestSyncText(state){if(!state?.sync?.lastProcessedMessageId&&state?.sync?.lastProcessedMessageId!==0)return'尚未推演正文';return`已推演消息 #${state.sync.lastProcessedMessageId}`}

function currentWorldHtml(state) {
    if (!state) return '';
    const cards = [];
    if (state.world?.time) cards.push(`<div class="status"><b>世界时间</b><span>${escapeHtml(state.world.time)}</span></div>`);
    if (state.world?.location) cards.push(`<div class="status"><b>当前地点</b><span>${escapeHtml(state.world.location)}</span></div>`);
    const moments = Array.isArray(state.world?.moments) ? state.world.moments : [];
    return `<div class="card"><h2>当前世界状态</h2>${state.world?.summary ? `<p>${escapeHtml(state.world.summary)}</p>` : '<p class="empty">当前没有需要额外概括的世界变化。</p>'}${cards.length ? `<div class="status-grid">${cards.join('')}</div>` : ''}${moments.length ? `<div class="item-list">${moments.map(item=>`<div class="item"><b>${escapeHtml(item.title)}</b><p>${escapeHtml(item.text)}</p></div>`).join('')}</div>` : ''}</div>`;
}

function homeHtml(version, preview) {
    const info = inspectSceneWorldStorage();
    const state = readSceneWorldState();
    const source = preview?.source ?? null;
    const already = !!preview?.alreadyProcessed;
    return `<div class="stack">
        <div class="card"><h2>2.0 重构 · 阶段 3C：通用稀疏推演</h2><p>核心推演采用同一套通用模板，不判断角色卡类型。没有依据就不填，没有变化可以全部为空；一次手动推演只调用一次当前模型。</p><div class="status-grid"><div class="status"><b>插件</b><span>已就绪 · ${escapeHtml(version)}</span></div><div class="status"><b>sceneworld 数据</b><span>${info.dataExists?`已创建 · ${formatBytes(info.totalBytes)}`:'未创建'}</span></div><div class="status"><b>正文同步</b><span>${escapeHtml(latestSyncText(state))}</span></div><div class="status"><b>自动推演</b><span>未加载 · 当前仅手动</span></div></div></div>
        ${currentWorldHtml(state)}
        <div class="card"><h2>① 读取最新 AI 正文</h2><p>只在本地读取，不调用模型、不保存数据。</p><div class="actions"><button class="action" type="button" data-action="read-latest">读取最新 AI 正文</button></div>${source?`<div class="note">消息 #${source.id} · ${escapeHtml(source.name)} · ${already?'这条正文已经推演过':'尚未推演'}</div><div class="preview">${escapeHtml(source.text)}</div>`:'<div class="note">尚未读取正文。</div>'}</div>
        <div class="card"><h2>② 手动推演这条正文</h2><p>确认后调用一次当前模型。只更新“此刻、人物、客观世界事实、世界线记忆”；不会生成舆情、暗流、回声或纪事。</p><div class="actions"><button class="action primary" type="button" data-action="simulate" ${source&&!already?'':'disabled'}>确认并推演这条正文</button>${info.dataExists?'<button class="action danger" type="button" data-action="clear">清理当前聊天 sceneworld 数据</button>':''}</div><div class="note">慢剧情允许没有任何世界变化。程序不会把“暂无重大事件”“局势稳定”之类占位文本保存进去。</div></div>
    </div>`;
}

function peopleHtml(state) {
    if (!state) return emptySection('人物');
    const items = Array.isArray(state.people) ? state.people : [];
    if (!items.length) return listSection('人物', [], () => ({}), '当前没有需要持续记录的人物状态。');
    return `<div class="stack"><div class="card"><h2>人物</h2><div class="item-list">${items.map(person=>{
        const detailChips=(Array.isArray(person.details)?person.details:[]).map(item=>`<span class="chip">${escapeHtml(item.label)}：${escapeHtml(item.value)}</span>`).join('');
        const knowledge=(Array.isArray(person.knowledge)?person.knowledge:[]).slice(-4).map(item=>escapeHtml(typeof item==='string'?item:item.text)).filter(Boolean).join('；');
        const main=[person.status,person.location?`位置：${person.location}`:''].filter(Boolean).join(' · ');
        return `<div class="item"><b>${escapeHtml(person.name||'未命名人物')}</b>${main?`<p>${escapeHtml(main)}</p>`:''}${detailChips?`<div class="chips">${detailChips}</div>`:''}${knowledge?`<div class="meta">已确认认知：${knowledge}</div>`:''}</div>`;
    }).join('')}</div></div></div>`;
}

function opinionHtml(state) {
    if (!state) return emptySection('舆情');
    return `<div class="stack"><div class="card"><h2>舆情</h2><h3>新闻</h3><p class="empty">本阶段尚未接入手动舆情生成。</p><h3>论坛</h3><p class="empty">本阶段尚未接入手动舆情生成。</p><h3>随便逛逛</h3><p class="empty">后续作为独立 NON-CANON 功能接入，不影响世界事实。</p></div></div>`;
}

function memoryHtml(state) {
    if (!state) return emptySection('记忆');
    const items=Array.isArray(state.memory?.worldline)?state.memory.worldline:[];
    return listSection('世界线记忆', items, item=>({title:item.text||'世界线记忆',body:item.reason||'',meta:item.sourceMessageId===null||item.sourceMessageId===undefined?'':`来源消息 #${item.sourceMessageId}`}), '当前没有需要长期保留的世界线记忆。');
}

function chronicleHtml(state) {
    if (!state) return emptySection('纪事');
    const items=Array.isArray(state.chronicle)?[...state.chronicle].reverse():[];
    return listSection('纪事', items, item=>({title:item.title||'收藏内容',body:[item.time,item.summary||item.text].filter(Boolean).join(' · '),meta:item.sourceType?`来源：${item.sourceType}`:''}), '暂无收藏。后续会支持从新闻、论坛和“随便逛逛”手动收藏到这里。');
}

function emptySection(title){return`<div class="stack"><div class="card"><h2>${title}</h2><p>当前聊天尚未创建 sceneworld 数据。仅查看页面不会自动创建。</p></div></div>`}
function listSection(title,items,mapper,emptyText='暂无记录。'){if(!Array.isArray(items)||!items.length)return`<div class="stack"><div class="card"><h2>${title}</h2><p class="empty">${emptyText}</p></div></div>`;return`<div class="stack"><div class="card"><h2>${title}</h2><div class="item-list">${items.map(item=>{const view=mapper(item)||{};return`<div class="item"><b>${escapeHtml(view.title||'')}</b>${view.body?`<p>${escapeHtml(view.body)}</p>`:''}${view.meta?`<div class="meta">${escapeHtml(view.meta)}</div>`:''}</div>`}).join('')}</div></div></div>`}
function renderTab(tab,version,preview){const state=readSceneWorldState();if(tab==='此刻')return homeHtml(version,preview);if(tab==='人物')return peopleHtml(state);if(tab==='舆情')return opinionHtml(state);if(tab==='记忆')return memoryHtml(state);if(tab==='纪事')return chronicleHtml(state);return emptySection(tab)}

function countReportedChanges(summary){if(!summary)return 0;return (summary.worldPatch?1:0)+(summary.momentsUpsert||0)+(summary.momentsRemove||0)+(summary.facts||0)+(summary.people||0)+(summary.memory||0)}

export function createSceneWorldShell({ version, onClose, actions }) {
    let host=document.getElementById(HOST_ID);if(host)host.remove();host=document.createElement('div');host.id=HOST_ID;const shadow=host.attachShadow({mode:'open'});let activeTab='此刻';let busy=false;let preview=null;
    const render=()=>{shadow.innerHTML=`<style>${STYLES}</style><div class="backdrop"><section class="panel" role="dialog" aria-modal="true" aria-label="世界动态"><header class="header"><div class="title">世界动态</div><div class="version">${escapeHtml(version)}</div><div class="spacer"></div><button class="close" type="button" aria-label="关闭">×</button></header><main class="content">${renderTab(activeTab,version,preview)}</main><nav class="nav" aria-label="世界动态栏目">${TABS.map(tab=>`<button type="button" data-tab="${tab}" aria-selected="${tab===activeTab}">${tab}</button>`).join('')}</nav></section></div>`;
        shadow.querySelector('.close')?.addEventListener('click',()=>onClose?.());shadow.querySelector('.backdrop')?.addEventListener('click',e=>{if(e.target===e.currentTarget)onClose?.()});shadow.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{activeTab=button.dataset.tab||'此刻';render()}));
        shadow.querySelector('[data-action="read-latest"]')?.addEventListener('click',()=>{try{preview=actions?.inspectLatestNarrative?.()??null;if(!preview?.source)notify('当前聊天没有找到可读取的 AI 正文','warning')}catch(error){console.error('[SceneWorld] read narrative failed',error);notify(`读取正文失败：${error?.message||error}`,'error')}render()});
        shadow.querySelector('[data-action="simulate"]')?.addEventListener('click',async()=>{if(busy||!preview?.source)return;if(!confirm(`将调用一次当前 SillyTavern 模型，按“稀疏增量”规则推演消息 #${preview.source.id}。没有变化也允许返回空结果。继续吗？`))return;busy=true;try{const result=await actions?.simulateLatest?.(preview.source);preview=actions?.inspectLatestNarrative?.()??preview;const count=countReportedChanges(result?.changeSummary);notify(count?`世界推演完成：检测到 ${count} 组需要保存的变化`:'世界推演完成：本轮没有值得额外记录的变化','success')}catch(error){console.error('[SceneWorld] manual simulation failed',error);notify(`世界推演失败：${error?.message||error}`,'error')}finally{busy=false;render()}});
        shadow.querySelector('[data-action="clear"]')?.addEventListener('click',async()=>{if(busy)return;if(!confirm('只删除当前聊天的 chatMetadata.sceneworld 数据。不会删除聊天正文，也不会触碰其他插件数据。确定继续吗？'))return;busy=true;try{const removed=await clearSceneWorldState();preview=preview?.source?actions?.inspectLatestNarrative?.()??preview:preview;notify(removed?'当前聊天的 sceneworld 数据已清理':'当前聊天没有 sceneworld 数据','success')}catch(error){console.error('[SceneWorld] clear state failed',error);notify(`清理数据失败：${error?.message||error}`,'error')}finally{busy=false;render()}})
    };
    shadow.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();onClose?.();return}const target=event.target;if(target&&(target.tagName==='INPUT'||target.tagName==='TEXTAREA'||target.isContentEditable))event.stopPropagation()});render();document.body.appendChild(host);return{host,refresh:render,onChatChanged(){preview=null;render()},destroy(){host?.remove()}};
}

export function removeSceneWorldShell(){document.getElementById(HOST_ID)?.remove()}
