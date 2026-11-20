/* Transline · Hoja de ruta: armar, aprobar la salida, imprimir y registrar entregas con fotos. */
(function(){
const $ = s => document.querySelector(s);
const esc = s => String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const PORTAL = TL.PORTAL_URL || "../transline/";
$("#inicio").href = PORTAL;
let portal=null; try{ portal=JSON.parse(localStorage.getItem("tl_portal")||"null"); }catch(e){}
if(!portal||!portal.pin){ location.replace(PORTAL); return; }
const PIN=portal.pin;
let U=null, ordenes=[], rutas=[], elegidas=new Set(), vista=null;

const MSGS={permiso:"Tu usuario no puede hacer esto.",propia:"La salida debe aprobarla otro supervisor, no quien armó la hoja.",sin_fotos:"Toma al menos una foto de evidencia.",
  no_lista:"Una de las órdenes ya no está lista para salir.",en_otra_ruta:"Una de las órdenes ya está en otra hoja de ruta.",solicitud:"Una orden tiene una anulación o corrección pendiente.",estado:"El estado cambió. Actualiza la pantalla."};
const msg=e=>MSGS[e.message]||"No se pudo guardar. Revisa el internet e intenta de nuevo.";
function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("show");clearTimeout(toast.h);toast.h=setTimeout(()=>t.classList.remove("show"),3800)}
const rol=(...r)=>!!U&&(U.roles||[U.rol]).some(x=>r.includes(x));
async function api(body){
  const r=await fetch(TL.API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(Object.assign({pin:PIN},body))});
  const j=await r.json(); if(!j.ok){const e=new Error(j.error||"error");e.j=j;throw e} return j;
}
const ord=c=>ordenes.find(o=>o.codigo===c);
function destino(o){ const c=o.c||{};
  if(c.destino==="Provincia") return "Provincia – "+c.ciudad+" · "+c.agencia+(c.entrega==="Entrega a domicilio"?" · a domicilio":"");
  return "Lima · "+(c.entrega==="Recojo en tienda"?"Recojo en tienda":(c.distrito||"")); }
function direccion(o){ const c=o.c||{};
  if(c.destino==="Provincia") return c.entrega==="Entrega a domicilio"?(c.direccion+(c.distrito?", "+c.distrito:"")+(c.referencia?" (Ref.: "+c.referencia+")":"")):("Agencia "+c.agencia+(c.sede?" · "+c.sede:""));
  return c.direccion?(c.direccion+(c.referencia?" (Ref.: "+c.referencia+")":"")):""; }
function recibe(o){ const c=o.c||{}; return c.atencion&&c.atencion.nombre?{n:c.atencion.nombre,d:c.atencion.doc,t:c.atencion.tel}:{n:c.nombre,d:c.doc,t:c.tel}; }

/* ---------- Armar ruta ---------- */
const PAGO_BLOQUEA=["Pendiente","Adelanto · saldo antes de despachar"];
function listos(){ return ordenes.filter(o=>o.estado==="Embalado"&&o.c&&o.t&&o.t.impreso&&!o.ruta&&!(o.sol&&o.sol.estado==="Solicitada")&&!PAGO_BLOQUEA.includes(o.pago)); }
function bloqueadosPago(){ return ordenes.filter(o=>o.estado==="Embalado"&&o.c&&o.t&&o.t.impreso&&!o.ruta&&PAGO_BLOQUEA.includes(o.pago)); }
function pintarArmar(){
  const l=listos(); $("#n-armar").textContent=l.length; $("#n-armar").classList.toggle("cero",!l.length);
  [...elegidas].forEach(c=>{ if(!l.some(o=>o.codigo===c)) elegidas.delete(c); });
  const el=$("#lista-listos"); el.innerHTML="";
  if(!l.length){ el.innerHTML='<div class="alm-vacio">No hay órdenes listas para salir. Aparecen aquí cuando están embaladas y con sus etiquetas impresas.</div>'; }
  l.forEach(o=>{ const d=document.createElement("label"); d.className="pedido sel"+(elegidas.has(o.codigo)?" elegido":"");
    const r=recibe(o);
    d.innerHTML='<input type="checkbox" '+(elegidas.has(o.codigo)?"checked":"")+'><div style="flex:1;min-width:0"><div class="cab"><span class="od">'+esc(o.codigo)+'</span><span class="quien">'+esc(o.vendedor)+'</span></div>'+
      '<div class="dest">📍 '+esc(destino(o))+'</div><div class="quien" style="margin-top:4px">'+esc(r.n)+' · '+o.bultos+' bulto'+(o.bultos>1?'s':'')+'</div>'+
      (o.pago==="Contraentrega"?'<div class="chips"><span class="chip cobrar">CONTRAENTREGA · COBRAR</span></div>':'')+'</div>';
    d.querySelector("input").onchange=e=>{ e.target.checked?elegidas.add(o.codigo):elegidas.delete(o.codigo); pintarArmar(); };
    el.appendChild(d); });
  bloqueadosPago().forEach(o=>{ const d=document.createElement("div"); d.className="pedido bloq";
    d.innerHTML='<div class="cab"><span class="od">'+esc(o.codigo)+'</span><span class="quien">'+esc(o.vendedor)+'</span></div><div class="dest">📍 '+esc(destino(o))+'</div>'+
      '<div class="chips"><span class="chip cobrar">⛔ Falta el pago ('+esc(o.pago)+'): no puede salir</span></div>';
    el.appendChild(d); });
  const sel=l.filter(o=>elegidas.has(o.codigo)), bultos=sel.reduce((a,o)=>a+(o.bultos||0),0);
  $("#barra-armar").hidden=!sel.length; $("#resumen-armar").textContent=sel.length+" orden"+(sel.length>1?"es":"")+" · "+bultos+" bulto"+(bultos!==1?"s":"");
}
$("#crear-ruta").onclick=async()=>{
  const lista=[...elegidas], tr=$("#transportista").value.trim(), ay=$("#ayudante").value.trim();
  if(!tr){ toast("Escribe quién es el transportista"); $("#transportista").focus(); return; }
  const r=await TLConfirm({titulo:"¿Crear la hoja de ruta?",texto:lista.length+" órdenes · Transportista: "+tr+(ay?" · Ayudante: "+ay:"")+". Confirma que todo entra en el vehículo.",si:"Sí, crear"});
  if(!r.ok) return;
  try{ localStorage.setItem("tl_ruta_personas",JSON.stringify({tr,ay})); }catch(e){}
  try{ const j=await api({action:"crearRuta",ordenes:lista,transportista:tr,ayudante:ay}); elegidas.clear(); toast("🗂️ "+j.ruta.codigo+" creada: falta aprobar la salida");
    await cargar(); tab("hojas"); }
  catch(e){ toast(msg(e)+(e.j&&e.j.codigo?" ("+e.j.codigo+")":"")); cargar(); }
};

/* ---------- Hojas de ruta ---------- */
const CLASE={"Por aprobar":"por","En ruta":"ruta","Completada":"ok","Anulada":"anul"};
function pintarHojas(){
  const el=$("#lista-hojas"); el.innerHTML="";
  const visibles=rutas.filter(h=>h.estado!=="Anulada"||Date.now()-h.creado<86400000*2).slice(0,30);
  const activas=rutas.filter(h=>h.estado==="Por aprobar"||h.estado==="En ruta").length;
  $("#n-hojas").textContent=activas; $("#n-hojas").classList.toggle("cero",!activas);
  if(!visibles.length){ el.innerHTML='<div class="alm-vacio">Todavía no hay hojas de ruta.</div>'; return; }
  visibles.forEach(h=>{
    const os=h.ordenes.map(ord).filter(Boolean), hechas=os.filter(o=>o.estado==="Entregado").length;
    const d=document.createElement("div"); d.className="hoja";
    let html='<div class="cab"><span class="od">'+esc(h.codigo)+'</span><span class="est '+(CLASE[h.estado]||"")+'">'+esc(h.estado)+'</span>'+
      (h.estado==="En ruta"||h.estado==="Completada"?'<span class="quien">'+hechas+' de '+os.length+' paradas</span>':'')+'</div>'+
      '<div class="meta">'+esc(h.fecha)+' · Transportista: <b>'+esc(h.transportista)+'</b>'+(h.ayudante?' · Ayudante: '+esc(h.ayudante):'')+' · Armada por '+esc(h.creadaPor)+(h.aprobadaPor?' · Salida aprobada por <b>'+esc(h.aprobadaPor)+'</b>':'')+'</div>'+
      '<ul class="paradas">'+h.ordenes.map((c,i)=>{ const o=ord(c); if(!o) return '<li><b>'+(i+1)+'. '+esc(c)+'</b></li>';
        const e=o.entrega;
        return '<li><b>'+(i+1)+'. '+esc(c)+'</b><span style="flex:1;min-width:180px">'+esc(recibe(o).n)+' · '+esc(destino(o))+'</span>'+
          (e?'<span class="ok">✓ '+esc(e.tipo)+'</span> '+e.fotos.map((f,k)=>'<a href="'+esc(f.url)+'" target="_blank" rel="noopener">Foto '+(k+1)+'</a>').join(" "):(o.estado==="Anulada"?'<span>Anulada</span>':''))+'</li>'; }).join("")+'</ul>'+
      '<div class="acc">';
    html+='<button type="button" class="alm-btn sec" data-a="imp">🖨️ Imprimir hoja (A4)</button>';
    if(h.estado==="Por aprobar"&&rol("supervisor")) html+='<button type="button" class="alm-btn" data-a="aprobar">✓ Aprobar salida</button>';
    if(h.estado==="Por aprobar"&&rol("almacen","admin","supervisor")) html+='<button type="button" class="deshacer" data-a="anular">Anular esta hoja</button>';
    html+='</div>'+(h.estado==="Por aprobar"&&!rol("supervisor")?'<div class="quien" style="margin-top:8px">Un supervisor (Juan, Vilma, Paolo o Arturo) debe aprobar la salida desde su celular.</div>':'');
    d.innerHTML=html;
    const on=(a,fn)=>{const b=d.querySelector('[data-a="'+a+'"]'); if(b) b.onclick=fn;};
    on("imp",()=>imprimirHoja(h));
    on("aprobar",async e=>{ const r=await TLConfirm({titulo:"¿Aprobar la salida de "+h.codigo+"?",texto:"Verifica que los bultos cargados coincidan con la hoja: "+os.reduce((a,o)=>a+(o.bultos||0),0)+" bultos en "+os.length+" órdenes.",si:"Sí, aprobar salida"}); if(!r.ok) return;
      e.target.disabled=true; try{ await api({action:"aprobarRuta",codigo:h.codigo}); toast("🚚 "+h.codigo+" en ruta"); await cargar(); }catch(err){ e.target.disabled=false; toast(msg(err)); } });
    on("anular",async()=>{ const r=await TLConfirm({titulo:"¿Anular "+h.codigo+"?",texto:"Las órdenes vuelven a quedar listas para otra hoja de ruta.",campo:{label:"Motivo",min:5},si:"Anular hoja",tono:"peligro"}); if(!r.ok) return;
      try{ await api({action:"anularRuta",codigo:h.codigo,motivo:r.valor}); toast(h.codigo+" anulada"); await cargar(); }catch(err){ toast(msg(err)); } });
    el.appendChild(d);
  });
}
function imprimirHoja(h){
  const os=h.ordenes.map(ord).filter(o=>o&&o.estado!=="Anulada");
  const fecha=(h.fecha||"").split(" ")[0];
  const filas=os.map((o,i)=>{ const c=o.c||{}, r=recibe(o);
    const desc=o.productos.map(x=>esc(x.p)).join("<br>"), cant=o.productos.map(x=>x.q).join("<br>");
    const transp=c.destino==="Provincia"?(c.entrega==="Entrega a domicilio"?"Agencia · domicilio":"Agencia"):(c.entrega==="Recojo en tienda"?"Recojo en tienda":"Delivery");
    return '<tr class="'+(i%2?"par":"")+'"><td class="n">'+(i+1)+'</td><td><b>'+esc(o.codigo)+'</b> · '+o.bultos+' bulto'+(o.bultos>1?'s':'')+'<br>'+desc+(o.pago==="Contraentrega"?'<br><span class="cobrar">COBRAR CONTRAENTREGA</span>':'')+'</td><td style="text-align:center">'+cant+'</td>'+
      '<td>'+esc(c.nombre||"")+(c.doc?'<br>'+esc(c.tipoDoc||"")+' '+esc(c.doc):'')+'</td>'+
      '<td><div class="at"><span>ID</span><span>'+esc(r.n||"")+'</span><span>DNI</span><span>'+esc(r.d||"")+'</span><span>CEL</span><span>'+esc(r.t||"")+'</span></div></td>'+
      '<td>'+esc(c.destino==="Provincia"?c.ciudad:"Lima"+(c.distrito?" – "+c.distrito:""))+(direccion(o)&&c.destino!=="Provincia"?'<br>'+esc(direccion(o)):"")+(c.destino==="Provincia"&&c.entrega==="Entrega a domicilio"?'<br>'+esc(direccion(o)):"")+'</td>'+
      '<td>'+esc(c.destino==="Provincia"?c.agencia+(c.sede&&c.entrega!=="Entrega a domicilio"?" · "+c.sede:""):"—")+(o.clave?'<br><b>Clave: '+esc(o.clave)+'</b>':'')+'</td><td>'+esc(transp)+'</td><td></td></tr>'; }).join("");
  $("#print-area").innerHTML='<div class="hr-print"><div class="top"><div>'+(window.TL_LOGO_ET?'<img src="'+TL_LOGO_ET+'" alt="Transline">':'<b>TRANSLINE</b>')+'<small>Almacén principal - SJL</small></div>'+
    '<div><div class="caja">HOJA DE RUTA</div><div class="datos"><span>FECHA</span><span>'+esc(fecha)+'</span><span>N°</span><span>'+esc(h.codigo)+'</span></div></div></div>'+
    '<table><thead><tr><th>N°</th><th>DESCRIPCIÓN</th><th>CANT</th><th>RAZÓN SOCIAL</th><th>ATENCIÓN</th><th>DESTINO</th><th>AGENCIA</th><th>TRANSPORTE</th><th style="width:28mm">FIRMA / SELLO</th></tr></thead><tbody>'+filas+'</tbody></table>'+
    '<div class="firmas"><div>AUTORIZADO POR: ADMINISTRACIÓN<div class="linea">'+esc(h.aprobadaPor||"")+'</div></div><div>RESPONSABLE: TRANSPORTISTA<div class="linea">'+esc(h.transportista)+(h.ayudante?" · "+esc(h.ayudante):"")+'</div></div></div></div>';
  setTimeout(()=>window.print(),80);
}

/* ---------- Mi ruta (celular del transportista) ---------- */
function misRutas(){ const yo=(U&&U.nombre||"").toLowerCase();
  const hoy=(()=>{const d=new Date();return String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0")+"/"+d.getFullYear();})();
  return rutas.filter(h=>(h.estado==="En ruta"||(h.estado==="Completada"&&String(h.completada||"").startsWith(hoy)))&&(rol("admin","supervisor")||[h.transportista,h.ayudante].some(x=>String(x||"").toLowerCase().includes(yo)))); }
function pintarMia(){
  const el=$("#lista-mia"); el.innerHTML=""; const hs=misRutas();
  const pend=hs.reduce((a,h)=>a+h.ordenes.map(ord).filter(o=>o&&o.estado==="Despachado").length,0);
  $("#n-mia").textContent=pend; $("#n-mia").classList.toggle("cero",!pend);
  if(!hs.length){ el.innerHTML='<div class="alm-vacio">No tienes hojas de ruta en curso. Cuando un supervisor apruebe la salida, aparecerán aquí.</div>'; return; }
  hs.forEach(h=>{ const t=document.createElement("h2"); t.style.cssText="margin:6px 0 12px;font-size:1.25rem"; t.textContent=h.codigo+" · "+h.transportista+(h.estado==="Completada"?" · ✓ Completada":""); el.appendChild(t);
    h.ordenes.forEach((c,i)=>{ const o=ord(c); if(!o||o.estado==="Anulada") return; const r=recibe(o), cc=o.c||{}, hecha=o.estado==="Entregado";
      const d=document.createElement("div"); d.className="parada"+(hecha?" hecha":"");
      d.innerHTML='<div><span class="num">'+(i+1)+'</span><span class="od">'+esc(o.codigo)+'</span></div>'+
        '<div class="cli">'+esc(cc.nombre||"")+'</div>'+(cc.atencion&&cc.atencion.nombre?'<div class="lin">Atención a: <b>'+esc(cc.atencion.nombre)+'</b></div>':'')+
        '<div class="lin">📍 '+esc(destino(o))+'</div>'+(direccion(o)?'<div class="lin">'+esc(direccion(o))+'</div>':'')+
        '<div class="lin">📦 '+o.bultos+' bulto'+(o.bultos>1?'s':'')+' · '+o.productos.map(x=>x.q+" × "+esc(x.p)).join(", ")+'</div>'+
        (o.pago==="Contraentrega"?'<div class="chips"><span class="chip cobrar">CONTRAENTREGA · COBRAR</span></div>':'')+
        (o.clave?'<div class="clave-ruta">🔑 Clave para la agencia: <b>'+esc(o.clave)+'</b></div>':'')+
        (r.t?'<a class="tel" href="tel:'+esc(r.t)+'">📞 Llamar a '+esc(r.n)+'</a>':'')+
        (hecha?'<div class="lin" style="margin-top:10px;color:#1E7F55;font-weight:700">✓ '+esc(o.entrega.tipo)+' · '+esc(o.entrega.f)+'</div><div class="fotos-prev">'+o.entrega.fotos.map(f=>'<a href="'+esc(f.url)+'" target="_blank" rel="noopener"><img alt="Evidencia" src="https://drive.google.com/thumbnail?id='+esc(f.id)+'&sz=w200"></a>').join("")+'</div>'
          :'<div class="acc">'+(cc.destino==="Provincia"&&cc.entrega!=="Entrega a domicilio"
            ?'<button type="button" class="alm-btn azul ancho" data-t="Dejado en agencia">🏢 Dejado en agencia</button><button type="button" class="alm-btn sec" data-t="Entregado">✓ Entregado</button>'
            :'<button type="button" class="alm-btn ancho" data-t="Entregado">✓ Entregado</button><button type="button" class="alm-btn sec" data-t="Dejado en agencia">🏢 Dejado en agencia</button>')+'</div>');
      d.querySelectorAll("[data-t]").forEach(b=>b.onclick=()=>registrar(o,b.dataset.t));
      el.appendChild(d); }); });
}
/* Reduce cada foto a 1280 px en JPEG para que suba rápido incluso con poca señal */
function comprimir(file){ return new Promise((ok,mal)=>{ const img=new Image(), url=URL.createObjectURL(file);
  img.onload=()=>{ const m=1280, k=Math.min(1,m/Math.max(img.width,img.height)), cv=document.createElement("canvas");
    cv.width=Math.round(img.width*k); cv.height=Math.round(img.height*k); cv.getContext("2d").drawImage(img,0,0,cv.width,cv.height); URL.revokeObjectURL(url); ok(cv.toDataURL("image/jpeg",.72)); };
  img.onerror=()=>{ URL.revokeObjectURL(url); mal(new Error("foto")); }; img.src=url; }); }
async function registrar(o,tipo){
  let fotos=[];
  const pintarPrev=()=>{ const p=document.querySelector(".tlc .fotos-prev"); if(p) p.innerHTML=fotos.map(f=>'<img alt="Foto" src="'+f+'">').join(""); };
  const promesa=TLConfirm({titulo:(tipo==="Entregado"?"✓ Entregado":"🏢 Dejado en agencia")+" · "+o.codigo,
    html:'<p>Toma <b>al menos una foto</b> de cómo quedan los equipos'+(tipo==="Dejado en agencia"?' y del comprobante o guía de la agencia':'')+'. Puedes agregar hasta 4.</p>'+
      '<label class="foto-btn">📷 Tomar o elegir foto<input type="file" accept="image/*" capture="environment" multiple></label><div class="fotos-prev"></div>',
    campo:{label:"Nota (opcional)",placeholder:"Ej.: recibió el vigilante, caja en buen estado",opcional:true},si:"Guardar",no:"Cancelar"});
  const inp=document.querySelector(".tlc input[type=file]");          // la ventana ya existe: se conecta de inmediato
  if(inp) inp.onchange=async()=>{ for(const f of [...inp.files].slice(0,4-fotos.length)){ try{ fotos.push(await comprimir(f)); }catch(e){} } inp.value=""; pintarPrev(); };
  const r=await promesa; if(!r.ok) return;
  if(!fotos.length){ toast(MSGS.sin_fotos); return registrar(o,tipo); }
  toast("Subiendo fotos… no cierres la pantalla");
  try{ await api({action:"entregar",codigo:o.codigo,tipo,nota:r.valor,fotos}); toast("✓ "+o.codigo+": "+tipo); await cargar(); }
  catch(e){ toast(msg(e)); }
}

/* ---------- carga y pestañas ---------- */
function tab(n){ vista=n; document.querySelectorAll(".alm-tabs button").forEach(b=>b.setAttribute("aria-selected",b.dataset.tab===n));
  document.querySelectorAll(".alm-view").forEach(v=>v.hidden=v.id!=="v-"+n); }
document.querySelectorAll(".alm-tabs button").forEach(b=>b.onclick=()=>tab(b.dataset.tab));
async function cargar(){
  try{
    const r=await fetch(TL.API_URL+"?action=rutas&pin="+encodeURIComponent(PIN)); const j=await r.json();
    if(!j.ok){ sinAcceso("Tu usuario no tiene acceso a la hoja de ruta."); return; }
    U=j.usuario; $("#u-nombre").textContent=U.nombre; rutas=j.rutas||[]; ordenes=j.ordenes||[];
    if(!rol("ruta","almacen","admin","supervisor")){ sinAcceso("Tu usuario no tiene acceso a la hoja de ruta."); return; }
    const verMia=rol("ruta","admin"), verArmar=rol("almacen","admin");
    document.querySelector('[data-tab="mia"]').hidden=!verMia; document.querySelector('[data-tab="armar"]').hidden=!verArmar;
    if(!vista) tab(verMia&&!verArmar?"mia":(verArmar?"armar":"hojas"));
    pintarArmar(); pintarHojas(); pintarMia();
    const h=new Date(); $("#sync").textContent="Actualizado "+String(h.getHours()).padStart(2,"0")+":"+String(h.getMinutes()).padStart(2,"0");
  }catch(e){ $("#sync").textContent="Sin conexión"; }
}
function sinAcceso(t){ const a=$("#sin-acceso"); a.hidden=false; a.innerHTML=esc(t)+' <a href="'+PORTAL+'">Volver al inicio</a>'; document.querySelectorAll(".alm-view").forEach(v=>v.hidden=true); $(".alm-tabs").hidden=true; }
try{ const p=JSON.parse(localStorage.getItem("tl_ruta_personas")||"null"); if(p){ $("#transportista").value=p.tr||""; $("#ayudante").value=p.ay||""; } }catch(e){}
$("#lista-personas").innerHTML=["Celso Verástegui","Diego"].map(n=>'<option value="'+n+'">').join("");
cargar();
setInterval(()=>{ if(document.visibilityState==="visible"&&!document.querySelector(".tlc-fondo")) cargar(); },30000);
document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="visible"&&!document.querySelector(".tlc-fondo")) cargar(); });
})();
