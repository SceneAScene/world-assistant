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
.note{margin-top:10px;padding:10px 12px;border-radius:10px;background:rgba(0,0,0,.13);font-size:12px;line-height:1.65;opacity:.76}.note.warning{border:1px solid rgba(224,160,70,.38);background:rgba(224,160,70,.08);opacity:.9}.note.error{border:1px solid rgba(220,95,95,.40);background:rgba(220,95,95,.08);opacity:.92}
.preview-details{margin-top:10px;border:1px solid rgba(255,255,255,.09);border-radius:10px;overflow:hidden;background:rgba(0,0,0,.12)}.preview-details summary{cursor:pointer;padding:10px 12px;font-size:12px;font-weight:650;list-style-position:inside}.transcript{padding:0 10px 10px;display:grid;gap:8px}.message{padding:10px;border-radius:9px;background:rgba(0,0,0,.18)}.message .who{font-size:11px;opacity:.58;margin-bottom:5px}.message .body{white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.65}
.item-list{display:grid;gap:9px;margin-top:10px}.item{padding:11px 12px;border-radius:10px;background:rgba(0,0,0,.15)}.item-head{display:flex;align-items:flex-start;gap:8px}.item-head b{flex:1}.item b{display:block;font-size:13px;margin-bottom:4px}.item span,.item p{font-size:12px;line-height:1.55;opacity:.76;margin:0}.meta{font-size:11px;opacity:.56;margin-top:5px}.empty{opacity:.62}.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}.chip,.badge{font-size:11px;padding:4px 7px;border-radius:999px;background:rgba(255,255,255,.07);opacity:.82}.badge.noncanon{border:1px solid rgba(226,160,80,.35);background:rgba(226,160,80,.08)}
.replies{margin-top:8px;display:grid;gap:5px}.reply{font-size:11px;line-height:1.55;padding:7px 8px;border-radius:8px;background:rgba(255,255,255,.035);opacity:.78}.reply strong{font-weight:650}
.star{flex:0 0 auto;border:1px solid rgba(255,255,255,.12);background:transparent;color:inherit;border-radius:8px;min-width:34px;height:30px;cursor:pointer;opacity:.78}.star[disabled]{opacity:.35;cursor:default}.remove-small{border:0;background:transparent;color:inherit;opacity:.6;cursor:pointer;font-size:12px;padding:2px 4px}.section-title{display:flex;align-items:center;gap:8px;margin:14px 0 7px}.section-title h3{margin:0;flex:1}.section-title .count{font-size:11px;opacity:.5}
.nav{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));align-items:stretch;border-top:1px solid rgba(255,255,255,.10);background:rgba(0,0,0,.12);padding-bottom:env(safe-area-inset-bottom)}.nav button{min-width:0;min-height:48px;padding:8px 2px;border:0;border-right:1px solid rgba(255,255,255,.06);color:inherit;background:transparent;font-size:clamp(12px,3vw,14px);font-weight:620;cursor:pointer;white-space:nowrap}.nav button:last-child{border-right:0}.nav button[aria-selected="true"]{background:rgba(255,255,255,.09)}
@media(max-width:620px){.backdrop{padding:0;place-items:stretch}.panel{width:100vw;height:100dvh;min-height:0;border-radius:0;border:0}.header{min-height:52px;padding-left:14px}.title{font-size:17px}.content{padding:14px 12px}.status-grid{grid-template-columns:1fr}.actions{display:grid;grid-template-columns:1fr}.nav button{min-height:52px;font-size:clamp(12px,3.4vw,14px)}}`;

function escapeHtml(value) {
    return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
}
function formatBytes(bytes){const n=Number(bytes)||0;if(n<1024)return`${n} B`;if(n<1024*1024)return`${(n/1024).toFixed(1)} KB`;return`${(n/1024/1024).toFixed(2)} MB`}
function latestSyncText(state){
    const sync=state?.sync;
    if(!Number.isInteger(sync?.lastProcessedAssistantMessageId))return'尚未结算 AI 正文';
    const start=Number.isInteger(sync.lastProcessedAssistantRangeStartId)?sync.lastProcessedAssistantRangeStartId:sync.lastProcessedAssistantMessageId;
    const count=Number(sync.lastProcessedAssistantCount)||1;
    return start===sync.lastProcessedAssistantMessageId?`已结算 AI #${sync.lastProcessedAssistantMessageId}`:`已结算 AI #${start}～#${sync.lastProcessedAssistantMessageId} · ${count} 条`;
}
function timeLabel(value){if(!value)return'尚未刷新';try{return new Date(value).toLocaleString()}catch{return String(value)}}

function currentWorldHtml(state) {
    if (!state) return '';
    const cards = [];
    if (state.world?.time) cards.push(`<div class="status"><b>世界时间</b><span>${escapeHtml(state.world.time)}</span></div>`);
    if (state.world?.location) cards.push(`<div class="status"><b>当前地点</b><span>${escapeHtml(state.world.location)}</span></div>`);
    const moments = Array.isArray(state.world?.moments) ? state.world.moments : [];
    return `<div class="card"><h2>当前世界状态</h2>${state.world?.summary ? `<p>${escapeHtml(state.world.summary)}</p>` : '<p class="empty">当前没有需要额外概括的世界变化。</p>'}${cards.length ? `<div class="status-grid">${cards.join('')}</div>` : ''}${moments.length ? `<div class="item-list">${moments.map(item=>`<div class="item"><b>${escapeHtml(item.title)}</b><p>${escapeHtml(item.text)}</p></div>`).join('')}</div>` : ''}</div>`;
}

function transcriptHtml(messages) {
    if (!Array.isArray(messages) || !messages.length) return '<div class="note">无。</div>';
    return `<div class="transcript">${messages.map(item=>`<div class="message"><div class="who">#${item.id} · AI · ${escapeHtml(item.name)}</div><div class="body">${escapeHtml(item.text)}</div></div>`).join('')}</div>`;
}

function pendingPreviewHtml(preview) {
    const batch=preview?.batch;
    if(!batch)return '<div class="note">尚未读取待结算剧情。</div>';
    if(batch.anchorChanged)return `<div class="note error">${escapeHtml(batch.anchorReason)}</div>`;
    if(!batch.hasPending)return '<div class="note">当前没有新的 AI 正文需要结算。</div>';
    const budgetNote=batch.overBudget?`<div class="note warning">待结算正文约 ${batch.characters} 个字符，超过当前单次安全预算 ${batch.limits.maxPendingCharacters}。不会静默截断，也不会额外调用模型压缩，因此暂时禁止推演。</div>`:'';
    const previous=Number.isInteger(batch.lastProcessedAssistantMessageId)?`AI #${batch.lastProcessedAssistantMessageId}`:'无（首次结算）';
    return `<div class="status-grid"><div class="status"><b>上次结算</b><span>${previous}</span></div><div class="status"><b>待结算范围</b><span>#${batch.startId}～#${batch.endId}</span></div><div class="status"><b>待结算 AI 正文</b><span>${batch.assistantCount} 条</span></div><div class="status"><b>正文规模</b><span>${batch.characters} 字符</span></div></div>${budgetNote}<details class="preview-details" open><summary>预览本轮待结算 AI 正文</summary>${transcriptHtml(batch.pendingMessages)}</details>${batch.preContext?.length?`<details class="preview-details"><summary>已结算 AI 前置正文（仅用于承接，不会重复结算）</summary>${transcriptHtml(batch.preContext)}</details>`:''}`;
}

function homeHtml(version, preview, busy) {
    const info = inspectSceneWorldStorage();
    const state = readSceneWorldState();
    const batch=preview?.batch;
    const canSimulate=!!batch?.canSimulate && !busy;
    return `<div class="stack">
        <div class="card"><h2>2.0 重构 · 阶段 4A：手动舆情</h2><p>核心推演继续只结算 AI 正文；舆情已经拆成独立手动任务，不会随世界推演自动生成。</p><div class="status-grid"><div class="status"><b>插件</b><span>已就绪 · ${escapeHtml(version)}</span></div><div class="status"><b>sceneworld 数据</b><span>${info.dataExists?`已创建 · ${formatBytes(info.totalBytes)}`:'未创建'}</span></div><div class="status"><b>正文同步</b><span>${escapeHtml(latestSyncText(state))}</span></div><div class="status"><b>自动推演</b><span>未加载 · 当前仅手动</span></div></div></div>
        ${currentWorldHtml(state)}
        <div class="card"><h2>① 读取待结算剧情</h2><p>只在本地读取，不调用模型、不保存数据。只收集 AI 回复；USER 消息完全忽略。</p><div class="actions"><button class="action" type="button" data-action="read-pending" ${busy?'disabled':''}>读取待结算剧情</button></div>${pendingPreviewHtml(preview)}</div>
        <div class="card"><h2>② 手动结算本轮剧情</h2><p>确认后只调用一次当前模型，输出这批 AI 正文最终形成的稀疏净变化。</p><div class="actions"><button class="action primary" type="button" data-action="simulate" ${canSimulate?'':'disabled'}>确认并推演待结算剧情</button>${info.dataExists?`<button class="action danger" type="button" data-action="clear" ${busy?'disabled':''}>清理当前聊天 sceneworld 数据</button>`:''}</div></div>
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

function favorited(state, sourceType, id) {
    return Array.isArray(state?.chronicle) && state.chronicle.some(item => item?.sourceType === sourceType && item?.sourceId === id);
}
function favoriteButton(state, sourceType, id, busy) {
    const saved = favorited(state, sourceType, id);
    return `<button class="star" type="button" title="${saved?'已收藏到纪事':'收藏到纪事'}" data-favorite-type="${escapeHtml(sourceType)}" data-favorite-id="${escapeHtml(id)}" ${saved||busy?'disabled':''}>${saved?'★':'☆'}</button>`;
}
function repliesHtml(replies) {
    if (!Array.isArray(replies) || !replies.length) return '';
    return `<div class="replies">${replies.map(reply=>`<div class="reply"><strong>${escapeHtml(reply.author||'匿名')}</strong>：${escapeHtml(reply.text||'')}</div>`).join('')}</div>`;
}

function opinionHtml(state, busy) {
    if (!state) return emptySection('舆情');
    const opinion = state.publicOpinion || {};
    const facts = Array.isArray(state.world?.facts) ? state.world.facts : [];
    const publicCount = facts.filter(item => item?.publicity === 'public').length;
    const traceCount = facts.filter(item => item?.publicity === 'trace').length;
    const news = Array.isArray(opinion.news) ? opinion.news : [];
    const forum = Array.isArray(opinion.forum) ? opinion.forum : [];
    const casual = Array.isArray(opinion.casual) ? opinion.casual : [];
    const casualNews = casual.filter(item => item.kind === 'news');
    const casualForum = casual.filter(item => item.kind === 'forum');
    return `<div class="stack">
      <div class="card"><h2>舆情</h2><p>新闻与论坛只读取 SceneWorld 中已经标记为 <b>public</b> 或 <b>trace</b> 的公开面。没有值得传播的内容时允许为空；“随便逛逛”是完全独立的 NON-CANON 娱乐沙盒。</p><div class="status-grid"><div class="status"><b>公开事实</b><span>${publicCount} 条 public · ${traceCount} 条 trace</span></div><div class="status"><b>上次正式刷新</b><span>${escapeHtml(timeLabel(opinion.updatedAt))}</span></div></div><div class="actions"><button class="action primary" type="button" data-action="refresh-opinion" ${busy?'disabled':''}>刷新新闻与论坛</button><button class="action" type="button" data-action="refresh-casual" ${busy?'disabled':''}>随便逛逛</button></div><div class="note">新闻只能使用 public 事实；论坛可以围绕 trace 的公开迹象猜测，但程序会硬性阻止新闻引用 trace/private 真相。刷新会替换当前舆情，喜欢的内容可先 ☆ 收藏到纪事。</div></div>
      <div class="card"><div class="section-title"><h3>新闻</h3><span class="count">${news.length} 条</span></div>${news.length?`<div class="item-list">${news.map(item=>`<div class="item"><div class="item-head"><b>${escapeHtml(item.headline)}</b>${favoriteButton(state,'news',item.id,busy)}</div><div class="chips"><span class="chip">${escapeHtml(item.category||'公共消息')}</span>${item.source?`<span class="chip">${escapeHtml(item.source)}</span>`:''}</div><p>${escapeHtml(item.summary)}</p>${item.scope?`<div class="meta">范围：${escapeHtml(item.scope)}</div>`:''}</div>`).join('')}</div>`:'<p class="empty">当前没有值得形成新闻的公开事件。</p>'}</div>
      <div class="card"><div class="section-title"><h3>论坛 / 公共讨论</h3><span class="count">${forum.length} 条</span></div>${forum.length?`<div class="item-list">${forum.map(item=>`<div class="item"><div class="item-head"><b>${escapeHtml(item.title)}</b>${favoriteButton(state,'forum',item.id,busy)}</div><div class="chips"><span class="chip">${escapeHtml(item.board||'公共讨论')}</span><span class="chip">${escapeHtml(item.claimStatus||'mixed')}</span></div><p>${escapeHtml(item.summary)}</p>${repliesHtml(item.replies)}</div>`).join('')}</div>`:'<p class="empty">当前没有值得记录的公共讨论。</p>'}</div>
      <div class="card"><div class="section-title"><h3>随便逛逛</h3><span class="badge noncanon">NON-CANON</span><span class="count">${casual.length} 条</span></div><p>只提供生活质感，不会反向写入世界事实、人物认知或世界线记忆。上次生成：${escapeHtml(timeLabel(opinion.casualUpdatedAt))}</p>${casual.length?`<div class="item-list">${[...casualNews,...casualForum].map(item=>`<div class="item"><div class="item-head"><b>${escapeHtml(item.title)}</b>${favoriteButton(state,'casual',item.id,busy)}</div><div class="chips"><span class="badge noncanon">NON-CANON</span>${item.kind==='forum'?`<span class="chip">${escapeHtml(item.board||'闲聊')}</span>`:`<span class="chip">${escapeHtml(item.category||'日常')}</span>`}</div><p>${escapeHtml(item.summary)}</p>${repliesHtml(item.replies)}</div>`).join('')}</div>`:'<p class="empty">还没有生成“随便逛逛”。</p>'}</div>
    </div>`;
}

function memoryHtml(state) {
    if (!state) return emptySection('记忆');
    const items=Array.isArray(state.memory?.worldline)?state.memory.worldline:[];
    return listSection('世界线记忆', items, item=>({title:item.text||'世界线记忆',body:item.reason||'',meta:item.sourceMessageId===null||item.sourceMessageId===undefined?'':`来源结算至 AI #${item.sourceMessageId}`}), '当前没有需要长期保留的世界线记忆。');
}

function chronicleHtml(state, busy) {
    if (!state) return emptySection('纪事');
    const items=Array.isArray(state.chronicle)?[...state.chronicle].reverse():[];
    if(!items.length)return `<div class="stack"><div class="card"><h2>纪事</h2><p class="empty">暂无收藏。新闻、论坛和“随便逛逛”里的 ☆ 可以把喜欢的内容保留下来。</p></div></div>`;
    return `<div class="stack"><div class="card"><h2>纪事</h2><p>这里是手动收藏，不会因为刷新舆情而消失。NON-CANON 收藏仍然只是灵感，不会自动升级为世界事实。</p><div class="item-list">${items.map(item=>`<div class="item"><div class="item-head"><b>${escapeHtml(item.title||'收藏内容')}</b><button class="remove-small" type="button" data-remove-chronicle="${escapeHtml(item.id)}" ${busy?'disabled':''}>删除</button></div><div class="chips"><span class="chip">${escapeHtml(item.sourceLabel||item.sourceType||'收藏')}</span>${item.canon===false?'<span class="badge noncanon">NON-CANON</span>':'<span class="chip">CANON 来源</span>'}</div>${item.summary?`<p>${escapeHtml(item.summary)}</p>`:''}<div class="meta">收藏时间：${escapeHtml(timeLabel(item.capturedAt))}</div></div>`).join('')}</div></div></div>`;
}

function emptySection(title){return`<div class="stack"><div class="card"><h2>${title}</h2><p>当前聊天尚未创建 sceneworld 数据。仅查看页面不会自动创建。</p></div></div>`}
function listSection(title,items,mapper,emptyText='暂无记录。'){if(!Array.isArray(items)||!items.length)return`<div class="stack"><div class="card"><h2>${title}</h2><p class="empty">${emptyText}</p></div></div>`;return`<div class="stack"><div class="card"><h2>${title}</h2><div class="item-list">${items.map(item=>{const view=mapper(item)||{};return`<div class="item"><b>${escapeHtml(view.title||'')}</b>${view.body?`<p>${escapeHtml(view.body)}</p>`:''}${view.meta?`<div class="meta">${escapeHtml(view.meta)}</div>`:''}</div>`}).join('')}</div></div></div>`}
function renderTab(tab,version,preview,busy){const state=readSceneWorldState();if(tab==='此刻')return homeHtml(version,preview,busy);if(tab==='人物')return peopleHtml(state);if(tab==='舆情')return opinionHtml(state,busy);if(tab==='记忆')return memoryHtml(state);if(tab==='纪事')return chronicleHtml(state,busy);return emptySection(tab)}
function countReportedChanges(summary){if(!summary)return 0;return (summary.worldPatch?1:0)+(summary.momentsUpsert||0)+(summary.momentsRemove||0)+(summary.facts||0)+(summary.people||0)+(summary.memory||0)}

export function createSceneWorldShell({ version, onClose, actions }) {
    let host=document.getElementById(HOST_ID);if(host)host.remove();host=document.createElement('div');host.id=HOST_ID;const shadow=host.attachShadow({mode:'open'});let activeTab='此刻';let busy=false;let preview=null;
    const runBusy=async(task)=>{if(busy)return;busy=true;render();try{return await task()}finally{busy=false;render()}};
    const render=()=>{
        shadow.innerHTML=`<style>${STYLES}</style><div class="backdrop"><section class="panel" role="dialog" aria-modal="true" aria-label="世界动态"><header class="header"><div class="title">世界动态</div><div class="version">${escapeHtml(version)}</div><div class="spacer"></div><button class="close" type="button" aria-label="关闭">×</button></header><main class="content">${renderTab(activeTab,version,preview,busy)}</main><nav class="nav" aria-label="世界动态栏目">${TABS.map(tab=>`<button type="button" data-tab="${tab}" aria-selected="${tab===activeTab}">${tab}</button>`).join('')}</nav></section></div>`;
        shadow.querySelector('.close')?.addEventListener('click',()=>onClose?.());
        shadow.querySelector('.backdrop')?.addEventListener('click',e=>{if(e.target===e.currentTarget)onClose?.()});
        shadow.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{activeTab=button.dataset.tab||'此刻';render()}));
        shadow.querySelector('[data-action="read-pending"]')?.addEventListener('click',()=>{try{preview=actions?.inspectPendingNarrative?.()??null;const batch=preview?.batch;if(batch?.anchorChanged)notify(batch.anchorReason,'error');else if(!batch?.hasPending)notify('当前没有新的 AI 正文需要结算','info');else if(batch.overBudget)notify('待结算剧情超过当前单次安全预算，请查看界面说明','warning')}catch(error){console.error('[SceneWorld] read pending narrative failed',error);notify(`读取待结算剧情失败：${error?.message||error}`,'error')}render()});
        shadow.querySelector('[data-action="simulate"]')?.addEventListener('click',()=>runBusy(async()=>{const batch=preview?.batch;if(!batch?.canSimulate)return;if(!confirm(`将调用一次当前 SillyTavern 模型，结算 #${batch.startId}～#${batch.endId} 共 ${batch.assistantCount} 条 AI 正文。继续吗？`))return;try{const result=await actions?.simulatePending?.(batch);preview=actions?.inspectPendingNarrative?.()??preview;const count=countReportedChanges(result?.changeSummary);notify(count?`世界推演完成：结算 #${result.batch.startId}～#${result.batch.endId}，保存 ${count} 组变化`:`世界推演完成：结算 #${result.batch.startId}～#${result.batch.endId}，本轮没有值得额外记录的变化`,'success')}catch(error){console.error('[SceneWorld] pending simulation failed',error);notify(`世界推演失败：${error?.message||error}`,'error')}}));
        shadow.querySelector('[data-action="refresh-opinion"]')?.addEventListener('click',()=>runBusy(async()=>{try{const info=actions?.inspectPublicOpinion?.();if(info?.sourceCount>0&&!confirm(`将根据当前 ${info.publicCount} 条 public、${info.traceCount} 条 trace 世界事实调用一次模型刷新新闻与论坛。继续吗？`))return;const result=await actions?.refreshPublicOpinion?.();if(!result?.calledModel)notify('当前没有可用于舆情的公开世界变化，新闻与论坛已保持为空','info');else if((result.newsCount||0)+(result.forumCount||0)===0)notify('舆情刷新完成：当前没有值得记录的新闻或公共讨论','success');else notify(`舆情刷新完成：${result.newsCount||0} 条新闻，${result.forumCount||0} 条讨论`,'success')}catch(error){console.error('[SceneWorld] public opinion failed',error);notify(`刷新舆情失败：${error?.message||error}`,'error')}}));
        shadow.querySelector('[data-action="refresh-casual"]')?.addEventListener('click',()=>runBusy(async()=>{if(!confirm('“随便逛逛”将调用一次模型生成 NON-CANON 生活内容，不会写入世界事实。继续吗？'))return;try{const result=await actions?.refreshCasualOpinion?.();notify(`随便逛逛已更新：${result?.itemCount||0} 条内容`,'success')}catch(error){console.error('[SceneWorld] casual opinion failed',error);notify(`随便逛逛失败：${error?.message||error}`,'error')}}));
        shadow.querySelectorAll('[data-favorite-type]').forEach(button=>button.addEventListener('click',()=>runBusy(async()=>{try{await actions?.favoriteOpinion?.(button.dataset.favoriteType,button.dataset.favoriteId);notify('已收藏到纪事','success')}catch(error){console.error('[SceneWorld] favorite failed',error);notify(`收藏失败：${error?.message||error}`,'error')}})));
        shadow.querySelectorAll('[data-remove-chronicle]').forEach(button=>button.addEventListener('click',()=>runBusy(async()=>{try{await actions?.removeChronicle?.(button.dataset.removeChronicle);notify('已从纪事删除','success')}catch(error){console.error('[SceneWorld] chronicle remove failed',error);notify(`删除收藏失败：${error?.message||error}`,'error')}})));
        shadow.querySelector('[data-action="clear"]')?.addEventListener('click',()=>runBusy(async()=>{if(!confirm('只删除当前聊天的 chatMetadata.sceneworld 数据。不会删除聊天正文，也不会触碰其他插件数据。确定继续吗？'))return;try{const removed=await clearSceneWorldState();preview=actions?.inspectPendingNarrative?.()??null;notify(removed?'当前聊天的 sceneworld 数据已清理':'当前聊天没有 sceneworld 数据','success')}catch(error){console.error('[SceneWorld] clear state failed',error);notify(`清理数据失败：${error?.message||error}`,'error')}}));
    };
    shadow.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();onClose?.();return}const target=event.target;if(target&&(target.tagName==='INPUT'||target.tagName==='TEXTAREA'||target.isContentEditable))event.stopPropagation()});
    render();document.body.appendChild(host);return{host,refresh:render,onChatChanged(){preview=null;render()},destroy(){host?.remove()}};
}

export function removeSceneWorldShell(){document.getElementById(HOST_ID)?.remove()}
