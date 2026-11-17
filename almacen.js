/* Transline · Alistar pedidos (almacén, computadora). Usa la sesión del portal y el motor de Despachos. */
(function(){
const $ = s => document.querySelector(s);
const esc = s => String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const PORTAL = TL.PORTAL_URL || "../transline/";
$("#inicio").href = PORTAL;

let portal=null; try{ portal=JSON.parse(localStorage.getItem("tl_portal")||"null"); }catch(e){}
if(!portal||!portal.pin){ location.replace(PORTAL); return; }
const PIN=portal.pin;
let U=null, ordenes=[], previo=null, vista="alistar";

function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("show");clearTimeout(toast.h);toast.h=setTimeout(()=>t.classList.remove("show"),3500)}
let audio=null;
document.addEventListener("pointerdown",()=>{ try{ if(!audio) audio=new (window.AudioContext||window.webkitAudioContext)(); if(audio.state==="suspended") audio.resume(); }catch(e){} },{passive:true});
function sonar(tonos){ try{ if(!audio) return; const t=audio.currentTime;
  tonos.forEach(([f,d])=>{const o=audio.createOscillator(),g=audio.createGain();o.type="sine";o.frequency.value=f;
    g.gain.setValueAtTime(.0001,t+d);g.gain.exponentialRampToValueAtTime(.4,t+d+.02);g.gain.exponentialRampToValueAtTime(.0001,t+d+.35);
    o.connect(g).connect(audio.destination);o.start(t+d);o.stop(t+d+.4)}); }catch(e){} }
const SONIDO_NUEVO=[[660,0],[880,.2],[660,.4],[880,.6]];      // pedido nuevo
const SONIDO_ETIQ=[[1047,0],[1319,.18],[1568,.36]];            // etiquetas listas

async function api(body){
  const r=await fetch(TL.API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(Object.assign({pin:PIN},body))});
  const j=await r.json(); if(!j.ok){const e=new Error(j.error||"error");throw e} return j;
}
const hoyTxt=()=>{const d=new Date();return String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0")+"/"+d.getFullYear();};

/* ---------- textos ---------- */
function destino(o){
  const c=o.c, d=c?c.destino:(o.destinoPrev||"");
  if(d==="Provincia"){
    if(!c) return "📍 Provincia · agencia por confirmar";
    return "📍 Provincia – "+c.ciudad+" · "+c.agencia+(c.entrega==="Entrega a domicilio"?" · a domicilio":"");
  }
  if(d==="Lima"){ if(!c) return "📍 Lima"; return "📍 Lima · "+(c.entrega==="Recojo en tienda"?"Recojo en tienda":(c.distrito||"")); }
  return "📍 Destino por confirmar";
}
function tarjeta(o,clase){
  const total=o.productos.reduce((a,x)=>a+(+x.q||0),0);
  return '<div class="cab"><span class="od">'+esc(o.codigo)+'</span><span class="quien">Vendedor: '+esc(o.vendedor)+'</span></div>'+
    '<div class="dest">'+esc(destino(o))+'</div>'+
    '<div class="chips">'+(o.embalaje?'<span class="chip emb">'+esc(o.embalaje.toUpperCase())+'</span>':'')+
      (o.pago==="Contraentrega"?'<span class="chip cobrar">CONTRAENTREGA · COBRAR</span>':'')+
      (!o.c?'<span class="chip espera">Cliente aún no envía sus datos</span>':'')+
      (o.bultos&&o.estado!=="Pendiente"&&o.estado!=="Alistado"?'<span class="chip">'+o.bultos+' bulto'+(o.bultos>1?'s':'')+'</span>':'')+'</div>'+
    '<ul class="prod">'+o.productos.map(x=>'<li><span class="q">'+x.q+' ×</span><span>'+esc(x.p)+(x.s?'<small>'+esc(x.s)+'</small>':'')+'</span></li>').join("")+'</ul>'+
    '<div class="total">'+total+' producto'+(total===1?'':'s')+' en total</div>'+
    (o.obs?'<div class="obs">📝 '+esc(o.obs)+'</div>':'');
}

/* ---------- pintar ---------- */
function pintar(){
  const nuevos=ordenes.filter(o=>o.estado==="Pendiente");
  const alistados=ordenes.filter(o=>o.estado==="Alistado");
  const emb=ordenes.filter(o=>o.estado==="Embalado");
  const hoy=ordenes.filter(o=>o.estado==="Despachado"&&o.t&&String(o.t.Despachado||"").startsWith(hoyTxt()));
  const porImp=emb.filter(o=>o.c&&!(o.t&&o.t.impreso)).length;
  const setN=(id,n)=>{const e=$(id);e.textContent=n;e.classList.toggle("cero",!n)};
  setN("#n-alistar",nuevos.length+alistados.length); setN("#n-imprimir",emb.length); $("#n-hoy").textContent=hoy.length;
  document.title=(nuevos.length?"("+nuevos.length+") ":"")+"Alistar pedidos · Transline";

  const colN=$("#col-nuevos"), colA=$("#col-alistados"); colN.innerHTML=""; colA.innerHTML="";
  if(!nuevos.length) colN.innerHTML='<div class="alm-vacio">No hay pedidos nuevos. 👍</div>';
  if(!alistados.length) colA.innerHTML='<div class="alm-vacio">Nada pendiente de embalar.</div>';
  nuevos.forEach(o=>colN.appendChild(cardAlistar(o)));
  alistados.forEach(o=>colA.appendChild(cardEmbalar(o)));

  const li=$("#lista-imprimir"); li.innerHTML="";
  if(!emb.length) li.innerHTML='<div class="alm-vacio">No hay pedidos embalados. Cuando embales uno, aparecerá aquí para imprimir sus etiquetas.</div>';
  emb.sort((a,b)=>(a.c?0:1)-(b.c?0:1)).forEach(o=>li.appendChild(cardImprimir(o)));

  const lh=$("#lista-hoy"); lh.innerHTML="";
  if(!hoy.length) lh.innerHTML='<div class="alm-vacio">Todavía no se despacha nada hoy.</div>';
  hoy.forEach(o=>{const d=document.createElement("div");d.className="pedido listo";
    d.innerHTML=tarjeta(o)+'<div class="acc"><span class="quien">Salió: '+esc(String(o.t.Despachado).split(" · ")[0])+'</span><button type="button" class="deshacer">Reimprimir etiquetas</button></div>';
    d.querySelector(".deshacer").onclick=()=>TLEtiq.imprimir([o]); lh.appendChild(d);});
}
function marcarNuevo(d,o){ if(previo&&!previo[o.codigo]) d.classList.add("nuevo-flash"); }
function cardAlistar(o){
  const d=document.createElement("div"); d.className="pedido"; marcarNuevo(d,o);
  d.innerHTML=tarjeta(o)+'<div class="acc"><button type="button" class="alm-btn ancho">✓ Ya está alistado</button></div>';
  d.querySelector(".alm-btn").onclick=e=>estado(o,"Alistado",null,e.target);
  return d;
}
function cardEmbalar(o){
  const d=document.createElement("div"); d.className="pedido alistado";
  d.innerHTML=tarjeta(o)+'<div class="bultos-box"><label>¿Cuántos bultos?</label><div class="stepper"><button type="button" aria-label="Uno menos">−</button><input type="tel" inputmode="numeric" value="'+(o.bultos||1)+'" aria-label="Bultos"><button type="button" aria-label="Uno más">+</button></div>'+
    '<button type="button" class="alm-btn azul ancho">📦 Ya está embalado</button></div>'+
    '<div class="acc"><button type="button" class="deshacer">↩ Volver a "Nuevos"</button></div>';
  const inp=d.querySelector(".stepper input"), [menos,mas]=d.querySelectorAll(".stepper button");
  menos.onclick=()=>{inp.value=Math.max(1,(parseInt(inp.value,10)||1)-1)}; mas.onclick=()=>{inp.value=Math.min(99,(parseInt(inp.value,10)||1)+1)};
  d.querySelector(".alm-btn").onclick=e=>{const n=parseInt(inp.value,10); if(!(n>=1&&n<=99)){toast("Escribe cuántos bultos son (1 a 99)");return} estado(o,"Embalado",n,e.target)};
  d.querySelector(".deshacer").onclick=e=>estado(o,"Pendiente",null,e.target);
  return d;
}
function cardImprimir(o){
  const d=document.createElement("div"); const impresa=!!(o.t&&o.t.impreso);
  d.className="pedido "+(o.c?(impresa?"listo":""):"espera");
  let acc;
  if(!o.c) acc='<button type="button" class="alm-btn sec ancho" disabled>⏳ Esperando los datos del cliente</button>';
  else if(!impresa) acc='<button type="button" class="alm-btn azul ancho" data-a="imp">🖨️ Imprimir '+o.bultos+' etiqueta'+(o.bultos>1?'s':'')+'</button>';
  else acc='<button type="button" class="alm-btn ancho" data-a="desp">🚚 Ya salió (despachado)</button><button type="button" class="alm-btn sec" data-a="re">Reimprimir</button>';
  d.innerHTML=tarjeta(o)+'<div class="acc">'+acc+'</div>'+(o.estado==="Embalado"&&!impresa?'<div class="acc"><button type="button" class="deshacer" data-a="atras">↩ Volver a "Alistados"</button></div>':'');
  const on=(a,fn)=>{const b=d.querySelector('[data-a="'+a+'"]'); if(b) b.onclick=fn;};
  on("imp",async e=>{ TLEtiq.imprimir([o]); e.target.disabled=true;
    try{ const j=await api({action:"impreso",codigo:o.codigo}); reemplazar(j.orden); pintar(); }catch(err){ toast("Se imprimió, pero no se pudo guardar. Revisa el internet."); e.target.disabled=false; } });
  on("re",()=>TLEtiq.imprimir([o]));
  on("desp",e=>estado(o,"Despachado",null,e.target));
  on("atras",e=>estado(o,"Alistado",null,e.target));
  return d;
}
function reemplazar(o){ ordenes=ordenes.map(x=>x.codigo===o.codigo?o:x); }
async function estado(o,est,bultos,btn){
  if(btn) btn.disabled=true;
  try{ const j=await api({action:"estado",codigo:o.codigo,estado:est,bultos}); reemplazar(j.orden); recordar(); pintar();
    toast({Alistado:"✓ "+o.codigo+" alistado",Embalado:"📦 "+o.codigo+" embalado"+(j.orden.c?" · ya puedes imprimir sus etiquetas":" · las etiquetas saldrán cuando el cliente envíe sus datos"),Despachado:"🚚 "+o.codigo+" despachado",Pendiente:o.codigo+" volvió a Nuevos"}[est]||est); }
  catch(e){ if(btn) btn.disabled=false; toast(e.message==="permiso"?"Tu usuario no puede cambiar estados.":e.message==="sin_datos"?"Falta que el cliente envíe sus datos.":"No se pudo guardar. Revisa el internet e intenta de nuevo."); }
}

/* ---------- avisos ---------- */
const firma=o=>o.estado+"|"+(o.c?1:0);
function recordar(){ previo={}; ordenes.forEach(o=>previo[o.codigo]=firma(o)); }
function detectar(){
  if(previo){
    const nuevos=ordenes.filter(o=>!previo[o.codigo]&&o.estado==="Pendiente");
    const listas=ordenes.filter(o=>o.c&&o.estado==="Embalado"&&previo[o.codigo]&&previo[o.codigo].endsWith("|0"));
    if(nuevos.length){ sonar(SONIDO_NUEVO); toast("📦 "+(nuevos.length===1?"Pedido nuevo: "+nuevos[0].codigo:nuevos.length+" pedidos nuevos")); }
    else if(listas.length){ sonar(SONIDO_ETIQ); toast("🖨️ Ya puedes imprimir las etiquetas de "+listas.map(o=>o.codigo).join(", ")); }
  }
}

/* ---------- carga ---------- */
async function cargar(){
  try{
    const r=await fetch(TL.API_URL+"?action=list&pin="+encodeURIComponent(PIN)); const j=await r.json();
    if(!j.ok){ sinAcceso("Tu usuario no tiene acceso a Alistar pedidos. Pide a la administración el rol «Almacén» en Despachos."); return; }
    U=j.usuario; $("#u-nombre").textContent=U.nombre;
    if(U.rol==="vendedor"){ sinAcceso("Esta pantalla es para el almacén. Los vendedores usan Despachos desde el inicio."); return; }
    ordenes=j.ordenes; const prev=previo; detectar(); pintar(); recordar(); if(!prev) recordar();
    const h=new Date(); $("#sync").textContent="Actualizado "+String(h.getHours()).padStart(2,"0")+":"+String(h.getMinutes()).padStart(2,"0");
  }catch(e){ $("#sync").textContent="Sin conexión"; }
}
function sinAcceso(t){ $("#sin-acceso").hidden=false; $("#sin-acceso").innerHTML=esc(t)+' <a href="'+PORTAL+'">Volver al inicio</a>'; document.querySelectorAll(".alm-view").forEach(v=>v.hidden=true); $(".alm-tabs").hidden=true; }

function tab(n){ vista=n; document.querySelectorAll(".alm-tabs button").forEach(b=>b.setAttribute("aria-selected",b.dataset.tab===n));
  document.querySelectorAll(".alm-view").forEach(v=>v.hidden=v.id!=="v-"+n); window.scrollTo(0,0); }
document.querySelectorAll(".alm-tabs button").forEach(b=>b.onclick=()=>tab(b.dataset.tab));
const ini=new URLSearchParams(location.search).get("vista"); if(["alistar","imprimir","hoy"].includes(ini)) tab(ini);
$("#prueba").onclick=()=>TLEtiq.imprimir([{codigo:"OD-0000",fecha:hoyTxt()+" 00:00",bultos:1,embalaje:"Con embalaje",
  c:{comprobante:"Factura",nombre:"Empresa de prueba SAC",tipoDoc:"RUC",doc:"20601457785",tel:"999999999",destino:"Provincia",ciudad:"Huancayo",agencia:"Shalom",entrega:"Recojo en agencia",sede:"Sede El Tambo",atencion:{nombre:"Persona de prueba",doc:"12345678",tel:"999999999"}}}]);

cargar();
setInterval(()=>{ if(document.visibilityState==="visible") cargar(); },20000);
document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="visible") cargar(); });
})();
