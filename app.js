(() => {
 const cfg=window.DPRO_PET_SALON_CONFIG, core=window.DPRO_BOOKING_CORE;
 const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
 const yen=n=>`${Number(n||0).toLocaleString('ja-JP')}円`;
 const setAll=(sel,text)=>$$(sel).forEach(el=>el.textContent=text);
 const menu=$('#bizNav'); $('#bizMenuToggle')?.addEventListener('click',()=>menu?.classList.toggle('open'));
 $$('#bizNav a').forEach(a=>a.addEventListener('click',()=>menu?.classList.remove('open')));
 $$('[data-member-url]').forEach(el=>el.href=cfg.system.memberUrl); $$('[data-owner-url]').forEach(el=>el.href=cfg.system.ownerUrl);
 const io=('IntersectionObserver' in window)?new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('show');io.unobserve(e.target)}}),{threshold:.08}):null;
 $$('.reveal').forEach(el=>io?io.observe(el):el.classList.add('show'));
 function firstService(list,code,re){return list.find(s=>s.service_code===code)||list.find(s=>re.test(s.service_name||''))||list[0]}
 async function load(){ if(!core){setAll('[data-system-sync]','DEMO表示');return;} try{
   const today=core.todayKey(); const [status,salon,option,hotel,times,hotelAvail]=await Promise.all([core.getStatus(),core.getSalonServices(),core.getOptionServices(),core.getHotelServices(),core.getTrimAvailableTimes(today),core.getHotelAvailability(today,7,{force:true})]);
   setAll('[data-system-sync]','DPRO本体とリアルタイム連動');
   const avail=(times.times||[]).filter(t=>t.can_reserve).map(t=>t.time); setAll('[data-live-next-trim]',avail[0]?`${avail[0]}〜 予約可`:(times.is_closed?'本日 定休日':'本日の空きは予約画面へ'));
   const hd=(hotelAvail.days||[]).find(d=>d.date===today)||(hotelAvail.days||[])[0]; if(hd){setAll('[data-live-hotel-capacity]',`1日最大 ${hotelAvail.capacity||hd.capacity||'-'}頭`); setAll('[data-live-hotel]',hd.can_stay?`残り${hd.remaining}頭`:(hd.is_full?'満室':'受付休止'));}
   const shampoo=firstService(salon.services||[],'shampoo_small',/シャンプー/), cut=firstService(salon.services||[],'cut_small',/カット/), hsvc=(hotel.services||[])[0];
   if(shampoo)setAll('[data-live-shampoo-price]',`${yen(shampoo.base_price)}〜`); if(cut)setAll('[data-live-cut-price]',`${yen(cut.base_price)}〜`); if(hsvc)setAll('[data-live-hotel-price]',`${yen(hsvc.base_price)}〜 / 1泊`);
   if((option.services||[]).length)setAll('[data-live-option]',(option.services||[]).map(s=>`${s.service_name} +${yen(s.base_price)}`).join(' / '));
 }catch(e){console.error(e);setAll('[data-system-sync]','本体接続を確認中');setAll('[data-live-next-trim]','予約画面で確認');setAll('[data-live-hotel]','予約画面で確認');}}
 load();
})();