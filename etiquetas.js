/* Transline · Etiquetas de despacho 100 × 60 mm (las usan la app de Despachos y Alistar pedidos) */
(function(){
const esc = s => String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function qrURL(o){ return new URL("./#o="+o.codigo, location.href).href; }
function qrSVG(text){
  try{ const q=qrcode(0,"M"); q.addData(text); q.make(); return q.createSvgTag({cellSize:2,margin:0,scalable:true}); }
  catch(e){ return '<div style="font-size:2.4mm;border:.3mm solid #000;height:21mm;display:flex;align-items:center;justify-content:center;text-align:center">'+esc(text.split("#o=")[1]||"")+'</div>'; }
}
function etiqueta(o,i,n){
  const c=o.c||{}, a=c.atencion;
  const fecha=(o.fecha||"").split(" ")[0];
  let detalle="";
  const domProv=c.destino==="Provincia"&&c.entrega==="Entrega a domicilio";
  if(domProv) detalle=(c.agencia||"")+" · Entrega a domicilio";
  else if(c.destino==="Provincia") detalle="Agencia "+(c.agencia||"")+(c.sede?" · "+c.sede:"");
  else if(c.entrega==="Recojo en tienda") detalle="Recoge en tienda";
  else detalle="Entrega: Delivery";
  let medio="";
  if(a&&a.nombre) medio='<div class="att"><b>ATENCIÓN A:</b> '+esc(a.nombre)+'<br>DNI '+esc(a.doc)+' · Tel. '+esc(a.tel)+'</div>';
  else medio='<p class="doc" style="margin-top:.8mm">Tel. '+esc(c.tel||"")+'</p>';
  if((c.destino==="Lima"&&c.entrega==="Delivery")||domProv) medio+='<p class="doc" style="margin-top:.6mm">'+esc(c.direccion||"")+(domProv&&c.distrito?", "+esc(c.distrito):"")+(c.referencia?'<br>Ref.: '+esc(c.referencia):'')+'</p>';
  return '<div class="et"><div class="top"><span class="brand">'+(window.TL_LOGO_ET?'<img src="'+TL_LOGO_ET+'" alt="Transline">':'TRANSLINE')+'</span><span class="tipo-et">DESPACHO</span><span style="display:flex;align-items:center"><span class="code">'+esc(o.codigo)+'<br>'+esc(fecha)+'</span><span class="bulto">BULTO '+i+'/'+n+'</span></span></div>'+
    '<div class="mid"><div style="min-width:0"><p class="k">DESTINATARIO</p><p class="name">'+esc((c.nombre||"").toUpperCase())+'</p><p class="doc">'+esc(c.doc?(c.tipoDoc||"DNI")+' '+c.doc+' · ':'')+esc(c.comprobante||"")+'</p>'+medio+'</div>'+
    '<div><div class="qr">'+qrSVG(qrURL(o))+'</div><div class="qrt">Escanea para ver la orden</div></div></div>'+
    '<div class="dest"><b>'+esc(TLtxt.lugar(c))+'</b><span>'+esc(detalle)+'</span></div>'+
    '<div class="foot"><span>Remitente: '+esc(TL.REMITENTE)+' · RUC '+esc(TL.RUC_REMITENTE)+'</span><span>'+esc((o.embalaje||"").toUpperCase())+'</span></div></div>';
}
const FLECHA_SVG = '<svg viewBox="0 0 1000 600" xmlns="http://www.w3.org/2000/svg"> <g fill="#000"> <polygon points="40,165 255,55 255,115 460,115 460,215 255,215 255,275"/> <polygon points="40,415 255,305 255,365 460,365 460,465 255,465 255,525"/> </g> <g transform="translate(565,300) rotate(-90) scale(.85)"> <path d="M-70,-90 h140 v40 a70,70 0 0 1 -140,0 z" fill="#000"/> <rect x="-7" y="-20" width="14" height="70" fill="#000"/> <rect x="-45" y="48" width="90" height="12" rx="6" fill="#000"/> <polyline points="-35,-80 -10,-55 -25,-50 5,-28" fill="none" stroke="#fff" stroke-width="7" stroke-linejoin="round"/> </g> <g transform="translate(0,0)"> <text x="0" y="0" transform="translate(745,300) rotate(-90)" text-anchor="middle" font-size="125" font-weight="900" letter-spacing="6">MUY</text> <text x="0" y="0" transform="translate(905,300) rotate(-90)" text-anchor="middle" font-size="125" font-weight="900" letter-spacing="6">FRÁGIL</text> </g> </svg>';
function flecha(){ return '<div class="et-flecha">'+FLECHA_SVG+'</div>'; }
/** Etiquetas de bulto y, después, las de flechas (o._flechas si el almacén ajustó la cantidad). */
function imprimir(lista){
  document.getElementById("print-area").innerHTML=lista.map(o=>{
    let h=""; const n=Math.max(1,o.bultos||1);
    const desde=Math.max(1,Math.min(n,o._desde||1)), hasta=Math.max(desde,Math.min(n,o._hasta||n));   // permite retomar, p. ej. 47 a 65
    if(!o._sinBultos) for(let i=desde;i<=hasta;i++) h+=etiqueta(o,i,n);
    const f=o._flechas!=null?o._flechas:(o.flechas||n*2);
    for(let i=0;i<f;i++) h+=flecha();
    return h;
  }).join("");
  setTimeout(()=>window.print(),80);
}
window.TLEtiq = { html: etiqueta, imprimir, flecha };
})();
