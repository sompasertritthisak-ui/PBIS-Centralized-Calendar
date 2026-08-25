/* ==========================================================================
   PBIS CENTRAL CALENDAR — EVENT EDITOR + ADMIN ACTIONS + BOOT
   ========================================================================== */

let EditorState = null;

function openEditor(id, seed){
  const existing = id ? Store.state.events.find(e=>e.id===id) : null;
  EditorState = existing ? JSON.parse(JSON.stringify(existing)) : Object.assign({
    id:null, title:'', description:'', date:Store.state.ui.cursor||T.todayKey(), endDate:'',
    start:'09:00', end:'10:00', allDay:false, campusId:'', yearGroupIds:[], audienceIds:['community'],
    categoryId:'academic', locationId:'', organizerId:Store.state.currentUserId,
    visibility:'public', status:'draft', important:false, recurrence:null, attachments:[], links:[], notify:false
  }, seed||{});
  EditorState.advanced = !!existing;
  renderEditor();
}
PBIS.openEditor = openEditor;

function fieldError(e, field){
  const hit = (e._fieldErrors || []).find(x => x.field === field);
  if (hit) return `<span class="err">${I.alert}${esc(hit.message)}</span>`;
  if (field === 'title' && e._err && !e.title) return `<span class="err">${I.alert}An event name is required</span>`;
  return '';
}

function renderEditor(){
  const e = EditorState;
  const isNew = !e.id;
  const ygs = e.campusId ? YEAR_GROUPS.filter(y=>y.campusId===e.campusId) : YEAR_GROUPS;
  const conflicts = (e._serverConflicts || []).map(c => ({ event: c, date: c.date }))
    .concat(findConflicts(e, e.id).filter(c => !(e._serverConflicts || []).some(s2 => s2.id === c.event.id)));
  const locs = e.campusId ? LOCATIONS.filter(l=>!l.campusId||l.campusId===e.campusId) : LOCATIONS;

  const html = `
  <div class="scrim" data-act="ed-cancel"></div>
  <aside class="drawer drawer-wide" role="dialog" aria-modal="true" aria-label="${isNew?'Create event':'Edit event'}" tabindex="-1">
    <div class="drawer-head">
      <div class="grow">
        <span class="eyebrow eyebrow-gold">${isNew?'New event':'Editing'}</span>
        <h3 class="display mt-1" style="font-size:var(--fs-xl)">${isNew?'Create Event':esc(e.title||'Untitled event')}</h3>
      </div>
      <button class="icon-btn" style="color:var(--fg-muted)" data-act="ed-cancel" aria-label="Close editor">${I.x}</button>
    </div>
    <div class="drawer-body">
      <!-- QUICK CREATE -->
      <div class="field mb-4">
        <label class="label" for="ed-title">Event name <span class="req" aria-hidden="true">*</span></label>
        <input class="input" id="ed-title" data-ed="title" value="${esc(e.title)}" placeholder="e.g. Year 6 Parent Evening" autofocus
          aria-invalid="${e._err&&!e.title?'true':'false'}">
        ${fieldError(e,'title')}
      </div>

      <div class="field-row" style="grid-template-columns:1fr 1fr 1fr">
        <div class="field"><label class="label" for="ed-date">Date <span class="req">*</span></label>
          <input class="input mono" type="date" id="ed-date" data-ed="date" value="${e.date}">${fieldError(e,'date')}</div>
        <div class="field"><label class="label" for="ed-start">Start</label>
          <input class="input mono" type="time" id="ed-start" data-ed="start" value="${e.start||''}" ${e.allDay?'disabled':''}></div>
        <div class="field"><label class="label" for="ed-end">End</label>
          <input class="input mono" type="time" id="ed-end" data-ed="end" value="${e.end||''}" ${e.allDay?'disabled':''}>${fieldError(e,'end')}</div>
      </div>

      <label class="check mt-2"><input type="checkbox" data-ed="allDay" ${e.allDay?'checked':''}><span>All-day event</span></label>

      ${conflicts.length?`<div class="alert alert-warning mt-3">${I.alert}<div class="txt">
        <b>Potential conflict</b>
        <span class="body">${esc(locName(e.locationId))} is already booked ${T.fmtShort(conflicts[0].date)} for “${esc(conflicts[0].event.title)}” (${esc(timeLabel(conflicts[0].event))}).</span>
        <div class="row row-tight mt-3">
          <button class="btn btn-outline btn-sm" data-act="open-event" data-id="${conflicts[0].event.id}">View conflict</button>
          <button class="btn btn-ghost btn-sm" data-act="ed-clear-loc">Change location</button>
          <button class="btn btn-ghost btn-sm" data-act="ed-ack">Keep anyway</button>
        </div>
      </div></div>`:''}

      ${!e.advanced?`
        <div class="row mt-5">
          <button class="btn btn-primary" data-act="ed-save-quick">${I.check}Create event</button>
          <button class="btn btn-ghost" data-act="ed-advanced">${I.chevD}Advanced details</button>
        </div>
        <p class="hint mt-3">Quick create makes a draft. Add campus, audience and category before publishing.</p>
      ` : `
        <hr class="rule-gold mt-6 mb-6">
        <h4 class="eyebrow mb-4">Who is it for</h4>
        <div class="field-row g2">
          <div class="field"><label class="label" for="ed-campus">Campus</label>
            <select class="select" id="ed-campus" data-ed="campusId">
              <option value="">Whole School</option>
              ${CAMPUSES.map(c=>`<option value="${c.id}" ${e.campusId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}
            </select></div>
          <div class="field"><label class="label" for="ed-cat">Category</label>
            <select class="select" id="ed-cat" data-ed="categoryId">
              ${CATEGORIES.map(c=>`<option value="${c.id}" ${e.categoryId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}
            </select></div>
        </div>

        <div class="field mt-4"><label class="label">Year groups</label>
          <div class="row row-tight" style="gap:6px">
            ${ygs.map(y=>`<button class="chip" type="button" aria-pressed="${(e.yearGroupIds||[]).includes(y.id)}" data-act="ed-yg" data-id="${y.id}">${esc(y.name)}</button>`).join('')}
          </div>
          <span class="hint">Leave empty for the whole campus.</span>
        </div>

        <div class="field mt-4"><label class="label">Audience</label>
          <div class="row row-tight" style="gap:6px">
            ${AUDIENCES.map(a=>`<button class="chip" type="button" aria-pressed="${(e.audienceIds||[]).includes(a.id)}" data-act="ed-aud" data-id="${a.id}">${esc(a.name)}</button>`).join('')}
          </div>
        </div>

        <hr class="rule-gold mt-6 mb-6">
        <h4 class="eyebrow mb-4">Where and when</h4>
        <div class="field-row g2">
          <div class="field"><label class="label" for="ed-loc">Location</label>
            <select class="select" id="ed-loc" data-ed="locationId">
              <option value="">No location</option>
              ${locs.map(l=>`<option value="${l.id}" ${e.locationId===l.id?'selected':''}>${esc(l.name)}${l.capacity?` (${l.capacity})`:''}</option>`).join('')}
            </select></div>
          <div class="field"><label class="label" for="ed-enddate">End date (multi-day)</label>
            <input class="input mono" type="date" id="ed-enddate" data-ed="endDate" value="${e.endDate||''}" min="${e.date}"></div>
        </div>

        <div class="field mt-4"><label class="label" for="ed-rec">Repeats</label>
          <select class="select" id="ed-rec" data-ed="recFreq">
            <option value="" ${!e.recurrence?'selected':''}>Does not repeat</option>
            <option value="daily" ${e.recurrence&&e.recurrence.freq==='daily'?'selected':''}>Daily</option>
            <option value="weekly" ${e.recurrence&&e.recurrence.freq==='weekly'&&(e.recurrence.interval||1)===1?'selected':''}>Weekly on ${T.DAYS[T.dow(e.date)]}</option>
            <option value="fortnightly" ${e.recurrence&&e.recurrence.freq==='weekly'&&e.recurrence.interval===2?'selected':''}>Every two weeks</option>
            <option value="monthly" ${e.recurrence&&e.recurrence.freq==='monthly'&&!e.recurrence.bysetpos?'selected':''}>Monthly on this date</option>
            <option value="monthlyNth" ${e.recurrence&&e.recurrence.bysetpos?'selected':''}>Monthly on the same weekday (e.g. first Friday)</option>
            <option value="yearly" ${e.recurrence&&e.recurrence.freq==='yearly'?'selected':''}>Annually</option>
            <option value="termtime" ${e.recurrence&&e.recurrence.termtime?'selected':''}>Every school week (term time only)</option>
          </select>
          ${e.recurrence?`<div class="field mt-3"><label class="label" for="ed-until">Repeat until</label>
            <input class="input mono" type="date" id="ed-until" data-ed="recUntil" value="${e.recurrence.until||''}"></div>`:''}
        </div>

        <hr class="rule-gold mt-6 mb-6">
        <h4 class="eyebrow mb-4">Details</h4>
        <div class="field"><label class="label" for="ed-desc">Description</label>
          <textarea class="textarea" id="ed-desc" data-ed="description" rows="5"
            placeholder="What families and students need to know: what happens, what to bring, what time to arrive.">${esc(e.description)}</textarea>
          <span class="hint">Written in plain English — this text appears in calendar subscriptions and emails too.</span></div>

        <div class="field-row g2 mt-4">
          <div class="field"><label class="label" for="ed-org">Organiser</label>
            <select class="select" id="ed-org" data-ed="organizerId">
              ${USERS.map(u=>`<option value="${u.id}" ${e.organizerId===u.id?'selected':''}>${esc(u.name)}</option>`).join('')}
            </select></div>
          <div class="field"><label class="label" for="ed-vis">Visibility</label>
            <select class="select" id="ed-vis" data-ed="visibility">
              <option value="public" ${e.visibility==='public'?'selected':''}>Public — anyone can see it</option>
              <option value="internal" ${e.visibility==='internal'?'selected':''}>Internal — signed-in community only</option>
              <option value="restricted" ${e.visibility==='restricted'?'selected':''}>Restricted — staff and leadership only</option>
            </select></div>
        </div>

        <div class="field-row g2 mt-4">
          <div class="field"><label class="label" for="ed-status">Status</label>
            <select class="select" id="ed-status" data-ed="status">
              ${['draft','pending','published','cancelled','postponed','completed'].map(s=>`<option value="${s}" ${e.status===s?'selected':''}>${s[0].toUpperCase()+s.slice(1)}</option>`).join('')}
            </select></div>
          <div class="field"><label class="label">Flags</label>
            <label class="check" style="padding-left:0"><input type="checkbox" data-ed="important" ${e.important?'checked':''}><span>Mark as an Important Date</span></label>
            <label class="check" style="padding-left:0"><input type="checkbox" data-ed="notify" ${e.notify?'checked':''}><span>Notify the audience on publish</span></label>
          </div>
        </div>

        <hr class="rule-gold mt-6 mb-6">
        <h4 class="eyebrow mb-4">Attachments</h4>
        ${e.id ? `
          ${(e.attachments||[]).map(a=>`<div class="row card card-pad mb-2" style="padding:10px 14px">
            ${I.file}<a class="grow" href="${esc(a.url)}" target="_blank" rel="noopener" style="font-size:var(--fs-sm)">${esc(a.name)}</a>
            <span class="mono subtle" style="font-size:11px">${a.size?Math.round(a.size/1024)+' KB':''}</span>
            <button class="btn btn-ghost btn-icon btn-sm" data-act="ed-attach-remove" data-id="${a.id}" aria-label="Remove ${esc(a.name)}">${I.trash}</button>
          </div>`).join('')}
          <div class="field mt-3">
            <label class="label" for="ed-file">Add a document</label>
            <input class="input" type="file" id="ed-file" data-act="ed-attach"
              accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.txt,.csv">
            <span class="hint">PDF, images, Word, Excel, text or CSV. Up to 10 MB. Trip letters and permission forms live with the event, not in an email thread.</span>
          </div>
        ` : `<p class="hint">Save the event first, then documents can be attached to it.</p>`}

        <div class="alert alert-info mt-5">${I.info}<div class="txt"><b>Create once, distribute everywhere</b>
          <span class="body">On publish this event becomes available to the website, personal calendar subscriptions, the parent portal, digital signage and the API — with no further work.</span></div></div>
      `}
    </div>
    <div class="drawer-foot">
      ${!isNew?`<button class="btn btn-ghost" data-act="ed-delete">${I.trash}Archive</button>`:''}
      ${!isNew?`<button class="btn btn-ghost" data-act="ed-duplicate">${I.copy}Duplicate</button>`:''}
      <div class="grow"></div>
      <button class="btn btn-ghost" data-act="ed-cancel">Cancel</button>
      ${e.advanced?`<button class="btn btn-outline" data-act="ed-save" data-status="draft">Save draft</button>
      <button class="btn btn-primary" data-act="ed-save" data-status="published">${I.check}${e.status==='published'?'Save changes':'Publish'}</button>`:''}
    </div>
  </aside>`;

  Overlay.open(html);
}

/**
 * Editor fields are handled by delegation, bound once at load. The previous
 * approach attached listeners after each render, which lost anything typed in
 * the moment before they attached — a real race for fast typists.
 */
function applyEditorField(el){
  const e = EditorState;
  if(!e) return;
  const k = el.dataset.ed;

  if(el.type === 'checkbox'){
    e[k] = el.checked;
    if(k === 'allDay') renderEditor();
    return;
  }
  if(k === 'recFreq'){
    const v = el.value;
    if(!v) e.recurrence = null;
    else if(v === 'fortnightly') e.recurrence = {freq:'weekly', interval:2, byday:[T.dow(e.date)], until:(e.recurrence&&e.recurrence.until)||''};
    else if(v === 'termtime'){ const t = termFor(e.date);
      e.recurrence = {freq:'weekly', interval:1, byday:[T.dow(e.date)], termTime:true, until:t?t.end:''}; }
    else if(v === 'weekly') e.recurrence = {freq:'weekly', interval:1, byday:[T.dow(e.date)], until:(e.recurrence&&e.recurrence.until)||''};
    else if(v === 'monthlyNth') e.recurrence = {freq:'monthly', interval:1, byday:[T.dow(e.date)], bysetpos:Math.ceil(Number(e.date.slice(8))/7), until:(e.recurrence&&e.recurrence.until)||''};
    else e.recurrence = {freq:v, interval:1, until:(e.recurrence&&e.recurrence.until)||''};
    renderEditor();
    return;
  }
  if(k === 'recUntil'){ if(e.recurrence) e.recurrence.until = el.value; return; }

  e[k] = el.value;
  e._fieldErrors = null;

  // These change what the rest of the form should offer, so redraw.
  if(k === 'campusId'){
    e.yearGroupIds = (e.yearGroupIds||[]).filter(y => {
      const yg = byId(YEAR_GROUPS, y); return !e.campusId || (yg && yg.campusId === e.campusId);
    });
    renderEditor();
  } else if(k === 'locationId' || k === 'date' || k === 'start' || k === 'end'){
    renderEditor();
  }
}

document.addEventListener('input', e => {
  const el = e.target.closest && e.target.closest('[data-ed]');
  if(!el) return;
  // Text-like fields update state on every keystroke but must not redraw the
  // form mid-typing, or the caret jumps.
  const k = el.dataset.ed;
  if(el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && ['text','search','email',''].includes(el.type))){
    EditorState[k] = el.value;
    if(EditorState._fieldErrors) EditorState._fieldErrors = null;
  }
});

document.addEventListener('change', e => {
  const el = e.target.closest && e.target.closest('[data-ed]');
  if(el) applyEditorField(el);
});

/* ------------------------------------------------------ SCOPE EXPORTS --- */
function eventsForScope(scope){
  const today=T.todayKey();
  const all = Store.state.events.filter(e=>e.status!=='archived'&&e.status!=='draft'&&visibleTo(e,Store.user().role)&&e.visibility!=='restricted');
  switch(scope){
    case 'all': return all;
    case 'my': return all.filter(e=>matchPersonal(e, Store.state.prefs));
    case 'important': return all.filter(e=>e.important);
    case 'holidays': return all.filter(e=>e.categoryId==='holiday'||/term/i.test(e.title));
    case 'exams': return all.filter(e=>['exam','assessment'].includes(e.categoryId));
    case 'early-years': return all.filter(e=>!e.campusId||e.campusId==='ey');
    case 'primary': return all.filter(e=>!e.campusId||e.campusId==='pr');
    case 'secondary': return all.filter(e=>!e.campusId||e.campusId==='se');
    case 'upcoming': return all.filter(e=>e.date>=today);
    case 'ay': { const a=activeAY(); return all.filter(e=>e.date>=a.start&&e.date<=a.end); }
    case 'campus': return all.filter(e=>e.campusId);
    case 'current': {
      const {from,to}=calRange();
      const ids=new Set(query({from,to}).map(o=>o.ev.id));
      return Store.state.events.filter(e=>ids.has(e.id));
    }
    default: return all;
  }
}
const SCOPE_NAMES = {all:'PBIS — All Events', my:'My PBIS Calendar', important:'PBIS — Important Dates',
  holidays:'PBIS — Term Dates and Holidays', exams:'PBIS — Examinations', 'early-years':'PBIS — Early Years',
  primary:'PBIS — Primary', secondary:'PBIS — Secondary', upcoming:'PBIS — Upcoming', ay:'PBIS — Academic Year',
  campus:'PBIS — By Campus', current:'PBIS — Current View'};

/* -------------------------------------------------------- CSV IMPORT ----
   The browser once had its own ICS and CSV parsers here. They drifted from
   the server's — folded lines truncated, all-day DTEND treated as inclusive.
   Both uploads now go through POST /api/v1/admin/imports so there is exactly
   one parser to keep correct. */


/* ------------------------------------------------------ DAY PEEK -------- */
function dayPeek(date){
  const occ = query({from:date,to:date,includeDrafts:true});
  Overlay.open(`
  <div class="scrim" data-act="close-overlay"></div>
  <div class="modal-wrap"><div class="modal" role="dialog" aria-modal="true" aria-label="${T.fmtLong(date)}" tabindex="-1">
    <div class="modal-head"><h3>${T.fmtLong(date)}</h3>
      <span class="badge badge-neutral">${occ.length} event${occ.length===1?'':'s'}</span>
      <button class="icon-btn" style="color:var(--fg-muted)" data-act="close-overlay" aria-label="Close">${I.x}</button></div>
    <div class="modal-body" style="padding:var(--s-3)">
      ${occ.map(o=>`<button class="agenda-item mb-2" style="--cat:${catColour(o.ev.categoryId)};width:100%"
        data-act="open-event" data-id="${o.ev.id}" data-date="${o.date}">
        <span class="at">${o.ev.allDay?'All day':esc(timeLabel(o.ev))}</span>
        <span><span class="an">${esc(o.ev.title)}</span>
        <span class="am"><span>${esc(campusName(o.ev.campusId))}</span><span>${esc(catName(o.ev.categoryId))}</span>
        ${o.ev.locationId?`<span>${esc(locName(o.ev.locationId))}</span>`:''}</span></span></button>`).join('')
        || `<div class="empty">${I.calendar}<h4>Nothing scheduled</h4></div>`}
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" data-act="goto-day" data-date="${date}">Open day view</button>
      ${Store.can('create')?`<button class="btn btn-primary" data-act="new-event-on" data-date="${date}">${I.plus}Add event</button>`:''}
    </div>
  </div></div>`);
}

/* --------------------------------------------------- ACTION HANDLERS ---- */
document.addEventListener('click', e=>{
  const t = e.target.closest('[data-act]');
  if(!t) return;
  const a = t.dataset.act;
  const st = e=>{ e.preventDefault(); e.stopPropagation(); };
  const F = Store.state.ui.filters;
  const toggle = (arr,id)=> arr.includes(id) ? arr.filter(x=>x!==id) : arr.concat([id]);

  switch(a){
    /* --- calendar nav --- */
    case 'cal-prev': st(e); shiftCursor(-1); break;
    case 'cal-next': st(e); shiftCursor(1); break;
    case 'cal-today': st(e); Store.setUI({cursor:T.todayKey()}); break;
    case 'set-view': st(e); Store.setUI({view:t.dataset.view}); break;
    case 'goto-day': st(e); Overlay.close(); Store.setUI({view:'day',cursor:t.dataset.date}); if(App.route.name!=='calendar') go('/calendar'); break;
    case 'day-peek': st(e); dayPeek(t.dataset.date); break;

    /* --- filters --- */
    case 'filter-campus': { st(e); const id=t.dataset.id;
      Store.setFilters({campusIds: id? toggle(F.campusIds,id) : [], yearGroupIds:[]}); App.sideOpen=false; break; }
    case 'filter-yg': { st(e); const id=t.dataset.id; Store.setFilters({yearGroupIds: id? toggle(F.yearGroupIds,id):[]}); break; }
    case 'filter-cat': { st(e); Store.setFilters({categoryIds: toggle(F.categoryIds,t.dataset.id)}); break; }
    case 'filter-aud': { st(e); Store.setFilters({audienceIds: toggle(F.audienceIds,t.dataset.id)}); break; }
    case 'clear-filters': st(e); Store.setFilters({campusIds:[],yearGroupIds:[],categoryIds:[],audienceIds:[],statuses:[],q:''}); break;
    case 'remove-filter': { st(e); const {kind,id}=t.dataset;
      if(kind==='campus') Store.setFilters({campusIds:F.campusIds.filter(x=>x!==id)});
      if(kind==='yg') Store.setFilters({yearGroupIds:F.yearGroupIds.filter(x=>x!==id)});
      if(kind==='cat') Store.setFilters({categoryIds:F.categoryIds.filter(x=>x!==id)});
      if(kind==='aud') Store.setFilters({audienceIds:F.audienceIds.filter(x=>x!==id)});
      if(kind==='q') Store.setFilters({q:''});
      break; }
    case 'campus-cal': st(e); Store.setFilters({campusIds:[t.dataset.id],yearGroupIds:[]}); go('/calendar'); break;
    case 'campus-yg': st(e); Store.setFilters({campusIds:[t.dataset.campus],yearGroupIds:[t.dataset.id]}); go('/calendar'); break;

    /* --- export / subscribe --- */
    case 'ics-scope': { st(e); downloadScope(t.dataset.scope, 'ics');
      toast('Calendar file downloading',{type:'success'}); break; }
    case 'exp': { st(e); downloadScope(t.dataset.scope, t.dataset.fmt);
      toast(`Export starting (.${t.dataset.fmt})`,{type:'success'}); break; }
    case 'export-view': case 'export-list': { st(e);
      const f=Store.state.ui.filters;
      const {from,to}=calRange();
      const qs=new URLSearchParams({scope:'all',format:'ics',from,to});
      downloadUrl('/api/v1/export?'+qs.toString());
      toast('Exporting the current view',{type:'success'}); break; }
    case 'subscribe-view': st(e); go('/subscribe'); break;
    case 'toggle-sub': { st(e); const s=t.dataset.scope; const subs=Store.state.prefs.subscriptions;
      const on=subs.includes(s);
      Store.setPrefs({subscriptions: on? subs.filter(x=>x!==s) : subs.concat([s])});
      toast(on?'Unsubscribed':'Subscribed — copy the feed address into your calendar app',{type:on?'':'success'}); break; }

    /* --- onboarding --- */
    case 'ob-campus': { st(e); App.onboard.campusId=t.dataset.id||null; App.onboard.touchedCampus=true; App.onboard.yearGroupId=null; render(); break; }
    case 'ob-yg': { st(e); App.onboard.yearGroupId=t.dataset.id||null; App.onboard.touchedYg=true; render(); break; }
    case 'ob-aud': { st(e); App.onboard.audienceId=t.dataset.id; render(); break; }
    case 'ob-cat': { st(e); const id=t.dataset.id; App.onboard.categoryIds=toggle(App.onboard.categoryIds,id); render(); break; }
    case 'ob-back': st(e); App.onboard.step=Math.max(0,App.onboard.step-1); render(); break;
    case 'ob-skip': st(e);
      if(App.onboard.step<3){ App.onboard.step++; render(); }
      else { finishOnboarding(); }
      break;
    case 'ob-next': st(e);
      if(App.onboard.step<3){ App.onboard.step++; render(); }
      else finishOnboarding();
      break;
    case 'edit-prefs': st(e); Store.setPrefs({onboarded:false}); App.onboard={step:0,
      campusId:Store.state.prefs.campusId, yearGroupId:Store.state.prefs.yearGroupId,
      audienceId:Store.state.prefs.audienceId, categoryIds:Store.state.prefs.categoryIds.slice()}; render(); break;

    /* --- editor --- */
    case 'new-event': st(e); openEditor(null); break;
    case 'new-event-on': st(e); Overlay.close(); setTimeout(()=>openEditor(null,{date:t.dataset.date}),140); break;
    case 'edit-event-direct': st(e); openEditor(t.dataset.id); break;
    case 'ed-cancel': st(e);
      if(EditorState && EditorState.title && !EditorState._saved){
        confirmDialog({title:'Discard this event?', body:'You have unsaved changes. Closing now will discard them.',
          confirmLabel:'Discard', danger:true, onConfirm:()=>{EditorState=null;}});
      } else { EditorState=null; Overlay.close(); }
      break;
    case 'ed-advanced': st(e); EditorState.advanced=true; renderEditor(); break;
    case 'ed-yg': { st(e); EditorState.yearGroupIds=toggle(EditorState.yearGroupIds||[],t.dataset.id); renderEditor(); break; }
    case 'ed-aud': { st(e); EditorState.audienceIds=toggle(EditorState.audienceIds||[],t.dataset.id); renderEditor(); break; }
    case 'ed-clear-loc': st(e); EditorState.locationId=''; renderEditor(); break;
    case 'ed-ack': st(e); EditorState._ackConflict=true; toast('Conflict acknowledged — the event can be saved',{type:'warning'}); break;
    case 'ed-save-quick': st(e); saveEditor('draft', true); break;
    case 'ed-save': st(e); saveEditor(t.dataset.status); break;
    case 'ed-duplicate': { st(e); const c=JSON.parse(JSON.stringify(EditorState));
      c.id=null; c.seeded=false; c.modified=false; c.slug=null; c.title=c.title+' (copy)'; c.status='draft'; c._saved=false; EditorState=c; renderEditor();
      toast('Duplicated — review and save the copy'); break; }
    case 'ed-delete': { st(e); const id=EditorState.id;
      confirmDialog({title:'Archive this event?', body:'The event is removed from the calendar but kept in the archive with its full history. You can restore it at any time.',
        confirmLabel:'Archive event', danger:true, onConfirm:async()=>{
          try{ EditorState=null; await Store.deleteEvent(id); render();
               toast('Event archived',{type:'success',undo:true}); }
          catch(err){ toast(err.message,{type:'danger'}); } }});
      break; }

    /* --- admin table --- */
    case 'ev-tab': st(e); AdminState.tab=t.dataset.tab; AdminState.selected.clear(); AdminState.page=0; render(); break;
    case 'page': st(e); AdminState.page=Number(t.dataset.to); AdminState.selected.clear(); render(); break;
    case 'sub-tab': st(e); AdminState.subTab=t.dataset.tab; render(); break;
    case 'sort': { st(e); const k=t.dataset.key;
      AdminState.sort = AdminState.sort.key===k ? {key:k,dir:-AdminState.sort.dir} : {key:k,dir:1}; AdminState.page=0; render(); break; }
    case 'sel-row': { const id=t.dataset.id;
      if(AdminState.selected.has(id)) AdminState.selected.delete(id); else AdminState.selected.add(id); render(); break; }
    case 'sel-all': {
      if(AdminState.selected.size){ AdminState.selected.clear(); }
      else { document.querySelectorAll('[data-act="sel-row"]').forEach(cb=>AdminState.selected.add(cb.dataset.id)); }
      render(); break; }
    case 'bulk': { st(e); const op=t.dataset.op; const ids=Array.from(AdminState.selected);
      if(op==='clear'){ AdminState.selected.clear(); render(); break; }
      if(!ids.length) break;
      const OPS = {
        publish:['publish',null,'Published','success'],
        important:['important',null,'Marked important','success'],
        cancel:['cancel',null,'Cancelled','warning'],
        archive:['archive',null,'Archived','success'],
        move7:['move',7,'Moved forward one week','success']
      };
      (async()=>{
        try{
          if(op==='duplicate'){
            for(const id of ids) await Api.post(`/api/v1/admin/events/${id}/duplicate`, {});
            await Store.refresh();
            toast(`${ids.length} events duplicated as drafts`,{type:'success'});
          } else if(op==='export'){
            downloadUrl('/api/v1/export?scope=all&format=ics');
            toast('Export starting',{type:'success'});
          } else if(OPS[op]){
            const [operation,value,label,type]=OPS[op];
            const r=await Store.bulk(ids, operation, value, label);
            const n=r.updated.length, skipped=r.skipped.length;
            toast(`${label}: ${n} event${n===1?'':'s'}${skipped?` · ${skipped} skipped (not yours)`:''}`,
              {type, undo:['publish','important','move'].includes(operation)});
          }
          if(op==='archive'||op==='duplicate') AdminState.selected.clear();
          render();
        }catch(err){ toast(err.message,{type:'danger'}); }
      })();
      break; }
    case 'dup-event': { st(e);
      Api.post(`/api/v1/admin/events/${t.dataset.id}/duplicate`, {})
        .then(async r=>{ await Store.refresh(); render();
          toast(`“${r.data.title}” created as a draft`,{type:'success'}); })
        .catch(err=>toast(err.message,{type:'danger'}));
      break; }

    /* --- submissions --- */
    case 'sub-approve': { st(e); const id=t.dataset.id;
      Api.post(`/api/v1/admin/submissions/${id}/approve`, {})
        .then(async r=>{ await Store.refresh(); render();
          toast(`“${r.data.event.title}” approved and published`,{type:'success'}); })
        .catch(err=>toast(err.message,{type:'danger'}));
      break; }
    case 'sub-reject': { st(e); const s=Store.state.submissions.find(x=>x.id===t.dataset.id);
      confirmDialog({title:'Reject this submission?', body:`“${esc(s.title)}” will be returned to ${esc(userName(s.submittedBy))} as rejected. They can revise and resubmit.`,
        confirmLabel:'Reject', danger:true, onConfirm:()=>{
          Api.post(`/api/v1/admin/submissions/${s.id}/reject`, {note:'Rejected.'})
            .then(async()=>{ await Store.loadAdminExtras(); render(); toast('Submission rejected'); })
            .catch(err=>toast(err.message,{type:'danger'})); }});
      break; }
    case 'sub-changes': { st(e);
      Api.post(`/api/v1/admin/submissions/${t.dataset.id}/request-changes`,
        {note:'Changes requested — please add the missing detail and resubmit.'})
        .then(async()=>{ await Store.loadAdminExtras(); render();
          toast('Changes requested — the submitter has been notified'); })
        .catch(err=>toast(err.message,{type:'danger'}));
      break; }

    /* --- import --- */
    case 'imp-src': { st(e);
      const src = t.dataset.src;
      if(src === AdminState.importSrc) break;
      AdminState.importSrc = src;
      // XLSX genuinely is not parsed here, so say so at the point of choosing
      // rather than letting the upload fail with a 415 further down.
      if(src === 'XLSX') toast('Excel workbooks are not parsed on this deployment — save as CSV first',{type:'warning'});
      render(); break; }
    case 'imp-sample': st(e); previewImport(SAMPLE_CSV); break;
    case 'imp-parse': { st(e); const ta=document.getElementById('imp-paste');
      if(ta && ta.value.trim()) previewImport(ta.value);
      else toast('Paste some rows or upload a file first',{type:'warning'}); break; }
    case 'imp-cancel': { st(e);
      if(AdminState.importJobId) Api.del(`/api/v1/admin/imports/${AdminState.importJobId}`).catch(()=>{});
      AdminState.importRows=null; AdminState.importMap=null; AdminState.importJobId=null;
      AdminState.importText=null; render(); break; }
    case 'imp-row': { const i=Number(t.dataset.i);
      AdminState.importRows[i].include=t.checked;
      AdminState.importRows[i].action=t.checked?'import':'skip'; break; }
    case 'imp-toggle-all': { st(e); const anyOn=AdminState.importRows.some(r=>r.include);
      AdminState.importRows.forEach(r=>{ if(r.status!=='error'){ r.include=!anyOn; r.action=r.include?'import':'skip'; }});
      render(); break; }
    case 'imp-commit': { st(e);
      const rows=AdminState.importRows.filter(r=>r.include&&r.status!=='error');
      if(!rows.length){ toast('No rows selected to import',{type:'warning'}); break; }
      confirmDialog({title:`Import ${rows.length} events?`,
        body:`They will be created as <b>drafts</b> so you can review them before families see them. Nothing is published automatically.`,
        confirmLabel:`Import ${rows.length} events`, onConfirm:async()=>{
          try{
            const decisions={};
            AdminState.importRows.forEach((r,i)=>{ decisions[i]=r.action||'skip'; });
            const res=await Api.post(`/api/v1/admin/imports/${AdminState.importJobId}/commit`, {decisions});
            AdminState.importRows=null; AdminState.importMap=null; AdminState.importJobId=null;
            await Store.refresh(); render();
            toast(`${res.data.created} events imported as drafts${res.data.skipped?` · ${res.data.skipped} skipped`:''}`,
              {type:'success'});
          }catch(err){ toast(err.message,{type:'danger'}); }
        }});
      break; }

    /* --- rollover --- */
    case 'ro-next': st(e);
      if(AdminState.rollover.step<5){ AdminState.rollover.step++; render(); }
      else {
        const to = Store.state.academicYears.find(a=>a.status==='planning')
                || Store.state.academicYears[Store.state.academicYears.length-1];
        const from = Store.state.academicYears.find(a=>a.status==='active');
        Api.post('/api/v1/admin/rollover/commit', {
          fromYearId: from.id, shiftDays: 364,
          newYear: { name: to.name, start: to.start, end: to.end },
          decisions: AdminState.rollover.decisions
        }).then(async r=>{
          AdminState.rollover.step=0;
          await Store.refresh();
          toast(`${to.name} created — ${r.data.created} events copied as drafts for review`,{type:'success'});
          go('/admin/years');
        }).catch(err=>toast(err.message,{type:'danger'}));
      }
      break;
    case 'ro-back': st(e); AdminState.rollover.step=Math.max(0,AdminState.rollover.step-1); render(); break;
    case 'ro-dec': st(e); AdminState.rollover.decisions[t.dataset.k]=t.dataset.v; render(); break;
    case 'ro-keep': { st(e);
      // Accept a double booking deliberately: drop it from the warning list so
      // the reviewer can see at a glance what is still outstanding.
      AdminState.rollover.keep.add(t.dataset.id);
      toast('Conflict accepted — the two events will both stand',{type:'success'});
      render(); break; }

    /* --- session --- */
    case 'sign-in': { st(e); submitSignIn(); break; }
    case 'sign-in-demo': { st(e);
      const f=document.getElementById('si-email'), p=document.getElementById('si-password');
      if(f) f.value=t.dataset.email;
      if(p) p.value=t.dataset.password||'pbis-demo';
      submitSignIn(); break; }
    case 'sign-out': { st(e);
      confirmDialog({title:'Sign out of the CMS?', body:'You will be returned to the sign-in screen. Nothing you have published is affected.',
        confirmLabel:'Sign out', onConfirm:async()=>{ await Store.signOut(); go('/admin'); render();
          toast('Signed out of the CMS'); }});
      break; }

    /* --- misc admin --- */
    case 'switch-user': st(e);
      toast('Sign out and sign in as that person — accounts are real now, so roles cannot be swapped in place.',
        {type:'info'}); break;
    case 'tax-save': st(e); saveTaxonomy(); break;
    case 'ed-attach-remove': { st(e); const aid=t.dataset.id;
      Api.del(`/api/v1/admin/attachments/${aid}`).then(async()=>{
        EditorState.attachments=(EditorState.attachments||[]).filter(a=>a.id!==aid);
        renderEditor(); await Store.refresh(); toast('Attachment removed');
      }).catch(err=>toast(err.message,{type:'danger'}));
      break; }
    case 'tax-add': st(e); openTaxonomyEditor(t.dataset.kind, null); break;
    case 'tax-edit': st(e); openTaxonomyEditor(t.dataset.kind, t.dataset.id); break;
    case 'tax-delete': { st(e); const kind=t.dataset.kind, rid=t.dataset.id, name=t.dataset.name||'this item';
      confirmDialog({title:`Remove ${esc(name)}?`,
        body:'If it is still used by any event it will be archived instead of deleted, so nothing in the calendar breaks.',
        confirmLabel:'Remove', danger:true, onConfirm:async()=>{
          try{
            const r=await Api.del(`/api/v1/admin/taxonomy/${kind}/${rid}`);
            await Store.init(); render();
            toast(r.data.archived
              ? `Archived — still referenced by ${r.data.references} event${r.data.references===1?'':'s'}`
              : 'Removed', {type:'success'});
          }catch(err){ toast(err.message,{type:'danger'}); }
        }});
      break; }
    case 'show-conflicts': { st(e); const cf=allConflicts();
      Overlay.open(`<div class="scrim" data-act="close-overlay"></div><div class="modal-wrap">
        <div class="modal modal-lg" role="dialog" aria-modal="true" aria-label="Scheduling conflicts" tabindex="-1">
        <div class="modal-head"><h3>Potential conflicts</h3><span class="badge badge-warning">${cf.length}</span>
          <button class="icon-btn" style="color:var(--fg-muted)" data-act="close-overlay" aria-label="Close">${I.x}</button></div>
        <div class="modal-body">${cf.map(c=>`<div class="alert alert-warning">${I.alert}<div class="txt">
          <b>${esc(locName(c.locationId))} — ${T.fmtLong(c.date)}</b>
          <span class="body">“${esc(c.a.title)}” ${esc(timeLabel(c.a))} overlaps “${esc(c.b.title)}” ${esc(timeLabel(c.b))}</span></div>
          <button class="btn btn-outline btn-sm" data-act="edit-event-direct" data-id="${c.b.id}">Resolve</button></div>`).join('')
          || `<div class="empty">${I.checkCircle}<h4>No conflicts</h4><p>No location is double-booked.</p></div>`}</div>
        <div class="modal-foot"><button class="btn btn-primary" data-act="close-overlay">Done</button></div></div></div>`);
      break; }
    case 'reset-demo': st(e);
      confirmDialog({title:'Clear local preferences?',
        body:'Theme and personalisation stored in this browser will be cleared. Events in the database are not affected.',
        confirmLabel:'Clear', danger:true, onConfirm:()=>Store.reset()});
      break;
  }
});

function finishOnboarding(){
  const o=App.onboard;
  Store.setPrefs({onboarded:true, campusId:o.campusId, yearGroupId:o.yearGroupId, audienceId:o.audienceId, categoryIds:o.categoryIds});
  toast('Your PBIS Calendar is ready',{type:'success'});
  render();
}

async function saveEditor(status, quick){
  const e = EditorState;
  if(!e.title || !e.title.trim()){ e._err=true; renderEditor(); toast('An event name is required',{type:'danger'});
    setTimeout(()=>{const i=document.getElementById('ed-title'); if(i) i.focus();},100); return; }

  const payload = {
    title:e.title.trim(), description:e.description||'', date:e.date, endDate:e.endDate||null,
    start:e.allDay?null:(e.start||null), end:e.allDay?null:(e.end||null), allDay:!!e.allDay,
    campusId:e.campusId||null, yearGroupIds:e.yearGroupIds||[],
    audienceIds:(e.audienceIds&&e.audienceIds.length)?e.audienceIds:['community'],
    categoryId:e.categoryId||'other', locationId:e.locationId||null, organizerId:e.organizerId||null,
    visibility:e.visibility||'public', status:status||e.status||'draft', important:!!e.important,
    recurrence:e.recurrence||null, links:e.links||[], notify:!!e.notify
  };
  if(e._ackConflict) payload.acknowledgeConflict = true;

  setEditorBusy(true);
  try{
    let saved;
    if(e.id){
      saved = await Store.updateEvent(e.id, payload, status);
      toast(`“${saved.title}” saved`,{type:'success',undo:true});
    } else {
      saved = await Store.addEvent(payload, {acknowledgeConflict:!!e._ackConflict});
      toast(quick ? 'Draft created — add details before publishing'
                  : `“${saved.title}” ${payload.status==='published'?'published':'saved as a draft'}`,
        {type:'success',undo:true});
      if(quick){ EditorState = Object.assign({}, saved, {advanced:true,_saved:false}); renderEditor(); return; }
    }
    if(payload.notify && payload.status==='published'){
      setTimeout(()=>toast('Notification queued for the selected audience',{type:'info'}), 800);
    }
    EditorState = null;
    Overlay.close();
    render();
  }catch(err){
    setEditorBusy(false);
    if(err.status===409 && err.body.conflicts){
      // The server refused because the room is taken. Show it, and let the
      // administrator decide — the same choice the prototype offered.
      EditorState._serverConflicts = err.body.conflicts;
      renderEditor();
      toast('That location is already booked — resolve or acknowledge the clash',{type:'warning'});
      return;
    }
    if(err.status===422 && err.errors.length){
      EditorState._fieldErrors = err.errors;
      renderEditor();
      toast(err.errors[0].message,{type:'danger'});
      return;
    }
    toast(err.message,{type:'danger'});
  }
}

function setEditorBusy(busy){
  document.querySelectorAll('.drawer-foot .btn').forEach(b=>{
    if(busy) b.setAttribute('aria-disabled','true'); else b.removeAttribute('aria-disabled');
  });
}

/* --------------------------------------------------- TAXONOMY EDITOR ---- */
const TAX_FIELDS = {
  campuses:   [['name','Name','text',true],['short','Code','text'],['blurb','Description','textarea'],['colour','Colour','text']],
  yeargroups: [['name','Name','text',true],['campusId','Campus','campus',true],['sortOrder','Order','number']],
  categories: [['name','Name','text',true],['colourVar','Colour token','text']],
  locations:  [['name','Name','text',true],['campusId','Campus','campus'],['capacity','Capacity','number']],
  audiences:  [['name','Name','text',true]],
  years:      [['name','Name','text',true],['startDate','Start date','date',true],['endDate','End date','date',true],['status','Status','status']],
  terms:      [['name','Name','text',true],['academicYearId','Academic year','ay',true],['startDate','Start date','date',true],['endDate','End date','date',true]]
};
const TAX_TITLES = { campuses:'Campus', yeargroups:'Year group', categories:'Category',
  locations:'Location', audiences:'Audience', years:'Academic year', terms:'Term' };

let TaxState = null;
async function openTaxonomyEditor(kind, rowId){
  const fields = TAX_FIELDS[kind]; if(!fields) return;
  let row = {};
  if(rowId){
    try{
      const r = await Api.get(`/api/v1/admin/taxonomy/${kind}`);
      row = (r.data||[]).find(x=>x.id===rowId) || {};
    }catch(err){ toast(err.message,{type:'danger'}); return; }
  }
  TaxState = { kind, id: rowId, row, fields };
  renderTaxonomyEditor();
}

function renderTaxonomyEditor(){
  const {kind, id, row, fields} = TaxState;
  const camel = k => ({campusId:'campus_id', sortOrder:'sort_order', colourVar:'colour_var',
    startDate:'start_date', endDate:'end_date', academicYearId:'academic_year_id'}[k] || k);
  const val = k => row[camel(k)] !== undefined && row[camel(k)] !== null ? row[camel(k)] : '';
  const input = ([key,label,type,required]) => {
    const common = `id="tx-${key}" data-tx="${key}"`;
    if(type==='textarea') return `<textarea class="textarea" ${common} rows="3">${esc(val(key))}</textarea>`;
    if(type==='campus') return `<select class="select" ${common}><option value="">Whole school / shared</option>
      ${CAMPUSES.map(c=>`<option value="${c.id}" ${val(key)===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select>`;
    if(type==='ay') return `<select class="select" ${common}>
      ${Store.state.academicYears.map(a=>`<option value="${a.id}" ${val(key)===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select>`;
    if(type==='status') return `<select class="select" ${common}>
      ${['draft','planning','active','archived'].map(x=>`<option value="${x}" ${val(key)===x?'selected':''}>${x[0].toUpperCase()+x.slice(1)}</option>`).join('')}</select>`;
    return `<input class="input${type==='date'?' mono':''}" type="${type==='number'?'number':type==='date'?'date':'text'}" ${common} value="${esc(val(key))}">`;
  };
  Overlay.open(`
  <div class="scrim" data-act="close-overlay"></div>
  <div class="modal-wrap"><div class="modal" role="dialog" aria-modal="true" aria-label="${id?'Edit':'Add'} ${TAX_TITLES[kind]}" tabindex="-1">
    <div class="modal-head"><h3>${id?'Edit':'Add'} ${TAX_TITLES[kind].toLowerCase()}</h3>
      <button class="icon-btn" style="color:var(--fg-muted)" data-act="close-overlay" aria-label="Close">${I.x}</button></div>
    <div class="modal-body">
      ${fields.map(f=>`<div class="field mb-4">
        <label class="label" for="tx-${f[0]}">${esc(f[1])}${f[3]?' <span class="req">*</span>':''}</label>
        ${input(f)}</div>`).join('')}
      <p class="hint">Changes take effect across the public calendar, every feed and the API immediately.</p>
    </div>
    <div class="modal-foot">
      ${id?`<button class="btn btn-ghost btn-danger" data-act="tax-delete" data-kind="${kind}" data-id="${id}" data-name="${esc(row.name||'')}">${I.trash}Remove</button>`:''}
      <div class="grow"></div>
      <button class="btn btn-ghost" data-act="close-overlay">Cancel</button>
      <button class="btn btn-primary" data-act="tax-save">${I.check}${id?'Save changes':'Create'}</button>
    </div>
  </div></div>`);
  setTimeout(()=>{ const first=document.querySelector('[data-tx]'); if(first) first.focus(); }, 60);
}

async function saveTaxonomy(){
  const {kind, id} = TaxState;
  const body = {};
  document.querySelectorAll('[data-tx]').forEach(el=>{
    const k = el.dataset.tx;
    let v = el.value;
    if(el.type==='number') v = v === '' ? null : Number(v);
    body[k] = v === '' ? null : v;
  });
  if(!body.name){ toast('A name is required',{type:'danger'}); return; }
  try{
    if(id) await Api.patch(`/api/v1/admin/taxonomy/${kind}/${id}`, body);
    else    await Api.post(`/api/v1/admin/taxonomy/${kind}`, body);
    Overlay.close();
    await Store.init();
    render();
    toast(`${TAX_TITLES[kind]} ${id?'updated':'created'}`,{type:'success'});
  }catch(err){
    toast(err.errors && err.errors.length ? err.errors[0].message : err.message, {type:'danger'});
  }
}

/* ------------------------------------------------------------ SIGN IN --- */
async function submitSignIn(){
  const email = (document.getElementById('si-email')||{}).value;
  const password = (document.getElementById('si-password')||{}).value;
  const err = document.getElementById('si-error');
  if(!email || !password){
    if(err){ err.textContent='Enter your email address and password.'; err.hidden=false; }
    return;
  }
  const btn = document.querySelector('[data-act="sign-in"]');
  if(btn) btn.setAttribute('aria-disabled','true');
  try{
    const user = await Store.signIn(email, password);
    render();
    toast(`Signed in as ${user.name} · ${ROLES[user.role].name}`,{type:'success'});
  }catch(e2){
    if(btn) btn.removeAttribute('aria-disabled');
    if(err){
      err.textContent = e2.status===429
        ? 'Too many attempts. Please wait a moment and try again.'
        : 'That email address and password do not match an account.';
      err.hidden = false;
    }
    const p = document.getElementById('si-password'); if(p){ p.value=''; p.focus(); }
  }
}

/* ------------------------------------------------------- IMPORT PREVIEW - */
async function previewImport(text, mapping){
  try{
    AdminState.importText = text;
    const r = await Api.post('/api/v1/admin/imports', Object.assign(
      { content: text, sourceCampus: AdminState.importCampus || 'auto' },
      mapping ? { mapping } : {}));
    AdminState.importJobId = r.data.id;
    AdminState.importMap = r.data.mapping;
    AdminState.importRows = r.data.rows.map(x => ({ ...x, include: x.action === 'import' }));
    render();
    const s2 = r.data.summary;
    toast(`${r.data.rows.length} rows parsed · ${s2.ready||0} ready, ${(s2.error||0)} error, ${(s2.duplicate||0)} duplicate`,
      {type:'success'});
  }catch(err){
    toast(err.status===415 ? err.body.message : err.message, {type:'danger'});
  }
}

/* -------------------------------------------------------- DRAG & DROP --- */
let dragId=null;
document.addEventListener('dragstart', e=>{
  const el=e.target.closest('[data-drag]'); if(!el) return;
  dragId=el.dataset.drag; el.classList.add('dragging');
  e.dataTransfer.effectAllowed='move';
  try{ e.dataTransfer.setData('text/plain', dragId); }catch(err){}
});
document.addEventListener('dragend', e=>{ document.querySelectorAll('.dragging').forEach(x=>x.classList.remove('dragging')); dragId=null; });
document.addEventListener('dragover', e=>{
  const cell=e.target.closest('[data-drop]'); if(!cell||!dragId) return;
  e.preventDefault(); e.dataTransfer.dropEffect='move';
  document.querySelectorAll('.drop-target').forEach(x=>x.classList.remove('drop-target'));
  cell.classList.add('drop-target');
});
document.addEventListener('dragleave', e=>{
  const cell=e.target.closest('[data-drop]'); if(cell) cell.classList.remove('drop-target');
});
document.addEventListener('drop', e=>{
  const cell=e.target.closest('[data-drop]'); if(!cell||!dragId) return;
  e.preventDefault();
  document.querySelectorAll('.drop-target').forEach(x=>x.classList.remove('drop-target'));
  const newDate = cell.dataset.date;
  const ev = Store.state.events.find(x=>x.id===dragId);
  if(!ev || ev.date===newDate){ dragId=null; return; }
  const shift = T.diffDays(ev.date, newDate);
  const patch = {date:newDate};
  if(ev.endDate) patch.endDate = T.addDays(ev.endDate, shift);
  Store.updateEvent(ev.id, patch, 'moved')
    .then(()=>{ render(); toast(`“${ev.title}” moved to ${T.fmtMed(newDate)}`,{type:'success',undo:true}); })
    .catch(err=>{
      if(err.status===409){ toast('That move would double-book the room — open the event to confirm',{type:'warning'}); }
      else toast(err.message,{type:'danger'});
      Store.refresh();
    });
  dragId=null;
});

/* Sign-in form submits with Enter as well as the button. */
document.addEventListener('submit', e=>{
  if(e.target && e.target.id === 'signin-form'){ e.preventDefault(); submitSignIn(); }
});

/* --------------------------------------------------- SEARCH DEBOUNCE ---- */
let searchTimer=null;
document.addEventListener('input', e=>{
  const el=e.target.closest('[data-act="search-input"]'); if(!el) return;
  clearTimeout(searchTimer);
  const v=el.value;
  searchTimer=setTimeout(()=>{
    AdminState.page=0;
    Store.setFilters({q:v});
    const focused=document.activeElement===el;
    render();
    if(focused){
      const again=document.querySelector('[data-act="search-input"]');
      if(again){ again.focus(); again.setSelectionRange(v.length,v.length); }
    }
  },260);
});
document.addEventListener('change', async e=>{
  const file=e.target.closest('[data-act="ed-attach"]');
  if(file && file.files && file.files[0]){
    const fd=new FormData(); fd.append('file', file.files[0]);
    try{
      const r=await Api.request('POST', `/api/v1/admin/events/${EditorState.id}/attachments`, fd);
      EditorState.attachments = (EditorState.attachments||[]).concat([r.data]);
      renderEditor();
      toast(`“${r.data.name}” attached`,{type:'success'});
      await Store.refresh();
    }catch(err){
      toast(err.status===415 ? 'That file type is not allowed.'
          : err.status===413 ? 'That file is larger than 10 MB.'
          : err.message, {type:'danger'});
    }
    return;
  }
  const ps=e.target.closest('[data-act="page-size"]');
  if(ps){ AdminState.pageSize=Number(ps.value); AdminState.page=0; AdminState.selected.clear(); render(); return; }

  // Correcting a column re-reads the whole file against the corrected mapping.
  // Relabelling the heading alone would leave the parsed rows wrong.
  const ic=e.target.closest('[data-act="imp-campus"]');
  if(ic){ AdminState.importCampus=ic.value; return; }

  const mp=e.target.closest('[data-act="imp-map"]');
  if(mp){
    if(!AdminState.importText){ toast('Re-upload the file to change its mapping',{type:'warning'}); return; }
    const mapping=[...document.querySelectorAll('[data-act="imp-map"]')]
      .map(sel=>({source:sel.dataset.src, target:sel.value}));
    previewImport(AdminState.importText, mapping);
    return;
  }

  const el=e.target.closest('[data-act="imp-file"]'); if(!el||!el.files||!el.files[0]) return;
  const f=el.files[0]; const r=new FileReader();
  // One parser, on the server. The browser used to have its own copy, which
  // drifted: it mishandled folded lines and treated an all-day DTEND as
  // inclusive when RFC 5545 says it is exclusive.
  r.onload=()=>previewImport(String(r.result||''));
  r.readAsText(f);
});


/* ------------------------------------------------------------- RENDER --- */
function render(){
  App.route = parseRoute();
  const r = App.route;
  const root = document.getElementById('app');
  const scrollY = window.scrollY;

  if(r.name==='signage'){
    document.documentElement.setAttribute('data-surface','signage');
    document.title = routeTitle(r);
    root.innerHTML = viewSignage();
    startClock();
    App._lastRoute='signage';
    return;
  }

  let body;
  switch(r.name){
    case 'home':      body = viewHome(); break;
    case 'calendar':  body = viewCalendar(); break;
    case 'event':     body = viewEventPage(r.slug); break;
    case 'my':        body = viewMy(); break;
    case 'subscribe': body = viewSubscribe(); break;
    case 'dates':     body = viewDates(); break;
    case 'year':      body = viewYear(); break;
    case 'campus':    body = viewCampus(r.slug); break;
    case 'embed':     body = viewEmbed(); break;
    case 'api':       body = viewAPI(); break;
    case 'admin':     body = viewAdmin(r.sub); break;
    default:          body = notFound();
  }
  if(r.name==='admin'){
    document.documentElement.setAttribute('data-surface','cms');
    root.innerHTML = renderAdminMasthead(r.sub) + body;
  } else {
    document.documentElement.setAttribute('data-surface','public');
    root.innerHTML = renderMasthead() + body + (r.name==='calendar'||r.name==='my' ? '' : renderFooter());
  }
  document.title = routeTitle(r);
  bindReveals();
  // preserve scroll on in-place updates (filters, tabs) but not on navigation
  if(r.name===App._lastRoute && r.sub===App._lastSub && r.slug===App._lastSlug) window.scrollTo(0, scrollY);
  else window.scrollTo(0,0);
  App._lastRoute=r.name; App._lastSub=r.sub; App._lastSlug=r.slug;

  const st=document.getElementById('side-toggle');
  if(st) st.style.display = window.matchMedia('(max-width:1100px)').matches ? 'inline-flex' : 'none';
  measureSticky();
}
PBIS.render = render;

/* The calendar toolbar can wrap on narrower screens, so the sticky offset for the
   weekday header must be measured rather than assumed. */
function measureSticky(){
  const header = document.querySelector('.masthead');
  const bar = document.querySelector('.cal-bar');
  if(!bar){ document.documentElement.style.removeProperty('--cal-sticky'); return; }
  const strip = document.querySelector('.active-filters');
  const h = (header?header.offsetHeight:64) + bar.offsetHeight + (strip?strip.offsetHeight:0);
  document.documentElement.style.setProperty('--cal-sticky', h+'px');
}
PBIS.measureSticky = measureSticky;

function routeTitle(r){
  const base = 'PBIS Central Calendar';
  const m = {home:base+' — One School. Three Campuses. One Shared Calendar.', calendar:'Calendar · '+base,
    my:'My PBIS Calendar · '+base, subscribe:'Subscribe · '+base, dates:'Important Dates · '+base,
    year:'Academic Year · '+base, signage:'Today at PBIS', embed:'Embed · '+base, api:'API · '+base,
    admin:'CMS · '+base};
  if(r.name==='event'){ const e=Store.state.events.find(x=>x.slug===r.slug); return (e?e.title+' · ':'')+base; }
  if(r.name==='campus'){ const c=CAMPUSES.find(x=>x.slug===r.slug); return (c?c.name+' · ':'')+base; }
  return m[r.name]||base;
}

let clockTimer=null;
function startClock(){
  if(clockTimer) clearInterval(clockTimer);
  clockTimer = setInterval(()=>{
    const el=document.getElementById('sig-clock');
    if(!el){ clearInterval(clockTimer); clockTimer=null; return; }
    el.textContent = T.nowClock();
  }, 15000);
}

