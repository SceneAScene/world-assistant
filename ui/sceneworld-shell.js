import {
    clearSceneWorldState,
    inspectSceneWorldStorage,
    readSceneWorldState,
} from '../data/sceneworld-store.js';
import { notify } from '../platform/sillytavern.js';
import { createSceneWorldDialogManager } from './dialog-manager.js';
import { createViewportManager } from './viewport-manager.js';

const HOST_ID = 'sceneworld-root';
const TABS = ['此刻', '人物', '见闻', '脉络', '纪事'];
const SETTINGS_TABS = [
    ['simulation', '推演'],
    ['model', '模型'],
    ['reference', '参考'],
    ['appearance', '外观'],
    ['data', '数据'],
];

const HELP_TOPICS = Object.freeze({
    home: {
        title: '关于“此刻”',
        message: '“此刻”是世界动态的主控制页。先读取待推演剧情，再手动执行世界推演。\n\n“当前世界”是剧情在这一刻的基础状态，不要求发生重大事件；首次推演必须建立，后续在状态变化时更新。新闻是否出现则另由公开事件决定。\n\n世界推演只读取设置允许的 AI 正文标签范围，并结合当前世界状态、最近 5 次动态、持续性世界事实，以及可选的角色描述、世界书条目和记忆插件长期历史。',
    },
    people: {
        title: '关于“人物”',
        message: '人物页保存的是当前仍然成立的人物状态，不是人物履历。折叠时只显示姓名和当前位置；展开后查看当前状态、附加详情与已确认认知。\n\n如果 AI 识别错误、漏人或多识别人，可以直接手动修改、增加或删除。手动维护后的内容会继续参与后续世界推演。',
    },
    observation: {
        title: '关于“见闻”',
        message: '见闻必须建立在至少一次成功的世界推演之后。它不会重新读取原始剧情正文。\n\n“公共动态”中，新闻只根据已经成立的公开事实生成；论坛可以围绕当前世界主题、公开迹象和生活环境自然衍生讨论。\n\n“街巷漫游”每次生成市井闲闻和可探索地点。市井闲闻与灵感地点不会自动写回世界事实。',
    },
    continuity: {
        title: '关于“脉络”',
        message: '脉络只保存两类连续性信息：最近 5 次世界推演的净变化，以及最多 20 条仍然有效的持续性世界事实。\n\n持续性事实会参与后续推演；发现 AI 误判时可以手动修改或删除。较早的长期剧情历史可以按需交给记忆插件提供。',
    },
    chronicle: {
        title: '关于“纪事”',
        message: '纪事是收藏夹，用来保存喜欢的新闻、论坛、市井闲闻或其他灵感。刷新见闻不会删除收藏。\n\n收藏本身不会自动成为世界事实，也不会自动发送给后续世界推演。',
    },
    reference: {
        title: '关于“参考资料”',
        message: '世界推演和见闻分别维护自己的参考资料。世界书按“条目”选择，不按整本世界书全量发送。\n\n第一次发现条目时，酒馆中已启用的条目默认勾选，关闭的条目默认不勾选；之后完全以世界动态里的手动选择为准。即使某条世界书条目当前在酒馆里关闭，也仍然可以单独勾选给世界动态使用。\n\n服装规则、状态栏格式、NSFW 规则等不需要的条目可以取消；趣味设定可以只勾给见闻。',
    },
});

const STYLES = `
:host{all:initial;position:fixed;top:var(--sw-vv-top,0px);left:var(--sw-vv-left,0px);right:auto;bottom:auto;width:var(--sw-vv-width,100vw);height:var(--sw-vv-height,100dvh);z-index:2147483000;display:block;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:#272821;--sw-bg:#f3eee3;--sw-surface:#f8f3e8;--sw-card:#fffdf7;--sw-text:#292722;--sw-muted:#746b61;--sw-faint:#9b9185;--sw-line:#ddd2c2;--sw-line-soft:#eee5d7;--sw-accent:#436c85;--sw-accent-dark:#35586e;--sw-accent-soft:#e4edf1;--sw-support:#82b29b;--sw-support-soft:#e7f1eb;--sw-warn:#a86636;--sw-warn-bg:#f8eadc;--sw-danger:#b73f42;--sw-danger-bg:#f7e5e4;--sw-shadow:0 18px 55px rgba(60,58,49,.18);--sw-font-adjust:1px}
*,*::before,*::after{box-sizing:border-box}button,input,select,textarea{font:inherit}button{color:inherit}.backdrop{width:100%;height:100%;display:grid;place-items:center;padding:max(14px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(14px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));background:rgba(48,48,42,.34)}
.panel{width:min(920px,96vw);height:min(820px,calc(var(--sw-vv-height,100dvh) - 28px));max-height:calc(var(--sw-vv-height,100dvh) - 12px);min-height:430px;overflow:hidden;display:grid;grid-template-rows:auto 1fr auto;border:1px solid #d9cdbc;border-radius:20px;background:var(--sw-bg);box-shadow:var(--sw-shadow);color:var(--sw-text)}
.header{min-height:60px;padding:11px 14px 10px 20px;display:flex;align-items:center;gap:9px;border-bottom:1px solid var(--sw-line);background:rgba(255,253,247,.97)}.title{font-size:calc(19px + var(--sw-font-adjust));font-weight:760;letter-spacing:.035em;color:#20211c}.version{font-size:calc(10.5px + var(--sw-font-adjust));color:var(--sw-faint);margin-top:2px}.spacer{flex:1}.header-icon,.close{border:0;background:transparent;color:#42443c;width:38px;height:38px;border-radius:10px;cursor:pointer;line-height:1;display:grid;place-items:center;transition:background .16s,color .16s}.header-icon{font-size:calc(19px + var(--sw-font-adjust))}.close{font-size:calc(24px + var(--sw-font-adjust))}.header-icon:hover,.close:hover{background:var(--sw-accent-soft);color:var(--sw-accent-dark)}
.content{overflow-y:auto;overflow-x:hidden;padding:22px 18px 26px;scrollbar-color:#c9c6b9 transparent}.stack{width:100%;max-width:800px;min-width:0;margin:0 auto;display:grid;gap:16px}.page-intro{padding:2px 3px 0}.page-title-row{display:flex;align-items:center;gap:8px}.page-title-row h1{flex:0 1 auto}.page-intro h1{margin:0;font-size:calc(20px + var(--sw-font-adjust));line-height:1.35;font-weight:760;color:#22231e}.page-intro p{margin:6px 0 0;color:var(--sw-muted);font-size:calc(13px + var(--sw-font-adjust));line-height:1.65}.page-kicker{font-size:calc(11px + var(--sw-font-adjust));color:var(--sw-accent-dark);font-weight:700;letter-spacing:.08em;margin-bottom:5px}.info-button{width:28px;height:28px;border:0;border-radius:50%;background:transparent;color:#7c7e74;display:grid;place-items:center;cursor:pointer;font-size:calc(15px + var(--sw-font-adjust));font-weight:700;line-height:1;flex:0 0 auto}.info-button:hover{background:var(--sw-accent-soft);color:var(--sw-accent-dark)}
.card{min-width:0;border:1px solid var(--sw-line);background:var(--sw-card);border-radius:16px;padding:17px 18px;box-shadow:0 2px 10px rgba(66,64,53,.035)}.card.soft{background:#faf5eb}.card h2{margin:0 0 8px;font-size:calc(16px + var(--sw-font-adjust));line-height:1.4;color:#282921}.card h3{margin:15px 0 8px;font-size:calc(14px + var(--sw-font-adjust));color:#303128}.card p{margin:7px 0;font-size:calc(13px + var(--sw-font-adjust));line-height:1.72;color:var(--sw-muted)}.card p strong{color:var(--sw-text)}.card-header{display:flex;gap:10px;align-items:flex-start;margin-bottom:8px}.card-header>div:first-child{flex:1;min-width:0}.card-header h2,.card-header h3{margin:0}.card-subtitle{font-size:calc(12px + var(--sw-font-adjust));color:var(--sw-muted);line-height:1.55;margin-top:3px}
.overview{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;align-items:start}.overview-summary{font-size:calc(15px + var(--sw-font-adjust))!important;line-height:1.8!important;color:#3b3c33!important;margin:0!important}.overview-meta{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}.meta-pill{display:inline-flex;align-items:center;gap:5px;padding:6px 9px;border-radius:999px;background:var(--sw-accent-soft);color:var(--sw-accent-dark);font-size:calc(11.5px + var(--sw-font-adjust));font-weight:650}.meta-pill.neutral{background:#eee6da;color:#6e655b}
.status-grid{margin-top:12px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.status{padding:11px 12px;border:1px solid var(--sw-line-soft);border-radius:11px;background:#faf5eb}.status b{display:block;font-size:calc(11px + var(--sw-font-adjust));color:#66685f;margin-bottom:4px;font-weight:650}.status span{font-size:calc(12.5px + var(--sw-font-adjust));line-height:1.5;color:#32342c;word-break:break-word}.status.compact{padding:9px 10px}
.actions{margin-top:13px;display:flex;flex-wrap:wrap;gap:9px}.action{min-height:39px;border:1px solid #cfcbbd;border-radius:10px;padding:8px 13px;background:#fffaf1;color:#3d4036;cursor:pointer;font-weight:650;font-size:calc(12.5px + var(--sw-font-adjust));transition:.15s}.action:hover{border-color:#87aabd;background:#edf4f6}.action.primary{background:var(--sw-accent);border-color:var(--sw-accent);color:#fff}.action.primary:hover{background:var(--sw-accent-dark);border-color:var(--sw-accent-dark)}.card-header .action{flex:0 0 auto;min-width:76px;min-height:35px;padding:7px 13px}.action:disabled{opacity:.42;cursor:not-allowed}.action.danger{color:var(--sw-danger);border-color:#dbbcb7;background:#fff9f7}.action.danger:hover{background:var(--sw-danger-bg)}
.note{margin-top:10px;padding:10px 12px;border:1px solid var(--sw-line-soft);border-radius:10px;background:#faf4e8;font-size:calc(12px + var(--sw-font-adjust));line-height:1.65;color:var(--sw-muted)}.note.warning{border-color:#dfcf9f;background:var(--sw-warn-bg);color:#735d2c}.note.error{border-color:#dfb9b4;background:var(--sw-danger-bg);color:#864b46}.tip{display:flex;gap:8px;align-items:flex-start}.tip-mark{flex:0 0 auto;width:18px;height:18px;border-radius:50%;background:var(--sw-accent-soft);color:var(--sw-accent-dark);display:grid;place-items:center;font-size:calc(11px + var(--sw-font-adjust));font-weight:800;margin-top:1px}
.preview-details{margin-top:10px;border:1px solid var(--sw-line);border-radius:11px;overflow:hidden;background:#fffaf1}.preview-details summary{cursor:pointer;padding:10px 12px;font-size:calc(12px + var(--sw-font-adjust));font-weight:680;color:#4b4d43;list-style-position:inside;background:#f4ecdf}.transcript{padding:10px;display:grid;gap:8px}.message{padding:10px 11px;border-radius:9px;background:#faf3e7;border:1px solid var(--sw-line-soft)}.message .who{font-size:calc(10.5px + var(--sw-font-adjust));color:var(--sw-faint);margin-bottom:5px}.message .body{white-space:pre-wrap;word-break:break-word;font-size:calc(12px + var(--sw-font-adjust));line-height:1.65;color:#44463d}
.item-list{display:grid;gap:9px;margin-top:11px}.item{padding:12px 13px;border-radius:11px;border:1px solid var(--sw-line-soft);background:#fffaf2}.item:hover{border-color:#d7d4c7}.item-head{display:flex;align-items:flex-start;gap:9px}.item-head b{flex:1}.mini-actions{display:flex;gap:5px;flex:0 0 auto}.item b{display:block;font-size:calc(13.5px + var(--sw-font-adjust));line-height:1.45;margin-bottom:4px;color:#303129}.item span,.item p{font-size:calc(12px + var(--sw-font-adjust));line-height:1.62;color:var(--sw-muted);margin:0}.meta{font-size:calc(10.8px + var(--sw-font-adjust));color:var(--sw-faint);margin-top:6px}.empty{color:var(--sw-faint)!important}.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}.chip,.badge{font-size:calc(10.5px + var(--sw-font-adjust));padding:4px 7px;border-radius:999px;background:#eee5d8;color:#6f665c}.badge.noncanon{border:1px solid #ddcda7;background:#f8f0dc;color:#7b642d}
.replies{margin-top:9px;display:grid;gap:6px}.reply{font-size:calc(11.5px + var(--sw-font-adjust));line-height:1.62;padding:8px 9px;border-radius:8px;background:#f7efe3;color:#625b53}.reply strong{font-weight:680;color:#43453d}.star{flex:0 0 auto;border:1px solid #d4d0c2;background:#fffdf7;color:#77766e;border-radius:8px;min-width:34px;height:30px;cursor:pointer}.star:hover{background:var(--sw-accent-soft);color:var(--sw-accent-dark)}.star[disabled]{opacity:.4;cursor:default}.remove-small{border:0;background:transparent;color:#77796f;cursor:pointer;font-size:calc(11px + var(--sw-font-adjust));padding:3px 5px;border-radius:6px}.remove-small:hover{background:#f2eadf;color:#4b4d43}.insert-small{border:1px solid #d8ccbb;background:#fffdf7;color:#62675a;border-radius:8px;padding:6px 9px;cursor:pointer;font-size:calc(11px + var(--sw-font-adjust));white-space:nowrap}.insert-small.icon-only{width:34px;height:30px;padding:0;display:grid;place-items:center;font-size:calc(17px + var(--sw-font-adjust));line-height:1;font-weight:700}.insert-small:hover{background:var(--sw-accent-soft);border-color:#9bb9c8;color:var(--sw-accent-dark)}.insert-small:disabled{opacity:.4;cursor:not-allowed}.quote{margin-top:8px;padding:9px 11px;border-left:3px solid var(--sw-support);background:#eef3ef;font-size:calc(12px + var(--sw-font-adjust));line-height:1.7;color:#4a4c43}.street-meta{font-size:calc(10.8px + var(--sw-font-adjust));color:var(--sw-faint);margin-top:4px}
.section-title{display:flex;align-items:center;gap:8px;margin:14px 0 8px}.section-title h3{margin:0;flex:1}.section-title .count{font-size:calc(10.8px + var(--sw-font-adjust));color:var(--sw-faint)}.section-divider{height:1px;background:var(--sw-line-soft);margin:14px 0}.segmented{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;padding:4px;border-radius:11px;background:#ece3d6;margin:10px 0 2px}.segmented button{border:0;border-radius:8px;padding:9px 10px;background:transparent;color:#6b6d63;font-size:calc(12.5px + var(--sw-font-adjust));font-weight:680;cursor:pointer}.segmented button[aria-selected="true"]{background:#fffdf7;color:#31332b;box-shadow:0 1px 5px rgba(60,58,48,.08)}
.person-card{padding:0;overflow:hidden}.person-card>summary{list-style:none;cursor:pointer;padding:14px 15px}.person-card>summary::-webkit-details-marker{display:none}.person-summary{display:flex;align-items:center;gap:12px}.person-avatar{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:var(--sw-accent-soft);color:var(--sw-accent-dark);font-weight:760;font-size:calc(15px + var(--sw-font-adjust))}.person-main{flex:1;min-width:0}.person-main b{font-size:calc(14px + var(--sw-font-adjust));color:#2e3028}.person-line{font-size:calc(11.5px + var(--sw-font-adjust));color:var(--sw-muted);margin-top:3px;white-space:normal;overflow:visible;line-height:1.55;word-break:break-word}.person-chevron{color:#999a91;font-size:calc(15px + var(--sw-font-adjust))}.person-card[open] .person-chevron{transform:rotate(180deg)}.person-detail{border-top:1px solid var(--sw-line-soft);padding:12px 15px 14px;background:#fffaf2}.detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.detail-cell{padding:9px 10px;border-radius:9px;background:#f8f0e5}.detail-cell b{display:block;font-size:calc(10.5px + var(--sw-font-adjust));color:#7d7e74;margin-bottom:3px}.detail-cell span{font-size:calc(12px + var(--sw-font-adjust));line-height:1.55;color:#42443b}.knowledge-box{margin-top:9px;padding:9px 10px;border-left:3px solid var(--sw-support);background:#eef3ef;font-size:calc(11.5px + var(--sw-font-adjust));line-height:1.65;color:#606258}
.timeline{display:grid;margin-top:10px}.timeline-row{position:relative;padding:0 0 16px 24px}.timeline-row:last-child{padding-bottom:0}.timeline-row::before{content:"";position:absolute;left:7px;top:9px;bottom:-2px;width:1px;background:#d6d4ca}.timeline-row:last-child::before{display:none}.timeline-dot{position:absolute;left:2px;top:5px;width:11px;height:11px;border-radius:50%;background:#89977e;border:2px solid #f9f7f0}.timeline-body{padding:10px 12px;border:1px solid var(--sw-line-soft);border-radius:10px;background:#fffaf2}.timeline-body b{font-size:calc(12.5px + var(--sw-font-adjust));line-height:1.55;color:#3c3e35}.timeline-body .meta{margin-top:5px}
.setting-grid{display:grid;gap:8px;margin-top:10px}.setting-row{display:flex;align-items:flex-start;gap:10px;padding:10px 11px;border:1px solid var(--sw-line-soft);border-radius:10px;background:#fffaf2}.setting-row input{margin-top:2px;accent-color:var(--sw-accent)}.setting-row span{font-size:calc(12.2px + var(--sw-font-adjust));line-height:1.55;color:#41433a}.setting-row small{display:block;color:var(--sw-muted);margin-top:2px}.setting-text{width:100%;max-width:100%;min-width:0;margin-top:8px;border:1px solid #d8ccbb;background:#fffdf7;color:#35372f;border-radius:9px;padding:9px 10px;font:inherit;font-size:calc(12px + var(--sw-font-adjust));outline:none}.setting-text:focus{border-color:#7fa2b6;box-shadow:0 0 0 2px rgba(67,108,133,.10)}.book-picker{margin-top:9px;border:1px solid var(--sw-line);border-radius:11px;background:#fffaf1;overflow:hidden}.book-picker summary{cursor:pointer;padding:10px 12px;font-size:calc(12px + var(--sw-font-adjust));font-weight:680;color:#4a4c43;list-style-position:inside;background:#faf3e7}.book-list{max-height:250px;overflow:auto;padding:8px;display:grid;gap:6px}.book-row{display:flex;align-items:flex-start;gap:9px;padding:9px;border-radius:8px;border:1px solid transparent;background:#fffdf7}.book-row:hover{border-color:#ddd9cc}.book-row input{margin-top:2px;accent-color:var(--sw-accent)}.book-row span{min-width:0;font-size:calc(12px + var(--sw-font-adjust));line-height:1.45;color:#3f4138}.book-row small{display:block;color:#83847a;margin-top:2px;word-break:break-word}.book-tools{display:flex;gap:6px;padding:8px 8px 0}.mini-setting-button{border:1px solid #d5d1c4;background:#fffdf7;color:#5a5d52;border-radius:7px;padding:5px 8px;font-size:calc(10.8px + var(--sw-font-adjust));cursor:pointer}.mini-setting-button:hover{background:var(--sw-accent-soft)}.mini-setting-button:disabled{opacity:.4;cursor:not-allowed}
.nav{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));align-items:stretch;border-top:1px solid var(--sw-line);background:rgba(251,250,245,.97);padding-bottom:env(safe-area-inset-bottom)}.nav button{min-width:0;min-height:50px;padding:8px 2px;border:0;color:#77796f;background:transparent;font-size:clamp(12px,3vw,13.5px);font-weight:660;cursor:pointer;white-space:nowrap;position:relative}.nav button[aria-selected="true"]{color:var(--sw-accent-dark);background:var(--sw-support-soft)}.nav button[aria-selected="true"]::before{content:"";position:absolute;top:0;left:22%;right:22%;height:2px;border-radius:2px;background:var(--sw-accent)}
.reference-divider{height:1px;background:linear-gradient(90deg,transparent,var(--sw-line) 12%,var(--sw-line) 88%,transparent);margin:18px 2px}
.api-presets{width:100%;max-width:100%;min-width:0;margin-top:12px;border:1px solid var(--sw-line);border-radius:11px;background:#fffaf2;padding:11px}.api-presets-head{display:flex;align-items:center;gap:8px}.api-presets-head>div{flex:1;min-width:0}.api-presets-list{width:100%;max-width:100%;min-width:0;display:grid;gap:7px;margin-top:9px}.api-preset-row{width:100%;max-width:100%;min-width:0;display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:8px;padding:8px 9px;border:1px solid var(--sw-line-soft);border-radius:9px;background:#fffdf7}.api-preset-main{flex:1;min-width:0}.api-preset-main b{display:block;font-size:calc(12px + var(--sw-font-adjust));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.api-preset-main small{display:block;color:var(--sw-muted);font-size:calc(10.5px + var(--sw-font-adjust));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.api-preset-row.active{border-color:#9eb7c5;background:#edf4f6}.api-preset-load{border:1px solid #cfc7b9;background:#fffaf1;border-radius:7px;padding:5px 8px;cursor:pointer;font-size:calc(10.8px + var(--sw-font-adjust));white-space:nowrap}.appearance-grid{display:grid;gap:12px}.appearance-block{padding:12px;border:1px solid var(--sw-line-soft);border-radius:11px;background:#fffaf2}.appearance-block h3{margin:0 0 5px}.appearance-block .api-field{margin-top:9px}
@media(max-width:620px){.backdrop{padding:0;place-items:stretch}.panel{width:100vw;height:100dvh;min-height:0;border-radius:0;border:0}.header{min-height:54px;padding:8px 10px 8px 14px}.title{font-size:calc(18px + var(--sw-font-adjust))}.version{font-size:calc(9.5px + var(--sw-font-adjust))}.content{padding:18px 12px 22px}.stack{gap:14px}.card{padding:15px 14px;border-radius:14px}.page-intro h1{font-size:calc(19px + var(--sw-font-adjust))}.overview{grid-template-columns:1fr}.status-grid{grid-template-columns:1fr 1fr}.actions{display:flex}.action{flex:1 1 150px}.detail-grid{grid-template-columns:1fr}.nav button{min-height:52px;font-size:clamp(12px,3.35vw,13.5px)}}
@media(max-width:390px){.status-grid{grid-template-columns:1fr}.actions{display:grid;grid-template-columns:1fr}.actions>.action{width:100%}.card-header>.action,.page-intro .card-header>.action{width:auto;max-width:46%;flex:0 0 auto}.card{padding:14px 13px}.content{padding-left:10px;padding-right:10px}}

.icon-action{width:32px;height:30px;border:0;background:transparent;color:#77796f;border-radius:7px;padding:5px;display:grid;place-items:center;cursor:pointer;flex:0 0 auto}.icon-action:hover{background:#f2eadf;color:#4b4d43}.icon-action.danger:hover{background:var(--sw-danger-bg);color:var(--sw-danger)}.icon-action:disabled{opacity:.4;cursor:not-allowed}.icon-action svg{width:17px;height:17px;display:block;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.person-tools{display:flex;align-items:center;gap:3px;margin-left:4px}.person-chevron{flex:0 0 auto;margin-left:2px}.person-card>summary .icon-action{position:relative;z-index:2}
.settings-tabs{display:flex;gap:5px;overflow-x:auto;padding:4px;border-radius:12px;background:#ece3d6;scrollbar-width:none}.settings-tabs::-webkit-scrollbar{display:none}.settings-tabs button{flex:1 0 68px;min-height:38px;border:0;border-radius:9px;background:transparent;color:#6b6d63;font-weight:680;cursor:pointer;padding:8px 10px}.settings-tabs button[aria-selected="true"]{background:#fffdf7;color:#31332b;box-shadow:0 1px 5px rgba(60,58,48,.08)}
.font-scale-control{display:grid;grid-template-columns:46px minmax(100px,1fr) 46px;align-items:center;gap:10px;margin-top:12px}.font-scale-button{height:40px;border:1px solid #d8ccbb;border-radius:10px;background:#fffdf7;color:#4d5147;cursor:pointer;font-size:calc(20px + var(--sw-font-adjust));line-height:1}.font-scale-button:hover{background:var(--sw-accent-soft);border-color:#9bb9c8}.font-scale-button:disabled{opacity:.4;cursor:not-allowed}.font-scale-value{height:40px;border:1px solid var(--sw-line-soft);border-radius:10px;background:#faf4e8;display:grid;place-items:center;font-size:calc(14px + var(--sw-font-adjust));font-weight:720;color:#3d4036}
.model-mode{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}.model-mode label{min-width:0;display:flex;align-items:flex-start;gap:9px;padding:11px 12px;border:1px solid var(--sw-line);border-radius:11px;background:#fffaf2;cursor:pointer}.model-mode label>span{min-width:0}.model-mode label:has(input:checked){border-color:#90acbd;background:#edf4f6;box-shadow:0 0 0 1px rgba(67,108,133,.08)}.model-mode input{margin-top:3px;accent-color:var(--sw-accent)}.model-mode b{display:block;font-size:calc(12.5px + var(--sw-font-adjust));color:var(--sw-text)}.model-mode small{display:block;margin-top:2px;color:var(--sw-muted);font-size:calc(10.8px + var(--sw-font-adjust));line-height:1.45;overflow-wrap:anywhere}.api-form{width:100%;max-width:100%;min-width:0;display:grid;gap:10px;margin-top:12px}.api-field>span{display:block;margin-bottom:5px;color:var(--sw-muted);font-size:calc(11px + var(--sw-font-adjust));font-weight:650}.api-input-row{width:100%;max-width:100%;min-width:0;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;align-items:center}.api-input-row .setting-text{width:100%;max-width:100%;min-width:0;margin-top:0}.api-inline-button{flex:0 0 auto;min-height:39px;border:1px solid #d8ccbb;border-radius:9px;padding:7px 10px;background:#fffdf7;color:#53606a;cursor:pointer;font-weight:650}.api-inline-button:hover{background:var(--sw-accent-soft);border-color:#a8becb}.api-inline-button:disabled{opacity:.45;cursor:not-allowed}.api-model-section{border:1px solid var(--sw-line);border-radius:10px;background:#fffaf2;overflow:hidden}.api-model-section summary{padding:9px 11px;cursor:pointer;color:#5e5a53;font-size:calc(11.5px + var(--sw-font-adjust));font-weight:650}.api-model-body{padding:0 9px 9px}.api-model-list{max-height:210px;overflow:auto;display:grid;gap:4px;margin-top:7px}.api-model-item{width:100%;text-align:left;border:1px solid transparent;border-radius:8px;padding:8px 9px;background:#fffdf7;color:#3f4447;cursor:pointer;font-size:calc(11.5px + var(--sw-font-adjust));word-break:break-word}.api-model-item:hover,.api-model-item.active{border-color:#aac0cc;background:#edf4f6;color:#35586e}.api-empty{padding:10px;color:var(--sw-faint);font-size:calc(11.5px + var(--sw-font-adjust))}.api-advanced{margin-top:11px;border-top:1px solid var(--sw-line-soft);padding-top:10px}.api-advanced summary{cursor:pointer;color:var(--sw-muted);font-size:calc(11.5px + var(--sw-font-adjust));font-weight:650}.api-save-row{display:flex;justify-content:flex-end;margin-top:12px}.api-save-row .action{min-width:130px}.token-setting-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:10px}.token-setting-grid .api-field small{display:block;margin-top:5px;color:var(--sw-faint);font-size:calc(10.5px + var(--sw-font-adjust));line-height:1.5}.token-setting-grid [hidden]{display:none!important}.token-budget-box{margin-top:10px;border:1px solid #bfd0c7;border-radius:11px;background:#f2f7f2;padding:10px 11px}.token-budget-box.near{border-color:#dfbf8d;background:#fff7ea}.token-budget-box.blocked{border-color:#d5a5a1;background:#fff0ee}.token-budget-box.unknown{border-color:#c7c2b5;background:#f8f4eb}.token-budget-title{display:flex;justify-content:space-between;gap:8px;align-items:center;color:#3d4c44}.token-budget-title>span{font-weight:720}.token-budget-title>b{font-size:calc(10.8px + var(--sw-font-adjust));color:var(--sw-accent)}.token-budget-box.near .token-budget-title>b{color:#9a6a32}.token-budget-box.blocked .token-budget-title>b{color:var(--sw-danger)}.token-budget-box.unknown .token-budget-title>b{color:#716b61}.token-budget-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px 12px;margin-top:7px;color:#5b5d55;font-size:calc(11px + var(--sw-font-adjust))}.token-budget-grid b{color:var(--sw-text)}.token-budget-box p{margin:7px 0 0;color:var(--sw-muted);font-size:calc(10.7px + var(--sw-font-adjust));line-height:1.5}.token-budget-box p small{opacity:.8}.maintenance-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}.maintenance-item{border:1px solid var(--sw-line-soft);background:#fffaf2;border-radius:10px;padding:11px}.maintenance-item b{display:block;margin-bottom:4px}.maintenance-item p{margin:0 0 9px}.maintenance-item .action{width:100%;min-height:35px}
.modal-layer{position:absolute;inset:0;z-index:120;background:rgba(48,48,42,.46);display:flex;align-items:center;justify-content:center;overflow:auto;overscroll-behavior:contain;padding:max(18px,env(safe-area-inset-top)) max(14px,env(safe-area-inset-right)) max(18px,env(safe-area-inset-bottom)) max(14px,env(safe-area-inset-left))}.modal-dialog{width:min(520px,92vw);max-height:calc(var(--sw-vv-height,100dvh) - 36px);overflow:auto;border:1px solid var(--sw-line);border-radius:17px;background:var(--sw-card);box-shadow:0 20px 60px rgba(42,42,36,.28);padding:18px;margin:auto}.modal-dialog.person-editor{width:min(590px,92vw)}.dialog-error{margin-top:10px;padding:8px 10px;border-radius:9px;background:var(--sw-danger-bg);color:var(--sw-danger);font-size:calc(11.5px + var(--sw-font-adjust));line-height:1.5}.dialog-error:empty{display:none}.modal-dialog h2{margin:0 0 6px;font-size:calc(17px + var(--sw-font-adjust));line-height:1.35;color:var(--sw-text)}.modal-dialog>p{margin:0 0 13px;color:var(--sw-muted);font-size:calc(12px + var(--sw-font-adjust));line-height:1.65}.modal-message{white-space:pre-wrap;word-break:break-word;color:#46483f;font-size:calc(12.5px + var(--sw-font-adjust));line-height:1.72;margin:8px 0 0}.modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:17px}.modal-actions .action{min-width:86px}.modal-actions .action.danger-fill{background:var(--sw-danger);border-color:var(--sw-danger);color:#fff}.modal-actions .action.danger-fill:hover{background:#844742;border-color:#844742}.editor-field{display:block;margin-top:11px}.editor-field>span{display:block;font-size:calc(11px + var(--sw-font-adjust));color:var(--sw-muted);font-weight:650;margin-bottom:5px}.editor-field input,.editor-field textarea{width:100%;border:1px solid #d8ccbb;background:#fffdf7;color:var(--sw-text);border-radius:9px;padding:9px 10px;outline:none}.editor-field textarea{min-height:92px;resize:vertical;line-height:1.55}.editor-field input:focus,.editor-field textarea:focus{border-color:#7fa2b6;box-shadow:0 0 0 2px rgba(67,108,133,.10)}.editor-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:15px}
@media(max-width:620px){.token-setting-grid{grid-template-columns:1fr}.maintenance-grid{grid-template-columns:1fr}.modal-layer{padding:max(12px,env(safe-area-inset-top)) 10px max(12px,env(safe-area-inset-bottom))}.modal-dialog,.modal-dialog.person-editor{width:100%;max-height:calc(var(--sw-vv-height,100dvh) - 24px);border-radius:15px;padding:16px}.modal-actions,.editor-actions{position:sticky;bottom:-16px;background:linear-gradient(to top,var(--sw-card) 72%,rgba(255,254,249,0));padding:14px 0 2px;margin-top:12px}.card-header{align-items:flex-start}.card-header>.action{width:auto;flex:0 0 auto;min-width:70px;max-width:42%;white-space:nowrap}.settings-tabs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:3px;overflow:visible}.settings-tabs button{min-width:0;min-height:38px;padding:8px 2px;white-space:nowrap;font-size:calc(11.5px + var(--sw-font-adjust))}.model-mode{grid-template-columns:1fr}.api-presets-head{flex-direction:column;align-items:stretch}.api-presets-head .api-inline-button{width:100%}.api-input-row{min-width:0}.api-field{min-width:0}.api-model-row{grid-template-columns:minmax(0,1fr)}.api-model-row .api-inline-button{width:100%}.api-preset-row{gap:6px;padding:8px}.api-preset-load{padding-left:7px;padding-right:7px}}
`;

function escapeHtml(value) {
function isLifecycleCancellation(error){return error?.code==='SCENEWORLD_TASK_CANCELLED'||error?.code==='SCENEWORLD_CHAT_CHANGED'||error?.name==='AbortError'}
    return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
}
function iconSvg(name) {
    if (name === 'edit') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l4.2-1 10.2-10.2a2.1 2.1 0 0 0-3-3L5.2 16 4 20z"></path><path d="M13.8 7.4l2.8 2.8"></path></svg>';
    if (name === 'trash') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M7 7l1 13h8l1-13"></path><path d="M10 11v5M14 11v5"></path></svg>';
    return '';
}
function editIconButton(attrs='', disabled=false) { return `<button class="icon-action" type="button" title="修改" aria-label="修改" ${attrs} ${disabled?'disabled':''}>${iconSvg('edit')}</button>`; }
function trashIconButton(attrs='', disabled=false) { return `<button class="icon-action danger" type="button" title="删除" aria-label="删除" ${attrs} ${disabled?'disabled':''}>${iconSvg('trash')}</button>`; }
function helpButton(topic, label='查看说明') { return `<button class="info-button" type="button" data-help-topic="${escapeHtml(topic)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">ⓘ</button>`; }
function fontScaleToAdjust(scale) { const value=Math.max(80,Math.min(130,Number(scale)||100)); return 1.5 + (value-100)/10; }
function baiBaiStatusText(status) { return status?.available ? `已检测到柏宝书接口${status.pluginVersion?` · ${status.pluginVersion}`:''}` : '当前未检测到柏宝书接口；不可用时会自动跳过'; }
function formatBytes(bytes){const n=Number(bytes)||0;if(n<1024)return`${n} B`;if(n<1024*1024)return`${(n/1024).toFixed(1)} KB`;return`${(n/1024/1024).toFixed(2)} MB`}
function formatTokenCount(value){const n=Number(value)||0;if(n>=1000000)return`${(n/1000000).toFixed(n>=10000000?0:1)}M`;if(n>=1000)return`${(n/1000).toFixed(n>=100000?0:1)}K`;return String(Math.round(n))}
function tokenBudgetHint(budget){
    if(!budget)return'';
    if(budget.status==='calculating')return'<div class="token-budget-box"><div class="token-budget-title">Token 预算</div><p>正在根据完整提示词估算输入 Token…</p></div>';
    const input=formatTokenCount(budget.inputTokens);
    const output=formatTokenCount(budget.outputTokens);
    const context=budget.contextTokens?formatTokenCount(budget.contextTokens):'未知';
    const total=formatTokenCount(budget.totalTokens);
    let cls='safe',label='余量充足',note='';
    if(budget.status==='blocked'){cls='blocked';label='预计超出安全范围';note='不会自动截断正文，请减少单批楼层、参考条目，或切换上下文更充足的模型。'}
    else if(budget.status==='near'){cls='near';label='接近上下文上限';note='建议减少单批楼层或参考内容，给模型输出留出更宽裕空间。'}
    else if(budget.status==='unknown'){cls='unknown';label='已估算输入';note='当前连接无法可靠取得总上下文上限，世界动态不会要求额外填写；最终容量由 API 服务端判断。'}
    else note='已为输出上限和估算误差预留安全空间。';
    const method=budget.tokenMethod==='tavern-tokenizer'?'酒馆分词器估算':'近似估算';
    return `<div class="token-budget-box ${cls}"><div class="token-budget-title"><span>Token 预算</span><b>${label}</b></div><div class="token-budget-grid"><span>预计输入 <b>${input}</b></span><span>输出上限 <b>${output}</b></span><span>预计总需求 <b>${total}</b></span><span>上下文 <b>${context}</b></span></div><p>${escapeHtml(note)} <small>${escapeHtml(method)}</small></p></div>`;
}
function latestSyncText(state){
    const sync=state?.sync;
    if(!String(state?.world?.summary||'').trim())return'尚未建立有效世界基线';
    if(!Number.isInteger(sync?.lastProcessedAssistantMessageId))return'尚未推演 AI 正文';
    const start=Number.isInteger(sync.lastProcessedAssistantRangeStartId)?sync.lastProcessedAssistantRangeStartId:sync.lastProcessedAssistantMessageId;
    const count=Number(sync.lastProcessedAssistantCount)||1;
    return start===sync.lastProcessedAssistantMessageId?`已推演 AI #${sync.lastProcessedAssistantMessageId}`:`已推演 AI #${start}～#${sync.lastProcessedAssistantMessageId} · ${count} 条`;
}
function timeLabel(value){if(!value)return'尚未刷新';try{return new Date(value).toLocaleString()}catch{return String(value)}}

function currentWorldHtml(state) {
    if (!state) return '';
    const moments = Array.isArray(state.world?.moments) ? state.world.moments : [];
    const time = state.world?.time ? `<span class="meta-pill">◷ ${escapeHtml(state.world.time)}</span>` : '';
    const place = state.world?.location ? `<span class="meta-pill">⌖ ${escapeHtml(state.world.location)}</span>` : '';
    const summary = state.world?.summary || '当前世界基线尚未建立。请重新读取待推演剧情并执行一次世界推演。';
    return `<div class="card"><div class="card-header"><div><h2>当前世界</h2><div class="card-subtitle">待推演区间结束时仍然成立的当前世界基线</div></div></div><p class="overview-summary">${escapeHtml(summary)}</p>${time||place?`<div class="overview-meta">${time}${place}</div>`:''}${moments.length?`<div class="section-divider"></div><div class="section-title"><h3>正在发生</h3><span class="count">${moments.length} 条</span></div><div class="item-list">${moments.map(item=>`<div class="item"><b>${escapeHtml(item.title)}</b>${item.text?`<p>${escapeHtml(item.text)}</p>`:''}</div>`).join('')}</div>`:''}</div>`;
}

function transcriptHtml(messages) {
    if (!Array.isArray(messages) || !messages.length) return '<div class="note">无。</div>';
    return `<div class="transcript">${messages.map(item=>`<div class="message"><div class="who">#${item.id} · AI · ${escapeHtml(item.name)}</div><div class="body">${escapeHtml(item.text)}</div></div>`).join('')}</div>`;
}

function pendingPreviewHtml(preview) {
    const batch=preview?.batch;
    if(!batch)return '<div class="note">尚未读取待推演剧情。每次只会读取当前设置允许的单批 AI 正文。</div>';
    if(batch.anchorChanged)return `<div class="note error">${escapeHtml(batch.anchorReason)}</div>`;
    if(!batch.hasPending)return '<div class="note">当前没有新的 AI 正文需要推演。</div>';
    const budgetNote=tokenBudgetHint(preview?.tokenBudget)+(preview?.tokenBudgetError?`<div class="note warning">Token 预算估算失败：${escapeHtml(preview.tokenBudgetError)}。为避免盲目发送，本轮推演按钮暂时禁用；请重新读取或检查模型设置。</div>`:'');
    const previous=Number.isInteger(batch.lastProcessedAssistantMessageId)?`AI #${batch.lastProcessedAssistantMessageId}`:'无（首次推演）';
    let windowNote='';
    if(batch.isInitialBatch&&batch.initialMode==='latest'){
        windowNote=`<div class="note">首次推演采用“从当前开始”：只读取当前聊天最近最多 ${batch.limits.maxPendingAssistantMessages||10} 条 AI 正文。${batch.skippedOlderNarrative?'更早正文已主动跳过，不会一次性回灌。':''}</div>`;
    }else if(batch.isInitialBatch&&batch.initialMode==='from_floor'){
        windowNote=`<div class="note">首次推演从指定楼层 #${batch.requestedStartFloor} 开始，本轮最多处理 ${batch.limits.maxPendingAssistantMessages||10} 条 AI 正文。${batch.hasMoreAfterBatch?'后面还有未推演正文，完成本轮后再次读取即可继续下一批。':''}</div>`;
    }else if(batch.hasMoreAfterBatch){
        windowNote=`<div class="note">本轮已按上限截成 ${batch.limits.maxPendingAssistantMessages||10} 条。后面还有未推演正文，完成后再次“读取待推演剧情”即可继续下一批。</div>`;
    }
    return `<div class="status-grid"><div class="status"><b>上次推演</b><span>${previous}</span></div><div class="status"><b>本批范围</b><span>#${batch.startId}～#${batch.endId}</span></div><div class="status"><b>本批正文</b><span>${batch.assistantCount} / ${batch.limits.maxPendingAssistantMessages||10} 条 AI 正文${batch.ignoredAssistantCount?` · 忽略 ${batch.ignoredAssistantCount} 条未命中标签的 AI 消息`:''}</span></div><div class="status"><b>正文规模</b><span>${batch.characters} 字符</span></div></div>${windowNote}${budgetNote}<details class="preview-details" open><summary>预览本批标签内正文</summary>${transcriptHtml(batch.pendingMessages)}</details>`;
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
            return `<details class="book-picker" data-preserve-key="${escapeHtml(`${purpose}:${book.id||book.name}`)}" data-book-purpose="${purpose}" data-book-id="${escapeHtml(book.id||book.name)}"><summary><span data-book-name>${escapeHtml(book.name)}</span> · 已选 <span data-book-selected>${selectedInBook}</span> / <span data-book-total>${entries.length}</span> 条</summary><div class="book-tools"><button class="mini-setting-button" type="button" data-world-entry-batch="all" data-world-entry-purpose="${purpose}" data-world-entry-ids='${encodedIds}' ${busy||!entries.length?'disabled':''}>全选本书</button><button class="mini-setting-button" type="button" data-world-entry-batch="none" data-world-entry-purpose="${purpose}" data-world-entry-ids='${encodedIds}' ${busy||!entries.length?'disabled':''}>清空本书</button></div><div class="book-list">${rows}</div></details>`;
        }).join('');
        return `<div class="note" data-entry-summary="${purpose}">${title}：已选 <span data-entry-selected>${selected}</span> / <span data-entry-total>${total}</span> 条。首次默认跟随酒馆启用状态，之后以这里的手动选择为准。</div>${groups}`;
    };

    return `<div class="card"><div class="card-header"><div><h2>世界观与长期参考</h2><div class="card-subtitle">世界推演和见闻分别选择要传输的条目</div></div>${helpButton('reference','查看参考资料规则')}</div>
      <div class="section-title"><h3>世界推演参考</h3></div>
      <div class="setting-grid">
        <label class="setting-row"><input type="checkbox" data-world-ref-setting="includeCharacterDescription" ${descriptionChecked?'checked':''} ${busy?'disabled':''}><span><b>传输角色描述</b><small>只给世界推演使用；见闻不读取角色描述。</small></span></label>
        <label class="setting-row"><input type="checkbox" data-world-ref-setting="simulationUseBaiBaiBook" ${settings.simulationUseBaiBaiBook===true?'checked':''} ${busy?'disabled':''}><span><b>世界推演使用柏宝书长期历史</b><small><span data-baibai-status="simulation">${escapeHtml(baiBaiStatusText(simulationBaiBai))}</span>。默认最多 ${Number(settings.baibaiHistoryMaxChars)||8000} 字符。</small></span></label>
      </div>
      ${entryPicker(simulationBooks,'simulation','世界推演条目')}

      <div class="reference-divider" aria-hidden="true"></div><div class="section-title"><h3>见闻参考</h3></div>
      <div class="setting-grid">
        <label class="setting-row"><input type="checkbox" data-world-ref-setting="observationUseBaiBaiBook" ${settings.observationUseBaiBaiBook===true?'checked':''} ${busy?'disabled':''}><span><b>见闻使用柏宝书长期历史</b><small><span data-baibai-status="observation">${escapeHtml(baiBaiStatusText(observationBaiBai))}</span>。只用于理解较早背景，不会替代当前世界状态。</small></span></label>
      </div>
      ${entryPicker(observationBooks,'observation','见闻条目')}
    </div>`;
}

function initialSettlementSettingsHtml(actions, busy, state) {
    const settings = actions?.getSettings?.() ?? {};
    const anchor = String(state?.world?.summary||'').trim() ? state?.sync?.lastProcessedAssistantMessageId : null;
    const mode = settings.initialSettlementMode === 'from_floor' ? 'from_floor' : 'latest';
    const floor = Number.isFinite(Number(settings.initialStartFloor)) ? Math.max(0, Math.trunc(Number(settings.initialStartFloor))) : 0;
    const batchSize = Number(settings.maxPendingAssistantMessages) === 5 ? 5 : 10;
    const anchorNote = Number.isInteger(anchor)
        ? `<div class="note">当前聊天已经建立推演锚点 AI #${anchor}，因此会继续从锚点之后读取。下面的“首次推演起点”仍可预先设置，但不会覆盖当前锚点；如果要让本聊天从指定楼层重新构建，请先清理当前聊天的 世界动态数据。</div>`
        : `<div class="note">旧聊天首次使用时，“从当前开始”只取最近一批正文；选择“从指定楼层开始”后，会从该楼层起按批次向后推演。指定起点的第一批成功后，后续自动沿锚点继续。</div>`;
    return `<div class="card"><h2>推演批次</h2><p>控制每次世界推演读取多少条 AI 正文，以及尚未建立世界动态时从哪里开始。</p>
      <label><span class="meta">单批最多读取</span><select class="setting-text" data-pending-batch-size ${busy?'disabled':''}><option value="10" ${batchSize===10?'selected':''}>10 条 AI 正文（推荐）</option><option value="5" ${batchSize===5?'selected':''}>5 条 AI 正文</option></select></label>
      <label><span class="meta">首次推演起点</span><select class="setting-text" data-initial-settlement-mode ${busy?'disabled':''}><option value="latest" ${mode==='latest'?'selected':''}>从当前开始</option><option value="from_floor" ${mode==='from_floor'?'selected':''}>从指定楼层开始</option></select></label>
      <label data-initial-start-floor-wrap ${mode==='from_floor'?'':'hidden'}><span class="meta">起始楼层编号 #</span><input class="setting-text" type="number" min="0" step="1" data-initial-start-floor value="${floor}" ${busy?'disabled':''}></label>
      ${anchorNote}<div class="note">剧情先后始终以 AI 楼层顺序为主。正文中出现明确日期或时间时会同步记录为“剧情时间”；本轮没有新日期时沿用上一轮已确认的剧情时间，不会自行编造日期。</div>
    </div>`;
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
    const canSimulate=!!batch?.canSimulate && !!preview?.tokenBudget && preview?.tokenBudget?.status !== 'blocked' && preview?.tokenBudget?.status !== 'calculating' && !busy;
    return `<div class="stack">
        <div class="page-intro"><div class="page-kicker">当前世界</div><div class="page-title-row"><h1>此刻</h1>${helpButton('home')}</div><p>查看当前世界状态、剧情时间与下一步。</p></div>
        ${state?currentWorldHtml(state):`<div class="card soft"><h2>尚未建立当前世界</h2><p>第一次使用时，先读取待推演剧情并完成一次世界推演。旧聊天默认只从最近最多 10 条 AI 正文开始，不会回灌全部历史。</p></div>`}
        ${actionSuggestionsHtml(state,busy)}
        <div class="card"><div class="card-header"><div><h2>世界推演</h2><div class="card-subtitle">读取只在本地进行；真正推演时才调用一次模型</div></div>${busy?'<span class="meta-pill neutral">处理中</span>':''}</div><div class="status-grid"><div class="status compact"><b>正文同步</b><span>${escapeHtml(latestSyncText(state))}</span></div><div class="status compact"><b>剧情时间</b><span>${escapeHtml(state?.sync?.lastProcessedStoryTime||state?.world?.time||'尚未识别')}</span></div><div class="status compact"><b>最近推演</b><span>${state?.sync?.lastProcessedAt?escapeHtml(timeLabel(state.sync.lastProcessedAt)):'尚未推演'}</span></div><div class="status compact"><b>当前数据</b><span>${info.dataExists?formatBytes(info.totalBytes):'尚未创建'}</span></div></div><div class="actions"><button class="action" type="button" data-action="read-pending" ${busy?'disabled':''}>读取待推演剧情</button><button class="action primary" type="button" data-action="simulate" ${canSimulate?'':'disabled'}>推演本批剧情</button></div>${pendingPreviewHtml(preview)}</div>
        <div class="note"><div class="tip"><span class="tip-mark">i</span><span>世界动态当前仅进行手动推演。调整正文标签、首次结算起点，开启世界书条目或记忆插件前往设置中管理。</span></div></div>
    </div>`;
}

function modelAdvancedSettingsHtml(actions, busy) {
    const settings=actions?.getSettings?.()??{};
    const maxOutput=Math.max(1024,Math.min(65536,Math.trunc(Number(settings.modelMaxOutputTokens)||8000)));
    return `<details class="card api-advanced model-advanced-card"><summary>高级设置（通常无需修改）</summary><div class="api-model-body">
        <label class="api-field"><span>最大回复 Token</span><input class="setting-text" type="number" min="1024" max="65536" step="1024" data-model-max-output value="${maxOutput}" ${busy?'disabled':''}><small>默认 8000。这里只限制模型最多回复多少内容，不限制发送给模型的正文长度；如果推理模型经常因为长度被截断，再适当提高即可。</small></label>
        <div class="note">发送给模型的输入量不需要手动填写上限。读取待推演剧情后会自动估算完整输入：酒馆当前连接能读取上下文上限时，按上下文容量的 95% 作为总安全线（输入 + 最大回复），超出时会阻止推演；自定义 API 无法可靠识别上下文上限时只显示输入估算，由 API 服务端最终判断容量。</div>
    </div></details>`;
}

function modelSettingsHtml(actions, busy) {
    const settings=actions?.getSettings?.()??{};
    const mode=settings.modelConnectionMode==='custom'?'custom':'tavern';
    const custom=mode==='custom';
    const presets=Array.isArray(settings.apiPresets)?settings.apiPresets:[];
    const activeId=String(settings.apiPresetActiveId||'');
    const presetRows=presets.length?presets.map(item=>`<div class="api-preset-row ${item.id===activeId?'active':''}" data-api-preset-row="${escapeHtml(item.id)}"><div class="api-preset-main"><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.model||'未指定模型')} · ${escapeHtml(item.url||'')}</small></div><button class="api-preset-load" type="button" data-load-api-preset="${escapeHtml(item.id)}" ${busy?'disabled':''}>载入</button>${trashIconButton(`data-delete-api-preset="${escapeHtml(item.id)}"`,busy)}</div>`).join(''):'<div class="api-empty">还没有保存 API 配置。</div>';
    const connectionCard=`<div class="card"><div class="card-header"><div><h2>模型与连接</h2><div class="card-subtitle">所有世界动态模型任务共用这里的连接方式</div></div></div>
        <div class="model-mode">
            <label><input type="radio" name="sw-model-mode" value="tavern" data-model-mode ${mode==='tavern'?'checked':''} ${busy?'disabled':''}><span><b>酒馆当前连接</b><small>复用当前模型、连接与采样参数；世界动态仍使用自己的任务提示词与参考资料。</small></span></label>
            <label><input type="radio" name="sw-model-mode" value="custom" data-model-mode ${custom?'checked':''} ${busy?'disabled':''}><span><b>自定义 API</b><small>使用独立的 OpenAI 兼容地址、Key 和模型，不改变酒馆聊天连接。</small></span></label>
        </div>
        ${custom?`<div class="api-form">
            <div class="api-presets"><div class="api-presets-head"><div><b>API 配置库</b><div class="card-subtitle">只保存地址、Key 和模型，方便快速切换不同来源。</div></div><button class="api-inline-button" type="button" data-save-api-preset ${busy?'disabled':''}>保存当前配置</button></div><div class="api-presets-list">${presetRows}</div></div>
            <label class="api-field"><span>API 地址（Base URL）</span><input class="setting-text" type="url" data-custom-api-url placeholder="例如 https://api.openai.com/v1" value="${escapeHtml(settings.customApiUrl||'')}" autocomplete="off"></label>
            <label class="api-field"><span>API Key</span><div class="api-input-row api-key-row"><input class="setting-text" type="password" data-custom-api-key placeholder="API Key" value="${escapeHtml(settings.customApiKey||'')}" autocomplete="new-password"><button class="api-inline-button" type="button" data-toggle-api-key title="显示 / 隐藏 Key">显示</button></div></label>
            <label class="api-field"><span>模型</span><div class="api-input-row api-model-row"><input class="setting-text" type="text" data-custom-api-model placeholder="输入模型名称，或读取列表后选择" value="${escapeHtml(settings.customApiModel||'')}" autocomplete="off"><button class="api-inline-button" type="button" data-fetch-api-models ${busy?'disabled':''}>读取模型</button></div></label>
            <details class="api-model-section" data-api-model-section style="display:none"><summary data-api-model-count>模型列表</summary><div class="api-model-body"><input class="setting-text" type="search" data-api-model-search placeholder="搜索模型…" autocomplete="off"><div class="api-model-list" data-api-model-list></div></div></details>
            <details class="api-advanced"><summary>连接高级设置</summary><label class="api-field"><span>请求超时（秒）</span><input class="setting-text" type="number" min="30" max="600" step="10" data-custom-api-timeout value="${Number(settings.customApiTimeoutSec)||180}"></label><div class="note">通常保持默认即可。“读取模型”只在主动点击时请求模型列表。</div></details>
            <div class="api-save-row"><button class="action primary" type="button" data-save-custom-api ${busy?'disabled':''}>保存并生效</button></div>
        </div>`:`<div class="note">当前方式复用酒馆已经连接的模型、连接与采样参数。世界动态不会自动再次拼入普通聊天正文、世界书或角色卡提示词；参考资料只以“参考”分页里的选择为准。</div>`}
    </div>`;
    return `${connectionCard}${modelAdvancedSettingsHtml(actions,busy)}`;
}

function appearanceSettingsHtml(actions, busy) {
    const settings=actions?.getSettings?.()??{};
    const value=Math.max(80,Math.min(130,Math.round((Number(settings.uiScalePercent)||100)/5)*5));
    return `<div class="card"><div class="card-header"><div><h2>外观</h2><div class="card-subtitle">只调整世界动态，不影响酒馆本身</div></div></div><div class="appearance-grid">
        <div class="appearance-block"><h3>界面大小</h3><p>当前视觉大小定义为 100%，可按 5% 微调。</p><div class="font-scale-control"><button class="font-scale-button" type="button" data-font-scale-step="-5" ${busy||value<=80?'disabled':''}>−</button><div class="font-scale-value" data-font-scale-value>${value}%</div><button class="font-scale-button" type="button" data-font-scale-step="5" ${busy||value>=130?'disabled':''}>＋</button></div><div class="note">范围 80%～130%。100% 即当前默认视觉大小。</div></div>
    </div></div>`;
}

function dataMaintenanceSettingsHtml(busy) {
    const info=inspectSceneWorldStorage();
    const state=readSceneWorldState();
    const people=state?.people?.length||0;
    const opinion=(state?.publicOpinion?.news?.length||0)+(state?.publicOpinion?.forum?.length||0)+(state?.publicOpinion?.street?.length||0)+(state?.guidance?.places?.length||0);
    const continuity=(state?.world?.facts?.length||0)+(state?.continuity?.recentDynamics?.length||0);
    const chronicle=state?.chronicle?.length||0;
    const guidance=state?.guidance?.actions?.length||0;
    return `<div class="card"><h2>数据与维护</h2><p>分块清理只删除对应的世界动态数据，不会删除聊天正文，也不会改动其他插件。</p><div class="status-grid"><div class="status"><b>当前聊天数据</b><span>${info.dataExists?`已创建 · ${formatBytes(info.totalBytes)}`:'未创建'}</span></div><div class="status"><b>正文同步</b><span>${escapeHtml(latestSyncText(state))}</span></div></div>${info.dataExists?`<div class="maintenance-grid"><div class="maintenance-item"><b>人物</b><p>${people} 人。保留其他世界状态。</p><button class="action danger" type="button" data-clear-section="people" ${busy?'disabled':''}>清理人物</button></div><div class="maintenance-item"><b>见闻</b><p>${opinion} 条。包括新闻、论坛、市井闲闻和地点建议。</p><button class="action danger" type="button" data-clear-section="observation" ${busy?'disabled':''}>清理见闻</button></div><div class="maintenance-item"><b>脉络</b><p>${continuity} 条。包括持续性事实与最近 5 次动态。</p><button class="action danger" type="button" data-clear-section="continuity" ${busy?'disabled':''}>清理脉络</button></div><div class="maintenance-item"><b>行动建议</b><p>${guidance} 条。只清理“此刻”的下一步建议。</p><button class="action danger" type="button" data-clear-section="guidance" ${busy?'disabled':''}>清理建议</button></div><div class="maintenance-item"><b>纪事</b><p>${chronicle} 条收藏。</p><button class="action danger" type="button" data-clear-section="chronicle" ${busy?'disabled':''}>清理纪事</button></div></div><div class="section-divider"></div><div class="actions"><button class="action danger" type="button" data-action="clear" ${busy?'disabled':''}>清理当前聊天全部世界动态数据</button></div>`:''}</div>`;
}
function settingsHtml(actions, busy, entryChoices, activeSettingsView='simulation') {
    const state=readSceneWorldState();
    const tabs=SETTINGS_TABS.map(([key,label])=>`<button type="button" data-settings-view="${key}" aria-selected="${key===activeSettingsView}">${label}</button>`).join('');
    let body='';
    if(activeSettingsView==='model') body=modelSettingsHtml(actions,busy);
    else if(activeSettingsView==='reference') body=worldReferenceSettingsHtml(actions,busy,entryChoices);
    else if(activeSettingsView==='data') body=dataMaintenanceSettingsHtml(busy);
    else if(activeSettingsView==='appearance') body=appearanceSettingsHtml(actions,busy);
    else body=`${narrativeScopeSettingsHtml(actions,busy)}${initialSettlementSettingsHtml(actions,busy,state)}`;
    return `<div class="stack"><div class="page-intro"><div class="page-kicker">插件设置</div><h1>设置</h1><p>按功能分区管理推演、模型、参考资料、外观和数据。这里的选择不会改变酒馆原本的聊天设置。</p></div><div class="settings-tabs" role="tablist" aria-label="设置分区">${tabs}</div>${body}</div>`;
}

function peopleHtml(state, busy) {
    if (!state) return emptySection('人物');
    const items = Array.isArray(state.people) ? state.people : [];
    const intro=`<div class="page-intro"><div class="page-kicker">人物状态</div><div class="card-header"><div><div class="page-title-row"><h1>人物</h1>${helpButton('people')}</div><p>查看人物当前位置；需要时可手动维护。</p></div><button class="action" type="button" data-add-person ${busy?'disabled':''}>＋ 添加人物</button></div></div>`;
    if (!items.length) return `<div class="stack">${intro}<div class="card"><p class="empty">当前没有人物状态，可以等待世界推演识别，也可以手动添加。</p></div></div>`;
    return `<div class="stack">${intro}<div class="item-list">${items.map(person=>{
        const details=Array.isArray(person.details)?person.details:[];
        const knowledge=(Array.isArray(person.knowledge)?person.knowledge:[]).slice(-6).map(item=>escapeHtml(typeof item==='string'?item:item.text)).filter(Boolean);
        const initials=String(person.name||'?').trim().slice(0,1) || '?';
        const line=person.location ? `位置：${person.location}` : '位置：尚未识别';
        const cells=[];
        if(person.location)cells.push(`<div class="detail-cell"><b>当前位置</b><span>${escapeHtml(person.location)}</span></div>`);
        if(person.status)cells.push(`<div class="detail-cell"><b>当前状态</b><span>${escapeHtml(person.status)}</span></div>`);
        for(const item of details.slice(0,12)){if(item?.label&&item?.value)cells.push(`<div class="detail-cell"><b>${escapeHtml(item.label)}</b><span>${escapeHtml(item.value)}</span></div>`)}
        const attrsEdit=`data-edit-person="${escapeHtml(person.id)}"`;
        const attrsDelete=`data-remove-person="${escapeHtml(person.id)}"`;
        return `<details class="card person-card" data-preserve-key="person:${escapeHtml(person.id)}"><summary><div class="person-summary"><div class="person-avatar">${escapeHtml(initials)}</div><div class="person-main"><b>${escapeHtml(person.name||'未命名人物')}</b><div class="person-line">${escapeHtml(line)}</div></div><div class="person-tools">${editIconButton(attrsEdit,busy)}${trashIconButton(attrsDelete,busy)}<span class="person-chevron">⌄</span></div></div></summary><div class="person-detail">${cells.length?`<div class="detail-grid">${cells.join('')}</div>`:''}${knowledge.length?`<div class="knowledge-box"><b>已确认认知</b><br>${knowledge.join('；')}</div>`:''}${person.manualEditedAt?`<div class="meta">手动维护：${escapeHtml(timeLabel(person.manualEditedAt))}</div>`:''}${!cells.length&&!knowledge.length?'<p class="empty">当前没有更多需要展开的信息。</p>':''}</div></details>`;
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
    const simulationReady = Boolean(String(state?.world?.summary||'').trim()) && Number.isInteger(state?.sync?.lastProcessedAssistantMessageId);
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
    const streetView=`<div class="card"><div class="card-header"><div><h2>街巷漫游</h2><div class="card-subtitle">每次生成生活化市井闲闻与 3～5 个可探索地点</div></div><button class="action primary" type="button" data-action="refresh-street" ${(busy||!simulationReady)?'disabled':''}>漫游</button></div>${simulationReady?'':'<div class="note warning">请先完成至少一次世界推演，建立当前世界状态。</div>'}<div class="overview-meta"><span class="meta-pill neutral">上次 ${escapeHtml(timeLabel(opinion.streetUpdatedAt))}</span></div><div class="note">市井闲闻属于生活化衍生内容，不会自动写入世界事实；“去哪逛逛”属于探索建议，也不会自动变成已经发生的剧情。</div></div>
      <div class="card"><div class="section-title"><h3>市井闲闻</h3><span class="count">${street.length} 条</span></div>${street.length?`<div class="item-list">${street.map(item=>`<div class="item"><div class="item-head"><b>${escapeHtml(item.title)}</b>${favoriteButton(state,'street',item.id,busy)}</div><div class="chips"><span class="chip">${escapeHtml(item.category||streetKindLabel(item.kind))}</span><span class="chip">${escapeHtml(streetKindLabel(item.kind))}</span></div>${item.speaker||item.place?`<div class="street-meta">${item.speaker?escapeHtml(item.speaker):escapeHtml(streetKindLabel(item.kind))}${item.place?` · ${escapeHtml(item.place)}`:''}</div>`:''}<div class="quote">${item.speaker?`“${escapeHtml(item.text)}”`:`【${escapeHtml(item.text)}】`}</div>${item.note&&item.note!==item.text?`<p>${escapeHtml(item.note)}</p>`:''}</div>`).join('')}</div>`:'<p class="empty">还没有生成市井闲闻。</p>'}</div>
      <div class="card"><div class="section-title"><h3>去哪逛逛</h3><span class="count">${places.length} 条</span></div>${places.length?`<div class="item-list">${places.map(item=>`<div class="item"><div class="item-head"><div style="flex:1;min-width:0"><b>${escapeHtml(item.name)}</b>${item.why?`<p>${escapeHtml(item.why)}</p>`:''}<div class="chips">${item.type?`<span class="chip">${escapeHtml(item.type)}</span>`:''}<span class="chip">${item.established?'已有地点':'灵感地点'}</span></div></div><button class="insert-small icon-only" type="button" title="填入输入框" aria-label="填入输入框" data-insert-guidance="${escapeHtml(item.id)}" data-guidance-kind="place" ${busy?'disabled':''}>↪</button></div></div>`).join('')}</div>`:'<p class="empty">还没有生成地点推荐。</p>'}</div>`;
    return `<div class="stack"><div class="page-intro"><div class="page-kicker">世界见闻</div><div class="page-title-row"><h1>见闻</h1>${helpButton('observation')}</div><p>从公共动态和街巷漫游两个角度查看镜头外的信息。</p><div class="segmented" role="tablist" aria-label="见闻类型"><button type="button" data-opinion-view="public" aria-selected="${activeView==='public'}">公共动态</button><button type="button" data-opinion-view="street" aria-selected="${activeView==='street'}">街巷漫游</button></div></div>${activeView==='street'?streetView:publicView}</div>`;
}

function continuityHtml(state, busy, actions) {
    if (!state) return emptySection('脉络');
    const facts = Array.isArray(state.world?.facts) ? [...state.world.facts] : [];
    const recent = Array.isArray(state.continuity?.recentDynamics) ? [...state.continuity.recentDynamics].reverse() : [];
    const sourceLabel = item => {const start=Number.isInteger(item?.sourceStartMessageId)?item.sourceStartMessageId:null;const end=Number.isInteger(item?.sourceEndMessageId)?item.sourceEndMessageId:(Number.isInteger(item?.sourceMessageId)?item.sourceMessageId:null);if(start===null&&end===null)return'';return start!==null&&end!==null&&start!==end?`AI #${start}～#${end}`:`AI #${end??start}`};
    const publicityLabel=value=>({private:'私有',trace:'公开迹象',public:'公开事实'}[value]||'私有');
    const validityLabel=value=>({current:'当前',upcoming:'将发生',historical:'历史',persistent:'持续'}[value]||value||'当前');
    const sortedFacts=facts.sort((a,b)=>String(b?.updatedAt||'').localeCompare(String(a?.updatedAt||''))||(b?.sourceMessageId??-1)-(a?.sourceMessageId??-1));
    return `<div class="stack"><div class="page-intro"><div class="page-kicker">连续脉络</div><div class="page-title-row"><h1>脉络</h1>${helpButton('continuity')}</div><p>最近 5 次世界变化与仍然有效的持续性事实。</p></div>
      <div class="card"><div class="card-header"><div><h2>持续性世界事实</h2><div class="card-subtitle">后续推演会把这里当作连续性约束；识别错误时可以手动修改或删除</div></div><span class="meta-pill neutral">${facts.length} / 20</span></div>${sortedFacts.length?`<div class="item-list">${sortedFacts.map(item=>`<div class="item"><div class="item-head"><b>${escapeHtml(item.value||item.key||'持续性世界事实')}</b><div class="mini-actions">${editIconButton(`data-edit-continuity-fact="${escapeHtml(item.id)}"`,busy)}${trashIconButton(`data-remove-continuity-fact="${escapeHtml(item.id)}"`,busy)}</div></div><div class="chips">${item.key?`<span class="chip">${escapeHtml(item.key)}</span>`:''}<span class="chip">${escapeHtml(validityLabel(item.validity))}</span><span class="chip">${escapeHtml(publicityLabel(item.publicity))}</span>${item.source==='manual'?'<span class="chip">手动修正</span>':''}</div>${item.publicHint?`<p>公开表象：${escapeHtml(item.publicHint)}</p>`:''}${item.evidence?`<details class="preview-details"><summary>查看依据</summary><div class="note">${escapeHtml(item.evidence)}</div></details>`:''}<div class="meta">${escapeHtml([sourceLabel(item),item.updatedAt?`更新：${timeLabel(item.updatedAt)}`:''].filter(Boolean).join(' · '))}</div></div>`).join('')}</div>`:'<p class="empty">当前没有需要长期占用额度的持续性世界事实。</p>'}</div>
      <div class="card"><div class="card-header"><div><h2>最近世界动态</h2><div class="card-subtitle">只保留最近 5 次世界推演的净变化摘要</div></div><span class="meta-pill neutral">${recent.length} / 5</span></div>${recent.length?`<div class="timeline">${recent.map(item=>`<div class="timeline-row"><span class="timeline-dot"></span><div class="timeline-body"><b>${escapeHtml(item.summary)}</b><div class="meta">${escapeHtml([item.storyTime?`剧情时间：${item.storyTime}`:'',sourceLabel(item),item.createdAt?`推演于：${timeLabel(item.createdAt)}`:''].filter(Boolean).join(' · '))}</div></div></div>`).join('')}</div>`:'<p class="empty">当前还没有最近世界动态。</p>'}</div>
    </div>`;
}
function chronicleHtml(state, busy) {
    if (!state) return emptySection('纪事');
    const items=Array.isArray(state.chronicle)?[...state.chronicle].reverse():[];
    return `<div class="stack"><div class="page-intro"><div class="page-kicker">收藏归档</div><div class="page-title-row"><h1>纪事</h1>${helpButton('chronicle')}</div><p>收藏值得保留的见闻与灵感。</p></div>${!items.length?`<div class="card"><p class="empty">暂无收藏。见闻卡片右上角的 ☆ 可以把喜欢的内容保留下来。</p></div>`:`<div class="card"><div class="card-header"><div><h2>收藏</h2><div class="card-subtitle">刷新见闻不会删除这些内容</div></div><span class="meta-pill neutral">${items.length} 条</span></div><div class="item-list">${items.map(item=>`<div class="item"><div class="item-head"><b>${escapeHtml(item.title||'收藏内容')}</b>${trashIconButton(`data-remove-chronicle="${escapeHtml(item.id)}"`,busy)}</div><div class="chips"><span class="chip">${escapeHtml(item.sourceLabel||item.sourceType||'收藏')}</span>${item.canon===false?'<span class="chip">灵感来源</span>':'<span class="chip">正史来源</span>'}</div>${item.summary?`<p>${escapeHtml(item.summary)}</p>`:''}<div class="meta">收藏于 ${escapeHtml(timeLabel(item.capturedAt))}</div></div>`).join('')}</div></div>`}</div>`;
}

function emptySection(title){return`<div class="stack"><div class="page-intro"><h1>${escapeHtml(title)}</h1><p>当前聊天尚未建立世界动态数据。</p></div><div class="card soft"><p>先到“此刻”完成一次世界推演。仅查看页面不会自动创建数据。</p></div></div>`}
function listSection(title,items,mapper,emptyText='暂无记录。'){if(!Array.isArray(items)||!items.length)return`<div class="stack"><div class="card"><h2>${title}</h2><p class="empty">${emptyText}</p></div></div>`;return`<div class="stack"><div class="card"><h2>${title}</h2><div class="item-list">${items.map(item=>{const view=mapper(item)||{};return`<div class="item"><b>${escapeHtml(view.title||'')}</b>${view.body?`<p>${escapeHtml(view.body)}</p>`:''}${view.meta?`<div class="meta">${escapeHtml(view.meta)}</div>`:''}</div>`}).join('')}</div></div></div>`}
function renderTab(tab,version,preview,busy,actions,opinionView){const state=readSceneWorldState();if(tab==='此刻')return homeHtml(version,preview,busy,actions);if(tab==='人物')return peopleHtml(state,busy);if(tab==='见闻')return opinionHtml(state,busy,actions,opinionView);if(tab==='脉络')return continuityHtml(state,busy,actions);if(tab==='纪事')return chronicleHtml(state,busy);return emptySection(tab)}
function countReportedChanges(summary){if(!summary)return 0;return (summary.worldPatch?1:0)+(summary.momentsUpsert||0)+(summary.momentsRemove||0)+(summary.factsUpsert||0)+(summary.factsRemove||0)+(summary.people||0)+(summary.recentDynamic?1:0)}

export function createSceneWorldShell({ version, onClose, actions }) {
    let host=document.getElementById(HOST_ID);if(host)host.remove();host=document.createElement('div');host.id=HOST_ID;const shadow=host.attachShadow({mode:'open'});let activeTab='此刻';let activeOpinionView='public';let activeSettingsView='simulation';let settingsOpen=false;let busy=false;let preview=null;let worldEntryChoices={simulation:null,observation:null};let worldEntryLoadVersion=0;let cachedCustomModels=[];
    const captureViewState=()=>{
        const content=shadow.querySelector('.content');
        const openDetails=[...shadow.querySelectorAll('details[data-preserve-key][open]')].map(item=>item.dataset.preserveKey).filter(Boolean);
        return { scrollTop: content?.scrollTop ?? 0, openDetails };
    };
    const restoreViewState=viewState=>{
        if(!viewState)return;
        const apply=()=>{
            for(const key of viewState.openDetails||[]){
                const detail=[...shadow.querySelectorAll('details[data-preserve-key]')].find(item=>item.dataset.preserveKey===key);
                if(detail)detail.open=true;
            }
            const content=shadow.querySelector('.content');
            if(content)content.scrollTop=viewState.scrollTop||0;
        };
        apply();
        if(typeof requestAnimationFrame==='function')requestAnimationFrame(apply);
    };
    const runBusy=async(task)=>{if(busy)return;busy=true;render();try{return await task()}finally{busy=false;render()}};
    const personToDetailsText=person=>(Array.isArray(person?.details)?person.details:[]).filter(item=>item?.label&&item?.value).map(item=>`${item.label}：${item.value}`).join('\n');
    const personToKnowledgeText=person=>(Array.isArray(person?.knowledge)?person.knowledge:[]).map(item=>typeof item==='string'?item:item?.text).filter(Boolean).join('\n');
    const parseDetailsText=value=>String(value??'').split(/\n+/).map(line=>line.trim()).filter(Boolean).map(line=>{const index=line.search(/[:：]/);if(index<1)return null;return{label:line.slice(0,index).trim(),value:line.slice(index+1).trim()}}).filter(item=>item?.label&&item?.value);
    const dialogs=createSceneWorldDialogManager({shadowRoot:shadow,escapeHtml});
    const viewport=createViewportManager(host);
    const openConfirmDialog=options=>dialogs.confirm(options);
    const openTextDialog=options=>dialogs.text(options);
    const openPersonEditor=async person=>{
        const bodyHtml=`<label class="editor-field"><span>人物名称</span><input type="text" data-person-name value="${escapeHtml(person?.name||'')}"></label><label class="editor-field"><span>当前位置</span><input type="text" data-person-location value="${escapeHtml(person?.location||'')}"></label><label class="editor-field"><span>当前状态</span><textarea data-person-status>${escapeHtml(person?.status||'')}</textarea></label><label class="editor-field"><span>附加详情</span><textarea data-person-details placeholder="当前行动：……\n身体状态：……">${escapeHtml(personToDetailsText(person))}</textarea></label><label class="editor-field"><span>已确认认知</span><textarea data-person-knowledge placeholder="每行一条">${escapeHtml(personToKnowledgeText(person))}</textarea></label>`;
        const payload=await dialogs.form({
            title:person?'修改人物':'添加人物',
            description:'手动内容会作为当前人物状态保存，并参与后续世界推演。附加详情每行使用“标签：内容”。',
            bodyHtml,
            className:'person-editor',
            readValue:overlay=>{
                const name=String(overlay.querySelector('[data-person-name]')?.value??'').trim();
                if(!name)return{ok:false,message:'人物名称不能为空',focusSelector:'[data-person-name]'};
                return{ok:true,value:{id:person?.id||'',name,location:String(overlay.querySelector('[data-person-location]')?.value??'').trim(),status:String(overlay.querySelector('[data-person-status]')?.value??'').trim(),details:parseDetailsText(overlay.querySelector('[data-person-details]')?.value),knowledge:String(overlay.querySelector('[data-person-knowledge]')?.value??'').split(/\n+/).map(v=>v.trim()).filter(Boolean)}};
            },
        });
        if(!payload)return;
        runBusy(async()=>{try{await actions?.upsertPerson?.(payload);notify(person?'人物状态已修改':'人物已添加','success')}catch(error){console.error('[SceneWorld] person save failed',error);notify(`保存人物失败：${error?.message||error}`,'error')}});
    };
    const syncWorldEntryCounts=purpose=>{
        const books=worldEntryChoices[purpose]||[];
        let total=0,selected=0;
        for(const book of books){
            const entries=Array.isArray(book.entries)?book.entries:[];
            const selectedInBook=entries.filter(entry=>entry.enabled===true).length;
            total+=entries.length;selected+=selectedInBook;
            const details=[...shadow.querySelectorAll('details[data-book-purpose]')].find(node=>node.dataset.bookPurpose===purpose&&node.dataset.bookId===String(book.id||book.name));
            if(details){
                const selectedNode=details.querySelector('[data-book-selected]');
                if(selectedNode)selectedNode.textContent=String(selectedInBook);
                const totalNode=details.querySelector('[data-book-total]');
                if(totalNode)totalNode.textContent=String(entries.length);
            }
        }
        const summary=shadow.querySelector(`[data-entry-summary="${purpose}"]`);
        if(summary){
            const selectedNode=summary.querySelector('[data-entry-selected]');if(selectedNode)selectedNode.textContent=String(selected);
            const totalNode=summary.querySelector('[data-entry-total]');if(totalNode)totalNode.textContent=String(total);
        }
    };
    const applyFontScale=scale=>{
        const value=Math.max(80,Math.min(130,Math.round((Number(scale)||100)/5)*5));
        const backdrop=shadow.querySelector('.backdrop');
        if(backdrop)backdrop.style.setProperty('--sw-font-adjust',`${fontScaleToAdjust(value)}px`);
        const label=shadow.querySelector('[data-font-scale-value]');
        if(label)label.textContent=`${value}%`;
        shadow.querySelectorAll('[data-font-scale-step]').forEach(button=>{
            const step=Number(button.dataset.fontScaleStep)||0;
            button.disabled=busy||(step<0&&value<=80)||(step>0&&value>=130);
        });
    };
    const syncBaiBaiStatus=()=>{
        for(const purpose of ['simulation','observation']){
            const node=shadow.querySelector(`[data-baibai-status="${purpose}"]`);
            if(!node)continue;
            const status=actions?.getBaiBaiStatus?.(purpose)??{};
            node.textContent=baiBaiStatusText(status);
        }
    };
    const ensureWorldEntriesLoaded=()=>{
        if(worldEntryChoices.simulation!==null&&worldEntryChoices.observation!==null)return Promise.resolve(worldEntryChoices);
        const loadVersion=worldEntryLoadVersion;
        return runBusy(async()=>{
            try{
                const [simulation,observation]=await Promise.all([
                    actions?.getWorldEntries?.('simulation'),
                    actions?.getWorldEntries?.('observation'),
                ]);
                if(loadVersion!==worldEntryLoadVersion)return worldEntryChoices;
                worldEntryChoices={simulation:simulation??[],observation:observation??[]};
                return worldEntryChoices;
            }catch(error){
                if(loadVersion!==worldEntryLoadVersion)return worldEntryChoices;
                console.error('[SceneWorld] world entry list load failed',error);
                worldEntryChoices={simulation:[],observation:[]};
                notify(`读取世界书内部条目失败：${error?.message||error}`,'error');
                return worldEntryChoices;
            }
        });
    };
    const renderCustomModelList=(filter='')=>{
        const list=shadow.querySelector('[data-api-model-list]');
        const section=shadow.querySelector('[data-api-model-section]');
        const count=shadow.querySelector('[data-api-model-count]');
        if(!list||!section||!count)return;
        const q=String(filter||'').trim().toLowerCase();
        const shown=q?cachedCustomModels.filter(model=>model.toLowerCase().includes(q)):cachedCustomModels;
        const current=String(shadow.querySelector('[data-custom-api-model]')?.value||'').trim();
        count.textContent=`已读取 ${cachedCustomModels.length} 个模型`;
        section.style.display='block';
        section.open=true;
        list.innerHTML=shown.length?shown.map(model=>`<button type="button" class="api-model-item${model===current?' active':''}" data-api-model-item="${escapeHtml(model)}">${escapeHtml(model)}</button>`).join(''):'<div class="api-empty">没有匹配的模型。</div>';
        list.querySelectorAll('[data-api-model-item]').forEach(button=>button.addEventListener('click',()=>{
            const input=shadow.querySelector('[data-custom-api-model]');if(input)input.value=button.dataset.apiModelItem||'';
            list.querySelectorAll('.api-model-item').forEach(item=>item.classList.toggle('active',item===button));
        }));
    };
    const render=(options={})=>{
        if(dialogs.active)dialogs.cancelActive(null);
        const viewState=options.preserve===false?null:captureViewState();
        const pageTitle=settingsOpen?'世界动态 · 设置':'世界动态';
        const settingsButtonLabel=settingsOpen?'返回世界动态':'打开设置';
        const settingsButtonIcon=settingsOpen?'←':'⚙';
        const mainHtml=settingsOpen?settingsHtml(actions,busy,worldEntryChoices,activeSettingsView):renderTab(activeTab,version,preview,busy,actions,activeOpinionView);
        const navHtml=settingsOpen?'':`<nav class="nav" aria-label="世界动态栏目">${TABS.map(tab=>`<button type="button" data-tab="${tab}" aria-selected="${tab===activeTab}">${tab}</button>`).join('')}</nav>`;
        const appearanceSettings=actions?.getSettings?.()??{};
        const fontScale=Math.max(80,Math.min(130,Math.round((Number(appearanceSettings.uiScalePercent)||100)/5)*5));
        const fontAdjust=fontScaleToAdjust(fontScale);
        shadow.innerHTML=`<style>${STYLES}</style><div class="backdrop" style="--sw-font-adjust:${fontAdjust}px"><section class="panel" role="dialog" aria-modal="true" aria-label="${settingsOpen?'世界动态设置':'世界动态'}"><header class="header"><div class="title">${pageTitle}</div><div class="version">${escapeHtml(version)}</div><div class="spacer"></div><button class="header-icon" type="button" data-action="settings-toggle" aria-label="${settingsButtonLabel}" title="${settingsButtonLabel}">${settingsButtonIcon}</button><button class="close" type="button" aria-label="关闭">×</button></header><main class="content">${mainHtml}</main>${navHtml}</section></div>`;
        restoreViewState(viewState);
        shadow.querySelector('.close')?.addEventListener('click',()=>onClose?.());
        shadow.querySelector('[data-action="settings-toggle"]')?.addEventListener('click',()=>{settingsOpen=!settingsOpen;render({preserve:false});if(settingsOpen&&activeSettingsView==='reference')void ensureWorldEntriesLoaded()});
        shadow.querySelector('.backdrop')?.addEventListener('click',e=>{if(e.target===e.currentTarget)onClose?.()});
        shadow.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{settingsOpen=false;activeTab=button.dataset.tab||'此刻';render({preserve:false})}));
        shadow.querySelectorAll('[data-opinion-view]').forEach(button=>button.addEventListener('click',()=>{activeOpinionView=button.dataset.opinionView==='street'?'street':'public';render({preserve:false})}));
        shadow.querySelectorAll('[data-settings-view]').forEach(button=>button.addEventListener('click',()=>{activeSettingsView=button.dataset.settingsView||'simulation';render({preserve:false});if(activeSettingsView==='reference')void ensureWorldEntriesLoaded()}));
        shadow.querySelectorAll('[data-model-mode]').forEach(input=>input.addEventListener('change',()=>{try{actions?.updateSettings?.({modelConnectionMode:input.value==='custom'?'custom':'tavern'});preview=null;cachedCustomModels=[];render({preserve:false});notify(input.value==='custom'?'已切换到自定义 API':'已切换到酒馆当前连接','success')}catch(error){console.error('[SceneWorld] model mode update failed',error);notify(`保存模型连接方式失败：${error?.message||error}`,'error')}}));
        shadow.querySelector('[data-toggle-api-key]')?.addEventListener('click',event=>{const input=shadow.querySelector('[data-custom-api-key]');if(!input)return;const show=input.type==='password';input.type=show?'text':'password';event.currentTarget.textContent=show?'隐藏':'显示'});
        shadow.querySelector('[data-fetch-api-models]')?.addEventListener('click',async event=>{const button=event.currentTarget;const url=String(shadow.querySelector('[data-custom-api-url]')?.value||'').trim();const key=String(shadow.querySelector('[data-custom-api-key]')?.value||'').trim();if(!url||!key){notify('请先填写 API 地址和 Key','warning');return}button.disabled=true;const old=button.textContent;button.textContent='读取中…';try{cachedCustomModels=await actions?.fetchCustomApiModels?.({url,key})||[];renderCustomModelList('');notify(`已读取 ${cachedCustomModels.length} 个模型`,'success')}catch(error){if(isLifecycleCancellation(error))return;console.error('[SceneWorld] fetch models failed',error);notify(`读取模型失败：${error?.message||error}`,'error')}finally{button.disabled=false;button.textContent=old}});
        shadow.querySelector('[data-api-model-search]')?.addEventListener('input',event=>renderCustomModelList(event.currentTarget.value));
        shadow.querySelector('[data-save-custom-api]')?.addEventListener('click',()=>{try{const url=String(shadow.querySelector('[data-custom-api-url]')?.value||'').trim();const key=String(shadow.querySelector('[data-custom-api-key]')?.value||'').trim();const model=String(shadow.querySelector('[data-custom-api-model]')?.value||'').trim();const timeout=Math.max(30,Math.min(600,Number(shadow.querySelector('[data-custom-api-timeout]')?.value)||180));if(!url||!key||!model){notify('请完整填写 API 地址、Key 和模型名称','warning');return}actions?.updateSettings?.({modelConnectionMode:'custom',customApiUrl:url,customApiKey:key,customApiModel:model,customApiTimeoutSec:timeout});preview=null;notify('自定义 API 已保存并生效','success')}catch(error){console.error('[SceneWorld] custom api save failed',error);notify(`保存模型设置失败：${error?.message||error}`,'error')}});
        shadow.querySelector('[data-save-api-preset]')?.addEventListener('click',async()=>{try{const url=String(shadow.querySelector('[data-custom-api-url]')?.value||'').trim();const key=String(shadow.querySelector('[data-custom-api-key]')?.value||'');const model=String(shadow.querySelector('[data-custom-api-model]')?.value||'').trim();if(!url){notify('请先填写 API 地址','warning');return}const name=await openTextDialog({title:'保存 API 配置',description:'保存当前地址、Key 和模型，方便以后快速载入。',label:'配置名称',value:'',confirmLabel:'保存'});if(name===null)return;const preset=actions?.createApiPreset?.({name,url,key,model});if(!preset)throw new Error('无法创建 API 配置');const settings=actions?.getSettings?.()??{};actions?.updateSettings?.({apiPresets:[...(settings.apiPresets||[]),preset],apiPresetActiveId:preset.id});notify(`已保存 API 配置“${preset.name}”`,'success');render()}catch(error){console.error('[SceneWorld] api preset save failed',error);notify(`保存 API 配置失败：${error?.message||error}`,'error')}});
        shadow.querySelectorAll('[data-load-api-preset]').forEach(button=>button.addEventListener('click',()=>{try{const settings=actions?.getSettings?.()??{};const preset=(settings.apiPresets||[]).find(item=>item.id===button.dataset.loadApiPreset);if(!preset)throw new Error('这个 API 配置已经不存在');const set=(sel,value)=>{const node=shadow.querySelector(sel);if(node)node.value=value??''};set('[data-custom-api-url]',preset.url);set('[data-custom-api-key]',preset.key);set('[data-custom-api-model]',preset.model);actions?.updateSettings?.({apiPresetActiveId:preset.id});cachedCustomModels=[];shadow.querySelectorAll('[data-api-preset-row]').forEach(row=>row.classList.toggle('active',row.dataset.apiPresetRow===preset.id));notify(`已载入“${preset.name}”，点击“保存并生效”后生效`,'success')}catch(error){console.error('[SceneWorld] api preset load failed',error);notify(`载入 API 配置失败：${error?.message||error}`,'error')}}));
        shadow.querySelectorAll('[data-delete-api-preset]').forEach(button=>button.addEventListener('click',async()=>{const settings=actions?.getSettings?.()??{};const preset=(settings.apiPresets||[]).find(item=>item.id===button.dataset.deleteApiPreset);if(!preset)return;const confirmed=await openConfirmDialog({title:'删除 API 配置',message:`确定删除“${preset.name}”吗？不会删除当前已经生效的 API 设置。`,confirmLabel:'删除',danger:true});if(!confirmed)return;try{actions?.updateSettings?.({apiPresets:(settings.apiPresets||[]).filter(item=>item.id!==preset.id),apiPresetActiveId:settings.apiPresetActiveId===preset.id?'':settings.apiPresetActiveId});notify('API 配置已删除','success');render()}catch(error){console.error('[SceneWorld] api preset delete failed',error);notify(`删除 API 配置失败：${error?.message||error}`,'error')}}));
        shadow.querySelector('[data-model-max-output]')?.addEventListener('change',event=>{try{const value=Math.max(1024,Math.min(65536,Math.trunc(Number(event.currentTarget?.value)||8000)));event.currentTarget.value=String(value);actions?.updateSettings?.({modelMaxOutputTokens:value});preview=null;notify(`最大回复已设为 ${formatTokenCount(value)} Token`,'success')}catch(error){console.error('[SceneWorld] output token setting failed',error);notify(`保存最大回复设置失败：${error?.message||error}`,'error')}});
        shadow.querySelectorAll('[data-world-ref-setting]').forEach(input=>input.addEventListener('change',()=>{try{actions?.updateSettings?.({[input.dataset.worldRefSetting]:input.checked});notify('世界观参考设置已保存','success')}catch(error){console.error('[SceneWorld] settings update failed',error);notify(`保存世界观参考设置失败：${error?.message||error}`,'error')}}));
        shadow.querySelectorAll('[data-world-entry]').forEach(input=>input.addEventListener('change',()=>{try{const purpose=input.dataset.worldEntryPurpose||'simulation';actions?.updateSettings?.({worldEntryId:input.dataset.worldEntry,worldEntryPurpose:purpose,worldEntryEnabled:input.checked});for(const book of worldEntryChoices[purpose]||[]){const entry=(book.entries||[]).find(item=>item.id===input.dataset.worldEntry);if(entry)entry.enabled=input.checked}syncWorldEntryCounts(purpose);notify(`${purpose==='observation'?'见闻':'世界推演'}世界书条目选择已保存`,'success')}catch(error){console.error('[SceneWorld] world entry setting failed',error);notify(`保存世界书条目选择失败：${error?.message||error}`,'error')}}));
        shadow.querySelectorAll('[data-world-entry-batch]').forEach(button=>button.addEventListener('click',()=>{try{const purpose=button.dataset.worldEntryPurpose||'simulation';const ids=JSON.parse(button.dataset.worldEntryIds||'[]');const enabled=button.dataset.worldEntryBatch==='all';actions?.updateSettings?.({worldEntryIds:ids,worldEntryPurpose:purpose,worldEntryEnabled:enabled});for(const book of worldEntryChoices[purpose]||[]){for(const entry of book.entries||[]){if(ids.includes(entry.id))entry.enabled=enabled}}const detail=button.closest('details');detail?.querySelectorAll('[data-world-entry]').forEach(input=>{input.checked=enabled});syncWorldEntryCounts(purpose);notify(`${enabled?'已全选':'已清空'}这本世界书的 ${purpose==='observation'?'见闻':'世界推演'}条目`,'success')}catch(error){console.error('[SceneWorld] world entry batch setting failed',error);notify(`批量保存世界书条目失败：${error?.message||error}`,'error')}}));
        shadow.querySelectorAll('[data-font-scale-step]').forEach(button=>button.addEventListener('click',()=>{try{const current=Math.max(80,Math.min(130,Math.round((Number(actions?.getSettings?.()?.uiScalePercent)||100)/5)*5));const step=Number(button.dataset.fontScaleStep)||0;const value=Math.max(80,Math.min(130,current+step));actions?.updateSettings?.({uiScalePercent:value});applyFontScale(value);notify(`世界动态界面大小已调整为 ${value}%`,'success')}catch(error){console.error('[SceneWorld] font setting failed',error);notify(`保存界面大小失败：${error?.message||error}`,'error')}}));
        shadow.querySelectorAll('[data-help-topic]').forEach(button=>button.addEventListener('click',()=>{const topic=HELP_TOPICS[button.dataset.helpTopic];if(topic)void dialogs.info({title:topic.title,message:topic.message})}));
        shadow.querySelector('[data-content-tags]')?.addEventListener('change',event=>{try{const value=String(event.currentTarget?.value??'').trim();actions?.updateSettings?.({contentTags:value});preview=null;notify('正文标签设置已保存','success')}catch(error){console.error('[SceneWorld] content tag settings update failed',error);notify(`保存正文标签失败：${error?.message||error}`,'error')}});
        shadow.querySelector('[data-pending-batch-size]')?.addEventListener('change',event=>{try{const size=Number(event.currentTarget?.value)===5?5:10;actions?.updateSettings?.({maxPendingAssistantMessages:size});preview=null;notify(`单批推演已设为最多 ${size} 条 AI 正文`,'success')}catch(error){console.error('[SceneWorld] batch size setting failed',error);notify(`保存推演批次失败：${error?.message||error}`,'error')}});
        shadow.querySelector('[data-initial-settlement-mode]')?.addEventListener('change',event=>{try{const mode=String(event.currentTarget?.value??'latest')==='from_floor'?'from_floor':'latest';actions?.updateSettings?.({initialSettlementMode:mode});preview=null;const wrap=shadow.querySelector('[data-initial-start-floor-wrap]');if(wrap)wrap.hidden=mode!=='from_floor';notify(mode==='from_floor'?'首次推演起点已切换为从指定楼层开始':'首次推演起点已切换为从当前开始','success')}catch(error){console.error('[SceneWorld] initial settlement mode failed',error);notify(`保存首次推演起点失败：${error?.message||error}`,'error')}});
        shadow.querySelector('[data-initial-start-floor]')?.addEventListener('change',event=>{try{const floor=Math.max(0,Math.trunc(Number(event.currentTarget?.value)||0));actions?.updateSettings?.({initialStartFloor:floor});preview=null;notify(`首次推演起点已设为 #${floor}`,'success')}catch(error){console.error('[SceneWorld] initial start floor failed',error);notify(`保存起始楼层失败：${error?.message||error}`,'error')}});
        shadow.querySelector('[data-action="read-pending"]')?.addEventListener('click',async()=>{try{preview=actions?.inspectPendingNarrative?.()??null;const batch=preview?.batch;if(batch?.anchorChanged){notify(batch.anchorReason,'error');render();return}if(!batch?.hasPending){notify('当前没有新的 AI 正文需要推演','info');render();return}preview={...preview,tokenBudget:{status:'calculating'},tokenBudgetError:''};render();try{const budgetInfo=await actions?.inspectPendingBudget?.(batch);preview={...preview,tokenBudget:budgetInfo?.tokenBudget??null,tokenBudgetError:''};const status=preview?.tokenBudget?.status;if(status==='blocked')notify('本轮预计超出模型上下文安全范围，请查看 Token 预算','warning');else if(status==='near')notify('本轮 Token 预算接近上下文上限，建议留意','warning');else if(status==='unknown')notify('已估算输入 Token；当前连接的总上下文上限由服务端判断','info')}catch(error){if(isLifecycleCancellation(error)){preview=null;return}console.error('[SceneWorld] token budget inspection failed',error);preview={...preview,tokenBudget:null,tokenBudgetError:String(error?.message||error)};notify(`Token 预算估算失败：${error?.message||error}`,'error')}}catch(error){console.error('[SceneWorld] read pending narrative failed',error);notify(`读取待推演剧情失败：${error?.message||error}`,'error')}render()});
        shadow.querySelector('[data-action="simulate"]')?.addEventListener('click', async () => {
            const batch = preview?.batch;
            const budget = preview?.tokenBudget;
            if (!batch?.canSimulate || !budget || budget.status === 'blocked' || budget.status === 'calculating') return;

            const budgetText = budget.contextTokens
                ? `预计输入 ${formatTokenCount(budget.inputTokens)} Token，输出上限 ${formatTokenCount(budget.outputTokens)}，模型上下文 ${formatTokenCount(budget.contextTokens)}。`
                : `预计输入 ${formatTokenCount(budget.inputTokens)} Token，输出上限 ${formatTokenCount(budget.outputTokens)}；当前无法可靠取得模型上下文上限。`;
            const confirmed = await openConfirmDialog({
                title: '开始世界推演',
                message: `将调用一次当前选择的模型连接，推演 #${batch.startId}～#${batch.endId} 共 ${batch.assistantCount} 条 AI 正文。\n\n${budgetText}`,
                confirmLabel: '开始推演',
            });
            if (!confirmed) return;

            runBusy(async () => {
                try {
                    const result = await actions?.simulatePending?.(batch);
                    preview = actions?.inspectPendingNarrative?.() ?? preview;
                    const count = countReportedChanges(result?.changeSummary);
                    const ref = result?.worldReference;
                    const refText = ref
                        ? ` · 世界观参考：${ref.characterDescriptionUsed ? '角色描述 + ' : ''}${ref.selectedEntries || 0} 条世界书条目`
                        : '';
                    const bb = result?.baibai;
                    const bbText = bb?.enabled
                        ? (bb?.used
                            ? ` · 记忆插件长期历史 ${bb.chars || 0} 字符`
                            : (bb?.available ? ' · 记忆插件本轮无可用长期历史' : ' · 记忆插件接口未检测到'))
                        : '';
                    const baselineNow=String(result?.state?.world?.summary||'').trim();
                    const summary = count
                        ? `世界推演完成：#${result.batch.startId}～#${result.batch.endId}，已更新当前世界并保存 ${count} 组变化`
                        : (baselineNow?`世界推演完成：#${result.batch.startId}～#${result.batch.endId}，当前世界基线已保持`:`世界推演完成：#${result.batch.startId}～#${result.batch.endId}`);
                    notify(summary + refText + bbText, 'success');
                } catch (error) {
                    if (isLifecycleCancellation(error)) return;
                    console.error('[SceneWorld] pending simulation failed', error);
                    notify(`世界推演失败：${error?.message || error}`, 'error');
                }
            });
        });

        shadow.querySelector('[data-action="refresh-opinion"]')?.addEventListener('click', async () => {
            try {
                const info = actions?.inspectPublicOpinion?.();
                if (!info?.simulationReady) {
                    throw new Error('请先完成至少一次世界推演，建立当前世界状态后再生成见闻');
                }

                const confirmed = await openConfirmDialog({
                    title: '刷新公共动态',
                    message: `将调用一次模型。新闻只会使用当前 ${info.publicCount} 条公开世界事实；论坛可围绕当前世界状态和主题自然生成。`,
                    confirmLabel: '刷新',
                });
                if (!confirmed) return;

                runBusy(async () => {
                    try {
                        const result = await actions?.refreshPublicOpinion?.();
                        if ((result.newsCount || 0) + (result.forumCount || 0) === 0) {
                            notify('公共动态刷新完成：本轮新闻为空，论坛也未形成有效内容', 'success');
                            return;
                        }
                        const ref = result?.worldReference;
                        const refText = ref ? ` · 参考 ${ref.selectedEntries || 0} 条世界书条目` : '';
                        notify(`公共动态刷新完成：${result.newsCount || 0} 条新闻，${result.forumCount || 0} 条讨论${refText}`, 'success');
                    } catch (error) {
                        if (isLifecycleCancellation(error)) return;
                        console.error('[SceneWorld] public info failed', error);
                        notify(`刷新公共动态失败：${error?.message || error}`, 'error');
                    }
                });
            } catch (error) {
                console.error('[SceneWorld] public info precheck failed', error);
                notify(`刷新公共动态失败：${error?.message || error}`, 'error');
            }
        });

        shadow.querySelector('[data-action="refresh-street"]')?.addEventListener('click', async () => {
            const info = actions?.inspectPublicOpinion?.();
            if (!info?.simulationReady) {
                notify('请先完成至少一次世界推演，建立当前世界状态后再生成见闻', 'warning');
                return;
            }

            const confirmed = await openConfirmDialog({
                title: '开始街巷漫游',
                message: '将调用一次模型，同时生成生活化市井闲闻和 3～5 个地点建议。这些内容不会自动写入世界事实。',
                confirmLabel: '开始漫游',
            });
            if (!confirmed) return;

            runBusy(async () => {
                try {
                    const result = await actions?.refreshStreetOpinion?.();
                    const ref = result?.worldReference;
                    const refText = ref ? ` · 参考 ${ref.selectedEntries || 0} 条世界书条目` : '';
                    notify(`街巷漫游已更新：${result?.itemCount || 0} 条市井闲闻，${result?.placeCount || 0} 个地点${refText}`, 'success');
                } catch (error) {
                    if (isLifecycleCancellation(error)) return;
                    console.error('[SceneWorld] street opinion failed', error);
                    notify(`街巷漫游失败：${error?.message || error}`, 'error');
                }
            });
        });

        shadow.querySelectorAll('[data-insert-guidance]').forEach(button => {
            button.addEventListener('click', async () => {
                try {
                    const state = readSceneWorldState();
                    const kind = button.dataset.guidanceKind;
                    const list = kind === 'place' ? state?.guidance?.places : state?.guidance?.actions;
                    const item = Array.isArray(list)
                        ? list.find(entry => entry?.id === button.dataset.insertGuidance)
                        : null;
                    if (!item?.prompt) throw new Error('这条建议已经不存在，请重新生成');

                    const existing = String(actions?.getChatInputText?.() ?? '').trim();
                    let overwrite = false;
                    if (existing && existing !== item.prompt) {
                        const confirmed = await openConfirmDialog({
                            title: '替换输入框内容',
                            message: 'SillyTavern 输入框里已经有内容。是否用这条建议替换现有内容？',
                            confirmLabel: '替换',
                        });
                        if (!confirmed) return;
                        overwrite = true;
                    }

                    const inserted = actions?.putTextIntoChatInput?.(item.prompt, { overwrite });
                    if (inserted === false) return;
                    notify('已填入 SillyTavern 输入框', 'success');
                    onClose?.();
                } catch (error) {
                    console.error('[SceneWorld] insert guidance failed', error);
                    notify(`填入输入框失败：${error?.message || error}`, 'error');
                }
            });
        });

        shadow.querySelectorAll('[data-favorite-type]').forEach(button => {
            button.addEventListener('click', () => {
                runBusy(async () => {
                    try {
                        await actions?.favoriteOpinion?.(button.dataset.favoriteType, button.dataset.favoriteId);
                        notify('已收藏到纪事', 'success');
                    } catch (error) {
                        console.error('[SceneWorld] favorite failed', error);
                        notify(`收藏失败：${error?.message || error}`, 'error');
                    }
                });
            });
        });

        shadow.querySelector('[data-add-person]')?.addEventListener('click', () => openPersonEditor(null));

        shadow.querySelectorAll('[data-edit-person]').forEach(button => {
            button.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                const state = readSceneWorldState();
                const person = (state?.people || []).find(item => item?.id === button.dataset.editPerson);
                if (person) openPersonEditor(person);
            });
        });

        shadow.querySelectorAll('[data-remove-person]').forEach(button => {
            button.addEventListener('click', async event => {
                event.preventDefault();
                event.stopPropagation();
                const state = readSceneWorldState();
                const person = (state?.people || []).find(item => item?.id === button.dataset.removePerson);
                if (!person) return;

                const confirmed = await openConfirmDialog({
                    title: '删除人物',
                    message: `确定删除人物“${person.name}”吗？后续正文再次明确出现时，世界推演仍可能重新识别该人物。`,
                    confirmLabel: '删除',
                    danger: true,
                });
                if (!confirmed) return;

                runBusy(async () => {
                    try {
                        await actions?.removePerson?.(person.id);
                        notify('人物已删除', 'success');
                    } catch (error) {
                        console.error('[SceneWorld] person remove failed', error);
                        notify(`删除人物失败：${error?.message || error}`, 'error');
                    }
                });
            });
        });

        shadow.querySelectorAll('[data-remove-chronicle]').forEach(button => {
            button.addEventListener('click', async () => {
                const confirmed = await openConfirmDialog({
                    title: '删除纪事收藏',
                    message: '确定删除这条收藏吗？只会移出纪事，不会修改世界事实。',
                    confirmLabel: '删除',
                    danger: true,
                });
                if (!confirmed) return;

                runBusy(async () => {
                    try {
                        await actions?.removeChronicle?.(button.dataset.removeChronicle);
                        notify('已从纪事删除', 'success');
                    } catch (error) {
                        console.error('[SceneWorld] chronicle remove failed', error);
                        notify(`删除收藏失败：${error?.message || error}`, 'error');
                    }
                });
            });
        });

        shadow.querySelectorAll('[data-remove-continuity-fact]').forEach(button => {
            button.addEventListener('click', async () => {
                const confirmed = await openConfirmDialog({
                    title: '删除持续性世界事实',
                    message: '删除后，后续推演将不再把这条内容作为世界连续性约束。确定删除吗？',
                    confirmLabel: '删除',
                    danger: true,
                });
                if (!confirmed) return;

                runBusy(async () => {
                    try {
                        await actions?.removeContinuityFact?.(button.dataset.removeContinuityFact);
                        notify('已删除持续性世界事实', 'success');
                    } catch (error) {
                        console.error('[SceneWorld] continuity fact remove failed', error);
                        notify(`删除持续性世界事实失败：${error?.message || error}`, 'error');
                    }
                });
            });
        });

        shadow.querySelectorAll('[data-edit-continuity-fact]').forEach(button => {
            button.addEventListener('click', async () => {
                try {
                    const state = readSceneWorldState();
                    const item = state?.world?.facts?.find(entry => entry?.id === button.dataset.editContinuityFact);
                    if (!item) throw new Error('这条持续性世界事实已经不存在');

                    const value = await openTextDialog({
                        title: '修改持续性世界事实',
                        description: '手动修正后的内容会作为后续世界推演的连续性约束。',
                        label: '事实内容',
                        value: item.value || '',
                        confirmLabel: '保存',
                    });
                    if (value === null) return;
                    if (!String(value).trim()) throw new Error('事实内容不能为空');

                    runBusy(async () => {
                        try {
                            await actions?.editContinuityFact?.(item.id, value);
                            notify('持续性世界事实已手动修正', 'success');
                        } catch (error) {
                            console.error('[SceneWorld] continuity fact edit failed', error);
                            notify(`修改持续性世界事实失败：${error?.message || error}`, 'error');
                        }
                    });
                } catch (error) {
                    console.error('[SceneWorld] continuity fact edit prepare failed', error);
                    notify(`修改持续性世界事实失败：${error?.message || error}`, 'error');
                }
            });
        });

        shadow.querySelectorAll('[data-clear-section]').forEach(button => {
            button.addEventListener('click', async () => {
                const labels = { people: '人物', observation: '见闻', continuity: '脉络', chronicle: '纪事', guidance: '行动建议' };
                const section = button.dataset.clearSection;
                const label = labels[section] || section;
                const confirmed = await openConfirmDialog({
                    title: `清理${label}数据`,
                    message: `只清理当前聊天的“${label}”数据，其他世界动态内容保留。`,
                    confirmLabel: '清理',
                    danger: true,
                });
                if (!confirmed) return;

                runBusy(async () => {
                    try {
                        const removed = await actions?.clearSection?.(section);
                        notify(removed ? `${label}数据已清理` : '当前聊天尚未建立世界动态数据', 'success');
                    } catch (error) {
                        console.error('[SceneWorld] section clear failed', error);
                        notify(`清理${label}失败：${error?.message || error}`, 'error');
                    }
                });
            });
        });

        shadow.querySelector('[data-action="clear"]')?.addEventListener('click', async () => {
            const confirmed = await openConfirmDialog({
                title: '清理全部世界动态数据',
                message: '只删除当前聊天中的世界动态数据。不会删除聊天正文，也不会触碰其他插件数据。',
                confirmLabel: '全部清理',
                danger: true,
            });
            if (!confirmed) return;

            runBusy(async () => {
                try {
                    const removed = await clearSceneWorldState();
                    preview = actions?.inspectPendingNarrative?.() ?? null;
                    notify(removed ? '当前聊天的 世界动态数据已清理' : '当前聊天没有 世界动态数据', 'success');
                } catch (error) {
                    console.error('[SceneWorld] clear state failed', error);
                    notify(`清理数据失败：${error?.message || error}`, 'error');
                }
            });
        });
    };
    shadow.addEventListener('keydown',event=>{if(event.key==='Escape'){if(dialogs.active)return;event.stopPropagation();if(settingsOpen){settingsOpen=false;render();return}onClose?.();return}const target=event.target;if(target&&(target.tagName==='INPUT'||target.tagName==='TEXTAREA'||target.isContentEditable))event.stopPropagation()});
    document.body.appendChild(host);viewport.start();render();return{host,refresh:render,onChatChanged(){dialogs.cancelActive(null);preview=null;worldEntryLoadVersion+=1;worldEntryChoices={simulation:null,observation:null};render();if(settingsOpen&&activeSettingsView==='reference')void ensureWorldEntriesLoaded()},onBaiBaiReady(){syncBaiBaiStatus()},destroy(){dialogs.destroy();viewport.stop();host?.remove()}};
}

export function removeSceneWorldShell(){document.getElementById(HOST_ID)?.remove()}
