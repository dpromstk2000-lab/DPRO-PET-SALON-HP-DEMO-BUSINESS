(() => {
  const cfg = window.DPRO_PET_SALON_CONFIG;
  if (!cfg?.system) throw new Error('DPRO PET SALON system config is required');
  const legacy = String(cfg.system.legacyApiBase || '').replace(/\/$/, '');
  const shopCode = cfg.system.shopCode;
  const hotelCache = new Map();

  const pad2 = n => String(n).padStart(2, '0');
  const dateKey = d => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  const parseDate = key => { const [y,m,d] = String(key).split('-').map(Number); return new Date(y,m-1,d); };
  const todayKey = () => dateKey(new Date());
  const addDays = (key, days) => { const d = parseDate(key); d.setDate(d.getDate()+Number(days||0)); return dateKey(d); };
  const diffDays = (a,b) => Math.round((parseDate(b)-parseDate(a))/86400000);
  const stayKeys = (checkin, checkout) => {
    const out=[]; let cur=checkin; let guard=0;
    while(cur < checkout && guard++ < 90){ out.push(cur); cur=addDays(cur,1); }
    return out;
  };

  async function api(url, options={}) {
    const response = await fetch(url, {
      cache:'no-store',
      ...options,
      headers:{ ...(options.body?{'Content-Type':'application/json'}:{}), ...(options.headers||{}) }
    });
    const data = await response.json().catch(()=>({}));
    if (!response.ok || data?.ok === false) {
      const err = new Error(data?.message || data?.error || `API接続エラー (${response.status})`);
      err.status = response.status;
      err.detail = data?.detail || data;
      throw err;
    }
    return data;
  }
  function q(params){
    const u=new URLSearchParams();
    Object.entries(params||{}).forEach(([k,v])=>{
      if(v!==undefined&&v!==null&&v!=='')u.set(k,String(v));
    });
    return u.toString();
  }

  async function health() { return api(`${legacy}/api/health`); }
  async function getStatus() { return api(`${legacy}/api/public/status?${q({shop_code:shopCode})}`); }
  async function getServices(category='salon') { return api(`${legacy}/api/public/services?${q({shop_code:shopCode,category})}`); }
  async function getSalonServices() { return getServices('salon'); }
  async function getHotelServices() { return getServices('hotel'); }
  async function getOptionServices() { return getServices('option'); }
  async function getTrimAvailableDays(from=todayKey(), days=7) { return api(`${legacy}/api/public/available-days?${q({shop_code:shopCode,from,days})}`); }
  async function getTrimAvailableTimes(date) { return api(`${legacy}/api/public/available-times?${q({shop_code:shopCode,date})}`); }

  async function getHotelAvailability(from=todayKey(), days=14, {force=false}={}) {
    const key=`${from}:${days}`;
    if(!force && hotelCache.has(key)) return hotelCache.get(key);
    const data=await api(`${legacy}/api/public/hotel-availability?${q({shop_code:shopCode,from,days})}`);
    (data.days||[]).forEach(d=>hotelCache.set(`day:${d.date}`,d));
    hotelCache.set(key,data);
    return data;
  }
  async function getHotelDay(date){
    if(hotelCache.has(`day:${date}`)) return hotelCache.get(`day:${date}`);
    const data=await getHotelAvailability(date,7,{force:true});
    return (data.days||[]).find(d=>d.date===date)||null;
  }
  function timeInWindow(time, day){
    const start=String(day?.handoff_start||'').slice(0,5), end=String(day?.handoff_end||'').slice(0,5);
    if(!start&&!end) return true;
    if(start&&time<start) return false;
    if(end&&time>end) return false;
    return true;
  }
  async function validateHotelStay(checkin, checkout, heads=1, checkinTime='10:00', checkoutTime='10:00') {
    if(!checkin||!checkout) return {ok:false,reason:'日程を選択してください。',days:[]};
    if(checkin < todayKey()) return {ok:false,reason:'過去の日付は選択できません。',days:[]};
    if(checkout <= checkin) return {ok:false,reason:'チェックアウトはチェックイン翌日以降を選択してください。',days:[]};
    const keys=stayKeys(checkin,checkout);
    const span=Math.max(7,diffDays(checkin,checkout)+2);
    const data=await getHotelAvailability(checkin,span,{force:true});
    const map=new Map((data.days||[]).map(d=>[d.date,d]));
    const days=keys.map(k=>map.get(k)).filter(Boolean);
    const missing=keys.find(k=>!map.has(k));
    if(missing) return {ok:false,reason:`${missing} のホテル空き状況を確認できませんでした。`,days,capacity:data.capacity};
    const stayBlocked=days.find(d=>!d.can_stay || Number(d.remaining||0)<Number(heads||1));
    if(stayBlocked){
      const reason=!stayBlocked.stay_allowed
        ? `${stayBlocked.date} はホテル宿泊を受け付けていません${stayBlocked.hotel_reason?`（${stayBlocked.hotel_reason}）`:''}。`
        : `${stayBlocked.date} は${Number(stayBlocked.remaining||0)<=0?'満室':`残り${stayBlocked.remaining}頭`}のため、この宿泊期間は予約できません。`;
      return {ok:false,reason,blockedDate:stayBlocked.date,days,capacity:data.capacity};
    }
    const ci=map.get(checkin);
    if(!ci?.can_checkin) return {ok:false,reason:`${checkin} はチェックイン受付ができません。`,blockedDate:checkin,days,capacity:data.capacity};
    if(!timeInWindow(checkinTime,ci)) return {ok:false,reason:`${checkin} のチェックイン受付時間は ${ci.handoff_start||'指定時間'}〜${ci.handoff_end||'指定時間'} です。`,blockedDate:checkin,days,capacity:data.capacity};
    const co=map.get(checkout);
    if(!co?.can_checkout) return {ok:false,reason:`${checkout} はチェックアウト受付ができません。`,blockedDate:checkout,days,capacity:data.capacity};
    if(!timeInWindow(checkoutTime,co)) return {ok:false,reason:`${checkout} のチェックアウト受付時間は ${co.handoff_start||'指定時間'}〜${co.handoff_end||'指定時間'} です。`,blockedDate:checkout,days,capacity:data.capacity};
    return {ok:true,reason:'この期間はご予約可能です。',days,nights:diffDays(checkin,checkout),capacity:data.capacity,operation:data.operation};
  }
  async function findNextAvailableStay(nights, heads=1, start=todayKey(), lookahead=45){
    const n=Math.max(1,Number(nights||1));
    const data=await getHotelAvailability(start,Math.max(7,lookahead+n),{force:true});
    const map=new Map((data.days||[]).map(d=>[d.date,d]));
    for(let i=0;i<lookahead;i++){
      const ci=addDays(start,i), co=addDays(ci,n), keys=stayKeys(ci,co);
      if(keys.every(k=>{const d=map.get(k); return d && d.can_stay && Number(d.remaining||0)>=heads;}) && map.get(ci)?.can_checkin && map.get(co)?.can_checkout) return {checkin:ci,checkout:co};
    }
    return null;
  }
  async function createTrimReservation(payload){
    return api(`${legacy}/api/reservations/create`,{method:'POST',body:JSON.stringify({...payload,shop_code:shopCode})});
  }
  async function createHotelApplication(payload){
    hotelCache.clear();
    return api(`${legacy}/api/hotel/applications/create`,{method:'POST',body:JSON.stringify({...payload,shop_code:shopCode})});
  }

  window.DPRO_BOOKING_CORE = {
    version:'CORE-DIRECT-LINK-V1.0.3-SYSTEM-SYNC-POLISH', todayKey,addDays,parseDate,dateKey,diffDays,stayKeys,
    health,getStatus,getServices,getSalonServices,getHotelServices,getOptionServices,getTrimAvailableDays,getTrimAvailableTimes,
    getHotelAvailability,getHotelDay,validateHotelStay,findNextAvailableStay,
    createTrimReservation,createHotelApplication
  };
})();