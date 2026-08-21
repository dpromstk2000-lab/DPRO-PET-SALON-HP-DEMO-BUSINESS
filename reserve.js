(() => {
  const cfg = window.DPRO_PET_SALON_CONFIG;
  const core = window.DPRO_BOOKING_CORE;
  if (!cfg || !core) throw new Error('DPRO PET SALON booking core is not loaded');

  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const params = new URLSearchParams(location.search);
  const typeParam = params.get('type');
  const repeatMode = params.get('repeat') === '1';

  const state = {
    step: 0,
    service: typeParam === 'hotel' ? 'hotel' : 'trim',
    store: cfg.stores[0]?.id || 'main',
    pet: cfg.demoPets[0]?.id || null,
    menu: null,
    options: [],
    date: null,
    time: null,
    checkin: null,
    checkout: null,
    checkinTime: '10:00',
    checkoutTime: '10:00',
    hotelTrim: false,
    hotelValidation: null,
    customer: { name:cfg.demoCustomer?.ownerName||'デモ太郎', phone:cfg.demoCustomer?.phone||'08000002004', contact:cfg.demoCustomer?.contact||'LINE連携済みDEMO' }
  };

  let menus = [];
  let options = [];
  let hotelNightPrice = Number(cfg.hotel?.nightPrice||0);
  let trimDays = [];
  const trimTimes = new Map();
  let hotelAvailability = null;

  const stepsTrim = ['ペット・メニュー','日時','お客様情報','確認','完了'];
  const stepsHotel = ['ペット・宿泊','日程','お客様情報','確認','完了'];
  const yen = n => `${Number(n||0).toLocaleString('ja-JP')}円`;
  const petById = id => cfg.demoPets.find(p=>p.id===id);
  const menuById = id => menus.find(m=>m.id===id);
  const html = v => String(v ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dateLabel = key => {
    const d=core.parseDate(key);
    return `${d.getMonth()+1}/${d.getDate()}`;
  };
  const dowLabel = key => ['日','月','火','水','木','金','土'][core.parseDate(key).getDay()];

  function normalizeService(s, index){
    const code = String(s.service_code || s.code || '');
    return {
      id: code || String(s.id || `service-${index}`),
      service_code: code,
      category: s.category || 'salon',
      size: s.size_label || s.size || s.target_size || 'メニュー',
      name: s.service_name || s.name || 'メニュー',
      duration: Number(s.base_minutes || s.duration || 60),
      price: Number(s.base_price || s.price || 0),
      description: s.description || s.note || `${Number(s.base_minutes || s.duration || 60)}分目安`
    };
  }

  function setLiveSource(text, ok=true){
    $('#liveSourceText').textContent=text;
    const dot=$('.live-dot');
    if(dot) dot.style.background=ok?'#3c7555':'#a46d27';
  }

  function buildSteps() {
    const list = state.service === 'hotel' ? stepsHotel : stepsTrim;
    $('#steps').innerHTML = list.map((name,i)=>`<span class="step-chip ${i===state.step?'active':''}">${i+1}. ${name}</span>`).join('');
  }

  function buildPetChoices() {
    $('#petChoices').innerHTML = cfg.demoPets.map(p=>`
      <button type="button" class="choice ${p.id===state.pet?'selected':''}" data-pet="${html(p.id)}">
        <strong>${html(p.name)}ちゃん</strong><span class="muted">${html(p.breed)} / ${html(p.weight)}kg / ${html(p.age)}</span>
      </button>`).join('') + `<button type="button" class="choice"><strong>＋ 新しいペットを追加</strong><span class="muted">DEMOでは登録済みペットを使用します</span></button>`;
    $$('[data-pet]').forEach(b=>b.addEventListener('click',()=>{ state.pet=b.dataset.pet; buildPetChoices(); updateSummary(); }));
  }

  function buildMenuChoices() {
    $('#menuChoices').innerHTML = menus.map(m=>`
      <button type="button" class="choice ${m.id===state.menu?'selected':''}" data-menu="${html(m.id)}">
        <span class="pill">${html(m.size)}</span><strong style="margin-top:10px">${html(m.name)}</strong>
        <span class="muted">${html(m.description)}</span><span class="price">${yen(m.price)}〜</span>
      </button>`).join('');
    $$('[data-menu]').forEach(b=>b.addEventListener('click',()=>{ state.menu=b.dataset.menu; buildMenuChoices(); updateSummary(); }));

    $('#optionList').innerHTML = options.map(o=>`
      <div class="option-row"><label><input type="checkbox" value="${html(o.id)}" ${state.options.includes(o.id)?'checked':''}>${html(o.name)}</label><strong>＋${yen(o.price)}</strong></div>`).join('');
    $$('#optionList input').forEach(i=>i.addEventListener('change',()=>{
      state.options = $$('#optionList input:checked').map(x=>x.value); updateSummary();
    }));
  }

  function statusLabel(slot){
    if(!slot) return {mark:'—',text:'取得不可',disabled:true};
    if(slot.can_reserve){
      const rem=Number(slot.remaining??0), max=Number(slot.max_reservations_per_slot??1);
      if(max>1 && rem===1) return {mark:'△1',text:'残り1枠',disabled:false};
      return {mark:'○',text:'予約可能',disabled:false};
    }
    const reason=String(slot.disabled_reason||'');
    if(reason.includes('満枠')) return {mark:'×',text:reason,disabled:true};
    if(reason.includes('過去')||reason.includes('より前')) return {mark:'—',text:'受付終了',disabled:true};
    return {mark:'—',text:reason||'受付不可',disabled:true};
  }

  function calendarDates(){
    if(trimDays.length) return trimDays.slice(0,7).map(d=>({key:d.date,label:dateLabel(d.date),dow:d.weekday_label||dowLabel(d.date),day:d}));
    return Array.from({length:7},(_,i)=>{const key=core.addDays(core.todayKey(),i);return {key,label:dateLabel(key),dow:dowLabel(key),day:null};});
  }

  function calendarTimes(){
    const set=new Set();
    for(const d of calendarDates().slice(0,5)){
      for(const t of (trimTimes.get(d.key)?.times||[])) set.add(t.time);
    }
    return [...set].sort((a,b)=>a.localeCompare(b)).slice(0,18);
  }

  function buildCalendar() {
    const dates=calendarDates();
    const times=calendarTimes();
    $('#calendarHead').innerHTML = `<th>時間</th>` + dates.slice(0,5).map(d=>`<th>${d.label}<br>${d.dow}${d.day?.is_closed?'<br><span style="color:#8d514d">休</span>':''}</th>`).join('');
    if(!times.length){
      $('#calendarBody').innerHTML=`<tr><td colspan="6" class="muted" style="padding:24px">DPRO本体から予約枠を取得しています…</td></tr>`;
      return;
    }
    $('#calendarBody').innerHTML = times.map(t=>`<tr><th>${t}</th>${dates.slice(0,5).map(d=>{
      const slot=(trimTimes.get(d.key)?.times||[]).find(x=>x.time===t);
      const st=statusLabel(slot);
      const selected=state.date===d.key&&state.time===t;
      return `<td><button class="slot-btn ${selected?'selected':''}" ${st.disabled?'disabled':''} data-date="${d.key}" data-time="${t}" aria-label="${d.label} ${t} ${html(st.text)}">${st.mark}</button></td>`;
    }).join('')}</tr>`).join('');
    $$('.slot-btn[data-date]').forEach(b=>b.addEventListener('click',()=>{state.date=b.dataset.date;state.time=b.dataset.time;buildCalendar();buildMobileSlots();updateSummary();}));
  }

  function buildMobileSlots() {
    const dates=calendarDates();
    if(!state.date) state.date = dates.find(d=>d.day?.can_reserve)?.key || dates[0]?.key || null;
    $('#dateTabs').innerHTML = dates.map(d=>`<button class="date-tab ${state.date===d.key?'selected':''}" data-date-tab="${d.key}">${d.label}(${d.dow})${d.day?.is_closed?' 休':''}</button>`).join('');
    $$('[data-date-tab]').forEach(b=>b.addEventListener('click',()=>{state.date=b.dataset.dateTab;state.time=null;buildMobileSlots();buildCalendar();updateSummary();}));
    const row=trimTimes.get(state.date);
    $('#timeList').innerHTML = (row?.times||[]).map(slot=>{
      const st=statusLabel(slot), selected=state.time===slot.time;
      return `<button class="time-btn ${selected?'selected':''}" ${st.disabled?'disabled':''} data-mobile-time="${slot.time}"><span>${slot.time}</span><span>${st.mark} ${html(st.text)}</span></button>`;
    }).join('') || `<div class="notice">${html(row?.is_closed?'この日は受付できません。':'予約枠を取得できませんでした。')}</div>`;
    $$('[data-mobile-time]').forEach(b=>b.addEventListener('click',()=>{state.time=b.dataset.mobileTime;buildMobileSlots();buildCalendar();updateSummary();}));
  }

  async function loadTrimAvailability(){
    try{
      const days=await core.getTrimAvailableDays(core.todayKey(),7);
      trimDays=Array.isArray(days.days)?days.days:[];
      await Promise.all(trimDays.map(async d=>{
        try{ trimTimes.set(d.date, await core.getTrimAvailableTimes(d.date)); }
        catch(e){ trimTimes.set(d.date,{date:d.date,times:[],error:e.message}); }
      }));
      setLiveSource('DPRO PET SALON本体に接続中｜予約枠・ホテル定員をリアルタイム参照');
    }catch(e){
      console.error(e);
      setLiveSource(`本体予約枠の取得に失敗：${e.message}`,false);
    }
    buildCalendar(); buildMobileSlots();
  }

  function buildStoreSelect() {
    const box = $('#storeBox');
    if (!cfg.features.multiStore) { box.hidden = true; return; }
    box.hidden = false;
    $('#storeSelect').innerHTML = cfg.stores.map(s=>`<option value="${html(s.id)}" ${s.id===state.store?'selected':''} ${!s.live?'disabled':''}>${html(s.name)}${!s.live?'（表示例）':''}</option>`).join('');
    $('#storeSelect').addEventListener('change', e=>{state.store=e.target.value;updateSummary();});
  }

  function hotelDayLabel(d){
    if(!d.stay_allowed) return {cls:'closed', text:`休 ${d.hotel_reason||d.closed_reason||'ホテル休業'}`};
    if(Number(d.remaining||0)<=0) return {cls:'full', text:'× 満室'};
    if(d.salon_closed || d.special_override){
      if(d.checkin_allowed || d.checkout_allowed){
        const time=d.handoff_limited ? ` ${d.handoff_start||''}〜${d.handoff_end||''}` : '';
        const io=d.checkin_allowed&&d.checkout_allowed?'受渡可':d.checkin_allowed?'IN可':d.checkout_allowed?'OUT可':'宿泊継続のみ';
        return {cls:'limited', text:`△ 宿泊可 / ${io}${time}`};
      }
      return {cls:'limited', text:'△ 宿泊継続のみ'};
    }
    if(Number(d.remaining||0)===1) return {cls:'limited', text:'△ 残り1頭'};
    return {cls:'available', text:`○ 残り${Number(d.remaining||0)}頭`};
  }

  function renderHotelDays(data){
    hotelAvailability=data;
    $('#hotelCapacityLabel').textContent=`（1日最大 ${Number(data?.capacity||0)}頭）`;
    const op=data?.operation||{};
    const modeLabel={always_open:'365日ホテル営業',holiday_handoff:'定休日の宿泊・受け渡しを個別設定',closed_with_salon:'サロン休業日にホテルも休業',custom:'個別設定'}[op.mode]||'個別設定';
    const detail=(op.mode==='holiday_handoff'||op.mode==='custom') ? ` / 宿泊${op.holiday_stay_allowed?'○':'×'}・IN${op.holiday_checkin_allowed?'○':'×'}・OUT${op.holiday_checkout_allowed?'○':'×'}${op.holiday_handoff_start&&op.holiday_handoff_end?`・${op.holiday_handoff_start}〜${op.holiday_handoff_end}`:''}` : '';
    $('#hotelPolicyNote').textContent=`ホテル営業：${modeLabel}${detail}`;
    const rows=(data?.days||[]).slice(0,8);
    $('#hotelDays').innerHTML=rows.map(d=>{
      const s=hotelDayLabel(d);
      return `<div class="hotel-day ${s.cls}"><strong>${dateLabel(d.date)}（${html(d.weekday_label||dowLabel(d.date))}）</strong><span>${html(s.text)}</span></div>`;
    }).join('') || `<div class="hotel-day"><strong>取得できません</strong><span>本体接続を確認してください</span></div>`;
  }

  async function loadHotelAvailability(from=core.todayKey()){
    $('#hotelDays').innerHTML=`<div class="hotel-day"><strong>読込中</strong><span>DPRO本体へ接続中…</span></div>`;
    try{
      const data=await core.getHotelAvailability(from,14,{force:true});
      renderHotelDays(data);
      return data;
    }catch(e){
      $('#hotelDays').innerHTML=`<div class="hotel-day closed"><strong>接続エラー</strong><span>${html(e.message)}</span></div>`;
      setLiveSource(`ホテル空き状況の取得に失敗：${e.message}`,false);
      return null;
    }
  }

  async function validateHotelSelection(){
    const el=$('#hotelStayResult');
    if(!state.checkin||!state.checkout){
      state.hotelValidation=null;
      el.className='hotel-result loading';
      el.textContent='チェックイン・チェックアウトを選択すると、宿泊期間すべての空きを確認します。';
      return;
    }
    el.className='hotel-result loading'; el.textContent='DPRO本体で宿泊期間の空きを確認しています…';
    try{
      const result=await core.validateHotelStay(state.checkin,state.checkout,1,state.checkinTime,state.checkoutTime);
      state.hotelValidation=result;
      if(result.ok){
        el.className='hotel-result ok';
        const min=Math.min(...result.days.map(d=>Number(d.remaining||0)));
        el.textContent=`○ ご予約可能です。${result.nights}泊 / 期間中の最少残り ${Number.isFinite(min)?min:'-'}頭。`;
      }else{
        el.className='hotel-result ng'; el.textContent=`× ${result.reason}`;
      }
    }catch(e){
      state.hotelValidation={ok:false,reason:e.message};
      el.className='hotel-result ng'; el.textContent=`× 空き状況を確認できませんでした：${e.message}`;
    }
  }

  function updateServiceUI() {
    $('#trimBlock').hidden = state.service !== 'trim';
    $('#hotelBlock').hidden = state.service !== 'hotel';
    $('#serviceTrim').classList.toggle('selected', state.service==='trim');
    $('#serviceHotel').classList.toggle('selected', state.service==='hotel');
    $('#dateStepTitle').textContent = state.service==='hotel' ? '宿泊日程を選択' : 'ご希望の日時を選択';
    $('#trimCalendarWrap').hidden = state.service==='hotel';
    $('#hotelDateWrap').hidden = state.service!=='hotel';
    $('#hotelCustomerExtra').hidden = state.service!=='hotel';
    if(state.service==='hotel') loadHotelAvailability(state.checkin||core.todayKey());
    buildSteps(); updateSummary();
  }

  $('#serviceTrim').addEventListener('click',()=>{state.service='trim';state.step=0;updateServiceUI();});
  $('#serviceHotel').addEventListener('click',()=>{state.service='hotel';state.step=0;updateServiceUI();});

  function buildHotelTimeSelects(){
    const times=[];
    for(let h=8;h<=19;h++) for(const m of [0,30]) { if(h===19&&m===30) continue; times.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`); }
    for(const id of ['checkinTime','checkoutTime']){
      const el=$(`#${id}`); el.innerHTML=times.map(t=>`<option value="${t}">${t}</option>`).join('');
      el.value=id==='checkinTime'?state.checkinTime:state.checkoutTime;
      el.addEventListener('change',async e=>{ if(id==='checkinTime') state.checkinTime=e.target.value; else state.checkoutTime=e.target.value; updateSummary(); await validateHotelSelection(); });
    }
  }

  function syncHotelDateLimits() {
    const checkin=$('#checkin'), checkout=$('#checkout'), today=core.todayKey();
    checkin.min=today;
    if (checkin.value && checkin.value < today) checkin.value='';
    state.checkin=checkin.value||null;
    const checkoutMin=state.checkin ? core.addDays(state.checkin,1) : core.addDays(today,1);
    checkout.min=checkoutMin;
    if (checkout.value && checkout.value < checkoutMin) checkout.value='';
    state.checkout=checkout.value||null;
  }

  syncHotelDateLimits();
  $('#checkin').addEventListener('change',async e=>{
    if(e.target.value && e.target.value < core.todayKey()){e.target.value='';alert('過去の日付は選択できません。');}
    state.checkin=e.target.value||null; syncHotelDateLimits(); updateSummary();
    await loadHotelAvailability(state.checkin||core.todayKey()); await validateHotelSelection();
  });
  $('#checkout').addEventListener('change',async e=>{
    syncHotelDateLimits();
    if(e.target.value && state.checkin && e.target.value<=state.checkin){e.target.value='';state.checkout=null;alert('チェックアウトはチェックイン翌日以降を選択してください。');}
    else state.checkout=e.target.value||null;
    updateSummary(); await validateHotelSelection();
  });
  $('#hotelTrim').addEventListener('change',e=>{state.hotelTrim=e.target.checked;updateSummary();});

  function optionTotal(){ return state.options.reduce((sum,id)=>sum+(options.find(o=>o.id===id)?.price||0),0); }
  function hotelNights(){ return state.checkin&&state.checkout ? Math.max(0,core.diffDays(state.checkin,state.checkout)) : 0; }
  function total(){ if(state.service==='hotel') return hotelNights()*hotelNightPrice; return (menuById(state.menu)?.price||0)+optionTotal(); }

  function updateSummary() {
    const pet = petById(state.pet), store = cfg.stores.find(s=>s.id===state.store), menu = menuById(state.menu);
    const optionNames = state.options.map(id=>options.find(o=>o.id===id)?.name).filter(Boolean).join('、');
    const when = state.service==='hotel' ? (state.checkin&&state.checkout?`${state.checkin} ${state.checkinTime} 〜 ${state.checkout} ${state.checkoutTime}`:'未選択') : (state.date&&state.time?`${state.date} ${state.time}`:'未選択');
    const serviceText = state.service==='hotel' ? `ペットホテル${state.hotelTrim?'＋滞在中トリミング希望':''}` : (menu?`${menu.name}${optionNames?`＋${optionNames}`:''}`:'未選択');
    $('#summaryList').innerHTML = `
      <div class="summary-line"><span>店舗</span><strong>${html(store?.name||'-')}</strong></div>
      <div class="summary-line"><span>ペット</span><strong>${pet?html(pet.name)+'ちゃん':'未選択'}</strong></div>
      <div class="summary-line"><span>内容</span><strong>${html(serviceText)}</strong></div>
      <div class="summary-line"><span>日時</span><strong>${html(when)}</strong></div>
      <div class="summary-line"><span>料金目安</span><strong>${total()?yen(total())+'〜':'未確定'}</strong></div>`;
    $('#confirmContent').innerHTML = $('#summaryList').innerHTML;
  }

  function validStep(){
    if(state.step===0){ if(!state.pet) return false; if(state.service==='trim'&&!state.menu) return false; return true; }
    if(state.step===1){
      if(state.service==='hotel') return !!(state.checkin&&state.checkout&&state.hotelValidation?.ok);
      return !!(state.date&&state.time);
    }
    if(state.step===2){
      if(!($('#customerName').value.trim() && $('#customerPhone').value.trim())) return false;
      if(state.service==='hotel' && (!$('#emergencyPhone').value.trim() || !$('#hotelTerms').checked || (cfg.hotel?.requireVaccineConfirmation && !$('#vaccineConfirmed').checked))) return false;
      return true;
    }
    return true;
  }

  function showStep() {
    $$('.step-panel').forEach((p,i)=>p.classList.toggle('active',i===state.step));
    buildSteps();
    $('#prevBtn').style.visibility = state.step===0 || state.step===4 ? 'hidden' : 'visible';
    $('#nextBtn').style.display = state.step>=3 ? 'none' : 'inline-flex';
    $('#confirmBtn').style.display = state.step===3 ? 'inline-flex' : 'none';
    $('#actions').style.display = state.step===4 ? 'none' : 'flex';
    window.scrollTo({top:0,behavior:'smooth'});
  }

  $('#nextBtn').addEventListener('click',async()=>{
    if(state.step===1 && state.service==='hotel') await validateHotelSelection();
    if(!validStep()){ alert(state.service==='hotel'&&state.step===1 ? (state.hotelValidation?.reason||'宿泊期間の空きを確認してください。') : '未選択の項目があります。内容をご確認ください。'); return; }
    if(state.step===2){
      state.customer.name=$('#customerName').value.trim();
      state.customer.phone=$('#customerPhone').value.trim();
      state.customer.contact=$('#customerContact').value.trim()||'LINE連携済み';
      updateSummary();
    }
    state.step++; showStep();
  });

  $('#prevBtn').addEventListener('click',()=>{state.step=Math.max(0,state.step-1);showStep();});

  $('#confirmBtn').addEventListener('click',async()=>{
    const btn=$('#confirmBtn'), err=$('#bookingError');
    err.classList.remove('show'); err.textContent='';
    btn.disabled=true; btn.textContent='DPRO本体へ登録中…';
    try{
      const pet=petById(state.pet);
      let result;
      if(state.service==='hotel'){
        const validation=await core.validateHotelStay(state.checkin,state.checkout,1,state.checkinTime,state.checkoutTime);
        if(!validation.ok) throw new Error(validation.reason);
        result=await core.createHotelApplication({
          owner_name:state.customer.name,
          phone:state.customer.phone,
          checkin_date:state.checkin,
          checkout_date:state.checkout,
          checkin_time:state.checkinTime,
          checkout_time:state.checkoutTime,
          emergency_contact_phone:$('#emergencyPhone').value.trim(),
          vaccine_confirmed:$('#vaccineConfirmed').checked,
          terms_accepted:$('#hotelTerms').checked,
          pets:[{
            pet_id:pet.pet_id||'', pet_name:pet.name, species:pet.species||'dog', breed:pet.breed||'',
            age_label:pet.age||'', weight:Number(pet.weight||0), caution_note:pet.note||''
          }],
          request_note:[state.hotelTrim?'滞在中トリミング希望':'',$('#requestNote').value.trim()].filter(Boolean).join('\n')
        });
        $('#completeNotice').textContent=`DPRO PET SALON本体のデモ店舗へホテル申込を登録しました。申込ID: ${result.application?.id||'-'}（実店舗への通知ではありません）`;
      }else{
        const menu=menuById(state.menu);
        if(!menu?.service_code) throw new Error('DPRO本体のメニューコードを取得できていません。再読み込みしてください。');
        result=await core.createTrimReservation({
          owner_name:state.customer.name,
          phone:state.customer.phone,
          reservation_date:state.date,
          reservation_time:state.time,
          pets:[{
            pet_name:pet.name, species:pet.species||'dog', breed:pet.breed||'',
            weight:Number(pet.weight||0), service_code:menu.service_code,
            options:state.options, request_note:$('#requestNote').value.trim()
          }]
        });
        $('#completeNotice').textContent=`DPRO PET SALON本体のデモ店舗へ予約希望を登録しました。予約ID: ${result.reservations?.[0]?.id||'-'}（実店舗への通知ではありません）`;
      }
      state.step=4;
      $('#completeDate').textContent = state.service==='hotel' ? `${state.checkin} ${state.checkinTime} 〜 ${state.checkout} ${state.checkoutTime}` : `${state.date} ${state.time}`;
      $('#completePet').textContent = `${pet?.name||''}ちゃん`;
      showStep();
    }catch(e){
      console.error(e);
      err.textContent=`登録できませんでした：${e.message}`;
      err.classList.add('show');
    }finally{
      btn.disabled=false; btn.textContent='予約を確定する';
    }
  });

  async function init(){
    $('#customerName').value=state.customer.name; $('#customerPhone').value=state.customer.phone; $('#customerContact').value=state.customer.contact;
    $('#emergencyPhone').value=state.customer.phone;
    const memberLink=$('#memberDemoLink'); if(memberLink) memberLink.href=cfg.system.memberUrl;
    if(!cfg.hotel?.requireVaccineConfirmation){ const label=$('#vaccineRequiredLabel'); if(label) label.textContent='任意'; }
    buildHotelTimeSelects(); buildStoreSelect(); buildPetChoices();
    try{
      const health=await core.health();
      const [salonResult, optionResult, hotelResult] = await Promise.allSettled([core.getSalonServices(), core.getOptionServices(), core.getHotelServices()]);
      if(salonResult.status==='fulfilled') menus=(salonResult.value.services||[]).map(normalizeService);
      if(!menus.length) menus=(cfg.fallbackMenus||[]).map(normalizeService);
      if(optionResult.status==='fulfilled') options=(optionResult.value.services||[]).map(normalizeService);
      if(!options.length) options=(cfg.fallbackOptions||[]).map(normalizeService);
      if(hotelResult.status==='fulfilled'){ const hs=(hotelResult.value.services||[]).map(normalizeService); if(hs[0]?.price) hotelNightPrice=hs[0].price; }
      state.menu=menus[0]?.id||null;
      if(repeatMode){
        const rp=cfg.repeatDemo||{};
        if(rp.petId && petById(rp.petId)) state.pet=rp.petId;
        const rm=menus.find(m=>m.service_code===rp.serviceCode); if(rm) state.menu=rm.id;
        state.options=(rp.optionCodes||[]).filter(code=>options.some(o=>o.id===code||o.service_code===code));
        const note=$('#repeatNotice'); if(note) note.hidden=false;
        buildPetChoices();
      }
      setLiveSource(`DPRO PET SALON本体 接続OK｜${health.worker_version||'Worker'}｜料金・予約枠・ホテル定員を同期`);
    }catch(e){
      console.error(e);
      menus=(cfg.fallbackMenus||[]).map(normalizeService); options=(cfg.fallbackOptions||[]).map(normalizeService); state.menu=menus[0]?.id||null;
      setLiveSource(`本体接続に失敗・DEMOフォールバック表示：${e.message}`,false);
    }
    buildMenuChoices(); updateSummary(); updateServiceUI(); showStep();
    await Promise.all([loadTrimAvailability(), loadHotelAvailability(core.todayKey())]);
    if(state.service==='hotel') await validateHotelSelection();
  }

  init();
})();