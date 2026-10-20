import './style.css';

const STORAGE_KEY = 'aura-shortcuts-v1';
const ACCENT_KEY = 'aura-accent-v1';
const defaults = [
  {id:'youtube', title:'YouTube', target:'https://www.youtube.com', category:'video', favorite:true, color:'#6d2630',mark:'▶'},
  {id:'netflix', title:'Netflix', target:'https://www.netflix.com', category:'video', favorite:true, color:'#4b1c29',mark:'N'},
  {id:'plex', title:'Plex', target:'https://app.plex.tv/desktop', category:'video', favorite:true, color:'#624823',mark:'P'},
  {id:'spotify', title:'Spotify', target:'https://open.spotify.com', category:'music', favorite:true, color:'#1c513f',mark:'♫'},
  {id:'prime', title:'Prime Video', target:'https://www.primevideo.com', category:'video', favorite:true, color:'#194765',mark:'p'},
  {id:'jellyfin', title:'Jellyfin', target:'http://localhost:8096', category:'video', favorite:false, color:'#36466a',mark:'J'},
];
let apps;
try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); apps = Array.isArray(saved) ? saved : structuredClone(defaults); } catch { apps = structuredClone(defaults); }
apps = apps.filter(a => a && typeof a.id === 'string' && typeof a.title === 'string' && typeof a.target === 'string');
let view = 'home';
let query = '';
let toastHandle;
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const native = Boolean(window.__TAURI__?.core?.invoke);
const accent = localStorage.getItem(ACCENT_KEY) || 'sand';
document.documentElement.dataset.accent = ['sand','blue','green'].includes(accent) ? accent : 'sand';

function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(apps)); }
function toast(message) { const el=$('#toast'); el.textContent=message; el.classList.remove('hidden'); clearTimeout(toastHandle); toastHandle=setTimeout(()=>el.classList.add('hidden'),3600); }
function validTarget(target) {
  const t=target.trim();
  if (/^https?:\/\//i.test(t)) { try { const u=new URL(t); return (u.protocol==='https:'||u.protocol==='http:')&&Boolean(u.hostname); } catch{return false;} }
  return /^[A-Za-z]:\\.+\.(exe|lnk|url|mp4|mkv|avi|mp3|flac)$/i.test(t) || /^\\\\[^\\]+\\[^\\]+\\.+\.(exe|lnk|url|mp4|mkv|avi|mp3|flac)$/i.test(t);
}
async function launch(app) {
  if (!validTarget(app.target)) {toast('Invalid shortcut. Edit its target first.');return;}
  try {
    if(native){await window.__TAURI__.core.invoke('open_target',{target:app.target});}
    else if(/^https?:\/\//i.test(app.target)){window.open(app.target,'_blank','noopener,noreferrer');}
    else toast('Windows apps can only be opened in the installed AURA application.');
  } catch (err) { toast(`Unable to open ${app.title}: ${String(err)}`); }
}
function tile(app, showControls=false) {
  const button=document.createElement('button');
  button.className='tile';
  button.type='button';
  button.style.setProperty('--tile-color', app.color || '#32485b');
  button.setAttribute('aria-label',`Launch ${app.title}`);
  const logo=document.createElement('span'); logo.className='tile-logo'; logo.textContent=app.mark||app.title[0]?.toUpperCase()||'•';
  const foot=document.createElement('div');foot.className='tile-foot';
  const titleContainer=document.createElement('div');
  const name=document.createElement('span');name.className='tile-name';name.textContent=app.title;
  const type=document.createElement('span');type.className='tile-type';type.textContent=app.category==='music'?'MUSIC':app.category==='video'?'MOVIES & TV':'SHORTCUT';
  titleContainer.append(name,type);foot.append(titleContainer);
  if (!showControls) { const arrow=document.createElement('span');arrow.textContent='↗';arrow.style.color='var(--accent)';foot.append(arrow); }
  button.append(logo,foot);
  button.addEventListener('click',()=>launch(app));
  if(showControls){
    const controls=document.createElement('div');controls.className='tile-controls';
    const star=document.createElement('button');star.className='tile-star'+(app.favorite?'':' off');star.type='button';star.title=app.favorite?'Remove from favorites':'Add to favorites';star.setAttribute('aria-label',star.title);star.textContent='★';
    star.addEventListener('click',()=>{app.favorite=!app.favorite;save();render();toast(`${app.title} ${app.favorite?'added to':'removed from'} favorites`);});
    const del=document.createElement('button');del.type='button';del.className='delete';del.textContent='Remove';del.setAttribute('aria-label',`Remove ${app.title}`);
    del.addEventListener('click',()=>{if(confirm(`Remove ${app.title} shortcut?`)){apps=apps.filter(a=>a.id!==app.id);save();render();toast('Shortcut removed');}});
    controls.append(star,del);
    const wrap=document.createElement('div');wrap.style.position='relative';wrap.style.minWidth='0';wrap.append(button,controls);
    controls.style.cssText='display:flex;gap:6px;position:absolute;top:9px;right:10px;z-index:1;';
    return wrap;
  }
  return button;
}
function render() {
  const fav=$('#favorites');const all=$('#all-apps');fav.replaceChildren();all.replaceChildren();
  const matches=a=>a.title.toLowerCase().includes(query)||a.category.toLowerCase().includes(query);
  const favoriteApps=apps.filter(a=>a.favorite&&matches(a));
  if(!favoriteApps.length){ const e=document.createElement('div');e.className='empty';e.textContent='No favorites yet. Add a shortcut using the + button.';fav.append(e);}
  else favoriteApps.forEach(a=>fav.append(tile(a)));
  const filtered=apps.filter(matches);
  if(!filtered.length){const e=document.createElement('div');e.className='empty';e.textContent='No matching shortcuts.';all.append(e);}
  else filtered.forEach(a=>all.append(tile(a,true)));
  $('#app-count').textContent=`${filtered.length} shortcut${filtered.length===1?'':'s'}`;
  $$('.swatch').forEach(x=>x.classList.toggle('selected',x.dataset.accent===document.documentElement.dataset.accent));
}
function setView(next){view=next;$$('.view').forEach(x=>x.classList.toggle('active',x.id===`${view}-view`));$$('[data-view]').forEach(x=>{if(x.classList.contains('rail-link')) x.classList.toggle('selected',x.dataset.view===view);});$('#page-heading').textContent=({home:'Home',apps:'Applications',library:'Library',settings:'Settings'})[view];$('#search-area').classList.add('hidden');query='';$('#search-box').value='';render();window.scrollTo({top:0,behavior:'instant'});}
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
function openDialog(){const el=$('#dialog-backdrop');el.classList.remove('hidden');$('#shortcut-title').focus();}
function closeDialog(){$('#dialog-backdrop').classList.add('hidden');$('#shortcut-form').reset();}
$$('#add-shortcut,#apps-add,#library-add,#settings-add').forEach(x=>x.addEventListener('click',openDialog));
$('#hero-browse').addEventListener('click',()=>setView('apps'));
$('#hero-configure').addEventListener('click',()=>setView('settings'));
$('#customize').addEventListener('click',()=>setView('settings'));
$('#close-dialog').addEventListener('click',closeDialog);
$('#dialog-backdrop').addEventListener('click',e=>{if(e.target.id==='dialog-backdrop')closeDialog();});
$('#shortcut-form').addEventListener('submit',e=>{
  e.preventDefault();
  const title=$('#shortcut-title').value.trim();const target=$('#shortcut-target').value.trim();
  if(!title||!validTarget(target)){toast('Enter a name and valid http(s) URL or absolute Windows application path.');return;}
  const colors=['#4e3d38','#284953','#314b3b','#64472e','#313f62','#654256'];
  apps.push({id:globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`,title,target,category:$('#shortcut-category').value,favorite:$('#shortcut-favorite').checked,color:colors[apps.length%colors.length],mark:title.slice(0,1).toUpperCase()});
  save();render();closeDialog();toast('Shortcut added');
});
$('#search-toggle').addEventListener('click',()=>{if(view!=='apps'&&view!=='home')setView('apps');$('#search-area').classList.toggle('hidden');if(!$('#search-area').classList.contains('hidden'))$('#search-box').focus();});
$('#search-box').addEventListener('input',e=>{query=e.target.value.trim().toLowerCase();render();});
$$('.swatch').forEach(b=>b.addEventListener('click',()=>{document.documentElement.dataset.accent=b.dataset.accent;localStorage.setItem(ACCENT_KEY,b.dataset.accent);render();}));
$('#toggle-fullscreen').addEventListener('click',async()=>{try{if(native){const win=window.__TAURI__.window.getCurrentWindow();await win.setFullscreen(!await win.isFullscreen());}else if(document.fullscreenElement){await document.exitFullscreen();}else{await document.documentElement.requestFullscreen();}}catch(err){toast(`Fullscreen unavailable: ${err}`);}});
$('#exit-app').addEventListener('click',async()=>{if(native){await window.__TAURI__.window.getCurrentWindow().close();}else{toast('Close this browser tab to leave the preview.');}});
function updateClock(){const d=new Date();$('#clock').textContent=new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit'}).format(d);$('#date').textContent=new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric'}).format(d);}
updateClock();setInterval(updateClock,15000);
// Remote/gamepad-like directional keyboard navigation across visible controls.
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!$('#dialog-backdrop').classList.contains('hidden')){closeDialog();return;}
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
  const a=document.activeElement;
  if(['INPUT','TEXTAREA','SELECT'].includes(a?.tagName))return;
  const controls=$$('button:not([disabled])').filter(el=>el.getClientRects().length&&el.closest('.view')?.classList.contains('active') || (el.getClientRects().length&&!el.closest('.view')&&!el.closest('.dialog')));
  if(!controls.length)return;
  const rect=a?.getBoundingClientRect?.();
  if(!rect||!controls.includes(a)){controls[0].focus();e.preventDefault();return;}
  const cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
  const candidates=controls.filter(el=>el!==a).map(el=>{const r=el.getBoundingClientRect(),dx=r.left+r.width/2-cx,dy=r.top+r.height/2-cy;const inDir=({ArrowRight:dx>5,ArrowLeft:dx< -5,ArrowDown:dy>5,ArrowUp:dy< -5})[e.key];return{el,dx,dy,inDir};}).filter(x=>x.inDir);
  candidates.sort((a,b)=>{const horiz=e.key==='ArrowLeft'||e.key==='ArrowRight';const as=(horiz?Math.abs(a.dx)+2*Math.abs(a.dy):Math.abs(a.dy)+2*Math.abs(a.dx));const bs=(horiz?Math.abs(b.dx)+2*Math.abs(b.dy):Math.abs(b.dy)+2*Math.abs(b.dx));return as-bs;});
  if(candidates[0]){candidates[0].el.focus();candidates[0].el.scrollIntoView({block:'nearest',inline:'nearest'});e.preventDefault();}
});
render();
