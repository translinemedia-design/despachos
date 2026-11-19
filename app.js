/* Transline · Órdenes de despacho · v2 (app del equipo) */
(function(){
const $ = s => document.querySelector(s);
const LS = { get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}}, set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}} };
const esc = s => String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const pad = n => String(n).padStart(2,"0");
const ESTADOS = ["Pendiente","Alistado","Embalado","Despachado"];
const PAGOS = ["Cancelado","Pendiente","Contraentrega","Adelanto"];
const EXTRA_KEY = "tl_extra";
const key = p => p.n+"|"+(p.s||"");

/* Sesión compartida con el portal Transline (un solo PIN para todos los módulos) */
const leerPortal = () => { try { return JSON.parse(localStorage.getItem("tl_portal")||"null"); } catch(e){ return null; } };
let PIN = (leerPortal()||{}).pin || "";
if(PIN && LS.get("tl_ultimo_pin","")!==PIN){            // otra persona entró en este equipo: se limpia lo guardado
  ["tl_usuario","tl_ordenes2","tl_estados3","tl_nuevos"].forEach(k=>{try{localStorage.removeItem(k)}catch(e){}});
  LS.set("tl_ultimo_pin",PIN);
}
let U = LS.get("tl_usuario",null);           // {nombre, rol}
let ordenes = LS.get("tl_ordenes2",[]);
let catalogo = (LS.get("tl_catalogo",null)||CAT_BASE).concat(LS.get(EXTRA_KEY,[]));
let catSel = "";
let agencias = LS.get("tl_agencias",[]);
const opForm = () => ({ agencias, buscarCliente: async doc => { const r=await fetch(TL.API_URL+"?action=buscarCliente&pin="+encodeURIComponent(PIN)+"&doc="+doc); const j=await r.json(); return j.ok?j.cliente:null; } });
let nuevos = new Set(LS.get("tl_nuevos",[]));
let estadosPrev = LS.get("tl_estados4",null);
let formNueva = null, formDatos = null, ordenDatos = null;
const S = { lineas:[], pago:"Cancelado", embalaje:"Automático", quien:"El cliente (link)", destino:"" };
let creada = null, hechos = new Set();

/* ---------- utilidades ---------- */
function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("show");clearTimeout(toast.h);toast.h=setTimeout(()=>t.classList.remove("show"),2800)}
function idTemporal(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
function abrir(url){const a=document.createElement("a");a.href=url;a.target="_blank";a.rel="noopener";document.body.appendChild(a);a.click();a.remove()}
function abrirWA(txt,tel){ tel=(tel||"").replace(/\D/g,""); if(tel&&tel.length===9) tel="51"+tel; abrir("https://wa.me/"+tel+"?text="+encodeURIComponent(txt)); }
async function copiar(txt){try{await navigator.clipboard.writeText(txt);return true}catch(e){const ta=document.createElement("textarea");ta.value=txt;ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.select();let ok=false;try{ok=document.execCommand("copy")}catch(_){}ta.remove();return ok}}
function linkCliente(o){ return new URL("cliente.html?t="+o.token, location.href).href; }
function qrURL(o){ return new URL("./#o="+o.codigo, location.href).href; }
function rol(...r){ return !!U && (U.roles||[U.rol]).some(x=>r.includes(x)); }
const soloAlmacen = () => rol("almacen") && !rol("vendedor","admin");
function claseEstado(e){ return {"Esperando cliente":"esperando","Pendiente":"pendiente","Alistado":"alistado","Embalado":"embalado","Despachado":"despachado","Anulada":"anulada"}[e]||""; }
const ERRORES={permiso:"Tu usuario no tiene permiso para esto.",sin_datos:"Falta que el cliente complete sus datos.",anulada:"La orden está anulada.",despachado:"La orden ya salió: se gestiona como devolución.",solicitud:"Hay una solicitud de anulación o corrección pendiente.",ya_solicitada:"Ya hay una solicitud pendiente para esta orden.",motivo:"Escribe el motivo (al menos 10 caracteres).",propia:"No puedes aprobar tu propia solicitud. Debe hacerlo otro supervisor.",config:"Falta confirmar la configuración de las luminarias.",sin_solicitud:"La solicitud ya fue resuelta."};
const msgError=e=>ERRORES[e.message]||"No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.";

async function api(body){
  const r=await fetch(TL.API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(Object.assign({pin:PIN},body))});
  const j=await r.json(); if(!j.ok){const e=new Error(j.error||"error");e.j=j;throw e} return j;
}
function reemplazar(o){ ordenes=[o,...ordenes.filter(x=>x.codigo!==o.codigo)]; LS.set("tl_ordenes2",ordenes); }

/* ---------- sonido y alertas (capa 2) ---------- */
let audio=null;
function prepararAudio(){ try{ if(!audio) audio=new (window.AudioContext||window.webkitAudioContext)(); if(audio.state==="suspended") audio.resume(); }catch(e){} }
document.addEventListener("pointerdown",prepararAudio,{passive:true});
function sonar(){
  try{ prepararAudio(); if(!audio) return; const t=audio.currentTime;
    [[880,0],[1175,.18],[1568,.36]].forEach(([f,d])=>{const o=audio.createOscillator(),g=audio.createGain();o.type="sine";o.frequency.value=f;
      g.gain.setValueAtTime(0.0001,t+d);g.gain.exponentialRampToValueAtTime(.35,t+d+.02);g.gain.exponentialRampToValueAtTime(.0001,t+d+.28);
      o.connect(g).connect(audio.destination);o.start(t+d);o.stop(t+d+.3)}); }catch(e){}
  try{ navigator.vibrate&&navigator.vibrate([200,100,200]); }catch(e){}
}
function firma(o){ return o.estado+"|"+(o.c?1:0)+"|"+(o.sol?o.sol.estado:""); }
function detectarCambios(){
  const actual={}; ordenes.forEach(o=>actual[o.codigo]=firma(o));
  if(estadosPrev){
    const datosV=[], nuevasA=[], listasA=[], solNuevas=[], solResueltas=[];
    ordenes.forEach(o=>{
      const antes=estadosPrev[o.codigo], p=antes?antes.split("|"):null, teniaDatos=p&&p[1]==="1";
      if(o.c && antes!==undefined && !teniaDatos){
        if(rol("vendedor","admin") && (rol("admin")||o.vendedor===U.nombre)){ datosV.push(o); nuevos.add(o.codigo); }
        if(rol("almacen","admin") && o.estado==="Embalado" && o.bultos) listasA.push(o);
      }
      if(antes===undefined && soloAlmacen()) nuevasA.push(o);
      const solAntes=p?p[2]:"", solAhora=o.sol?o.sol.estado:"";
      if(solAhora==="Solicitada" && solAntes!=="Solicitada" && rol("supervisor") && o.sol.por!==U.nombre) solNuevas.push(o);
      if(solAntes==="Solicitada" && (solAhora==="Aprobada"||solAhora==="Rechazada") && o.sol.por===U.nombre) solResueltas.push(o);
    });
    if(solResueltas.length){ sonar(); const o=solResueltas[0]; toast((o.sol.estado==="Aprobada"?"✅ Aprobada: ":"❌ Rechazada: ")+(o.sol.tipo==="anulacion"?"anulación":"corrección")+" de "+o.codigo); }
    else if(solNuevas.length){ sonar(); toast("🔔 Nueva solicitud por revisar: "+solNuevas.map(o=>o.codigo).join(", ")); }
    else if(datosV.length){ sonar(); toast(datosV.length===1?"✅ "+datosV[0].codigo+": "+datosV[0].c.nombre+" completó sus datos":"✅ "+datosV.length+" clientes completaron sus datos"); }
    else if(listasA.length){ sonar(); toast("🏷️ Etiquetas listas para imprimir: "+listasA.map(o=>o.codigo).join(", ")); }
    else if(nuevasA.length){ sonar(); toast(nuevasA.length===1?"📦 Nueva orden para alistar: "+nuevasA[0].codigo:"📦 "+nuevasA.length+" órdenes nuevas para alistar"); }
  }
  estadosPrev=actual; LS.set("tl_estados4",actual); LS.set("tl_nuevos",[...nuevos]);
  document.title=(nuevos.size?"("+nuevos.size+") ":"")+"Órdenes de despacho · Transline";
}
function visto(cod){ if(nuevos.delete(cod)){ LS.set("tl_nuevos",[...nuevos]); document.title=(nuevos.size?"("+nuevos.size+") ":"")+"Órdenes de despacho · Transline"; } }

/* ---------- mensajes ---------- */
function destinoDe(o){ return o.c ? o.c.destino : (o.destinoPrev||""); }
function msgLink(o){
  return "Hola 👋, gracias por tu compra en *Transline*.\n\nPara emitir tu comprobante y preparar tu pedido *"+o.codigo+"*, completa tus datos aquí:\n"+linkCliente(o)+"\n\nTe tomará menos de un minuto.";
}
/* Grupo de Envíos (almacén): ligero, sin datos de facturación ni del cliente */
function msgEnvios(o){
  const c=o.c, L=[], d=destinoDe(o);
  L.push("📦 *"+o.codigo+"* · "+o.vendedor);
  if(d==="Provincia"){ const ciudad=c&&c.ciudad?" – "+c.ciudad:""; const ag=c&&c.agencia?c.agencia+(c.entrega==="Entrega a domicilio"?" · a domicilio":(c.sede?" ("+c.sede+")":"")):"Agencia por confirmar"; L.push("📍 Provincia"+ciudad+" · "+ag); }
  else if(d==="Lima"){ L.push("📍 Lima"+(c?(c.entrega==="Recojo en tienda"?" · Recojo en tienda":(c.distrito?" – "+c.distrito:"")):"")); }
  else L.push("📍 Destino por confirmar");
  if(o.embalaje) L.push("🎁 "+o.embalaje);
  if(o.pago==="Contraentrega") L.push("💵 *CONTRAENTREGA*: cobrar al entregar");
  L.push("");
  const total=o.productos.reduce((a,x)=>a+(+x.q||0),0);
  L.push("🛒 *"+total+" producto"+(total===1?"":"s")+":*");
  o.productos.forEach(x=>L.push("• "+x.q+" × "+x.p+(x.s?" ("+x.s+")":"")));
  if(o.config){ L.push(""); L.push("⚙️ *Requiere configuración de drivers* · "+o.config.lugar+" · altura "+o.config.altura+" m"); }
  if(o.obs){ L.push(""); L.push("📝 "+o.obs); }
  return L.join("\n");
}
/* Grupo de Comprobantes (comercial): todos los datos para factura, boleta y guía */
function msgComprobantes(o){
  const c=o.c||{}, L=[];
  L.push("📄 *"+o.codigo+"* · "+o.vendedor); L.push("");
  L.push("🧾 *"+(c.comprobante||"—").toUpperCase()+"*");
  L.push("🧑 *"+(c.nombre||"—")+"*");
  L.push((c.doc?"🪪 "+(c.tipoDoc||"DNI")+" "+c.doc+"  |  ":"")+"📞 "+(c.tel||""));
  if(c.atencion&&c.atencion.nombre) L.push("👉 *Atención a:* "+c.atencion.nombre+" · DNI "+c.atencion.doc+" · Tel. "+c.atencion.tel);
  L.push("");
  if(c.destino==="Provincia"){ L.push("📍 *PROVINCIA – "+(c.ciudad||"").toUpperCase()+"*");
    if(c.entrega==="Entrega a domicilio"){ L.push("🚚 Agencia: "+c.agencia+" · entrega a domicilio"); L.push("🏠 "+(c.direccion||"")+(c.distrito?", "+c.distrito:"")+(c.referencia?" (Ref.: "+c.referencia+")":"")); }
    else L.push("🚚 Agencia: "+c.agencia+(c.sede?" ("+c.sede+")":"")); }
  else if(c.entrega==="Recojo en tienda") L.push("📍 *LIMA – RECOJO EN TIENDA*");
  else { L.push("📍 *LIMA – "+(c.distrito||"").toUpperCase()+"*"); L.push("🏠 "+(c.direccion||"")+(c.referencia?" (Ref.: "+c.referencia+")":"")); }
  L.push("");
  L.push("🛒 *Productos:*"); o.productos.forEach(x=>L.push("• "+x.q+" × "+x.p+(x.s?" ("+x.s+")":"")));
  L.push(""); L.push("💰 *Pago:* "+o.pago); if(o.obs) L.push("📝 *Obs.:* "+o.obs);
  return L.join("\n");
}
/* ---------- catálogo ---------- */
function renderCats(){
  const el=$("#cats");el.innerHTML="";
  ["Todos",...new Set(catalogo.map(p=>p.c))].forEach(c=>{const b=document.createElement("button");b.type="button";b.textContent=c;
    const val=c==="Todos"?"":c;b.setAttribute("aria-pressed",catSel===val);b.onclick=()=>{catSel=val;renderCats();renderCat()};el.appendChild(b)});
}
function renderCat(){
  const raw=$("#buscar").value.trim(),q=raw.toLowerCase(),el=$("#catalogo");el.innerHTML="";
  const list=catalogo.filter(p=>(!catSel||p.c===catSel)&&(!q||(p.n+" "+p.s).toLowerCase().includes(q)));
  if(!list.length)el.innerHTML='<span class="empty">No hay productos con ese nombre o SKU.</span>';
  list.forEach(p=>{const b=document.createElement("button");b.type="button";const ln=S.lineas.find(l=>key(l)===key(p));b.className=ln?"in":"";
    b.innerHTML=(ln?"✓ "+ln.q+" × ":"+ ")+esc(p.n)+(p.s?'<small>'+esc(p.s)+'</small>':'');b.onclick=()=>addLinea(p);el.appendChild(b)});
  const exacto=catalogo.some(p=>p.n.toLowerCase()===q||(p.s&&p.s.toLowerCase()===q));
  $("#addrow").hidden=!q||exacto; if(q&&!exacto)$("#agregar-nuevo").textContent="Agregar “"+raw+"”";
}
function addLinea(p){const ln=S.lineas.find(l=>key(l)===key(p));if(ln)ln.q++;else S.lineas.push({p:p.n,n:p.n,s:p.s||"",q:1,cfg:!!p.cfg});renderLineas();sync()}
function renderLineas(){
  const el=$("#lineas");el.innerHTML="";
  if(!S.lineas.length) el.innerHTML='<li class="empty">Toca un producto de la lista para agregarlo.</li>';
  S.lineas.forEach((l,i)=>{const li=document.createElement("li");
    li.innerHTML='<span class="name">'+esc(l.p)+(l.cfg?' ⚙️':'')+(l.s?'<small class="sku">'+esc(l.s)+'</small>':'')+'</span><div class="step"><button type="button" aria-label="Quitar uno">−</button><input type="tel" inputmode="numeric" aria-label="Cantidad" value="'+l.q+'"><button type="button" aria-label="Agregar uno">+</button></div>';
    const b=li.querySelectorAll("button"),inp=li.querySelector("input");
    b[0].onclick=()=>{l.q--;if(l.q<=0)S.lineas.splice(i,1);renderLineas();sync()};
    b[1].onclick=()=>{l.q++;renderLineas();sync()};
    inp.onchange=()=>{const n=parseInt(inp.value,10);if(!n||n<=0)S.lineas.splice(i,1);else l.q=n;renderLineas();sync()};
    el.appendChild(li)});
  renderCat();
}
$("#buscar").addEventListener("input",renderCat);
$("#agregar-nuevo").onclick=()=>{const v=$("#buscar").value.trim();if(!v)return;const p={n:v,s:"",c:"Otros"};const ex=LS.get(EXTRA_KEY,[]);ex.push(p);LS.set(EXTRA_KEY,ex);catalogo.push(p);$("#buscar").value="";renderCats();addLinea(p);toast("Producto agregado en este celular")};

/* ---------- nueva orden ---------- */
function chips(el,opts,k){el.innerHTML="";opts.forEach(o=>{const b=document.createElement("button");b.type="button";b.textContent=o;b.setAttribute("aria-pressed",S[k]===o);b.onclick=()=>{S[k]=o;chips(el,opts,k);sync()};el.appendChild(b)})}
function seg(el,k){el.querySelectorAll("button").forEach(b=>{b.setAttribute("aria-pressed",b.dataset.v===S[k]);b.onclick=()=>{S[k]=b.dataset.v;seg(el,k);sync()}})}
chips($("#pago"),PAGOS,"pago"); seg($("#embalaje"),"embalaje"); seg($("#quien"),"quien");
const necesitaConfig=()=>S.lineas.some(l=>l.cfg);
function filasCfg(){ const q=c=>[...document.querySelectorAll("#cfg-niveles "+c)], h=q(".cfg-h"), p=q(".cfg-p");
  return h.map((x,i)=>({querySelector:sel=>sel===".cfg-h"?x:p[i]})); }
function leerConfig(){ return {lugar:$("#cfg-lugar").value.trim(),altura:$("#cfg-altura").value.trim(),responsable:$("#cfg-resp").value.trim(),
  niveles:filasCfg().map(f=>({h:f.querySelector(".cfg-h").value,p:f.querySelector(".cfg-p").value}))}; }
function cargarConfig(k){ $("#cfg-lugar").value=k?k.lugar:""; $("#cfg-altura").value=k?k.altura:""; $("#cfg-resp").value=k?k.responsable:"";
  filasCfg().forEach((f,i)=>{const n=k&&k.niveles&&k.niveles[i]; f.querySelector(".cfg-h").value=n&&n.h?n.h:""; f.querySelector(".cfg-p").value=n?n.p:"";}); totalCfg(); }
function totalCfg(){ const fs=filasCfg(); const t=fs.reduce((a,f)=>a+(parseFloat(f.querySelector(".cfg-h").value)||0),0);
  const ultimo=!fs[4].querySelector(".cfg-h").value; $("#cfg-total").textContent="Total: "+(Math.round(t*100)/100)+" h"+(ultimo?" + el nivel 5 hasta el amanecer":"")+(t>14?" · revisa: es más que una noche normal":""); }
function validarConfig(){
  if(!necesitaConfig()) return null;
  const k=leerConfig();
  if(!k.lugar||!k.altura||!k.responsable||k.niveles.some((n,i)=>(i<4&&!(parseFloat(n.h)>0))||!(parseInt(n.p,10)>0))){
    toast("Completa la configuración: lugar, altura, responsable, cantidad de los niveles 1 a 4 y los 5 porcentajes"); $("#box-config").scrollIntoView({block:"start",behavior:"smooth"}); return false; }
  return k;
}
document.addEventListener("input",e=>{ if(e.target.closest&&e.target.closest("#cfg-niveles")) totalCfg(); });
document.addEventListener("change",e=>{ if(e.target.closest&&e.target.closest("#cfg-niveles")) totalCfg(); });
function sync(){
  const corr=!!S.corrigiendo, yo=S.quien==="Los lleno yo";
  $("#box-cliente").hidden=corr; $("#box-link").hidden=yo; $("#box-yo").hidden=!yo; $("#box-destino").hidden=yo||corr;
  $("#box-config").hidden=!necesitaConfig();
  if(yo&&!corr&&!formNueva) formNueva=FormCliente($("#form-nueva"),S.destino?{destino:S.destino}:null,opForm());
  const falta=[]; if(!S.lineas.length) falta.push("productos"); if(!corr&&!yo&&!S.destino) falta.push("Lima o Provincia");
  $("#missing").textContent=falta.length?"Falta: "+falta.join(", "):"";
  $("#enviar").disabled=!!falta.length; $("#enviar").textContent=corr?"Guardar corrección":"Crear orden";
}
function limpiarNueva(){ S.lineas=[]; S.pago="Cancelado"; S.embalaje="Automático"; S.destino=""; S.corrigiendo=null; $("#banner-corr").hidden=true;
  chips($("#pago"),PAGOS,"pago"); seg($("#embalaje"),"embalaje"); seg($("#destino-nueva"),"destino");
  ["#obs","#tel-cliente","#buscar"].forEach(id=>$(id).value=""); cargarConfig(null); if(formNueva){ $("#form-nueva").innerHTML=""; formNueva=null; } renderLineas(); sync(); }
seg($("#destino-nueva"),"destino");
let idPendiente=null;
async function crearOrden(){
  if(S.corrigiendo) return guardarCorreccion();
  if(!S.lineas.length){ toast("Agrega al menos un producto"); return; }
  const yo=S.quien==="Los lleno yo"; let c=null;
  if(yo){ c=formNueva.validar(); if(!c){ toast("Revisa los datos del cliente"); return; } }
  else if(!S.destino){ toast("Elige Lima o Provincia"); return; }
  const config=validarConfig(); if(config===false) return;
  const r=await TLConfirm({titulo:"¿Crear la orden?",texto:S.lineas.reduce((a,l)=>a+l.q,0)+" productos · "+(yo?c.destino:S.destino)+(config?" · con configuración de drivers":""),si:"Sí, crear"});
  if(!r.ok) return;
  idPendiente=idPendiente||idTemporal();
  const orden={idc:idPendiente,productos:S.lineas.map(l=>({p:l.p,s:l.s,q:l.q})),pago:S.pago,obs:$("#obs").value.trim(),
    telCliente:$("#tel-cliente").value.replace(/\D/g,""),embalajeModo:S.embalaje,destino:yo?c.destino:S.destino,c,config};
  const b=$("#enviar"); b.disabled=true; b.textContent="Creando…";
  try{
    const j=await api({action:"crear",orden}); const o=j.orden; idPendiente=null;
    reemplazar(o); estadosPrev&&(estadosPrev[o.codigo]=firma(o)); LS.set("tl_estados4",estadosPrev); renderLista();
    limpiarNueva(); mostrarCreada(o);
  }catch(e){ toast(e.message==="pin"?"Tu PIN ya no es válido":msgError(e)); if(e.message==="pin"){ PIN=""; pedirPin("Tu PIN ya no es válido. Ingrésalo de nuevo."); } }
  sync();
}
$("#enviar").onclick=crearOrden;

/* ---------- corrección y anulación ---------- */
async function iniciarCorreccion(o){
  await cargar(true); o=ordenes.find(x=>x.codigo===o.codigo)||o;
  if(o.sol&&o.sol.estado==="Solicitada"){ toast(ERRORES.ya_solicitada); return; }
  limpiarNueva();
  S.corrigiendo=o.codigo; S.corrEstado=o.estado;
  S.lineas=o.productos.map(x=>{const cat=catalogo.find(p=>p.n===x.p&&(p.s||"")===(x.s||"")); return {p:x.p,n:x.p,s:x.s||"",q:x.q,cfg:!!(cat&&cat.cfg)};});
  if(o.config&&!S.lineas.some(l=>l.cfg)) S.lineas.forEach(l=>l.cfg=true);
  S.pago=o.pago||"Cancelado"; S.embalaje=o.embalajeModo||"Automático"; chips($("#pago"),PAGOS,"pago"); seg($("#embalaje"),"embalaje");
  $("#obs").value=o.obs||""; cargarConfig(o.config||null);
  $("#corr-cod").textContent=o.codigo;
  $("#corr-nota").textContent=o.estado==="Pendiente"?"El almacén aún no la trabaja: el cambio se aplica al guardar.":"El almacén ya la trabajó: se enviará una solicitud a un supervisor.";
  $("#banner-corr").hidden=false; renderLineas(); sync(); tab("nueva");
}
$("#corr-cancelar").onclick=()=>{ limpiarNueva(); tab("ordenes"); };
async function guardarCorreccion(){
  if(!S.lineas.length){ toast("La orden debe tener al menos un producto"); return; }
  const config=validarConfig(); if(config===false) return;
  const inmediata=S.corrEstado==="Pendiente";
  const r=await TLConfirm({titulo:"Corregir "+S.corrigiendo,texto:inmediata?"El almacén aún no la trabaja: la corrección se aplica de inmediato.":"El almacén ya la trabajó. Un supervisor debe aprobar la corrección; después la orden vuelve a Nuevos para alistarla otra vez.",
    campo:{label:"¿Qué cambió y por qué?",placeholder:"Ej.: el cliente pidió 2 reflectores en lugar de 1",min:10},si:inmediata?"Guardar corrección":"Enviar solicitud"});
  if(!r.ok) return;
  const cambios={productos:S.lineas.map(l=>({p:l.p,s:l.s,q:l.q})),pago:S.pago,obs:$("#obs").value.trim(),embalajeModo:S.embalaje,config};
  try{ const j=await api({action:"corregir",codigo:S.corrigiendo,motivo:r.valor,cambios}); reemplazar(j.orden); estadosPrev&&(estadosPrev[j.orden.codigo]=firma(j.orden));
    toast(j.inmediata?"✅ Corrección aplicada":"📨 Solicitud enviada a un supervisor"); limpiarNueva(); tab("ordenes"); renderLista(); }
  catch(e){ toast(msgError(e)); }
}
async function anular(o){
  await cargar(true); o=ordenes.find(x=>x.codigo===o.codigo)||o;           // estado actualizado antes de decidir
  if(o.sol&&o.sol.estado==="Solicitada"){ toast(ERRORES.ya_solicitada); return; }
  const inmediata=o.estado==="Pendiente";
  const r=await TLConfirm({titulo:"¿Anular "+o.codigo+"?",texto:inmediata?"El almacén aún no la trabaja, así que se anulará de inmediato.":"El almacén ya empezó a trabajarla. Se enviará una solicitud a un supervisor para que la apruebe.",
    campo:{label:"Motivo de la anulación",placeholder:"Ej.: el cliente canceló la compra",min:10},si:inmediata?"Sí, anular":"Enviar solicitud",tono:"peligro"});
  if(!r.ok) return;
  try{ const j=await api({action:"anular",codigo:o.codigo,motivo:r.valor}); reemplazar(j.orden); estadosPrev&&(estadosPrev[o.codigo]=firma(j.orden));
    toast(j.inmediata?"Orden "+o.codigo+" anulada":"📨 Solicitud enviada a un supervisor"); renderLista(); renderSolicitudes(); }
  catch(e){ toast(msgError(e)); }
}
function detalleSol(o){
  const s=o.sol; if(!s) return "";
  let h='<b>'+(s.tipo==="anulacion"?"Anulación":"Corrección")+' solicitada por '+esc(s.por)+' · '+esc(s.f)+'</b>Motivo: '+esc(s.motivo);
  if(s.tipo==="correccion"&&s.cambios) h+='<br>Antes: '+o.productos.map(x=>x.q+" × "+esc(x.p)).join(", ")+'<br>Ahora: '+s.cambios.productos.map(x=>x.q+" × "+esc(x.p)).join(", ");
  return h;
}
function renderSolicitudes(){
  const el=$("#lista-sol"); if(!el) return;
  const l=ordenes.filter(o=>o.sol&&o.sol.estado==="Solicitada");
  const n=l.filter(o=>o.sol.por!==(U&&U.nombre)).length; $("#n-sol").textContent=n; $("#n-sol").hidden=!n;
  el.innerHTML=l.length?"":'<p class="vacio">No hay solicitudes pendientes. 👍</p>';
  l.forEach(o=>{ const d=document.createElement("div"); d.className="order"; const propia=o.sol.por===U.nombre;
    d.innerHTML='<div class="top"><b>'+esc(o.codigo)+'</b><span>'+esc(o.c?o.c.nombre:"Cliente por confirmar")+' · '+esc(o.vendedor)+' · '+esc(o.estado)+'</span></div><div class="sol-box">'+detalleSol(o)+'</div>'+
      '<div class="acts">'+(propia?'<span class="nota">Es tu solicitud: debe aprobarla otro supervisor.</span>':'<button type="button" class="btn primary" data-a="si">Aprobar</button><button type="button" class="btn peligro" data-a="no">Rechazar</button>')+'</div>';
    const si=d.querySelector('[data-a="si"]'), no=d.querySelector('[data-a="no"]');
    if(si) si.onclick=()=>resolver(o,true); if(no) no.onclick=()=>resolver(o,false);
    el.appendChild(d); });
}
async function resolver(o,aprobar){
  const anul=o.sol.tipo==="anulacion";
  const r=await TLConfirm(aprobar?{titulo:"¿Aprobar la "+(anul?"anulación":"corrección")+" de "+o.codigo+"?",texto:anul?"La orden quedará anulada"+(o.estado!=="Pendiente"?" y el almacén deberá devolver los productos al estante.":"."):"Se aplicarán los cambios y la orden volverá a Nuevos para alistarla de nuevo.",si:"Sí, aprobar"}
    :{titulo:"¿Rechazar la solicitud de "+o.codigo+"?",texto:"La orden seguirá su curso normal.",campo:{label:"Explica al vendedor por qué",min:5},si:"Rechazar",tono:"peligro"});
  if(!r.ok) return;
  try{ const j=await api({action:"resolver",codigo:o.codigo,aprobar,comentario:r.valor}); reemplazar(j.orden); estadosPrev&&(estadosPrev[o.codigo]=firma(j.orden));
    toast(aprobar?"✅ Solicitud aprobada":"Solicitud rechazada"); renderSolicitudes(); renderLista(); }
  catch(e){ toast(msgError(e)); }
}

/* ---------- pantalla "orden creada": los mensajes a enviar ---------- */
function pasosDe(o){
  const p=[];
  if(o._soloEnvios){ p.push({k:"envios",t:"📦 Copiar para Envíos",d:"",msg:()=>msgEnvios(o)}); return p; }
  if(!o.c) p.push({k:"link",t:"Enviar link al cliente",d:"Para que llene su comprobante y datos de envío.",msg:()=>msgLink(o),tel:o.telCliente});
  p.push({k:"envios",t:"📦 Enviar a Envíos",d:"Grupo de almacén: productos a alistar, sin datos de facturación.",msg:()=>msgEnvios(o)});
  if(o.c) p.push({k:"comprob",t:"📄 Enviar a Comprobantes",d:"Grupo comercial: factura o boleta y guía de remisión.",msg:()=>msgComprobantes(o)});
  return p;
}
function botonesPasos(o,cont,grande){
  pasosDe(o).forEach(p=>{
    const hecho=hechos.has(o.codigo+":"+p.k);
    const row=document.createElement("div"); row.className="paso"+(hecho?" hecho":"");
    row.innerHTML=(grande?'<div class="paso-t"><b>'+(hecho?"✓ ":"")+esc(p.t)+'</b><small>'+esc(p.d)+'</small></div>':'')+
      '<div class="paso-b"><button type="button" class="btn '+(hecho?'':'primary')+'">'+(grande?"Abrir WhatsApp":(hecho?"✓ ":"")+esc(p.t))+'</button><button type="button" class="btn">Copiar</button></div>';
    const [wa,cp]=row.querySelectorAll("button");
    const marcar=()=>{hechos.add(o.codigo+":"+p.k); if(p.k==="envios"||p.k==="comprob") visto(o.codigo); grande?mostrarCreada(o):renderLista();};
    wa.onclick=()=>{abrirWA(p.msg(),p.tel||""); marcar();};
    cp.onclick=async()=>{toast(await copiar(p.msg())?"Copiado. Pégalo en el chat o grupo.":"No se pudo copiar"); marcar();};
    cont.appendChild(row);
  });
}
function mostrarCreada(o){
  creada=o; $("#c-codigo").textContent=o.codigo;
  const cont=$("#c-pasos"); cont.innerHTML=""; botonesPasos(o,cont,true);
  $("#c-nota").textContent=o.c?"":"Cuando el cliente complete sus datos te sonará un aviso y podrás enviar la orden al grupo de Comprobantes desde Mis órdenes.";
  tab("creada");
}
$("#c-otra").onclick=()=>tab("nueva");
$("#c-ver").onclick=()=>{tab("ordenes"); $("#f-buscar").value=creada?creada.codigo:""; renderLista();};

/* ---------- llenar datos de una orden existente ---------- */
function abrirDatos(o){
  ordenDatos=o; $("#d-codigo").textContent=o.codigo; $("#form-datos").innerHTML=""; formDatos=FormCliente($("#form-datos"), o.c, opForm());
  tab("datos");
}
$("#d-cancelar").onclick=()=>tab("ordenes");
$("#d-guardar").onclick=async()=>{
  const c=formDatos.validar(); if(!c){ toast("Revisa los datos del cliente"); return; }
  const b=$("#d-guardar"); b.disabled=true;
  try{ const j=await api({action:"datos",codigo:ordenDatos.codigo,c}); reemplazar(j.orden); estadosPrev&&(estadosPrev[j.orden.codigo]=firma(j.orden)); renderLista(); tab("ordenes"); toast("Datos guardados. Ya puedes enviarla a almacén."); }
  catch(e){ toast(e.message==="bloqueado"?"La orden ya está en preparación":"No se pudieron guardar los datos"); }
  b.disabled=false;
};

/* ---------- lista de órdenes ---------- */
function lugarCorto(o){ const c=o.c; if(!c) return (o.destinoPrev?o.destinoPrev+" · ":"")+"Esperando datos del cliente"; if(c.destino==="Provincia") return "Provincia · "+c.ciudad+" · "+c.agencia+(c.entrega==="Entrega a domicilio"?" · a domicilio":""); return "Lima · "+(c.entrega==="Recojo en tienda"?"Recojo en tienda":c.distrito); }
function renderLista(){
  const fe=$("#f-estado").value, q=$("#f-buscar").value.trim().toLowerCase();
  $("#pend").textContent=ordenes.filter(o=>o.estado!=="Despachado"&&o.estado!=="Anulada").length;
  const porImp=ordenes.filter(o=>o.estado==="Embalado"&&o.bultos&&!(o.t&&o.t.impreso)).length;
  $("#pend-imp").textContent=porImp; $("#pend-imp").hidden=!porImp;
  const list=ordenes.filter(o=>{
    if(fe==="activas"){ if(o.estado==="Despachado"||o.estado==="Anulada") return false; }
    else if(fe==="anuladas"){ if(o.estado!=="Anulada") return false; }
    else if(fe==="sindatos"){ if(o.c) return false; }
    else if(fe && o.estado!==fe) return false;
    if(q){ const h=(o.codigo+" "+(o.c?o.c.nombre+" "+o.c.doc:"")+" "+o.vendedor).toLowerCase(); if(!h.includes(q)) return false; }
    return true; });
  const el=$("#lista"); el.innerHTML="";
  const n=[...nuevos].filter(c=>ordenes.some(o=>o.codigo===c)).length;
  $("#banner-nuevos").hidden=!n; $("#banner-nuevos").textContent=n===1?"🔔 1 cliente completó sus datos. Envía su orden a Comprobantes.":"🔔 "+n+" clientes completaron sus datos. Envía sus órdenes a Comprobantes.";
  if(!list.length){ el.innerHTML='<p class="vacio">'+(ordenes.length?"No hay órdenes con ese filtro.":"Aún no hay órdenes.")+'</p>'; return; }
  list.forEach(o=>{
    const anulada=o.estado==="Anulada", pendSol=!!(o.sol&&o.sol.estado==="Solicitada");
    const d=document.createElement("div"); d.className="order"+(nuevos.has(o.codigo)?" nuevo":"")+(anulada?" anulada":"");
    const c=o.c, idx=ESTADOS.indexOf(o.estado), impresa=!!(o.t&&o.t.impreso);
    let h='<div class="top"><b>'+esc(o.codigo)+'</b>'+(nuevos.has(o.codigo)?'<span class="nuevo-tag">DATOS NUEVOS</span>':'')+
      '<span>'+esc(c?c.nombre:"Cliente por confirmar")+' · '+esc(o.vendedor)+'</span></div>'+
      '<div style="margin-top:6px"><span class="chip-e '+claseEstado(o.estado)+'">'+esc(o.estado)+'</span>'+(c?' <span class="chip-e">'+esc(c.comprobante)+'</span>':' <span class="chip-e esperando">Sin datos del cliente</span>')+(o.bultos?' <span class="chip-e">'+o.bultos+' bulto'+(o.bultos>1?'s':'')+'</span>':'')+
        (pendSol?' <span class="chip-e alerta">⏳ '+(o.sol.tipo==="anulacion"?"Anulación":"Corrección")+' por aprobar</span>':'')+
        (o.corregida?' <span class="chip-e aviso">Corregida: volver a alistar</span>':'')+
        (o.config?' <span class="chip-e '+(o.config.hecho?'':'aviso')+'">⚙️ Configuración '+(o.config.hecho?'hecha':'pendiente')+'</span>':'')+
        (anulada&&o.devolverEstante?' <span class="chip-e alerta">Devolver al estante</span>':'')+'</div>'+
      '<div class="dest-l">'+esc(lugarCorto(o))+(o.embalaje?' · '+esc(o.embalaje):'')+'</div>'+
      (c&&c.atencion?'<div class="dest-l">Atención a: '+esc(c.atencion.nombre)+'</div>':'')+
      '<div class="items">'+o.productos.map(x=>x.q+" × "+esc(x.p)).join(", ")+'</div>';
    if(pendSol) h+='<div class="sol-box">'+detalleSol(o)+'</div>';
    else if(o.sol&&o.sol.estado==="Rechazada"&&!anulada) h+='<div class="sol-box"><b>Solicitud rechazada por '+esc(o.sol.aprobadoPor)+'</b>'+esc(o.sol.comentario||"")+'</div>';
    if(rol("almacen","admin") && !anulada){
      h+='<div class="states">'+ESTADOS.map((s,i)=>'<button type="button" data-s="'+s+'" class="'+(i<=idx?"done":"")+'">'+s+'</button>').join("")+'</div>'+
        '<div class="bultos" hidden><label for="b-'+o.codigo+'">¿Cuántos bultos?</label><input id="b-'+o.codigo+'" type="tel" inputmode="numeric" value="'+(o.bultos||1)+'"><button type="button" class="btn sun" data-a="emb-ok">Confirmar</button><button type="button" class="btn" data-a="emb-no">Cancelar</button></div>';
    }
    h+='<div class="pasos"></div><div class="acts">';
    if(rol("vendedor","admin") && !impresa && o.estado!=="Despachado" && !anulada) h+='<button type="button" class="btn" data-a="llenar">'+(c?"Corregir datos del cliente":"Llenar yo los datos")+'</button>';
    if(rol("vendedor","admin") && !anulada && o.estado!=="Despachado" && !pendSol && (rol("admin","almacen")||o.vendedor===U.nombre))
      h+='<button type="button" class="btn" data-a="corregir">Corregir pedido</button><button type="button" class="btn peligro" data-a="anular">Anular</button>';
    if(o.config) h+='<button type="button" class="btn" data-a="vercfg">⚙️ Ver configuración</button>';
    if(o.hist&&o.hist.length) h+='<button type="button" class="btn" data-a="hist">Historial</button>';
    if(c&&o.token&&rol("vendedor","admin")) h+='';
    if(nuevos.has(o.codigo)) h+='<button type="button" class="btn" data-a="visto">Marcar como visto</button>';
    h+='</div><div class="hist" hidden>'+(o.hist||[]).slice().reverse().map(x=>'<div>'+esc(x.f)+' · <b>'+esc(x.q)+'</b>: '+esc(x.a)+'</div>').join("")+'</div>'; d.innerHTML=h;
    if(anulada){}
    else if(rol("vendedor","admin")) botonesPasos(o,d.querySelector(".pasos"),false);
    else botonesPasos({...o,c:null,token:null,_soloEnvios:true},d.querySelector(".pasos"),false);
    const on=(a,fn)=>{const b=d.querySelector('[data-a="'+a+'"]'); if(b) b.onclick=fn;};
    on("llenar",()=>abrirDatos(o));
    on("corregir",()=>iniciarCorreccion(o));
    on("anular",()=>anular(o));
    on("hist",()=>{const x=d.querySelector(".hist"); x.hidden=!x.hidden;});
    on("vercfg",()=>verConfig(o));
    on("visto",()=>{visto(o.codigo);renderLista()});
    d.querySelectorAll(".states button").forEach(b=>b.onclick=()=>{
      if(b.dataset.s==="Embalado"){ d.querySelector(".bultos").hidden=false; d.querySelector(".bultos input").focus(); return; }
      if(b.dataset.s==="Despachado"&&!c){ toast("Falta que el cliente complete sus datos"); return; }
      if(b.dataset.s==="Alistado"&&o.config&&!o.config.hecho){ confirmarConfig(o); return; }
      cambiarEstado(o,b.dataset.s);
    });
    on("emb-ok",()=>{const n=parseInt(d.querySelector(".bultos input").value,10); if(!(n>=1&&n<=99)){toast("Ingresa entre 1 y 99 bultos");return} cambiarEstado(o,"Embalado",n)});
    on("emb-no",()=>{d.querySelector(".bultos").hidden=true});
    el.appendChild(d);
  });
}
function verConfig(o){ TLConfirm({titulo:"⚙️ Configuración · "+o.codigo,html:TLConfigHTML(o.config),si:"Cerrar",unBoton:true}); }
async function confirmarConfig(o){
  const r=await TLConfirm({titulo:"¿Se realizó la configuración?",html:TLConfigHTML(o.config),si:"Sí, ya está",no:"Todavía no"});
  if(!r.ok) return;
  try{ const j=await api({action:"configurado",codigo:o.codigo}); reemplazar(j.orden); renderLista(); toast("⚙️ Configuración registrada"); }catch(e){ toast(msgError(e)); }
}
async function cambiarEstado(o,estado,bultos){
  const r=await TLConfirm({titulo:"¿Pasar "+o.codigo+" a "+estado+"?",texto:estado==="Embalado"?bultos+" bulto"+(bultos>1?"s":""):"",si:"Sí",no:"No"});
  if(!r.ok) return;
  try{ const j=await api({action:"estado",codigo:o.codigo,estado,bultos}); reemplazar(j.orden); estadosPrev&&(estadosPrev[o.codigo]=firma(j.orden)); LS.set("tl_estados4",estadosPrev);
    renderLista(); renderImprimir(); toast(estado==="Embalado"?(j.orden.c?"Embalado · pasó a Por imprimir":"Embalado · las etiquetas saldrán cuando el cliente complete sus datos"):"Estado: "+estado); }
  catch(e){ toast(msgError(e)); }
}
$("#f-estado").onchange=renderLista; $("#f-buscar").addEventListener("input",renderLista);
$("#actualizar").onclick=()=>cargar();

/* ---------- etiquetas ---------- */
function imprimir(lista){ TLEtiq.imprimir(lista); }
function renderImprimir(){
  const el=$("#lista-imp"); if(!el) return;
  const emb=ordenes.filter(o=>o.estado==="Embalado"&&o.bultos&&!(o.t&&o.t.impreso));
  const pend=emb.filter(o=>o.c), esperan=emb.filter(o=>!o.c);
  const hechas=ordenes.filter(o=>o.bultos&&o.t&&o.t.impreso).slice(0,10);
  $("#imp-todas").hidden=pend.length<2; $("#imp-todas").textContent="Imprimir todas ("+pend.reduce((s,o)=>s+o.bultos,0)+" etiquetas)";
  el.innerHTML=(pend.length||esperan.length)?"":'<p class="vacio">No hay etiquetas pendientes. Cuando almacén marque una orden como Embalado, aparecerá aquí.</p>';
  const fila=(o,modo)=>{const d=document.createElement("div");d.className="order";
    const re=modo==="re", espera=modo==="espera";
    d.innerHTML='<div class="top"><b>'+esc(o.codigo)+'</b><span>'+esc(o.c?o.c.nombre:"Esperando datos del cliente")+(re?' · impresa '+esc(o.t.impreso):'')+'</span></div><div class="dest-l">'+esc(lugarCorto(o))+'</div>'+
      '<div class="acts"><button type="button" class="btn '+(re||espera?'':'primary')+'" '+(espera?'disabled':'')+'>'+(espera?"⏳ Esperando datos del cliente":(re?"Reimprimir":"Imprimir")+' '+o.bultos+' etiqueta'+(o.bultos>1?'s':''))+'</button></div>';
    if(!espera) d.querySelector("button").onclick=async()=>{ imprimir([o]); if(!re){ try{const j=await api({action:"impreso",codigo:o.codigo});reemplazar(j.orden);renderImprimir();renderLista()}catch(e){} } };
    return d;};
  pend.forEach(o=>el.appendChild(fila(o,"")));
  esperan.forEach(o=>el.appendChild(fila(o,"espera")));
  const el2=$("#lista-imp-hechas"); el2.innerHTML=""; $("#titulo-hechas").hidden=!hechas.length; hechas.forEach(o=>el2.appendChild(fila(o,"re")));
}
$("#imp-todas").onclick=async()=>{ const pend=ordenes.filter(o=>o.estado==="Embalado"&&o.bultos&&o.c&&!(o.t&&o.t.impreso)); imprimir(pend);
  for(const o of pend){ try{const j=await api({action:"impreso",codigo:o.codigo});reemplazar(j.orden)}catch(e){} } renderImprimir(); renderLista(); };
$("#imp-prueba").onclick=()=>imprimir([{codigo:"OD-0000",fecha:"01/01/2026 00:00",bultos:1,embalaje:"Con embalaje",
  c:{comprobante:"Factura",nombre:"Empresa de prueba SAC",tipoDoc:"RUC",doc:"20601457785",tel:"999999999",destino:"Provincia",ciudad:"Huancayo",agencia:"Shalom",sede:"Sede El Tambo",atencion:{nombre:"Persona de prueba",doc:"12345678",tel:"999999999"}}}]);

/* ---------- pestañas y sesión ---------- */
function tab(n){
  document.querySelectorAll(".tabs button").forEach(b=>b.setAttribute("aria-selected",b.dataset.tab===n));
  document.querySelectorAll("section.view").forEach(s=>s.hidden=s.id!=="v-"+n);
  $("#dock").hidden=n!=="nueva"; window.scrollTo(0,0);
  if(n==="imprimir") renderImprimir();
}
document.querySelectorAll(".tabs button").forEach(b=>b.onclick=()=>tab(b.dataset.tab));
function aplicarRol(){
  $("#who-n").textContent=U?U.nombre:""; $("#who").hidden=!U;
  const vis={nueva:rol("vendedor","admin"),ordenes:true,imprimir:rol("almacen","admin"),solicitudes:rol("supervisor")};
  document.querySelectorAll(".tabs button").forEach(b=>b.hidden=!vis[b.dataset.tab]);
  $("#t-ordenes").firstChild.textContent=(rol("vendedor")&&!rol("almacen","admin"))?"Mis órdenes":"Órdenes";
  if(soloAlmacen()) $("#f-estado").value="activas";
}
function salir(){ PIN=""; U=null; try{localStorage.removeItem("tl_portal")}catch(e){} LS.set("tl_usuario",null); LS.set("tl_estados4",null); estadosPrev=null; ordenes=[]; LS.set("tl_ordenes2",[]); nuevos=new Set(); LS.set("tl_nuevos",[]); renderLista(); pedirPin(); }
$("#salir").onclick=()=>{ location.href=TL.PORTAL_URL||"../transline/"; };

async function cargar(silencioso){
  if(!PIN) return;
  try{
    const r=await fetch(TL.API_URL+"?action=list&pin="+encodeURIComponent(PIN)); const j=await r.json();
    if(!j.ok){ if(j.error==="pin"){ PIN=""; U=null; ordenes=[]; renderLista(); pedirPin("Tu usuario no tiene acceso a Despachos o tu PIN cambió. Ingresa tu PIN o vuelve al inicio."); } return; }
    U=j.usuario; LS.set("tl_usuario",U); aplicarRol();
    ordenes=j.ordenes; LS.set("tl_ordenes2",ordenes);
    if(j.productos&&j.productos.length){ catalogo=j.productos.concat(LS.get(EXTRA_KEY,[])); LS.set("tl_catalogo",j.productos); renderCats(); renderCat(); }
    if(j.agencias&&j.agencias.length){ agencias=j.agencias; LS.set("tl_agencias",agencias); }
    detectarCambios(); renderLista(); renderImprimir(); renderSolicitudes();
    $("#sync").textContent="Conectado ✓";
  }catch(e){ $("#sync").textContent="Sin conexión"; if(!silencioso) toast("Sin conexión. Se muestra lo último guardado."); }
}
function pedirPin(msg){ $("#gate").hidden=false; $("#pin-err").textContent=msg||""; setTimeout(()=>$("#pin").focus(),50); }
async function validarPin(){
  const v=$("#pin").value.trim(); if(!v) return; prepararAudio();
  $("#pin-ok").disabled=true; $("#pin-err").textContent="Verificando…";
  try{ const r=await fetch(TL.API_URL+"?action=list&pin="+encodeURIComponent(v)); const j=await r.json();
    if(j.ok){ PIN=v; LS.set("tl_ultimo_pin",v); const p=leerPortal(); if(!p||p.pin!==v){ try{localStorage.setItem("tl_portal",JSON.stringify({pin:v,nombre:j.usuario?j.usuario.nombre:""}))}catch(e){} } $("#gate").hidden=true; $("#pin").value=""; estadosPrev=null; await cargar(); tab(soloAlmacen()?"ordenes":"nueva"); irAHash(); }
    else $("#pin-err").textContent="PIN incorrecto";
  }catch(e){ $("#pin-err").textContent="Sin conexión. Revisa tu internet."; }
  $("#pin-ok").disabled=false;
}
$("#pin-ok").onclick=validarPin; $("#pin").addEventListener("keydown",e=>{if(e.key==="Enter")validarPin()});
function irAHash(){ const m=location.hash.match(/^#o=([\w-]+)/); if(m&&PIN){ tab("ordenes"); $("#f-estado").value=""; $("#f-buscar").value=m[1]; renderLista(); } }
window.addEventListener("hashchange",irAHash);

/* ---------- arranque ---------- */
renderCats(); renderLineas(); sync(); aplicarRol(); renderLista();
if(!PIN) pedirPin(); else { tab(soloAlmacen()?"ordenes":"nueva"); cargar(true).then(irAHash); }
setInterval(()=>{ if(document.visibilityState==="visible"&&PIN) cargar(true) },20000);
document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="visible"&&PIN) cargar(true) });
if("serviceWorker" in navigator){ navigator.serviceWorker.register("sw.js").catch(()=>{}) }
})();
