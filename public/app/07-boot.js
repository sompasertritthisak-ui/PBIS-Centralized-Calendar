/* ==========================================================================
   PBIS CENTRAL CALENDAR — BOOT
   ========================================================================== */

/* --------------------------------------------------------------- BOOT --- */
async function boot(){
  // Real URLs are the addresses people share and bookmark; the client router
  // works in hashes. Map the path onto a route on first load so that
  // /calendar, /events/<slug> and /admin/events all land correctly on a hard
  // refresh — and so the CMS keeps its own entry point.
  if(!location.hash && location.pathname && location.pathname !== '/'){
    const p = location.pathname.replace(/\/+$/, '');
    if(p) location.hash = '#' + p;
  }

  renderBootScreen();
  try{
    await Store.init();
  }catch(err){
    document.getElementById('app').innerHTML = bootErrorHTML(err);
    return;
  }
  Store.subscribe(()=>render());
  window.addEventListener('hashchange', ()=>{ App.mobileNavOpen=false; App.sideOpen=false; Overlay.close(true); render(); });
  let rz=null;
  window.addEventListener('resize', ()=>{
    const st=document.getElementById('side-toggle');
    if(st) st.style.display = window.matchMedia('(max-width:1100px)').matches ? 'inline-flex' : 'none';
    clearTimeout(rz); rz=setTimeout(measureSticky,120);
  });
  if(!location.hash) location.hash = '#/';
  render();
  console.info('%cPBIS Central Calendar','color:#C39A2B;font-weight:700',
    `\nOne School. Three Campuses. One Shared Calendar.\n${Store.state.events.length} events loaded · timezone ${TZ}`);
}

function renderBootScreen(){
  document.getElementById('app').innerHTML = `
    <div style="min-height:100dvh;display:grid;place-items:center;background:var(--bg-brand-deep)">
      <div style="text-align:center">
        ${logo('full',150)}
        <p class="mono" style="color:var(--fg-on-brand-muted);font-size:11px;letter-spacing:.16em;margin-top:20px">
          LOADING CALENDAR…</p>
      </div>
    </div>`;
}

function bootErrorHTML(err){
  return `
    <div style="min-height:100dvh;display:grid;place-items:center;padding:24px;background:var(--bg-brand-deep)">
      <div class="card card-pad" style="max-width:440px;text-align:center">
        <h2 class="display" style="font-size:var(--fs-xl)">The calendar could not load</h2>
        <p class="muted mt-3">${esc(err.message || 'The server did not respond.')}</p>
        <button class="btn btn-primary mt-5" onclick="location.reload()">Try again</button>
      </div>
    </div>`;
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
