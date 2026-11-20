/* Transline · Ventana de confirmación grande (Sí / No), pensada para usarse sin errores en celular y computadora. */
(function(){
  const esc = s => String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  /** Tabla de configuración de drivers (la usan Despachos y Alistar pedidos). */
  window.TLConfigHTML = function(k){
    if(!k) return "";
    if(k.fabrica) return '<p class="cfg-datos">Va con la <b>configuración de fábrica</b>: no necesita configuración personalizada.</p>';
    return '<p class="cfg-datos"><b>Lugar:</b> '+esc(k.lugar)+'<br><b>Altura:</b> '+esc(k.altura)+' m · <b>Responsable:</b> '+esc(k.responsable)+'</p>'+
      '<table class="cfg-tabla"><tr><th>Nivel</th><th>Horas</th><th>Porcentaje</th></tr>'+
      (k.niveles||[]).map((n,i)=>'<tr><td>'+(i+1)+'</td><td>'+(n.h?esc(n.h):'Hasta el amanecer')+'</td><td>'+esc(n.p)+'%</td></tr>').join("")+'</table>'+
      (k.hecho?'<p class="cfg-datos">✓ Configurada por '+esc(k.hechoPor||"")+' · '+esc(k.fecha||"")+'</p>':'');
  };
  /** TLConfirm({titulo, texto, si:"Sí", no:"No", tono:"ok"|"peligro", campo:{label, placeholder, min, opcional}})
   *  → Promise<{ok:boolean, valor:string}> */
  window.TLConfirm = function(op){
    return new Promise(resolve=>{
      const fondo=document.createElement("div"); fondo.className="tlc-fondo";
      fondo.innerHTML='<div class="tlc" role="dialog" aria-modal="true" aria-labelledby="tlc-t">'+
        '<h2 id="tlc-t">'+esc(op.titulo||"¿Confirmas?")+'</h2>'+(op.texto?'<p>'+esc(op.texto)+'</p>':'')+
        (op.html||'')+
        (op.campo?'<label class="tlc-l" for="tlc-c">'+esc(op.campo.label||"")+'</label><textarea id="tlc-c" rows="3" placeholder="'+esc(op.campo.placeholder||"")+'"></textarea><div class="tlc-err" id="tlc-e"></div>':'')+
        '<div class="tlc-b'+(op.unBoton?' uno':'')+'"><button type="button" class="tlc-no">'+esc(op.no||"No")+'</button><button type="button" class="tlc-si '+(op.tono==="peligro"?"peligro":"")+'">'+esc(op.si||"Sí")+'</button></div></div>';
      document.body.appendChild(fondo);
      const fin=(ok,valor)=>{ fondo.remove(); document.removeEventListener("keydown",tecla); resolve({ok,valor:valor||""}); };
      const tecla=e=>{ if(e.key==="Escape") fin(false); };
      document.addEventListener("keydown",tecla);
      fondo.querySelector(".tlc-no").onclick=()=>fin(false);
      fondo.addEventListener("click",e=>{ if(e.target===fondo) fin(false); });
      fondo.querySelector(".tlc-si").onclick=()=>{
        if(op.campo){ const v=fondo.querySelector("#tlc-c").value.trim(), min=op.campo.min||0;
          if(!op.campo.opcional && v.length<min){ fondo.querySelector("#tlc-e").textContent="Escribe al menos "+min+" caracteres para que quede claro."; return; }
          fin(true,v); } else fin(true);
      };
      setTimeout(()=>{ const c=fondo.querySelector("#tlc-c"); (c||fondo.querySelector(".tlc-si")).focus(); },30);
    });
  };
})();
