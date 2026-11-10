/* Transline · Formulario de datos del cliente (lo usan cliente.html y la app del vendedor) */
(function () {
  const AGENCIAS_BASE = [{ n: "Shalom" }, { n: "Olva Courier" }, { n: "Marvisur" }, { n: "Cruz del Sur Cargo" }];
  const DISTRITOS = ["Ancón","Ate","Barranco","Breña","Carabayllo","Chaclacayo","Chorrillos","Cieneguilla","Comas","El Agustino",
    "Independencia","Jesús María","La Molina","La Victoria","Lima (Cercado)","Lince","Los Olivos","Lurigancho-Chosica","Lurín",
    "Magdalena del Mar","Miraflores","Pachacámac","Pucusana","Pueblo Libre","Puente Piedra","Punta Hermosa","Punta Negra",
    "Rímac","San Bartolo","San Borja","San Isidro","San Juan de Lurigancho","San Juan de Miraflores","San Luis",
    "San Martín de Porres","San Miguel","Santa Anita","Santa María del Mar","Santa Rosa","Santiago de Surco","Surquillo",
    "Villa El Salvador","Villa María del Triunfo","Callao","Bellavista","Carmen de la Legua","La Perla","La Punta",
    "Mi Perú","Ventanilla"];
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function seg(name, opts, val) {
    return '<div class="seg" data-seg="' + name + '">' + opts.map(o =>
      '<button type="button" data-v="' + esc(o) + '" aria-pressed="' + (o === val) + '">' + esc(o) + '</button>').join("") + '</div>';
  }
  function campo(id, label, attrs, hint) {
    return '<label class="f" for="fc-' + id + '">' + label + '</label><input id="fc-' + id + '" ' + (attrs || 'type="text"') + '>' +
      '<div class="hint" data-err="' + id + '">' + (hint || "") + '</div>';
  }

  window.FormCliente = function (root, inicial, op) {
    op = op || {};
    const AGS = (op.agencias && op.agencias.length ? op.agencias : AGENCIAS_BASE);
    const AGENCIAS = AGS.map(a => a.n).concat(["Otra"]);
    const S = { comprobante: "Boleta", destino: "Lima", entrega: "Delivery", agencia: AGENCIAS[0], aten: false };
    root.innerHTML =
      '<fieldset><legend>1. Comprobante de pago</legend>' + seg("comprobante", ["Boleta", "Factura"], S.comprobante) +
      '<div id="fc-boleta">' + campo("nombre", "Nombre y apellidos", 'type="text" autocomplete="name" placeholder="Ej.: Eduardo Ramírez Torres"') +
        campo("dni", "DNI o carné de extranjería", 'type="tel" inputmode="numeric" maxlength="12" placeholder="8 dígitos"') + '</div>' +
      '<div id="fc-factura" hidden>' + campo("ruc", "RUC", 'type="tel" inputmode="numeric" maxlength="11" placeholder="11 dígitos"') +
        campo("razon", "Razón social", 'type="text" autocomplete="organization" placeholder="Ej.: Inversiones Solar SAC"') + '</div>' +
      campo("tel", "Teléfono / WhatsApp", 'type="tel" inputmode="tel" maxlength="12" autocomplete="tel" placeholder="9 dígitos"') +
      '</fieldset>' +
      '<fieldset><legend>2. Envío</legend>' + seg("destino", ["Lima", "Provincia"], S.destino) +
      '<div id="fc-lima"><label class="f">Tipo de entrega</label>' + seg("entrega", ["Delivery", "Recojo en tienda"], S.entrega) +
        '<div id="fc-delivery">' + campo("distrito", "Distrito", 'type="text" list="fc-distritos" placeholder="Ej.: Pueblo Libre"') +
        '<datalist id="fc-distritos">' + DISTRITOS.map(d => '<option value="' + d + '">').join("") + '</datalist>' +
        campo("direccion", "Dirección", 'type="text" autocomplete="street-address" placeholder="Ej.: Av. Mariano Cornejo 2117, dpto. 301"') +
        campo("referencia", "Referencia (opcional)", 'type="text" placeholder="Ej.: frente al parque"') + '</div></div>' +
      '<div id="fc-prov" hidden>' + campo("ciudad", "Ciudad / provincia", 'type="text" placeholder="Ej.: Huancayo"') +
        '<label class="f">Agencia de envío</label><div class="chips" id="fc-agencias">' +
        AGENCIAS.map(a => '<button type="button" data-v="' + a + '" aria-pressed="' + (a === S.agencia) + '">' + a + '</button>').join("") + '</div>' +
        '<input id="fc-agencia-otra" type="text" placeholder="Nombre de la agencia" hidden style="margin-top:8px"><div class="hint" id="fc-ag-dias"></div><div class="hint" data-err="agencia"></div>' +
        campo("sede", "Sede o dirección de la agencia", 'type="text" placeholder="Ej.: Sede El Tambo, Av. Huancavelica 123"') + '</div>' +
      '</fieldset>' +
      '<fieldset><legend>3. ¿Quién recibe o recoge el pedido?</legend><div id="fc-aten-seg"></div>' +
      '<div id="fc-aten" hidden><p class="nota">Datos de la persona que recibe o recoge:</p>' +
        campo("aten-nombre", "Atención a (nombre y apellidos)", 'type="text" placeholder="Ej.: Juan Pérez Rojas"') +
        '<div class="row2"><div>' + campo("aten-dni", "DNI", 'type="tel" inputmode="numeric" maxlength="12" placeholder="8 dígitos"') + '</div>' +
        '<div>' + campo("aten-tel", "Teléfono", 'type="tel" inputmode="tel" maxlength="12" placeholder="9 dígitos"') + '</div></div></div>' +
      '</fieldset>';

    const $ = s => root.querySelector(s);
    const v = id => ($("#fc-" + id) ? $("#fc-" + id).value.trim() : "");
    const dig = id => v(id).replace(/\D/g, "");

    function pintarAten() {
      const f = S.comprobante === "Factura";
      const ops = f ? ["Solo a nombre de la empresa", "Atención a una persona"] : ["Recibe el mismo comprador", "Atención a otra persona"];
      $("#fc-aten-seg").innerHTML = seg("aten", ops, S.aten ? ops[1] : ops[0]);
      $("#fc-aten-seg .seg").querySelectorAll("button").forEach((b, i) => b.onclick = () => { S.aten = i === 1; pintarAten(); disparar(); });
      $("#fc-aten").hidden = !S.aten;
    }
    function pintar() {
      root.querySelectorAll(".seg[data-seg]").forEach(sg => {
        const k = sg.dataset.seg; if (k === "aten") return;
        sg.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === S[k]));
      });
      $("#fc-boleta").hidden = S.comprobante !== "Boleta";
      $("#fc-factura").hidden = S.comprobante !== "Factura";
      $("#fc-lima").hidden = S.destino !== "Lima";
      $("#fc-prov").hidden = S.destino !== "Provincia";
      $("#fc-delivery").hidden = S.entrega !== "Delivery";
      $("#fc-agencias").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === S.agencia));
      $("#fc-agencia-otra").hidden = S.agencia !== "Otra";
      const ag = AGS.find(a => a.n === S.agencia);
      $("#fc-ag-dias").textContent = ag && ag.max ? "Llegada estimada: " + (ag.min && ag.min !== ag.max ? ag.min + " a " + ag.max : ag.max) + (ag.max === 1 ? " día" : " días") + " desde el envío." : "";
      pintarAten();
    }
    let alCambiar = () => {};
    function disparar() { alCambiar(); }
    root.querySelectorAll(".seg[data-seg]").forEach(sg => {
      const k = sg.dataset.seg;
      sg.querySelectorAll("button").forEach(b => b.onclick = () => { S[k] = b.dataset.v; pintar(); disparar(); });
    });
    $("#fc-agencias").querySelectorAll("button").forEach(b => b.onclick = () => { S.agencia = b.dataset.v; pintar(); disparar(); });
    let ultimoBuscado = "";
    async function autocompletar(doc) {
      if (!op.buscarCliente || doc === ultimoBuscado) return;
      ultimoBuscado = doc;
      let c = null; try { c = await op.buscarCliente(doc); } catch (e) { return; }
      if (!c) return;
      const f = S.comprobante === "Factura";
      const llenar = (id, val) => { const el = $("#fc-" + id); if (el && !el.value.trim() && val) el.value = val; };
      llenar(f ? "razon" : "nombre", c.nombre); llenar("tel", c.tel);
      if (S.destino === "Lima" && S.entrega === "Delivery") { llenar("distrito", c.distrito); llenar("direccion", c.direccion); }
      if (S.destino === "Provincia" && c.ciudad && sinT(c.ciudad) !== "lima") llenar("ciudad", c.ciudad);
      const h = root.querySelector('[data-err="' + (f ? "ruc" : "dni") + '"]');
      if (h) { h.classList.remove("bad"); h.textContent = "✓ Cliente encontrado en la base: se completaron sus datos. Revísalos."; }
      disparar();
    }
    const sinT = t => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    root.addEventListener("input", e => {
      if (["fc-dni", "fc-ruc", "fc-aten-dni"].includes(e.target.id)) e.target.value = e.target.value.replace(/\D/g, "");
      if (e.target.id === "fc-dni" && e.target.value.length === 8) autocompletar(e.target.value);
      if (e.target.id === "fc-ruc" && e.target.value.length === 11) autocompletar(e.target.value);
      const er = root.querySelector('[data-err="' + e.target.id.replace("fc-", "") + '"]'); if (er) { er.textContent = ""; er.classList.remove("bad"); }
      disparar();
    });

    function datos() {
      const f = S.comprobante === "Factura";
      const c = { comprobante: S.comprobante, nombre: f ? v("razon") : v("nombre"), tipoDoc: f ? "RUC" : "DNI",
        doc: f ? dig("ruc") : dig("dni"), tel: dig("tel"), destino: S.destino,
        entrega: S.destino === "Provincia" ? "Agencia" : S.entrega };
      if (S.destino === "Lima" && S.entrega === "Delivery") { c.distrito = v("distrito"); c.direccion = v("direccion"); c.referencia = v("referencia"); }
      if (S.destino === "Provincia") { c.ciudad = v("ciudad"); c.agencia = S.agencia === "Otra" ? v("agencia-otra") : S.agencia; c.sede = v("sede"); }
      c.atencion = S.aten ? { nombre: v("aten-nombre"), doc: dig("aten-dni"), tel: dig("aten-tel") } : null;
      return c;
    }
    function marcar(id, msg) { const e = root.querySelector('[data-err="' + id + '"]'); if (e) { e.textContent = msg; e.classList.add("bad"); } }
    function validar() {
      root.querySelectorAll(".hint.bad").forEach(e => { e.textContent = ""; e.classList.remove("bad"); });
      const c = datos(), malos = [];
      const m = (id, msg) => { marcar(id, msg); malos.push(id); };
      if (c.comprobante === "Factura") {
        if (!/^(10|15|17|20)\d{9}$/.test(c.doc)) m("ruc", "Ingresa un RUC válido de 11 dígitos.");
        if (!c.nombre) m("razon", "Ingresa la razón social.");
      } else {
        if (!c.nombre) m("nombre", "Ingresa nombre y apellidos.");
        if (!/^\d{8,12}$/.test(c.doc)) m("dni", "Ingresa un DNI de 8 dígitos (o tu carné de extranjería).");
      }
      if (c.tel.length < 9) m("tel", "Ingresa un teléfono de 9 dígitos.");
      if (c.destino === "Lima" && c.entrega === "Delivery") {
        if (!c.distrito) m("distrito", "Elige o escribe el distrito.");
        if (!c.direccion) m("direccion", "Ingresa la dirección de entrega.");
      }
      if (c.destino === "Provincia") {
        if (!c.ciudad) m("ciudad", "Ingresa la ciudad.");
        if (!c.agencia) m("agencia", "Elige o escribe la agencia.");
      }
      if (c.atencion) {
        if (!c.atencion.nombre) m("aten-nombre", "Ingresa el nombre de quien recibe.");
        if (!/^\d{8,12}$/.test(c.atencion.doc)) m("aten-dni", "DNI de 8 dígitos.");
        if (c.atencion.tel.length < 9) m("aten-tel", "Teléfono de 9 dígitos.");
      }
      if (malos.length) { const el = root.querySelector("#fc-" + malos[0]) || root.querySelector('[data-err="' + malos[0] + '"]'); if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); if (el.focus) el.focus({ preventScroll: true }); } }
      return malos.length ? null : c;
    }
    function cargar(c) {
      if (!c) return;
      S.comprobante = c.comprobante === "Factura" ? "Factura" : "Boleta";
      S.destino = c.destino === "Provincia" ? "Provincia" : "Lima";
      S.entrega = c.entrega === "Recojo en tienda" ? "Recojo en tienda" : "Delivery";
      const set = (id, val) => { if ($("#fc-" + id)) $("#fc-" + id).value = val || ""; };
      if (S.comprobante === "Factura") { set("razon", c.nombre); set("ruc", c.doc); } else { set("nombre", c.nombre); set("dni", c.doc); }
      set("tel", c.tel); set("distrito", c.distrito); set("direccion", c.direccion); set("referencia", c.referencia);
      set("ciudad", c.ciudad); set("sede", c.sede);
      if (c.agencia) { if (AGENCIAS.includes(c.agencia)) S.agencia = c.agencia; else { S.agencia = "Otra"; set("agencia-otra", c.agencia); } }
      S.aten = !!(c.atencion && c.atencion.nombre);
      if (S.aten) { set("aten-nombre", c.atencion.nombre); set("aten-dni", c.atencion.doc); set("aten-tel", c.atencion.tel); }
      pintar();
    }
    pintar(); cargar(inicial);
    return { datos, validar, cargar, onChange: fn => { alCambiar = fn; } };
  };

  /* Textos comunes para mensajes y etiquetas */
  window.TLtxt = {
    destinatario(c) {
      if (!c) return "";
      return c.nombre + " · " + c.tipoDoc + " " + c.doc;
    },
    lugar(c) {
      if (!c) return "";
      if (c.destino === "Provincia") return "PROVINCIA · " + (c.ciudad || "").toUpperCase();
      if (c.entrega === "Recojo en tienda") return "LIMA · RECOJO EN TIENDA";
      return "LIMA · " + (c.distrito || "").toUpperCase();
    }
  };
})();
