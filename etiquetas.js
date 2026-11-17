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
    '<div class="mid"><div style="min-width:0"><p class="k">DESTINATARIO</p><p class="name">'+esc((c.nombre||"").toUpperCase())+'</p><p class="doc">'+esc(c.tipoDoc||"")+' '+esc(c.doc||"")+' · '+esc(c.comprobante||"")+'</p>'+medio+'</div>'+
    '<div><div class="qr">'+qrSVG(qrURL(o))+'</div><div class="qrt">Escanea para ver la orden</div></div></div>'+
    '<div class="dest"><b>'+esc(TLtxt.lugar(c))+'</b><span>'+esc(detalle)+'</span></div>'+
    '<div class="foot"><span>Remitente: '+esc(TL.REMITENTE)+' · RUC '+esc(TL.RUC_REMITENTE)+'</span><span>'+esc((o.embalaje||"").toUpperCase())+'</span></div></div>';
}
function imprimir(lista){
  document.getElementById("print-area").innerHTML=lista.map(o=>{let h="";const n=Math.max(1,o.bultos||1);for(let i=1;i<=n;i++)h+=etiqueta(o,i,n);return h}).join("");
  setTimeout(()=>window.print(),80);
}
window.TLEtiq = { html: etiqueta, imprimir };
})();
