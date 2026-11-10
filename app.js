/* Transline · Órdenes de despacho · v2 (app del equipo) */
(function(){
const $ = s => document.querySelector(s);
const LS = { get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}}, set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}} };
const esc = s => String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const pad = n => String(n).padStart(2,"0");
const ESTADOS = ["Esperando cliente","Pendiente","Alistado","Embalado","Despachado"];
const PAGOS = ["Cancelado","Pendiente","Contraentrega","Adelanto"];
const EXTRA_KEY = "tl_extra";
const key = p => p.n+"|"+(p.s||"");

let PIN = LS.get("tl_pin2","");
let U = LS.get("tl_usuario",null);           // {nombre, rol}
let ordenes = LS.get("tl_ordenes2",[]);
let catalogo = (LS.get("tl_catalogo",null)||CAT_BASE).concat(LS.get(EXTRA_KEY,[]));
let catSel = "";
let agencias = LS.get("tl_agencias",[]);
const opForm = () => ({ agencias, buscarCliente: async doc => { const r=await fetch(TL.API_URL+"?action=buscarCliente&pin="+encodeURIComponent(PIN)+"&doc="+doc); const j=await r.json(); return j.ok?j.cliente:null; } });
let nuevos = new Set(LS.get("tl_nuevos",[]));
let estadosPrev = LS.get("tl_estados",null);
let formNueva = null, formDatos = null, ordenDatos = null;
const S = { lineas:[], pago:"Cancelado", embalaje:"Automático", quien:"El cliente (link)" };

/* ---------- utilidades ---------- */
function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("show");clearTimeout(toast.h);toast.h=setTimeout(()=>t.classList.remove("show"),2800)}
function nuevoCodigo(){const d=new Date();return "TL-"+pad(d.getDate())+pad(d.getMonth()+1)+"-"+pad(d.getHours())+pad(d.getMinutes())+Math.random().toString(36).slice(2,4).toUpperCase()}
function abrir(url){const a=document.createElement("a");a.href=url;a.target="_blank";a.rel="noopener";document.body.appendChild(a);a.click();a.remove()}
function abrirWA(txt,tel){ tel=(tel||"").replace(/\D/g,""); if(tel&&tel.length===9) tel="51"+tel; abrir("https://wa.me/"+tel+"?text="+encodeURIComponent(txt)); }
async function copiar(txt){try{await navigator.clipboard.writeText(txt);return true}catch(e){const ta=document.createElement("textarea");ta.value=txt;ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.select();let ok=false;try{ok=document.execCommand("copy")}catch(_){}ta.remove();return ok}}
function linkCliente(o){ return new URL("cliente.html?t="+o.token, location.href).href; }
function qrURL(o){ return new URL("./#o="+o.codigo, location.href).href; }
function rol(...r){ return U && r.includes(U.rol); }
function claseEstado(e){ return {"Esperando cliente":"esperando","Pendiente":"pendiente","Alistado":"alistado","Embalado":"embalado","Despachado":"despachado"}[e]||""; }

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
function detectarCambios(){
  const actual={}; ordenes.forEach(o=>actual[o.codigo]=o.estado);
  if(estadosPrev){
    const listos=[], nuevasAlm=[];
    ordenes.forEach(o=>{
      const antes=estadosPrev[o.codigo];
      if(rol("vendedor","admin") && antes==="Esperando cliente" && o.estado!=="Esperando cliente" && (U.rol==="admin"||o.vendedor===U.nombre)){ listos.push(o); nuevos.add(o.codigo); }
      if(rol("almacen","admin") && o.estado==="Pendiente" && antes!=="Pendiente" && (antes===undefined||antes==="Esperando cliente")) nuevasAlm.push(o);
    });
    if(listos.length){ sonar(); toast(listos.length===1?("✅ "+(listos[0].c?listos[0].c.nombre:listos[0].codigo)+" completó sus datos"):("✅ "+listos.length+" clientes completaron sus datos")); }
    else if(nuevasAlm.length){ sonar(); toast(nuevasAlm.length===1?"📦 Nueva orden para alistar: "+nuevasAlm[0].codigo:"📦 "+nuevasAlm.length+" órdenes nuevas para alistar"); }
  }
  estadosPrev=actual; LS.set("tl_estados",actual); LS.set("tl_nuevos",[...nuevos]);
  document.title=(nuevos.size?"("+nuevos.size+") ":"")+"Órdenes de despacho · Transline";
}
function visto(cod){ if(nuevos.delete(cod)){ LS.set("tl_nuevos",[...nuevos]); document.title=(nuevos.size?"("+nuevos.size+") ":"")+"Órdenes de despacho · Transline"; } }

/* ---------- mensajes ---------- */
function msgLink(o){
  return "Hola 👋, gracias por tu compra en *Transline*.\n\nPara emitir tu comprobante y preparar tu pedido *"+o.codigo+"*, completa tus datos aquí:\n"+linkCliente(o)+"\n\nTe tomará menos de un minuto.";
}
function msgAlmacen(o){
  const c=o.c||{}, L=[];
  L.push("📦 *ORDEN DE DESPACHO – TRANSLINE*"); L.push("🔢 "+o.codigo);
  L.push("🗓️ "+o.fecha+"  |  👤 "+o.vendedor); L.push("");
  L.push("🧾 *"+(c.comprobante||"—").toUpperCase()+"*"); L.push("🧑 *"+(c.nombre||"—")+"*"); L.push("🪪 "+(c.tipoDoc||"")+" "+(c.doc||"")+"  |  📞 "+(c.tel||""));
  if(c.atencion&&c.atencion.nombre) L.push("👉 *Atención a:* "+c.atencion.nombre+" · DNI "+c.atencion.doc+" · Tel. "+c.atencion.tel);
  L.push("");
  if(c.destino==="Provincia"){ L.push("📍 *PROVINCIA – "+(c.ciudad||"").toUpperCase()+"*"); L.push("🚚 *Agencia:* "+c.agencia+(c.sede?" ("+c.sede+")":"")); }
  else if(c.entrega==="Recojo en tienda"){ L.push("📍 *LIMA – RECOJO EN TIENDA*"); }
  else { L.push("📍 *LIMA – "+(c.distrito||"").toUpperCase()+"*"); L.push("🏠 "+(c.direccion||"")+(c.referencia?" (Ref.: "+c.referencia+")":"")); }
  L.push("🎁 *"+(o.embalaje||"").toUpperCase()+"*"); L.push("");
  L.push("🛒 *Productos:*"); o.productos.forEach(x=>L.push("• "+x.q+" × "+x.p+(x.s?" ("+x.s+")":""))); L.push("");
  L.push("💰 *Pago:* "+o.pago); if(o.obs) L.push("📝 *Obs.:* "+o.obs);
  if(o.estado&&o.estado!=="Pendiente") L.push("\n✅ *Estado:* "+o.estado);
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
function addLinea(p){const ln=S.lineas.find(l=>key(l)===key(p));if(ln)ln.q++;else S.lineas.push({p:p.n,n:p.n,s:p.s||"",q:1});renderLineas();sync()}
function renderLineas(){
  const el=$("#lineas");el.innerHTML="";
  if(!S.lineas.length) el.innerHTML='<li class="empty">Toca un producto de la lista para agregarlo.</li>';
  S.lineas.forEach((l,i)=>{const li=document.createElement("li");
    li.innerHTML='<span class="name">'+esc(l.p)+(l.s?'<small class="sku">'+esc(l.s)+'</small>':'')+'</span><div class="step"><button type="button" aria-label="Quitar uno">−</button><input type="tel" inputmode="numeric" aria-label="Cantidad" value="'+l.q+'"><button type="button" aria-label="Agregar uno">+</button></div>';
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
function sync(){
  const yo=S.quien==="Los lleno yo";
  $("#box-link").hidden=yo; $("#box-yo").hidden=!yo;
  if(yo&&!formNueva) formNueva=FormCliente($("#form-nueva"),null,opForm());
  const falta=[]; if(!S.lineas.length) falta.push("productos");
  $("#missing").textContent=falta.length?"Falta: "+falta.join(", "):"";
  $("#enviar").textContent=yo?"Crear y enviar a almacén":"Crear y enviar link al cliente";
  $("#copiar").textContent=yo?"Copiar":"Copiar link";
}
function limpiarNueva(){ S.lineas=[]; S.pago="Cancelado"; S.embalaje="Automático"; chips($("#pago"),PAGOS,"pago"); seg($("#embalaje"),"embalaje");
  ["#obs","#tel-cliente","#buscar"].forEach(id=>$(id).value=""); if(formNueva){ $("#form-nueva").innerHTML=""; formNueva=null; } renderLineas(); sync(); window.scrollTo(0,0); }
async function crearOrden(modo){
  if(!S.lineas.length){ toast("Agrega al menos un producto"); return; }
  const yo=S.quien==="Los lleno yo"; let c=null;
  if(yo){ c=formNueva.validar(); if(!c){ toast("Revisa los datos del cliente"); return; } }
  const orden={codigo:nuevoCodigo(),productos:S.lineas.map(l=>({p:l.p,s:l.s,q:l.q})),pago:S.pago,obs:$("#obs").value.trim(),
    telCliente:$("#tel-cliente").value.replace(/\D/g,""),embalajeModo:S.embalaje,c};
  const b1=$("#enviar"),b2=$("#copiar"); b1.disabled=b2.disabled=true; const txt=b1.textContent; b1.textContent="Creando…";
  try{
    const j=await api({action:"crear",orden}); const o=j.orden; reemplazar(o); estadosPrev&&(estadosPrev[o.codigo]=o.estado); renderLista();
    const msg=yo?msgAlmacen(o):msgLink(o);
    if(modo==="wa") abrirWA(msg, yo?"":o.telCliente); else { const ok=await copiar(msg); toast(ok?(yo?"Orden copiada. Pégala en el grupo.":"Link copiado. Pégalo en el chat del cliente."):"No se pudo copiar"); }
    toast("Orden "+o.codigo+" creada"); limpiarNueva();
  }catch(e){ toast(e.message==="pin"?"Tu PIN ya no es válido":"No se pudo crear la orden. Revisa tu conexión."); if(e.message==="pin") salir(); }
  b1.disabled=b2.disabled=false; b1.textContent=txt; sync();
}
$("#enviar").onclick=()=>crearOrden("wa");
$("#copiar").onclick=()=>crearOrden("copiar");

/* ---------- llenar datos de una orden existente ---------- */
function abrirDatos(o){
  ordenDatos=o; $("#d-codigo").textContent=o.codigo; $("#form-datos").innerHTML=""; formDatos=FormCliente($("#form-datos"), o.c, opForm());
  tab("datos");
}
$("#d-cancelar").onclick=()=>tab("ordenes");
$("#d-guardar").onclick=async()=>{
  const c=formDatos.validar(); if(!c){ toast("Revisa los datos del cliente"); return; }
  const b=$("#d-guardar"); b.disabled=true;
  try{ const j=await api({action:"datos",codigo:ordenDatos.codigo,c}); reemplazar(j.orden); estadosPrev&&(estadosPrev[j.orden.codigo]=j.orden.estado); renderLista(); tab("ordenes"); toast("Datos guardados. Ya puedes enviarla a almacén."); }
  catch(e){ toast(e.message==="bloqueado"?"La orden ya está en preparación":"No se pudieron guardar los datos"); }
  b.disabled=false;
};

/* ---------- lista de órdenes ---------- */
function lugarCorto(o){ const c=o.c; if(!c) return "Sin datos del cliente"; if(c.destino==="Provincia") return "Provincia · "+c.ciudad+" · "+c.agencia; return "Lima · "+(c.entrega==="Recojo en tienda"?"Recojo en tienda":c.distrito); }
function renderLista(){
  const fe=$("#f-estado").value, q=$("#f-buscar").value.trim().toLowerCase();
  const pend=ordenes.filter(o=>U&&(U.rol==="almacen"?["Pendiente","Alistado","Embalado"].includes(o.estado):o.estado!=="Despachado")).length;
  $("#pend").textContent=pend;
  const porImp=ordenes.filter(o=>o.estado==="Embalado"&&o.bultos&&!(o.t&&o.t.impreso)).length;
  $("#pend-imp").textContent=porImp; $("#pend-imp").hidden=!porImp;
  const list=ordenes.filter(o=>{
    if(fe==="activas"){ if(o.estado==="Despachado") return false; }
    else if(fe && o.estado!==fe) return false;
    if(q){ const h=(o.codigo+" "+(o.c?o.c.nombre+" "+o.c.doc:"")+" "+o.vendedor).toLowerCase(); if(!h.includes(q)) return false; }
    return true; });
  const el=$("#lista"); el.innerHTML="";
  const n=[...nuevos].filter(c=>ordenes.some(o=>o.codigo===c)).length;
  $("#banner-nuevos").hidden=!n; $("#banner-nuevos").textContent=n===1?"🔔 1 cliente completó sus datos. Envía su orden a almacén.":"🔔 "+n+" clientes completaron sus datos. Envía sus órdenes a almacén.";
  if(!list.length){ el.innerHTML='<p class="vacio">'+(ordenes.length?"No hay órdenes con ese filtro.":"Aún no hay órdenes.")+'</p>'; return; }
  list.forEach(o=>{
    const d=document.createElement("div"); d.className="order"+(nuevos.has(o.codigo)?" nuevo":"");
    const c=o.c; const idx=ESTADOS.indexOf(o.estado);
    let h='<div class="top"><b>'+esc(c?c.nombre:"Cliente por confirmar")+'</b>'+(nuevos.has(o.codigo)?'<span class="nuevo-tag">DATOS NUEVOS</span>':'')+
      '<span>'+esc(o.codigo)+' · '+esc(o.fecha)+' · '+esc(o.vendedor)+'</span></div>'+
      '<div style="margin-top:6px"><span class="chip-e '+claseEstado(o.estado)+'">'+esc(o.estado)+'</span>'+(c?' <span class="chip-e">'+esc(c.comprobante)+'</span>':'')+(o.bultos?' <span class="chip-e">'+o.bultos+' bulto'+(o.bultos>1?'s':'')+'</span>':'')+'</div>'+
      '<div class="dest-l">'+esc(lugarCorto(o))+(o.embalaje?' · '+esc(o.embalaje):'')+'</div>'+
      (c&&c.atencion?'<div class="dest-l">Atención a: '+esc(c.atencion.nombre)+'</div>':'')+
      '<div class="items">'+o.productos.map(x=>x.q+" × "+esc(x.p)).join(", ")+'</div>';
    if(rol("almacen","admin") && c){
      h+='<div class="states">'+["Pendiente","Alistado","Embalado","Despachado"].map((s,i)=>'<button type="button" data-s="'+s+'" class="'+(i+1<=idx?"done":"")+'">'+s+'</button>').join("")+'</div>'+
        '<div class="bultos" hidden><label for="b-'+o.codigo+'">¿Cuántos bultos?</label><input id="b-'+o.codigo+'" type="tel" inputmode="numeric" value="'+(o.bultos||1)+'"><button type="button" class="btn sun" data-a="emb-ok">Confirmar</button><button type="button" class="btn" data-a="emb-no">Cancelar</button></div>';
    }
    h+='<div class="acts">';
    if(rol("vendedor","admin")){
      if(o.estado==="Esperando cliente"){
        if(o.token) h+='<button type="button" class="btn primary" data-a="link">Enviar link</button><button type="button" class="btn" data-a="copiar-link">Copiar link</button>';
        h+='<button type="button" class="btn" data-a="llenar">Llenar yo los datos</button>';
      } else {
        h+='<button type="button" class="btn primary" data-a="almacen">Enviar a almacén</button><button type="button" class="btn" data-a="copiar">Copiar</button>';
        if(o.estado==="Pendiente") h+='<button type="button" class="btn" data-a="llenar">Corregir datos</button>';
      }
      if(nuevos.has(o.codigo)) h+='<button type="button" class="btn" data-a="visto">Marcar como visto</button>';
    } else if(c){
      h+='<button type="button" class="btn" data-a="copiar">Copiar</button>';
    }
    h+='</div>'; d.innerHTML=h;
    const on=(a,fn)=>{const b=d.querySelector('[data-a="'+a+'"]'); if(b) b.onclick=fn;};
    on("link",()=>abrirWA(msgLink(o),o.telCliente));
    on("copiar-link",async()=>toast(await copiar(msgLink(o))?"Link copiado":"No se pudo copiar"));
    on("llenar",()=>abrirDatos(o));
    on("almacen",()=>{visto(o.codigo);abrirWA(msgAlmacen(o));renderLista()});
    on("copiar",async()=>{visto(o.codigo);toast(await copiar(msgAlmacen(o))?"Orden copiada. Pégala en el grupo.":"No se pudo copiar");renderLista()});
    on("visto",()=>{visto(o.codigo);renderLista()});
    d.querySelectorAll(".states button").forEach(b=>b.onclick=()=>{
      if(b.dataset.s==="Embalado"){ d.querySelector(".bultos").hidden=false; d.querySelector(".bultos input").focus(); return; }
      cambiarEstado(o,b.dataset.s);
    });
    on("emb-ok",()=>{const n=parseInt(d.querySelector(".bultos input").value,10); if(!(n>=1&&n<=99)){toast("Ingresa entre 1 y 99 bultos");return} cambiarEstado(o,"Embalado",n)});
    on("emb-no",()=>{d.querySelector(".bultos").hidden=true});
    el.appendChild(d);
  });
}
async function cambiarEstado(o,estado,bultos){
  try{ const j=await api({action:"estado",codigo:o.codigo,estado,bultos}); reemplazar(j.orden); estadosPrev&&(estadosPrev[o.codigo]=j.orden.estado); LS.set("tl_estados",estadosPrev);
    renderLista(); renderImprimir(); toast(estado==="Embalado"?"Embalado · pasó a Por imprimir":"Estado: "+estado); }
  catch(e){ toast(e.message==="permiso"?"Tu usuario no puede cambiar estados":"No se pudo actualizar. Revisa tu conexión."); }
}
$("#f-estado").onchange=renderLista; $("#f-buscar").addEventListener("input",renderLista);
$("#actualizar").onclick=()=>cargar();

/* ---------- etiquetas ---------- */
function qrSVG(text){
  try{ const q=qrcode(0,"M"); q.addData(text); q.make(); return q.createSvgTag({cellSize:2,margin:0,scalable:true}); }
  catch(e){ return '<div style="font-size:2.4mm;border:.3mm solid #000;height:21mm;display:flex;align-items:center;justify-content:center;text-align:center">'+esc(text.split("#o=")[1]||"")+'</div>'; }
}
function etiqueta(o,i,n){
  const c=o.c||{}, a=c.atencion;
  const fecha=(o.fecha||"").split(" ")[0];
  let detalle="";
  if(c.destino==="Provincia") detalle="Agencia "+(c.agencia||"")+(c.sede?" · "+c.sede:"");
  else if(c.entrega==="Recojo en tienda") detalle="Recoge en tienda";
  else detalle="Entrega: Delivery";
  let medio="";
  if(a&&a.nombre) medio='<div class="att"><b>ATENCIÓN A:</b> '+esc(a.nombre)+'<br>DNI '+esc(a.doc)+' · Tel. '+esc(a.tel)+'</div>';
  else medio='<p class="doc" style="margin-top:.8mm">Tel. '+esc(c.tel||"")+'</p>';
  if(c.destino==="Lima"&&c.entrega==="Delivery") medio+='<p class="doc" style="margin-top:.6mm">'+esc(c.direccion||"")+(c.referencia?'<br>Ref.: '+esc(c.referencia):'')+'</p>';
  return '<div class="et"><div class="top"><span class="brand">TRANSLINE</span><span style="display:flex;align-items:center"><span class="code">'+esc(o.codigo)+'<br>'+esc(fecha)+'</span><span class="bulto">BULTO '+i+'/'+n+'</span></span></div>'+
    '<div class="mid"><div style="min-width:0"><p class="k">DESTINATARIO</p><p class="name">'+esc((c.nombre||"").toUpperCase())+'</p><p class="doc">'+esc(c.tipoDoc||"")+' '+esc(c.doc||"")+' · '+esc(c.comprobante||"")+'</p>'+medio+'</div>'+
    '<div><div class="qr">'+qrSVG(qrURL(o))+'</div><div class="qrt">Escanea para ver la orden</div></div></div>'+
    '<div class="dest"><b>'+esc(TLtxt.lugar(c))+'</b><span>'+esc(detalle)+'</span></div>'+
    '<div class="foot"><span>Remitente: '+esc(TL.REMITENTE)+' · RUC '+esc(TL.RUC_REMITENTE)+'</span><span>'+esc((o.embalaje||"").toUpperCase())+'</span></div></div>';
}
function imprimir(lista){
  $("#print-area").innerHTML=lista.map(o=>{let h="";const n=Math.max(1,o.bultos||1);for(let i=1;i<=n;i++)h+=etiqueta(o,i,n);return h}).join("");
  setTimeout(()=>window.print(),80);
}
function renderImprimir(){
  const el=$("#lista-imp"); if(!el) return;
  const pend=ordenes.filter(o=>o.estado==="Embalado"&&o.bultos&&!(o.t&&o.t.impreso));
  const hechas=ordenes.filter(o=>o.bultos&&o.t&&o.t.impreso).slice(0,10);
  $("#imp-todas").hidden=pend.length<2; $("#imp-todas").textContent="Imprimir todas ("+pend.reduce((s,o)=>s+o.bultos,0)+" etiquetas)";
  el.innerHTML=pend.length?"":'<p class="vacio">No hay etiquetas pendientes. Cuando almacén marque una orden como Embalado, aparecerá aquí.</p>';
  const fila=(o,re)=>{const d=document.createElement("div");d.className="order";
    d.innerHTML='<div class="top"><b>'+esc(o.c?o.c.nombre:"")+'</b><span>'+esc(o.codigo)+(re?' · impresa '+esc(o.t.impreso):'')+'</span></div><div class="dest-l">'+esc(lugarCorto(o))+'</div>'+
      '<div class="acts"><button type="button" class="btn '+(re?'':'primary')+'">'+(re?"Reimprimir":"Imprimir")+' '+o.bultos+' etiqueta'+(o.bultos>1?'s':'')+'</button></div>';
    d.querySelector("button").onclick=async()=>{ imprimir([o]); if(!re){ try{const j=await api({action:"impreso",codigo:o.codigo});reemplazar(j.orden);renderImprimir();renderLista()}catch(e){} } };
    return d;};
  pend.forEach(o=>el.appendChild(fila(o,false)));
  const el2=$("#lista-imp-hechas"); el2.innerHTML=""; $("#titulo-hechas").hidden=!hechas.length; hechas.forEach(o=>el2.appendChild(fila(o,true)));
}
$("#imp-todas").onclick=async()=>{ const pend=ordenes.filter(o=>o.estado==="Embalado"&&o.bultos&&!(o.t&&o.t.impreso)); imprimir(pend);
  for(const o of pend){ try{const j=await api({action:"impreso",codigo:o.codigo});reemplazar(j.orden)}catch(e){} } renderImprimir(); renderLista(); };
$("#imp-prueba").onclick=()=>imprimir([{codigo:"TL-PRUEBA",fecha:"01/01/2026 00:00",bultos:1,embalaje:"Con embalaje",
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
  const vis={nueva:rol("vendedor","admin"),ordenes:true,imprimir:rol("almacen","admin")};
  document.querySelectorAll(".tabs button").forEach(b=>b.hidden=!vis[b.dataset.tab]);
  $("#t-ordenes").firstChild.textContent=rol("vendedor")?"Mis órdenes":"Órdenes";
  if(rol("almacen")) $("#f-estado").value="activas";
}
function salir(){ PIN=""; U=null; LS.set("tl_pin2",""); LS.set("tl_usuario",null); LS.set("tl_estados",null); estadosPrev=null; ordenes=[]; LS.set("tl_ordenes2",[]); nuevos=new Set(); LS.set("tl_nuevos",[]); renderLista(); pedirPin(); }
$("#salir").onclick=()=>{ if(confirm("¿Cerrar sesión en este celular?")) salir(); };

async function cargar(silencioso){
  if(!PIN) return;
  try{
    const r=await fetch(TL.API_URL+"?action=list&pin="+encodeURIComponent(PIN)); const j=await r.json();
    if(!j.ok){ if(j.error==="pin"){ salir(); $("#pin-err").textContent="Tu PIN ya no está activo. Pide uno nuevo."; } return; }
    U=j.usuario; LS.set("tl_usuario",U); aplicarRol();
    ordenes=j.ordenes; LS.set("tl_ordenes2",ordenes);
    if(j.productos&&j.productos.length){ catalogo=j.productos.concat(LS.get(EXTRA_KEY,[])); LS.set("tl_catalogo",j.productos); renderCats(); renderCat(); }
    if(j.agencias&&j.agencias.length){ agencias=j.agencias; LS.set("tl_agencias",agencias); }
    detectarCambios(); renderLista(); renderImprimir();
    $("#sync").textContent="Conectado ✓";
  }catch(e){ $("#sync").textContent="Sin conexión"; if(!silencioso) toast("Sin conexión. Se muestra lo último guardado."); }
}
function pedirPin(msg){ $("#gate").hidden=false; $("#pin-err").textContent=msg||""; setTimeout(()=>$("#pin").focus(),50); }
async function validarPin(){
  const v=$("#pin").value.trim(); if(!v) return; prepararAudio();
  $("#pin-ok").disabled=true; $("#pin-err").textContent="Verificando…";
  try{ const r=await fetch(TL.API_URL+"?action=list&pin="+encodeURIComponent(v)); const j=await r.json();
    if(j.ok){ PIN=v; LS.set("tl_pin2",v); $("#gate").hidden=true; $("#pin").value=""; estadosPrev=null; await cargar(); tab(rol("almacen")?"ordenes":"nueva"); irAHash(); }
    else $("#pin-err").textContent="PIN incorrecto";
  }catch(e){ $("#pin-err").textContent="Sin conexión. Revisa tu internet."; }
  $("#pin-ok").disabled=false;
}
$("#pin-ok").onclick=validarPin; $("#pin").addEventListener("keydown",e=>{if(e.key==="Enter")validarPin()});
function irAHash(){ const m=location.hash.match(/^#o=([\w-]+)/); if(m&&PIN){ tab("ordenes"); $("#f-estado").value=""; $("#f-buscar").value=m[1]; renderLista(); } }
window.addEventListener("hashchange",irAHash);

/* ---------- arranque ---------- */
renderCats(); renderLineas(); sync(); aplicarRol(); renderLista();
if(!PIN) pedirPin(); else { tab(rol("almacen")?"ordenes":"nueva"); cargar(true).then(irAHash); }
setInterval(()=>{ if(document.visibilityState==="visible"&&PIN) cargar(true) },20000);
document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="visible"&&PIN) cargar(true) });
if("serviceWorker" in navigator){ navigator.serviceWorker.register("sw.js").catch(()=>{}) }
})();
