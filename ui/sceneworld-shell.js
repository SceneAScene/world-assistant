import {
    clearSceneWorldState,
    inspectSceneWorldStorage,
    readSceneWorldState,
} from '../data/sceneworld-store.js';
import { notify } from '../platform/sillytavern.js';

const HOST_ID = 'sceneworld-root';
const TABS = ['此刻', '人物', '见闻', '脉络', '纪事'];

const STYLES = `
:host{all:initial;position:fixed;inset:0;z-index:2147483000;display:block;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:#272821;--sw-bg:#f3f1e8;--sw-surface:#fbfaf5;--sw-card:#fffef9;--sw-text:#272821;--sw-muted:#74756c;--sw-faint:#99998f;--sw-line:#dedbcf;--sw-line-soft:#ebe8dc;--sw-accent:#66765c;--sw-accent-dark:#526149;--sw-accent-soft:#e8ede2;--sw-warn:#8a6d2e;--sw-warn-bg:#f5eedb;--sw-danger:#9a534d;--sw-danger-bg:#f5e8e5;--sw-shadow:0 18px 55px rgba(60,58,49,.18)}
*,*::before,*::after{box-sizing:border-box}button,input,select,textarea{font:inherit}button{color:inherit}.backdrop{width:100%;height:100%;display:grid;place-items:center;padding:max(14px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(14px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));background:rgba(48,48,42,.34)}
.panel{width:min(920px,96vw);height:min(820px,92dvh);min-height:430px;overflow:hidden;display:grid;grid-template-rows:auto 1fr auto;border:1px solid #d8d5c8;border-radius:20px;background:var(--sw-bg);box-shadow:var(--sw-shadow);color:var(--sw-text)}
.header{min-height:60px;padding:11px 14px 10px 20px;display:flex;align-items:center;gap:9px;border-bottom:1px solid var(--sw-line);background:rgba(251,250,245,.96)}.title{font-size:19px;font-weight:760;letter-spacing:.035em;color:#20211c}.version{font-size:10.5px;color:var(--sw-faint);margin-top:2px}.spacer{flex:1}.header-icon,.close{border:0;background:transparent;color:#42443c;width:38px;height:38px;border-radius:10px;cursor:pointer;line-height:1;display:grid;place-items:center;transition:background .16s,color .16s}.header-icon{font-size:19px}.close{font-size:24px}.header-icon:hover,.close:hover{background:var(--sw-accent-soft);color:var(--sw-accent-dark)}
.content{overflow:auto;padding:22px 18px 26px;scrollbar-color:#c9c6b9 transparent}.stack{max-width:800px;margin:0 auto;display:grid;gap:16px}.page-intro{padding:2px 3px 0}.page-intro h1{margin:0;font-size:20px;line-height:1.35;font-weight:760;color:#22231e}.page-intro p{margin:6px 0 0;color:var(--sw-muted);font-size:13px;line-height:1.65}.page-kicker{font-size:11px;color:var(--sw-accent-dark);font-weight:700;letter-spacing:.08em;margin-bottom:5px}
.card{border:1px solid var(--sw-line);background:var(--sw-card);border-radius:16px;padding:17px 18px;box-shadow:0 2px 10px rgba(66,64,53,.035)}.card.soft{background:#f8f7f0}.card h2{margin:0 0 8px;font-size:16px;line-height:1.4;color:#282921}.card h3{margin:15px 0 8px;font-size:14px;color:#303128}.card p{margin:7px 0;font-size:13px;line-height:1.72;color:var(--sw-muted)}.card p strong{color:var(--sw-text)}.card-header{display:flex;gap:10px;align-items:flex-start;margin-bottom:8px}.card-header>div:first-child{flex:1}.card-header h2,.card-header h3{margin:0}.card-subtitle{font-size:12px;color:var(--sw-muted);line-height:1.55;margin-top:3px}
.overview{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;align-items:start}.overview-summary{font-size:15px!important;line-height:1.8!important;color:#3b3c33!important;margin:0!important}.overview-meta{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}.meta-pill{display:inline-flex;align-items:center;gap:5px;padding:6px 9px;border-radius:999px;background:var(--sw-accent-soft);color:var(--sw-accent-dark);font-size:11.5px;font-weight:650}.meta-pill.neutral{background:#f0eee6;color:#686960}
.status-grid{margin-top:12px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.status{padding:11px 12px;border:1px solid var(--sw-line-soft);border-radius:11px;background:#f8f7f1}.status b{display:block;font-size:11px;color:#66685f;margin-bottom:4px;font-weight:650}.status span{font-size:12.5px;line-height:1.5;color:#32342c;word-break:break-word}.status.compact{padding:9px 10px}
.actions{margin-top:13px;display:flex;flex-wrap:wrap;gap:9px}.action{min-height:39px;border:1px solid #cfcbbd;border-radius:10px;padding:8px 13px;background:#faf9f3;color:#3d4036;cursor:pointer;font-weight:650;font-size:12.5px;transition:.15s}.action:hover{border-color:#9da693;background:#f1f3eb}.action.primary{background:var(--sw-accent);border-color:var(--sw-accent);color:#fff}.action.primary:hover{background:var(--sw-accent-dark);border-color:var(--sw-accent-dark)}.action:disabled{opacity:.42;cursor:not-allowed}.action.danger{color:var(--sw-danger);border-color:#dbbcb7;background:#fff9f7}.action.danger:hover{background:var(--sw-danger-bg)}
.note{margin-top:10px;padding:10px 12px;border:1px solid var(--sw-line-soft);border-radius:10px;background:#f7f5ed;font-size:12px;line-height:1.65;color:var(--sw-muted)}.note.warning{border-color:#dfcf9f;background:var(--sw-warn-bg);color:#735d2c}.note.error{border-color:#dfb9b4;background:var(--sw-danger-bg);color:#864b46}.tip{display:flex;gap:8px;align-items:flex-start}.tip-mark{flex:0 0 auto;width:18px;height:18px;border-radius:50%;background:var(--sw-accent-soft);color:var(--sw-accent-dark);display:grid;place-items:center;font-size:11px;font-weight:800;margin-top:1px}
.preview-details{margin-top:10px;border:1px solid var(--sw-line);border-radius:11px;overflow:hidden;background:#fbfaf5}.preview-details summary{cursor:pointer;padding:10px 12px;font-size:12px;font-weight:680;color:#4b4d43;list-style-position:inside;background:#f5f3eb}.transcript{padding:10px;display:grid;gap:8px}.message{padding:10px 11px;border-radius:9px;background:#f7f5ee;border:1px solid var(--sw-line-soft)}.message .who{font-size:10.5px;color:var(--sw-faint);margin-bottom:5px}.message .body{white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.65;color:#44463d}
.item-list{display:grid;gap:9px;margin-top:11px}.item{padding:12px 13px;border-radius:11px;border:1px solid var(--sw-line-soft);background:#faf9f4}.item:hover{border-color:#d7d4c7}.item-head{display:flex;align-items:flex-start;gap:9px}.item-head b{flex:1}.mini-actions{display:flex;gap:5px;flex:0 0 auto}.item b{display:block;font-size:13.5px;line-height:1.45;margin-bottom:4px;color:#303129}.item span,.item p{font-size:12px;line-height:1.62;color:var(--sw-muted);margin:0}.meta{font-size:10.8px;color:var(--sw-faint);margin-top:6px}.empty{color:var(--sw-faint)!important}.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}.chip,.badge{font-size:10.5px;padding:4px 7px;border-radius:999px;background:#efede5;color:#6e6f65}.badge.noncanon{border:1px solid #ddcda7;background:#f8f0dc;color:#7b642d}
.replies{margin-top:9px;display:grid;gap:6px}.reply{font-size:11.5px;line-height:1.62;padding:8px 9px;border-radius:8px;background:#f3f1e9;color:#5e6056}.reply strong{font-weight:680;color:#43453d}.star{flex:0 0 auto;border:1px solid #d4d0c2;background:#fffdf7;color:#77766e;border-radius:8px;min-width:34px;height:30px;cursor:pointer}.star:hover{background:var(--sw-accent-soft);color:var(--sw-accent-dark)}.star[disabled]{opacity:.4;cursor:default}.remove-small{border:0;background:transparent;color:#77796f;cursor:pointer;font-size:11px;padding:3px 5px;border-radius:6px}.remove-small:hover{background:#eeeae1;color:#4b4d43}.insert-small{border:1px solid #d2cfc1;background:#fffdf7;color:#62675a;border-radius:8px;padding:6px 9px;cursor:pointer;font-size:11px;white-space:nowrap}.insert-small.icon-only{width:34px;height:30px;padding:0;display:grid;place-items:center;font-size:17px;line-height:1;font-weight:700}.insert-small:hover{background:var(--sw-accent-soft);border-color:#bcc5b5;color:var(--sw-accent-dark)}.insert-small:disabled{opacity:.4;cursor:not-allowed}.quote{margin-top:8px;padding:9px 11px;border-left:3px solid #aab7a0;background:#f4f5ef;font-size:12px;line-height:1.7;color:#4a4c43}.street-meta{font-size:10.8px;color:var(--sw-faint);margin-top:4px}
.section-title{display:flex;align-items:center;gap:8px;margin:14px 0 8px}.section-title h3{margin:0;flex:1}.section-title .count{font-size:10.8px;color:var(--sw-faint)}.section-divider{height:1px;background:var(--sw-line-soft);margin:14px 0}.segmented{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;padding:4px;border-radius:11px;background:#e9e7de;margin:10px 0 2px}.segmented button{border:0;border-radius:8px;padding:9px 10px;background:transparent;color:#6b6d63;font-size:12.5px;font-weight:680;cursor:pointer}.segmented button[aria-selected="true"]{background:#fffef9;color:#31332b;box-shadow:0 1px 5px rgba(60,58,48,.08)}
.person-card{padding:0;overflow:hidden}.person-card>summary{list-style:none;cursor:pointer;padding:14px 15px}.person-card>summary::-webkit-details-marker{display:none}.person-summary{display:flex;align-items:center;gap:12px}.person-avatar{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:var(--sw-accent-soft);color:var(--sw-accent-dark);font-weight:760;font-size:15px}.person-main{flex:1;min-width:0}.person-main b{font-size:14px;color:#2e3028}.person-line{font-size:11.5px;color:var(--sw-muted);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.person-chevron{color:#999a91;font-size:15px}.person-card[open] .person-chevron{transform:rotate(180deg)}.person-detail{border-top:1px solid var(--sw-line-soft);padding:12px 15px 14px;background:#fbfaf6}.detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.detail-cell{padding:9px 10px;border-radius:9px;background:#f5f3ec}.detail-cell b{display:block;font-size:10.5px;color:#7d7e74;margin-bottom:3px}.detail-cell span{font-size:12px;line-height:1.55;color:#42443b}.knowledge-box{margin-top:9px;padding:9px 10px;border-left:3px solid #b5c1ac;background:#f4f5ef;font-size:11.5px;line-height:1.65;color:#606258}
.timeline{display:grid;margin-top:10px}.timeline-row{position:relative;padding:0 0 16px 24px}.timeline-row:last-child{padding-bottom:0}.timeline-row::before{content:"";position:absolute;left:7px;top:9px;bottom:-2px;width:1px;background:#d6d4ca}.timeline-row:last-child::before{display:none}.timeline-dot{position:absolute;left:2px;top:5px;width:11px;height:11px;border-radius:50%;background:#89977e;border:2px solid #f9f7f0}.timeline-body{padding:10px 12px;border:1px solid var(--sw-line-soft);border-radius:10px;background:#faf9f4}.timeline-body b{font-size:12.5px;line-height:1.55;color:#3c3e35}.timeline-body .meta{margin-top:5px}
.setting-grid{display:grid;gap:8px;margin-top:10px}.setting-row{display:flex;align-items:flex-start;gap:10px;padding:10px 11px;border:1px solid var(--sw-line-soft);border-radius:10px;background:#faf9f4}.setting-row input{margin-top:2px;accent-color:var(--sw-accent)}.setting-row span{font-size:12.2px;line-height:1.55;color:#41433a}.setting-row small{display:block;color:var(--sw-muted);margin-top:2px}.setting-text{width:100%;margin-top:8px;border:1px solid #d2cfc1;background:#fffef9;color:#35372f;border-radius:9px;padding:9px 10px;font:inherit;font-size:12px;outline:none}.setting-text:focus{border-color:#9eaa95;box-shadow:0 0 0 2px rgba(102,118,92,.10)}.book-picker{margin-top:9px;border:1px solid var(--sw-line);border-radius:11px;background:#fbfaf5;overflow:hidden}.book-picker summary{cursor:pointer;padding:10px 12px;font-size:12px;font-weight:680;color:#4a4c43;list-style-position:inside;background:#f7f5ee}.book-list{max-height:250px;overflow:auto;padding:8px;display:grid;gap:6px}.book-row{display:flex;align-items:flex-start;gap:9px;padding:9px;border-radius:8px;border:1px solid transparent;background:#fffef9}.book-row:hover{border-color:#ddd9cc}.book-row input{margin-top:2px;accent-color:var(--sw-accent)}.book-row span{min-width:0;font-size:12px;line-height:1.45;color:#3f4138}.book-row small{display:block;color:#83847a;margin-top:2px;word-break:break-word}.book-tools{display:flex;gap:6px;padding:8px 8px 0}.mini-setting-button{border:1px solid #d5d1c4;background:#fffef9;color:#5a5d52;border-radius:7px;padding:5px 8px;font-size:10.8px;cursor:pointer}.mini-setting-button:hover{background:var(--sw-accent-soft)}.mini-setting-button:disabled{opacity:.4;cursor:not-allowed}
.nav{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));align-items:stretch;border-top:1px solid var(--sw-line);background:rgba(251,250,245,.97);padding-bottom:env(safe-area-inset-bottom)}.nav button{min-width:0;min-height:50px;padding:8px 2px;border:0;color:#77796f;background:transparent;font-size:clamp(12px,3vw,13.5px);font-weight:660;cursor:pointer;white-space:nowrap;position:relative}.nav button[aria-selected="true"]{color:var(--sw-accent-dark);background:#f1f3eb}.nav button[aria-selected="true"]::before{content:"";position:absolute;top:0;left:22%;right:22%;height:2px;border-radius:2px;background:var(--sw-accent)}
@media(max-width:620px){.backdrop{padding:0;place-items:stretch}.panel{width:100vw;height:100dvh;min-height:0;border-radius:0;border:0}.header{min-height:54px;padding:8px 10px 8px 14px}.title{font-size:18px}.version{font-size:9.5px}.content{padding:18px 12px 22px}.stack{gap:14px}.card{padding:15px 14px;border-radius:14px}.page-intro h1{font-size:19px}.overview{grid-template-columns:1fr}.status-grid{grid-template-columns:1fr 1fr}.actions{display:flex}.action{flex:1 1 150px}.detail-grid{grid-template-columns:1fr}.nav button{min-height:52px;font-size:clamp(12px,3.35vw,13.5px)}}
@media(max-width:390px){.status-grid{grid-template-columns:1fr}.actions{display:grid;grid-template-columns:1fr}.action{width:100%}.card{padding:14px 13px}.content{padding-left:10px;padding-right:10px}}
`;

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
    const moments = Array.isArray(state.world?.moments) ? state.world.moments : [];
    const time = state.world?.time ? `<span class="meta-pill">◷ ${escapeHtml(state.world.time)}</span>` : '';
    const place = state.world?.location ? `<span class="meta-pill">⌖ ${escapeHtml(state.world.location)}</span>` : '';
    const summary = state.world?.summary || '当前没有需要额外概括的世界变化。';
    return `<div class="card"><div class="card-header"><div><h2>当前世界</h2><div class="card-subtitle">这一刻最值得知道的世界状态</div></div></div><p class="overview-summary">${escapeHtml(summary)}</p>${time||place?`<div class="overview-meta">${time}${place}</div>`:''}${moments.length?`<div class="section-divider"></div><div class="section-title"><h3>正在发生</h3><span class="count">${moments.length} 条</span></div><div class="item-list">${moments.map(item=>`<div class="item"><b>${escapeHtml(item.title)}</b>${item.text?`<p>${escapeHtml(item.text)}</p>`:''}</div>`).join('')}</div>`:''}</div>`;
}

function transcriptHtml(messages) {
    if (!Array.isArray(messages) || !messages.length) return '<div class="note">无。</div>';
    return `<div class="transcript">${messages.map(item=>`<div class="message"><div class="who">#${item.id} · AI · ${escapeHtml(item.name)}</div><div class="body">${escapeHtml(item.text)}</div></div>`).join('')}</div>`;
}

function pendingPreviewHtml(preview) {
    const batch=preview?.batch;
    if(!batch)return '<div class="note">尚未读取待结算剧情。每次最多只会读取 10 条 AI 正文。</div>';
    if(batch.anchorChanged)return `<div class="note error">${escapeHtml(batch.anchorReason)}</div>`;
    if(!batch.hasPending)return '<div class="note">当前没有新的 AI 正文需要结算。</div>';
    const budgetNote=batch.overBudget?`<div class="note warning">本批只有 ${batch.assistantCount} 条 AI 正文，但合计约 ${batch.characters} 个字符，仍超过单次安全预算 ${batch.limits.maxPendingCharacters}。不会静默截断，因此暂时禁止推演。</div>`:'';
    const previous=Number.isInteger(batch.lastProcessedAssistantMessageId)?`AI #${batch.lastProcessedAssistantMessageId}`:'无（首次结算）';
    let windowNote='';
    if(batch.isInitialBatch&&batch.initialMode==='latest'){
        windowNote=`<div class="note">首次结算采用“从当前开始”：只读取当前聊天最近最多 ${batch.limits.maxPendingAssistantMessages||10} 条 AI 正文。${batch.skippedOlderNarrative?'更早正文已主动跳过，不会一次性回灌。':''}</div>`;
    }else if(batch.isInitialBatch&&batch.initialMode==='from_floor'){
        windowNote=`<div class="note">首次结算从指定楼层 #${batch.requestedStartFloor} 开始，本轮最多处理 ${batch.limits.maxPendingAssistantMessages||10} 条 AI 正文。${batch.hasMoreAfterBatch?'后面还有未结算正文，完成本轮后再次读取即可继续下一批。':''}</div>`;
    }else if(batch.hasMoreAfterBatch){
        windowNote=`<div class="note">本轮已按上限截成 ${batch.limits.maxPendingAssistantMessages||10} 条。后面还有未结算正文，完成后再次“读取待结算剧情”即可继续下一批。</div>`;
    }
    return `<div class="status-grid"><div class="status"><b>上次结算</b><span>${previous}</span></div><div class="status"><b>本批范围</b><span>#${batch.startId}～#${batch.endId}</span></div><div class="status"><b>本批正文</b><span>${batch.assistantCount} / ${batch.limits.maxPendingAssistantMessages||10} 条 AI 正文${batch.ignoredAssistantCount?` · 忽略 ${batch.ignoredAssistantCount} 条未命中标签的 AI 消息`:''}</span></div><div class="status"><b>正文规模</b><span>${batch.characters} 字符</span></div></div>${windowNote}${budgetNote}<details class="preview-details" open><summary>预览本批标签内正文</summary>${transcriptHtml(batch.pendingMessages)}</details>`;
}

function actionSuggestionsHtml(state, busy) {
    const actions = Array.isArray(state?.guidance?.actions) ? state.guidance.actions : [];
    if (!state) return '';
    return `<div class="card"><div class="card-header"><div><h2>下一步</h2><div class="card-subtitle">根据当前人物处境推演的行动方向，点击右侧箭头可放入酒馆输入框</div></div><span class="meta-pill neutral">${actions.length} 条</span></div>${actions.length?`<div class="item-list">${actions.map(item=>`<div class="item"><div class="item-head"><div style="flex:1;min-width:0"><b>${escapeHtml(item.title)}</b>${item.reason?`<p>${escapeHtml(item.reason)}</p>`:''}${item.tone?`<div class="chips"><span class="chip">${escapeHtml(item.tone)}</span></div>`:''}</div><button class="insert-small icon-only" type="button" title="填入输入框" aria-label="填入输入框" data-insert-guidance="${escapeHtml(item.id)}" data-guidance-kind="action" ${busy?'disabled':''}>↪</button></div></div>`).join('')}</div>`:'<p class="empty">完成一次世界推演后，这里会出现 3～5 条行动建议。</p>'}</div>`;
}

function worldReferenceSettingsHtml(actions, busy, entryChoices) {
    const settings = actions?.getSettings?.() ?? {};
    const simulationBooks = Array.isArray(entryChoices?.simulation) ? entryChoices.simulation : null;
    const observationBooks = Array.isArray(entryChoices?.observation) ? entryChoices.observation : null;
    const simulationBaiBai = actions?.getBaiBaiStatus?.('simulation') ?? { enabled: false, available: false };
    const observationBaiBai = actions?.getBaiBaiStatus?.('observation') ?? { enabled: false, available: false };
    const descriptionChecked = settings.includeCharacterDescription !== false;

    const entryPicker = (books, purpose, title) => {
        if (books === null) return `<div class="book-picker"><div class="note">正在读取当前聊天可用世界书及其内部条目……</div></div>`;
        if (!books.length) return `<div class="book-picker"><div class="note">当前没有检测到角色、聊天或全局可用的世界书。</div></div>`;
        const total = books.reduce((sum, book) => sum + (book.entries?.length || 0), 0);
        const selected = books.reduce((sum, book) => sum + (book.entries || []).filter(entry => entry.enabled === true).length, 0);
        const groups = books.map(book => {
            const entries = Array.isArray(book.entries) ? book.entries : [];
            const selectedInBook = entries.filter(entry => entry.enabled === true).length;
            const ids = entries.map(entry => entry.id);
            const rows = entries.length ? entries.map(entry => {
                const tavernState = entry.disabledInTavern ? '酒馆中关闭' : (entry.constant ? '酒馆中常驻' : '酒馆中条件触发');
                const excerpt = String(entry.content || '').replace(/\s+/g, ' ').trim().slice(0, 120);
                return `<label class="book-row"><input type="checkbox" data-world-entry="${escapeHtml(entry.id)}" data-world-entry-purpose="${purpose}" ${entry.enabled===true?'checked':''} ${busy?'disabled':''}><span><b>${escapeHtml(entry.label||`条目 ${entry.uid}`)}</b><small>${escapeHtml(tavernState)} · ${escapeHtml(entry.sourceLabel||book.sourceLabel||'世界书')}</small>${excerpt?`<small>${escapeHtml(excerpt)}${String(entry.content||'').length>120?'…':''}</small>`:''}</span></label>`;
            }).join('') : '<div class="note">这本世界书没有可读取的正文条目。</div>';
            const encodedIds = escapeHtml(JSON.stringify(ids));
            return `<details class="book-picker"><summary>${escapeHtml(book.name)} · 已选 ${selectedInBook} / ${entries.length} 条</summary><div class="book-tools"><button class="mini-setting-button" type="button" data-world-entry-batch="all" data-world-entry-purpose="${purpose}" data-world-entry-ids='${encodedIds}' ${busy||!entries.length?'disabled':''}>全选本书</button><button class="mini-setting-button" type="button" data-world-entry-batch="none" data-world-entry-purpose="${purpose}" data-world-entry-ids='${encodedIds}' ${busy||!entries.length?'disabled':''}>清空本书</button></div><div class="book-list">${rows}</div></details>`;
        }).join('');
        return `<div class="note">${title}：已选 ${selected} / ${total} 条。首次发现条目时，酒馆中“启用”的条目会默认勾选，酒馆中“关闭”的条目默认不勾选；之后以你在 世界动态里的手动选择为准。无论酒馆当前是否触发，该条目都可以手动勾选或取消。</div>${groups}`;
    };

    const baibaiText = status => status.available
        ? `已检测到柏宝书${status.pluginVersion?` · ${escapeHtml(status.pluginVersion)}`:''}`
        : '当前未检测到柏宝书公开接口；即使勾选，接口不可用时也会自动跳过';

    return `<div class="card"><h2>世界观与长期参考</h2><p>世界推演和见闻分别选择自己要传输的世界书条目，不再按“整本世界书”全量发送。</p>
      <div class="section-title"><h3>世界推演参考</h3></div>
      <div class="setting-grid">
        <label class="setting-row"><input type="checkbox" data-world-ref-setting="includeCharacterDescription" ${descriptionChecked?'checked':''} ${busy?'disabled':''}><span><b>传输角色描述</b><small>只给世界推演使用；见闻不读取角色描述。</small></span></label>
        <label class="setting-row"><input type="checkbox" data-world-ref-setting="simulationUseBaiBaiBook" ${settings.simulationUseBaiBaiBook===true?'checked':''} ${busy?'disabled':''}><span><b>世界推演使用柏宝书长期历史</b><small>${baibaiText(simulationBaiBai)}。默认最多 ${Number(settings.baibaiHistoryMaxChars)||8000} 字符。</small></span></label>
      </div>
      ${entryPicker(simulationBooks,'simulation','世界推演条目')}

      <div class="section-title"><h3>见闻参考</h3></div>
      <div class="setting-grid">
        <label class="setting-row"><input type="checkbox" data-world-ref-setting="observationUseBaiBaiBook" ${settings.observationUseBaiBaiBook===true?'checked':''} ${busy?'disabled':''}><span><b>见闻使用柏宝书长期历史</b><small>${baibaiText(observationBaiBai)}。只用于理解较早背景，不会替代当前世界状态。</small></span></label>
      </div>
      ${entryPicker(observationBooks,'observation','见闻条目')}
      <div class="note">例如服装规则、NSFW 规则、状态栏格式等，如果不需要给世界动态，就取消勾选；趣味设定即使在酒馆里处于关闭状态，也可以只在“见闻”中手动勾选。世界动态调用模型时使用独立构造的提示词，不会自动把酒馆当前聊天正文、角色卡、世界书或普通聊天提示词再拼一遍。</div>
    </div>`;
}

function initialSettlementSettingsHtml(actions, busy, state) {
    const settings = actions?.getSettings?.() ?? {};
    const anchor = state?.sync?.lastProcessedAssistantMessageId;
    if (Number.isInteger(anchor)) {
        return `<div class="card"><h2>结算批次</h2><p>当前聊天已经建立结算锚点 AI #${anchor}。后续只会从锚点之后继续，并且每次最多读取 10 条 AI 正文。</p><div class="note">如果确实需要从更早楼层重新构建世界动态，应先清理当前聊天的 世界动态数据，再选择“从指定楼层开始”。这样不会把旧状态和回溯结果混在一起。</div></div>`;
    }
    const mode = settings.initialSettlementMode === 'from_floor' ? 'from_floor' : 'latest';
    const floor = Number.isFinite(Number(settings.initialStartFloor)) ? Math.max(0, Math.trunc(Number(settings.initialStartFloor))) : 0;
    return `<div class="card"><h2>首次结算起点</h2><p>高楼层旧聊天默认直接从当前开始，不会把前几十层一次性塞进模型。每次世界推演最多只处理 10 条 AI 正文。</p><label><span class="meta">首次结算方式</span><select class="setting-text" data-initial-settlement-mode ${busy?'disabled':''}><option value="latest" ${mode==='latest'?'selected':''}>从当前开始（推荐：最近最多 10 条 AI 正文）</option><option value="from_floor" ${mode==='from_floor'?'selected':''}>从指定楼层开始（之后每批最多 10 条）</option></select></label>${mode==='from_floor'?`<label><span class="meta">起始楼层编号 #</span><input class="setting-text" type="number" min="0" step="1" data-initial-start-floor value="${floor}" ${busy?'disabled':''}></label>`:''}<div class="note">楼层编号与预览中的 #N 一致，指定楼层本身若是 AI 正文会包含在第一批中。开场白若位于 #0，可填写 0。指定起点的第一批成功后，当前聊天会沿结算锚点继续 10 条一批向后处理；全局首次模式会自动恢复为“从当前开始”，避免影响下一张旧聊天。</div></div>`;
}

function narrativeScopeSettingsHtml(actions, busy) {
    const settings = actions?.getSettings?.() ?? {};
    const tags = Array.isArray(settings.contentTags) && settings.contentTags.length ? settings.contentTags : ['content'];
    const display = tags.join(', ');
    return `<div class="card"><h2>正文读取范围</h2><p>世界动态只把完整标签范围内的 AI 文本当作剧情正文。默认读取 &lt;content&gt;...&lt;/content&gt;，标签外的思维链、状态栏、行动选项、小剧场等不会进入世界推演。</p><label><span class="meta">正文标签名（多个用逗号或换行分隔）</span><input class="setting-text" type="text" data-content-tags value="${escapeHtml(display)}" placeholder="content" ${busy?'disabled':''}></label><div class="note">例如填写 <b>content, story</b> 时，会读取 &lt;content&gt; 和 &lt;story&gt; 的完整闭合范围。修改后立即保存到世界动态设置。</div></div>`;
}

function homeHtml(version, preview, busy, actions) {
    const info = inspectSceneWorldStorage();
    const state = readSceneWorldState();
    const batch=preview?.batch;
    const canSimulate=!!batch?.canSimulate && !busy;
    return `<div class="stack">
        <div class="page-intro"><div class="page-kicker">当前世界</div><h1>此刻</h1><p>先把剧情结算成清晰的当前世界，再从这里查看状态、人物与下一步。</p></div>
        ${state?currentWorldHtml(state):`<div class="card soft"><h2>尚未建立当前世界</h2><p>第一次使用时，先读取待结算剧情并完成一次世界推演。旧聊天默认只从最近最多 10 条 AI 正文开始，不会回灌全部历史。</p></div>`}
        ${actionSuggestionsHtml(state,busy)}
        <div class="card"><div class="card-header"><div><h2>世界推演</h2><div class="card-subtitle">读取只在本地进行；真正推演时才调用一次模型</div></div>${busy?'<span class="meta-pill neutral">处理中</span>':''}</div><div class="status-grid"><div class="status compact"><b>正文同步</b><span>${escapeHtml(latestSyncText(state))}</span></div><div class="status compact"><b>当前数据</b><span>${info.dataExists?formatBytes(info.totalBytes):'尚未创建'}</span></div></div><div class="actions"><button class="action" type="button" data-action="read-pending" ${busy?'disabled':''}>读取待结算剧情</button><button class="action primary" type="button" data-action="simulate" ${canSimulate?'':'disabled'}>推演本批剧情</button></div>${pendingPreviewHtml(preview)}</div>
        <div class="note"><div class="tip"><span class="tip-mark">i</span><span>世界动态当前只手动推演。正文标签、首次结算起点、世界书条目与柏宝书都在右上角设置中管理。</span></div></div>
    </div>`;
}

function settingsHtml(actions, busy, entryChoices) {
    const info = inspectSceneWorldStorage();
    const state = readSceneWorldState();
    return `<div class="stack">
        <div class="page-intro"><div class="page-kicker">插件设置</div><h1>设置</h1><p>把日常使用与高级配置分开管理。这里的选择不会改变酒馆原本的世界书或聊天设置。</p></div><div class="card soft"><div class="card-header"><div><h2>模型连接</h2><div class="card-subtitle">目前使用 酒馆（SillyTavern）当前连接；自定义 API 将在下一阶段接入</div></div></div><div class="status-grid"><div class="status compact"><b>当前方式</b><span>酒馆当前连接</span></div><div class="status compact"><b>自定义 API</b><span>尚未启用</span></div></div></div>
        ${narrativeScopeSettingsHtml(actions,busy)}
        ${initialSettlementSettingsHtml(actions,busy,state)}
        ${worldReferenceSettingsHtml(actions,busy,entryChoices)}
        <div class="card"><h2>数据与维护</h2><p>这里只管理当前聊天的 SceneWorld 数据，不会删除聊天正文，也不会触碰其他插件。</p><div class="status-grid"><div class="status"><b>当前聊天数据</b><span>${info.dataExists?`已创建 · ${formatBytes(info.totalBytes)}`:'未创建'}</span></div><div class="status"><b>正文同步</b><span>${escapeHtml(latestSyncText(state))}</span></div></div>${info.dataExists?`<div class="actions"><button class="action danger" type="button" data-action="clear" ${busy?'disabled':''}>清理当前聊天 SceneWorld 数据</button></div>`:''}</div>
    </div>`;
}

function peopleHtml(state) {
    if (!state) return emptySection('人物');
    const items = Array.isArray(state.people) ? state.people : [];
    if (!items.length) return `<div class="stack"><div class="page-intro"><div class="page-kicker">人物状态</div><h1>人物</h1><p>只展示当前仍值得持续追踪的人物状态。</p></div><div class="card"><p class="empty">当前没有需要持续记录的人物状态。</p></div></div>`;
    return `<div class="stack"><div class="page-intro"><div class="page-kicker">人物状态</div><h1>人物</h1><p>先看人物当前处境，需要细节时再展开。没有内容的字段不会强行显示。</p></div><div class="item-list">${items.map(person=>{
        const details=Array.isArray(person.details)?person.details:[];
        const knowledge=(Array.isArray(person.knowledge)?person.knowledge:[]).slice(-4).map(item=>escapeHtml(typeof item==='string'?item:item.text)).filter(Boolean);
        const initials=String(person.name||'?').trim().slice(0,1) || '?';
        const line=[person.status,person.location?`位置：${person.location}`:''].filter(Boolean).join(' · ') || '暂无额外状态';
        const cells=[];
        if(person.location)cells.push(`<div class="detail-cell"><b>当前位置</b><span>${escapeHtml(person.location)}</span></div>`);
        if(person.status)cells.push(`<div class="detail-cell"><b>当前状态</b><span>${escapeHtml(person.status)}</span></div>`);
        for(const item of details.slice(0,6)){if(item?.label&&item?.value)cells.push(`<div class="detail-cell"><b>${escapeHtml(item.label)}</b><span>${escapeHtml(item.value)}</span></div>`)}
        return `<details class="card person-card"><summary><div class="person-summary"><div class="person-avatar">${escapeHtml(initials)}</div><div class="person-main"><b>${escapeHtml(person.name||'未命名人物')}</b><div class="person-line">${escapeHtml(line)}</div></div><span class="person-chevron">⌄</span></div></summary><div class="person-detail">${cells.length?`<div class="detail-grid">${cells.join('')}</div>`:''}${knowledge.length?`<div class="knowledge-box"><b>已确认认知</b><br>${knowledge.join('；')}</div>`:''}${!cells.length&&!knowledge.length?'<p class="empty">当前没有更多需要展开的信息。</p>':''}</div></details>`;
    }).join('')}</div></div>`;
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

function opinionHtml(state, busy, actions, activeView='public') {
    if (!state) return emptySection('见闻');
    const simulationReady = Number.isInteger(state?.sync?.lastProcessedAssistantMessageId);
    const opinion = state.publicOpinion || {};
    const guidance = state.guidance || {};
    const facts = Array.isArray(state.world?.facts) ? state.world.facts : [];
    const publicCount = facts.filter(item => item?.publicity === 'public').length;
    const traceCount = facts.filter(item => item?.publicity === 'trace').length;
    const news = Array.isArray(opinion.news) ? opinion.news : [];
    const forum = Array.isArray(opinion.forum) ? opinion.forum : [];
    const street = Array.isArray(opinion.street) ? opinion.street : [];
    const places = Array.isArray(guidance.places) ? guidance.places : [];
    const streetKindLabel = kind => ({overheard:'路人耳语',gossip:'小道消息',curiosity:'本地趣闻',local_incident:'偶发事件',notice:'告示消息',slice:'生活切片'}[kind] || '市井闲闻');
    const publicView=`<div class="card"><div class="card-header"><div><h2>公共动态</h2><div class="card-subtitle">新闻只记录真正成立的公开事件；论坛可以从当前世界主题自然衍生讨论</div></div><button class="action primary" type="button" data-action="refresh-opinion" ${(busy||!simulationReady)?'disabled':''}>刷新</button></div><div class="overview-meta"><span class="meta-pill neutral">公开事实 ${publicCount}</span><span class="meta-pill neutral">公开迹象 ${traceCount}</span><span class="meta-pill neutral">${escapeHtml(timeLabel(opinion.updatedAt))}</span></div>${simulationReady?'':'<div class="note warning">请先完成至少一次世界推演，建立当前世界状态。</div>'}</div>
      <div class="card"><div class="section-title"><h3>新闻</h3><span class="count">${news.length} 条</span></div>${news.length?`<div class="item-list">${news.map(item=>`<div class="item"><div class="item-head"><b>${escapeHtml(item.headline)}</b>${favoriteButton(state,'news',item.id,busy)}</div><div class="chips"><span class="chip">${escapeHtml(item.category||'公共消息')}</span>${item.source?`<span class="chip">${escapeHtml(item.source)}</span>`:''}</div><p>${escapeHtml(item.summary)}</p>${item.scope?`<div class="meta">范围：${escapeHtml(item.scope)}</div>`:''}</div>`).join('')}</div>`:'<p class="empty">当前没有值得形成新闻的公开事件。</p>'}</div>
      <div class="card"><div class="section-title"><h3>论坛 / 公共讨论</h3><span class="count">${forum.length} 条</span></div>${forum.length?`<div class="item-list">${forum.map(item=>`<div class="item"><div class="item-head"><b>${escapeHtml(item.title)}</b>${favoriteButton(state,'forum',item.id,busy)}</div><div class="chips"><span class="chip">${escapeHtml(item.board||'公共讨论')}</span><span class="chip">${escapeHtml(item.claimStatus||'mixed')}</span></div><p>${escapeHtml(item.summary)}</p>${repliesHtml(item.replies)}</div>`).join('')}</div>`:'<p class="empty">还没有生成论坛讨论。</p>'}</div>`;
    const streetView=`<div class="card"><div class="card-header"><div><h2>街巷漫游</h2><div class="card-subtitle">每次生成生活化市井闲闻与 3～5 个可探索地点</div></div><button class="action primary" type="button" data-action="refresh-street" ${(busy||!simulationReady)?'disabled':''}>漫游</button></div>${simulationReady?'':'<div class="note warning">请先完成至少一次世界推演，建立当前世界状态。</div>'}<div class="overview-meta"><span class="badge noncanon">NON-CANON</span><span class="meta-pill neutral">上次 ${escapeHtml(timeLabel(opinion.streetUpdatedAt))}</span></div></div>
      <div class="card"><div class="section-title"><h3>市井闲闻</h3><span class="count">${street.length} 条</span></div>${street.length?`<div class="item-list">${street.map(item=>`<div class="item"><div class="item-head"><b>${escapeHtml(item.title)}</b>${favoriteButton(state,'street',item.id,busy)}</div><div class="chips"><span class="chip">${escapeHtml(item.category||streetKindLabel(item.kind))}</span><span class="chip">${escapeHtml(streetKindLabel(item.kind))}</span></div>${item.speaker||item.place?`<div class="street-meta">${item.speaker?escapeHtml(item.speaker):escapeHtml(streetKindLabel(item.kind))}${item.place?` · ${escapeHtml(item.place)}`:''}</div>`:''}<div class="quote">${item.speaker?`“${escapeHtml(item.text)}”`:`【${escapeHtml(item.text)}】`}</div>${item.note&&item.note!==item.text?`<p>${escapeHtml(item.note)}</p>`:''}</div>`).join('')}</div>`:'<p class="empty">还没有生成市井闲闻。</p>'}</div>
      <div class="card"><div class="section-title"><h3>去哪逛逛</h3><span class="count">${places.length} 条</span></div>${places.length?`<div class="item-list">${places.map(item=>`<div class="item"><div class="item-head"><div style="flex:1;min-width:0"><b>${escapeHtml(item.name)}</b>${item.why?`<p>${escapeHtml(item.why)}</p>`:''}<div class="chips">${item.type?`<span class="chip">${escapeHtml(item.type)}</span>`:''}<span class="chip">${item.established?'已有地点':'灵感地点'}</span></div></div><button class="insert-small icon-only" type="button" title="填入输入框" aria-label="填入输入框" data-insert-guidance="${escapeHtml(item.id)}" data-guidance-kind="place" ${busy?'disabled':''}>↪</button></div></div>`).join('')}</div>`:'<p class="empty">还没有生成地点推荐。</p>'}</div>`;
    return `<div class="stack"><div class="page-intro"><div class="page-kicker">世界见闻</div><h1>见闻</h1><p>世界推演之后，再从公共讨论或街巷生活两个角度看看镜头外的世界。</p><div class="segmented" role="tablist" aria-label="见闻类型"><button type="button" data-opinion-view="public" aria-selected="${activeView==='public'}">公共动态</button><button type="button" data-opinion-view="street" aria-selected="${activeView==='street'}">街巷漫游</button></div></div>${activeView==='street'?streetView:publicView}<div class="note"><div class="tip"><span class="tip-mark">i</span><span>见闻不读取原始剧情正文，只使用世界推演后的当前状态、最近动态、持续性事实，以及你在设置中单独选择的见闻参考。</span></div></div></div>`;
}

function continuityHtml(state, busy, actions) {
    if (!state) return emptySection('脉络');
    const facts = Array.isArray(state.world?.facts) ? [...state.world.facts] : [];
    const recent = Array.isArray(state.continuity?.recentDynamics) ? [...state.continuity.recentDynamics].reverse() : [];
    const sourceLabel = item => {const start=Number.isInteger(item?.sourceStartMessageId)?item.sourceStartMessageId:null;const end=Number.isInteger(item?.sourceEndMessageId)?item.sourceEndMessageId:(Number.isInteger(item?.sourceMessageId)?item.sourceMessageId:null);if(start===null&&end===null)return'';return start!==null&&end!==null&&start!==end?`AI #${start}～#${end}`:`AI #${end??start}`};
    const publicityLabel=value=>({private:'私有',trace:'公开迹象',public:'公开事实'}[value]||'私有');
    const validityLabel=value=>({current:'当前',upcoming:'将发生',historical:'历史',persistent:'持续'}[value]||value||'当前');
    const sortedFacts=facts.sort((a,b)=>String(b?.updatedAt||'').localeCompare(String(a?.updatedAt||''))||(b?.sourceMessageId??-1)-(a?.sourceMessageId??-1));
    return `<div class="stack"><div class="page-intro"><div class="page-kicker">连续脉络</div><h1>脉络</h1><p>只保留最近 5 次世界变化和仍然有效的持续性事实，让长期聊天保持轻量。</p></div>
      <div class="card"><div class="card-header"><div><h2>持续性世界事实</h2><div class="card-subtitle">后续推演会把这里当作连续性约束；识别错误时可以手动修改或删除</div></div><span class="meta-pill neutral">${facts.length} / 20</span></div>${sortedFacts.length?`<div class="item-list">${sortedFacts.map(item=>`<div class="item"><div class="item-head"><b>${escapeHtml(item.value||item.key||'持续性世界事实')}</b><div class="mini-actions"><button class="remove-small" type="button" title="修改" data-edit-continuity-fact="${escapeHtml(item.id)}" ${busy?'disabled':''}>修改</button><button class="remove-small" type="button" title="删除" data-remove-continuity-fact="${escapeHtml(item.id)}" ${busy?'disabled':''}>删除</button></div></div><div class="chips">${item.key?`<span class="chip">${escapeHtml(item.key)}</span>`:''}<span class="chip">${escapeHtml(validityLabel(item.validity))}</span><span class="chip">${escapeHtml(publicityLabel(item.publicity))}</span>${item.source==='manual'?'<span class="chip">手动修正</span>':''}</div>${item.publicHint?`<p>公开表象：${escapeHtml(item.publicHint)}</p>`:''}${item.evidence?`<details class="preview-details"><summary>查看依据</summary><div class="note">${escapeHtml(item.evidence)}</div></details>`:''}<div class="meta">${escapeHtml([sourceLabel(item),item.updatedAt?`更新：${timeLabel(item.updatedAt)}`:''].filter(Boolean).join(' · '))}</div></div>`).join('')}</div>`:'<p class="empty">当前没有需要长期占用额度的持续性世界事实。</p>'}</div>
      <div class="card"><div class="card-header"><div><h2>最近世界动态</h2><div class="card-subtitle">只保留最近 5 次世界推演的净变化摘要</div></div><span class="meta-pill neutral">${recent.length} / 5</span></div>${recent.length?`<div class="timeline">${recent.map(item=>`<div class="timeline-row"><span class="timeline-dot"></span><div class="timeline-body"><b>${escapeHtml(item.summary)}</b><div class="meta">${escapeHtml(sourceLabel(item))}${item.createdAt?`${sourceLabel(item)?' · ':''}${escapeHtml(timeLabel(item.createdAt))}`:''}</div></div></div>`).join('')}</div>`:'<p class="empty">当前还没有最近世界动态。</p>'}</div>
    </div>`;
}
function chronicleHtml(state, busy) {
    if (!state) return emptySection('纪事');
    const items=Array.isArray(state.chronicle)?[...state.chronicle].reverse():[];
    return `<div class="stack"><div class="page-intro"><div class="page-kicker">收藏归档</div><h1>纪事</h1><p>把值得保留的新闻、讨论与灵感收进这里。收藏不会自动变成世界事实。</p></div>${!items.length?`<div class="card"><p class="empty">暂无收藏。见闻卡片右上角的 ☆ 可以把喜欢的内容保留下来。</p></div>`:`<div class="card"><div class="card-header"><div><h2>收藏</h2><div class="card-subtitle">刷新见闻不会删除这些内容</div></div><span class="meta-pill neutral">${items.length} 条</span></div><div class="item-list">${items.map(item=>`<div class="item"><div class="item-head"><b>${escapeHtml(item.title||'收藏内容')}</b><button class="remove-small" type="button" data-remove-chronicle="${escapeHtml(item.id)}" ${busy?'disabled':''}>删除</button></div><div class="chips"><span class="chip">${escapeHtml(item.sourceLabel||item.sourceType||'收藏')}</span>${item.canon===false?'<span class="badge noncanon">NON-CANON</span>':'<span class="chip">正史来源</span>'}</div>${item.summary?`<p>${escapeHtml(item.summary)}</p>`:''}<div class="meta">收藏于 ${escapeHtml(timeLabel(item.capturedAt))}</div></div>`).join('')}</div></div>`}</div>`;
}

function emptySection(title){return`<div class="stack"><div class="page-intro"><h1>${escapeHtml(title)}</h1><p>当前聊天尚未建立世界动态数据。</p></div><div class="card soft"><p>先到“此刻”完成一次世界推演。仅查看页面不会自动创建数据。</p></div></div>`}
function listSection(title,items,mapper,emptyText='暂无记录。'){if(!Array.isArray(items)||!items.length)return`<div class="stack"><div class="card"><h2>${title}</h2><p class="empty">${emptyText}</p></div></div>`;return`<div class="stack"><div class="card"><h2>${title}</h2><div class="item-list">${items.map(item=>{const view=mapper(item)||{};return`<div class="item"><b>${escapeHtml(view.title||'')}</b>${view.body?`<p>${escapeHtml(view.body)}</p>`:''}${view.meta?`<div class="meta">${escapeHtml(view.meta)}</div>`:''}</div>`}).join('')}</div></div></div>`}
function renderTab(tab,version,preview,busy,actions,opinionView){const state=readSceneWorldState();if(tab==='此刻')return homeHtml(version,preview,busy,actions);if(tab==='人物')return peopleHtml(state);if(tab==='见闻')return opinionHtml(state,busy,actions,opinionView);if(tab==='脉络')return continuityHtml(state,busy,actions);if(tab==='纪事')return chronicleHtml(state,busy);return emptySection(tab)}
function countReportedChanges(summary){if(!summary)return 0;return (summary.worldPatch?1:0)+(summary.momentsUpsert||0)+(summary.momentsRemove||0)+(summary.factsUpsert||0)+(summary.factsRemove||0)+(summary.people||0)+(summary.recentDynamic?1:0)}

export function createSceneWorldShell({ version, onClose, actions }) {
    let host=document.getElementById(HOST_ID);if(host)host.remove();host=document.createElement('div');host.id=HOST_ID;const shadow=host.attachShadow({mode:'open'});let activeTab='此刻';let activeOpinionView='public';let settingsOpen=false;let busy=false;let preview=null;let worldEntryChoices={simulation:null,observation:null};
    const runBusy=async(task)=>{if(busy)return;busy=true;render();try{return await task()}finally{busy=false;render()}};
    const render=()=>{
        const pageTitle=settingsOpen?'世界动态 · 设置':'世界动态';
        const settingsButtonLabel=settingsOpen?'返回世界动态':'打开设置';
        const settingsButtonIcon=settingsOpen?'←':'⚙';
        const mainHtml=settingsOpen?settingsHtml(actions,busy,worldEntryChoices):renderTab(activeTab,version,preview,busy,actions,activeOpinionView);
        const navHtml=settingsOpen?'':`<nav class="nav" aria-label="世界动态栏目">${TABS.map(tab=>`<button type="button" data-tab="${tab}" aria-selected="${tab===activeTab}">${tab}</button>`).join('')}</nav>`;
        shadow.innerHTML=`<style>${STYLES}</style><div class="backdrop"><section class="panel" role="dialog" aria-modal="true" aria-label="${settingsOpen?'世界动态设置':'世界动态'}"><header class="header"><div class="title">${pageTitle}</div><div class="version">${escapeHtml(version)}</div><div class="spacer"></div><button class="header-icon" type="button" data-action="settings-toggle" aria-label="${settingsButtonLabel}" title="${settingsButtonLabel}">${settingsButtonIcon}</button><button class="close" type="button" aria-label="关闭">×</button></header><main class="content">${mainHtml}</main>${navHtml}</section></div>`;
        shadow.querySelector('.close')?.addEventListener('click',()=>onClose?.());
        shadow.querySelector('[data-action="settings-toggle"]')?.addEventListener('click',()=>{settingsOpen=!settingsOpen;render();if(settingsOpen&&(worldEntryChoices.simulation===null||worldEntryChoices.observation===null)){runBusy(async()=>{try{worldEntryChoices={simulation:await actions?.getWorldEntries?.('simulation')??[],observation:await actions?.getWorldEntries?.('observation')??[]}}catch(error){console.error('[SceneWorld] world entry list load failed',error);worldEntryChoices={simulation:[],observation:[]};notify(`读取世界书内部条目失败：${error?.message||error}`,'error')}})}});
        shadow.querySelector('.backdrop')?.addEventListener('click',e=>{if(e.target===e.currentTarget)onClose?.()});
        shadow.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{settingsOpen=false;activeTab=button.dataset.tab||'此刻';render()}));
        shadow.querySelectorAll('[data-opinion-view]').forEach(button=>button.addEventListener('click',()=>{activeOpinionView=button.dataset.opinionView==='street'?'street':'public';render()}));
        shadow.querySelectorAll('[data-world-ref-setting]').forEach(input=>input.addEventListener('change',()=>{try{actions?.updateSettings?.({[input.dataset.worldRefSetting]:input.checked});notify('世界观参考设置已保存','success');render()}catch(error){console.error('[SceneWorld] settings update failed',error);notify(`保存世界观参考设置失败：${error?.message||error}`,'error')}}));
        shadow.querySelectorAll('[data-world-entry]').forEach(input=>input.addEventListener('change',()=>{try{const purpose=input.dataset.worldEntryPurpose||'simulation';actions?.updateSettings?.({worldEntryId:input.dataset.worldEntry,worldEntryPurpose:purpose,worldEntryEnabled:input.checked});for(const book of worldEntryChoices[purpose]||[]){const entry=(book.entries||[]).find(item=>item.id===input.dataset.worldEntry);if(entry)entry.enabled=input.checked}notify(`${purpose==='observation'?'见闻':'世界推演'}世界书条目选择已保存`,'success');render()}catch(error){console.error('[SceneWorld] world entry setting failed',error);notify(`保存世界书条目选择失败：${error?.message||error}`,'error')}}));
        shadow.querySelectorAll('[data-world-entry-batch]').forEach(button=>button.addEventListener('click',()=>{try{const purpose=button.dataset.worldEntryPurpose||'simulation';const ids=JSON.parse(button.dataset.worldEntryIds||'[]');const enabled=button.dataset.worldEntryBatch==='all';actions?.updateSettings?.({worldEntryIds:ids,worldEntryPurpose:purpose,worldEntryEnabled:enabled});for(const book of worldEntryChoices[purpose]||[]){for(const entry of book.entries||[]){if(ids.includes(entry.id))entry.enabled=enabled}}notify(`${enabled?'已全选':'已清空'}这本世界书的 ${purpose==='observation'?'见闻':'世界推演'}条目`,'success');render()}catch(error){console.error('[SceneWorld] world entry batch setting failed',error);notify(`批量保存世界书条目失败：${error?.message||error}`,'error')}}));
        shadow.querySelector('[data-content-tags]')?.addEventListener('change',event=>{try{const value=String(event.currentTarget?.value??'').trim();actions?.updateSettings?.({contentTags:value});preview=null;notify('正文标签设置已保存','success');render()}catch(error){console.error('[SceneWorld] content tag settings update failed',error);notify(`保存正文标签失败：${error?.message||error}`,'error')}});
        shadow.querySelector('[data-initial-settlement-mode]')?.addEventListener('change',event=>{try{const mode=String(event.currentTarget?.value??'latest')==='from_floor'?'from_floor':'latest';actions?.updateSettings?.({initialSettlementMode:mode});preview=null;notify(mode==='from_floor'?'首次结算已切换为从指定楼层开始':'首次结算已切换为从当前开始','success');render()}catch(error){console.error('[SceneWorld] initial settlement mode failed',error);notify(`保存首次结算方式失败：${error?.message||error}`,'error')}});
        shadow.querySelector('[data-initial-start-floor]')?.addEventListener('change',event=>{try{const floor=Math.max(0,Math.trunc(Number(event.currentTarget?.value)||0));actions?.updateSettings?.({initialStartFloor:floor});preview=null;notify(`首次结算起点已设为 #${floor}`,'success');render()}catch(error){console.error('[SceneWorld] initial start floor failed',error);notify(`保存起始楼层失败：${error?.message||error}`,'error')}});
        shadow.querySelector('[data-action="read-pending"]')?.addEventListener('click',()=>{try{preview=actions?.inspectPendingNarrative?.()??null;const batch=preview?.batch;if(batch?.anchorChanged)notify(batch.anchorReason,'error');else if(!batch?.hasPending)notify('当前没有新的 AI 正文需要结算','info');else if(batch.overBudget)notify('本批 10 条以内的正文仍超过单次安全预算，请查看界面说明','warning')}catch(error){console.error('[SceneWorld] read pending narrative failed',error);notify(`读取待结算剧情失败：${error?.message||error}`,'error')}render()});
        shadow.querySelector('[data-action="simulate"]')?.addEventListener('click',()=>runBusy(async()=>{const batch=preview?.batch;if(!batch?.canSimulate)return;if(!confirm(`将调用一次酒馆当前模型，结算 #${batch.startId}～#${batch.endId} 共 ${batch.assistantCount} 条 AI 正文。继续吗？`))return;try{const result=await actions?.simulatePending?.(batch);preview=actions?.inspectPendingNarrative?.()??preview;const count=countReportedChanges(result?.changeSummary);const ref=result?.worldReference;const refText=ref?` · 世界观参考：${ref.characterDescriptionUsed?'角色描述 + ':''}${ref.selectedEntries||0} 条世界书条目`:'';const bb=result?.baibai;const bbText=bb?.enabled?(bb?.used?` · 柏宝书长期历史 ${bb.chars||0} 字符`:(bb?.available?' · 柏宝书本轮无可用长期历史':' · 柏宝书接口未检测到')):'';notify((count?`世界推演完成：结算 #${result.batch.startId}～#${result.batch.endId}，保存 ${count} 组变化`:`世界推演完成：结算 #${result.batch.startId}～#${result.batch.endId}，本轮没有值得额外记录的变化`)+refText+bbText,'success')}catch(error){console.error('[SceneWorld] pending simulation failed',error);notify(`世界推演失败：${error?.message||error}`,'error')}}));
        shadow.querySelector('[data-action="refresh-opinion"]')?.addEventListener('click',()=>runBusy(async()=>{try{const info=actions?.inspectPublicOpinion?.();if(!info?.simulationReady)throw new Error('请先完成至少一次世界推演，建立当前世界状态后再生成见闻');if(!confirm(`将调用一次模型刷新公共动态。新闻只会使用当前 ${info.publicCount} 条 public 公开事实；论坛可围绕当前世界状态和主题自然生成。继续吗？`))return;const result=await actions?.refreshPublicOpinion?.();if((result.newsCount||0)+(result.forumCount||0)===0)notify('公共动态刷新完成：本轮新闻为空，论坛也未形成有效内容','success');else {const ref=result?.worldReference;const refText=ref?` · 参考 ${ref.selectedEntries||0} 条世界书条目`:'';notify(`公共动态刷新完成：${result.newsCount||0} 条新闻，${result.forumCount||0} 条讨论${refText}`,'success')}}catch(error){console.error('[SceneWorld] public info failed',error);notify(`刷新公共动态失败：${error?.message||error}`,'error')}}));
        shadow.querySelector('[data-action="refresh-street"]')?.addEventListener('click',()=>runBusy(async()=>{const info=actions?.inspectPublicOpinion?.();if(!info?.simulationReady){notify('请先完成至少一次世界推演，建立当前世界状态后再生成见闻','warning');return}if(!confirm('“街巷漫游”将调用一次模型，同时生成 NON-CANON 市井闲闻和 3～5 个地点建议，不会写入世界事实。继续吗？'))return;try{const result=await actions?.refreshStreetOpinion?.();{const ref=result?.worldReference;const refText=ref?` · 参考 ${ref.selectedEntries||0} 条世界书条目`:'';notify(`街巷漫游已更新：${result?.itemCount||0} 条市井闲闻，${result?.placeCount||0} 个地点${refText}`,'success')}}catch(error){console.error('[SceneWorld] street opinion failed',error);notify(`街巷漫游失败：${error?.message||error}`,'error')}}));
        shadow.querySelectorAll('[data-insert-guidance]').forEach(button=>button.addEventListener('click',()=>{try{const state=readSceneWorldState();const kind=button.dataset.guidanceKind;const list=kind==='place'?state?.guidance?.places:state?.guidance?.actions;const item=Array.isArray(list)?list.find(entry=>entry?.id===button.dataset.insertGuidance):null;if(!item?.prompt)throw new Error('这条建议已经不存在，请重新生成');const inserted=actions?.putTextIntoChatInput?.(item.prompt);if(inserted===false)return;notify('已填入 SillyTavern 输入框','success');onClose?.()}catch(error){console.error('[SceneWorld] insert guidance failed',error);notify(`填入输入框失败：${error?.message||error}`,'error')}}));
        shadow.querySelectorAll('[data-favorite-type]').forEach(button=>button.addEventListener('click',()=>runBusy(async()=>{try{await actions?.favoriteOpinion?.(button.dataset.favoriteType,button.dataset.favoriteId);notify('已收藏到纪事','success')}catch(error){console.error('[SceneWorld] favorite failed',error);notify(`收藏失败：${error?.message||error}`,'error')}})));
        shadow.querySelectorAll('[data-remove-chronicle]').forEach(button=>button.addEventListener('click',()=>runBusy(async()=>{try{await actions?.removeChronicle?.(button.dataset.removeChronicle);notify('已从纪事删除','success')}catch(error){console.error('[SceneWorld] chronicle remove failed',error);notify(`删除收藏失败：${error?.message||error}`,'error')}})));
        shadow.querySelectorAll('[data-remove-continuity-fact]').forEach(button=>button.addEventListener('click',()=>runBusy(async()=>{if(!confirm('确定删除这条持续性世界事实吗？删除后，后续推演将不再把它作为世界连续性约束。'))return;try{await actions?.removeContinuityFact?.(button.dataset.removeContinuityFact);notify('已删除持续性世界事实','success')}catch(error){console.error('[SceneWorld] continuity fact remove failed',error);notify(`删除持续性世界事实失败：${error?.message||error}`,'error')}})));
        shadow.querySelectorAll('[data-edit-continuity-fact]').forEach(button=>button.addEventListener('click',()=>runBusy(async()=>{try{const state=readSceneWorldState();const item=state?.world?.facts?.find(entry=>entry?.id===button.dataset.editContinuityFact);if(!item)throw new Error('这条持续性世界事实已经不存在');const value=prompt('修改持续性世界事实：',item.value||'');if(value===null)return;if(!String(value).trim())throw new Error('事实内容不能为空');await actions?.editContinuityFact?.(item.id,value);notify('持续性世界事实已手动修正','success')}catch(error){console.error('[SceneWorld] continuity fact edit failed',error);notify(`修改持续性世界事实失败：${error?.message||error}`,'error')}})));
        shadow.querySelector('[data-action="clear"]')?.addEventListener('click',()=>runBusy(async()=>{if(!confirm('只删除当前聊天的 chatMetadata.世界动态数据。不会删除聊天正文，也不会触碰其他插件数据。确定继续吗？'))return;try{const removed=await clearSceneWorldState();preview=actions?.inspectPendingNarrative?.()??null;notify(removed?'当前聊天的 世界动态数据已清理':'当前聊天没有 世界动态数据','success')}catch(error){console.error('[SceneWorld] clear state failed',error);notify(`清理数据失败：${error?.message||error}`,'error')}}));
    };
    shadow.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();if(settingsOpen){settingsOpen=false;render();return}onClose?.();return}const target=event.target;if(target&&(target.tagName==='INPUT'||target.tagName==='TEXTAREA'||target.isContentEditable))event.stopPropagation()});
    render();document.body.appendChild(host);return{host,refresh:render,onChatChanged(){preview=null;worldEntryChoices={simulation:null,observation:null};render()},destroy(){host?.remove()}};
}

export function removeSceneWorldShell(){document.getElementById(HOST_ID)?.remove()}
