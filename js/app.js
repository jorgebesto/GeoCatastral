/* Interfaz de la página. */
(function () {
  const IP = window.IP, U = IP.util, T = IP.textos, C = IP.CONFIG;
  const $ = (s) => document.querySelector(s);
  const esc = U.esc;
  const E = { excel: null, fichas: [], mapas: [], lote: [], loteCorriendo: false, loteDetener: false };
  const MARCA = { ok: "✓ Coincide", revisar: "⚠ Revisar", diferente: "✗ Diferente", sin_dato: "—" };
  const NOMBRES_DATOS = {
    numero_predial: "Número predial", numero_predial_anterior: "Predial anterior", matricula_inmobiliaria: "Matrícula",
    estado_fmi: "Estado del folio", fecha_apertura_fmi: "Apertura del folio", tipo_predio: "Tipo de predio", condicion_predio: "Condición",
    tipo_derecho: "Derecho", destino_economico: "Destino", area_terreno_m2: "Área terreno", area_registral_m2: "Área registral",
    area_construida_m2: "Área construida", area_poligono_m2: "Área del polígono", zona: "Zona", estrato: "Estrato",
    zona_fisica: "Zona física", zona_economica: "Zona económica", construcciones: "Construcciones", vigencia: "Vigencia",
    nombre_predio: "Nombre", chip: "CHIP", cedula_catastral: "Cédula catastral", direccion: "Dirección", barrio: "Barrio",
    uso: "Uso", vetustez: "Vetustez", avaluo: "Avalúo", nupre: "NUPRE", codigo_local: "Código local", tipo_lote: "Tipo de lote",
  };
  const ORIGEN = { IGAC: "IGAC", "Gestor catastral": "Geoportal del gestor", Empresa: "Empresa", SNR: "SNR" };

  /* ---------------- utilidades de interfaz ---------------- */
  function aviso(texto) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = texto;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }
  const url = (u) => (/^https?:\/\//i.test(u || "") ? u : "");
  const a = (u, t) => (url(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)} ↗</a>` : "");
  function descargar(blob, nombre) {
    const el = document.createElement("a");
    el.href = URL.createObjectURL(blob);
    el.download = nombre;
    document.body.appendChild(el);
    el.click();
    setTimeout(() => { URL.revokeObjectURL(el.href); el.remove(); }, 1000);
  }
  const marcaTiempo = () => {
    const d = new Date(), p = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  };
  const insignia = (f) => `<span class="insignia i-${f.resumen.veredicto}">${T.VEREDICTO[f.resumen.veredicto]}${f.resumen.diferencias ? ` · ${f.resumen.diferencias} dif.` : ""}${f.resumen.revisar ? ` · ${f.resumen.revisar} por revisar` : ""}</span>`;
  const chipOrigen = (o) => (o ? `<span class="origen o-${o === "IGAC" ? "igac" : o === "Gestor catastral" ? "gestor" : "otro"}">${esc(ORIGEN[o] || o)}</span>` : "");

  /* ---------------- Pestañas ---------------- */
  function pestana(nombre) {
    document.querySelectorAll(".pestanas button").forEach((b) => b.classList.toggle("activa", b.dataset.pestana === nombre));
    $("#vistaUno").hidden = nombre !== "uno";
    $("#vistaVarios").hidden = nombre !== "varios";
    if (nombre === "uno") E.mapas.forEach((m) => m.invalidateSize());
  }
  document.querySelectorAll(".pestanas button").forEach((b) => b.addEventListener("click", () => pestana(b.dataset.pestana)));

  /* ---------------- Excel ---------------- */
  function pintarExcel(fecha) {
    const el = $("#estadoExcel");
    const ex = E.excel;
    if (ex) {
      el.className = "estado ok";
      const det = ex.columnasDetectadas;
      el.innerHTML = `<b>${esc(ex.nombreArchivo)}</b> · hoja “${esc(ex.hoja)}” · ${ex.total} filas` +
        (fecha ? `<br><span class="nota">Cargado ${esc(fecha)} · matrícula en “${esc(det.fmi || "?")}”</span>` : "");
      $("#quitarExcel").hidden = false;
    } else {
      el.className = "estado";
      el.textContent = "Sin Excel cargado (la página funciona igual, sin el contraste con la empresa)";
      $("#quitarExcel").hidden = true;
    }
    pintarFiltrosLote();
  }
  $("#excel").addEventListener("change", async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    $("#estadoExcel").className = "estado";
    $("#estadoExcel").textContent = "Leyendo…";
    try {
      const buf = await f.arrayBuffer();
      E.excel = await IP.excelDesdeBuffer(buf, f.name);
      await IP.almacen.guardarExcel(f.name, buf);
      pintarExcel(U.ahora());
      if (E.fichas.length) refrescarFichas();
    } catch (e) {
      E.excel = null;
      $("#estadoExcel").className = "estado mal";
      $("#estadoExcel").textContent = "No se pudo leer el Excel: " + e.message;
      pintarFiltrosLote();
    }
    ev.target.value = "";
  });
  $("#quitarExcel").addEventListener("click", async () => {
    await IP.almacen.borrarExcel();
    E.excel = null;
    pintarExcel();
  });

  /* ---------------- Gestores ---------------- */
  function pintarGestores() {
    const g = IP.gestores.resumen();
    const el = $("#estadoGestores");
    if (g.municipios) {
      el.className = "estado ok";
      el.textContent = `${g.municipios} municipios · ${g.gestores} gestores · actualizado ${g.actualizado || ""}`;
      $("#listaGestores").innerHTML = g.lista.map(([n, c]) => `<div><span>${esc(n)}</span><b>${c}</b></div>`).join("");
    } else {
      el.className = g.error ? "estado mal" : "estado";
      el.textContent = g.error || "Aún no descargado (se descarga solo en la primera búsqueda)";
    }
  }
  $("#actGestores").addEventListener("click", async () => {
    const b = $("#actGestores");
    b.disabled = true;
    $("#estadoGestores").textContent = "Descargando del IGAC…";
    try { await IP.gestores.descargar(); }
    catch (e) { IP.gestores.error = "No se pudo descargar: " + e.message; }
    pintarGestores();
    b.disabled = false;
  });

  /* ---------------- Historial ---------------- */
  async function pintarHistorial() {
    const h = await IP.almacen.historial();
    $("#historial").innerHTML = h.length
      ? h.map((x) => `<li><button type="button" data-matricula="${esc(x.matricula)}"><span><span class="fmi">${esc(x.matricula)}</span><br><span class="nota">${esc(x.municipio || "")}</span></span><span class="nota">${esc(x.ultima || "")}${x.consultas > 1 ? ` · ${x.consultas} consultas` : ""}</span></button></li>`).join("")
      : `<li class="nota">Todavía no hay consultas guardadas</li>`;
  }
  $("#historial").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-matricula]");
    if (b) buscar(b.dataset.matricula);
  });
  $("#borrarTodo").addEventListener("click", async () => {
    if (!confirm("¿Borrar el Excel y todas las consultas del VUR guardadas en este navegador?")) return;
    await IP.almacen.borrarTodo();
    E.excel = null; E.fichas = []; E.lote = [];
    pintarExcel(); pintarHistorial(); pintarFichas(); pintarLote();
    aviso("Datos borrados de este navegador");
  });

  /* ---------------- Búsqueda de un predio ---------------- */
  const opciones = (vur, catastro) => ({ vur, excel: E.excel, catastro });
  function agregar(ficha) { E.fichas = [ficha, ...E.fichas.filter((f) => f.matricula !== ficha.matricula)]; }
  function cargando(texto) {
    const div = document.createElement("div");
    div.className = "cargando";
    div.textContent = texto;
    const cont = $("#fichas");
    if (cont.querySelector(".vacio")) cont.innerHTML = "";
    cont.prepend(div);
    return div;
  }
  async function buscar(matricula) {
    const m = U.normalizarMatricula(matricula);
    if (!m) { aviso("Escriba una matrícula"); return; }
    pestana("uno");
    $("#matricula").value = m;
    const c = cargando(`Buscando ${m}…`);
    try {
      const ficha = await IP.investigarMatricula(m, opciones(undefined, $("#catastro").checked));
      agregar(ficha);
      history.replaceState(null, "", "#m=" + encodeURIComponent(ficha.matricula));
    } catch (e) { aviso("Error: " + e.message); }
    c.remove();
    pintarFichas();
    pintarGestores();
  }
  $("#formBuscar").addEventListener("submit", (ev) => { ev.preventDefault(); buscar($("#matricula").value); });

  /* ---------------- VUR ---------------- */
  function previa(textarea, salida) {
    let t;
    textarea.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const txt = textarea.value;
        if (!txt.trim()) { salida.textContent = ""; return; }
        const cs = IP.vur.leerTexto(txt);
        if (cs.length) salida.textContent = `Detecté ${cs.length} consulta(s) del VUR: ` + cs.map((c) => `${c.matricula_normalizada} (${c.municipio || "sin municipio"})`).join(", ");
        else if (salida.dataset.listas) {
          const ms = listaMatriculas(txt);
          salida.textContent = ms.length ? `Detecté ${ms.length} matrícula(s).` : "No detecto matrículas.";
        } else salida.textContent = "Todavía no detecto ninguna matrícula en el texto.";
      }, 300);
    });
  }
  previa($("#texto"), $("#previa"));
  $("#ejemplo").addEventListener("click", () => { $("#texto").value = IP.EJEMPLO_VUR; $("#texto").dispatchEvent(new Event("input")); });

  function cargarPdfJs() {
    if (window.pdfjsLib) return Promise.resolve();
    const base = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = base + "pdf.min.js";
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = base + "pdf.worker.min.js"; res(); };
      s.onerror = () => rej(new Error("No se pudo cargar el lector de PDF"));
      document.head.appendChild(s);
    });
  }
  async function leerConsultas(texto, archivos) {
    const textos = [texto];
    if (archivos && archivos.length) {
      await cargarPdfJs();
      for (const p of archivos) textos.push(await IP.vur.textoDePdf(p));
    }
    return textos.flatMap((t) => IP.vur.leerTexto(t));
  }

  $("#leerVur").addEventListener("click", async () => {
    const b = $("#leerVur");
    b.disabled = true;
    try {
      const consultas = await leerConsultas($("#texto").value, $("#pdf").files);
      if (!consultas.length) { aviso("No encontré ninguna consulta del VUR con número de matrícula"); return; }
      const c = cargando(`Investigando ${consultas.length} matrícula(s)…`);
      for (const d of consultas) {
        const guardada = await IP.almacen.guardarVur(d);
        c.textContent = `Investigando ${d.matricula_normalizada}…`;
        agregar(await IP.investigarMatricula(d.matricula_normalizada, opciones(guardada, $("#catastro").checked)));
      }
      c.remove();
      $("#texto").value = ""; $("#pdf").value = ""; $("#previa").textContent = "";
      if (consultas.length === 1) history.replaceState(null, "", "#m=" + encodeURIComponent(consultas[0].matricula_normalizada));
      pintarFichas(); pintarHistorial(); pintarGestores();
    } catch (e) {
      aviso("Error: " + e.message);
    } finally { b.disabled = false; }
  });

  /* ---------------- Fichas ---------------- */
  async function refrescarFichas() {
    const nuevas = [];
    for (const f of E.fichas) nuevas.push(await IP.investigarMatricula(f.matricula, opciones(undefined, $("#catastro").checked)));
    E.fichas = nuevas;
    pintarFichas();
  }

  function filaContraste(f) {
    const cod = /predial|cédula|código|matrícula|círculo|CHIP/i.test(f.campo) ? "cod" : "";
    return `<tr class="e-${f.estado}"><td class="campo">${esc(f.campo)}</td>
      <td class="${cod}">${esc(f.excel)}</td><td class="${cod}">${esc(f.vur)}</td>
      <td class="${cod}">${esc(f.catastro)}${f.fuente_catastro ? `<span class="de">${esc(f.fuente_catastro)}</span>` : ""}</td>
      <td class="marca">${MARCA[f.estado] || esc(f.estado)}${f.nota ? `<span class="nota">${esc(f.nota)}</span>` : ""}</td></tr>`;
  }
  function datosCatastro(d) {
    const filas = Object.entries(NOMBRES_DATOS).filter(([k]) => U.limpiar(d[k]) !== "").map(([k, n]) => {
      let v = d[k];
      if (/area_/.test(k)) v = U.formatoArea(v);
      return `<dt>${esc(n)}</dt><dd class="${/numero_predial|chip|matricula/.test(k) ? "cod" : ""}">${esc(v)}</dd>`;
    });
    return filas.length ? `<dl class="datos">${filas.join("")}</dl>` : "";
  }
  function tablaDonde(f) {
    return `<table class="donde"><colgroup><col class="d1"><col class="d2"><col class="d3"><col class="d4"></colgroup>
      <thead><tr><th>Fuente</th><th>Resultado</th><th>Dónde se encontró</th><th>Confirmar</th></tr></thead><tbody>
      ${f.donde.map((x) => `<tr class="r-${x.estado}"><td><b>${esc(x.fuente)}</b><br>${chipOrigen(x.origen)}</td>
        <td class="res">${esc(x.etiqueta || T.CAT[x.estado] || x.estado)}${x.no_probado ? `<span class="nota">fuente no probada</span>` : ""}</td>
        <td>${esc(x.detalle)}</td>
        <td>${x.enlaces.map((e) => a(e.url, e.texto)).filter(Boolean).join("<br>") || "—"}</td></tr>`).join("")}
      </tbody></table>`;
  }

  function tarjeta(f, i) {
    const v = f.vur || {}, c = f.catastro, gi = c.gestor_info || {}, r = f.registro || {};
    const predial = v.referencia_catastral || c.claves.predial30 || c.datos.numero_predial || "";
    const lugar = [v.municipio || r.municipio || c.datos.municipio, v.departamento || r.departamento || c.datos.departamento].filter(Boolean).join(", ");
    const props = (v.propietarios || []).map((p) => `<tr><td>${esc(p.nombre)}</td><td class="cod">${esc(p.tipo_documento)} ${esc(p.documento)}</td><td>${esc(p.participacion)}</td></tr>`).join("")
      || `<tr><td class="nota">${f.vur ? "Sin propietarios en la consulta" : "Sin consulta del VUR"}</td></tr>`;
    const fuentes = (c.fuentes || []).map((s) => `<div class="caja"><div class="tit"><span>${esc(s.fuente)}</span><span class="est ${s.estado === "ok" ? "ok" : "no"}">${esc(T.CAT[s.estado] || s.estado)}</span></div>
        ${chipOrigen(s.origen)} <span class="nota">${esc(s.mensaje)}</span>${datosCatastro(s.datos || {})}
        ${(s.enlaces || [])[0] ? `<div class="conf">${a(s.enlaces[0].url, "Confirmar en la página")}</div>` : ""}</div>`).join("")
      || `<div class="caja"><div class="tit">Catastro</div><div class="nota">${c.estado === "omitido" ? "Consulta al catastro desactivada" : "Sin datos para consultar"}</div></div>`;
    const contacto = [gi.NOMBRE_DE_, gi.RESPONSABL, gi.CARGO, gi.GESTOR_DIR, gi.CORREOS_JU].filter(Boolean).map(esc).join("<br>");
    const enlaces = [
      [C.enlaces.vur, "Abrir el VUR"], [C.enlaces.certificado, "Certificado de tradición (SNR)"], [url(c.visor), "Geoportal del catastro"],
      [c.lat != null ? `https://www.google.com/maps?q=${c.lat},${c.lon}` : "", "Ver en Google Maps"],
      [C.enlaces.colombia_en_mapas, "Colombia en Mapas (IGAC)"], [C.enlaces.igac_tramites, "Trámites catastrales IGAC (VIVI)"],
    ].filter(([u]) => u).map(([u, t]) => `<li>${a(u, t)}</li>`).join("");
    const salv = (v.salvedades || []).map((x) => `<p><b>${esc(x.fecha)}</b> ${esc(x.radicacion)} — ${esc(x.descripcion)}</p>`).join("");
    const regs = f.excel.registros.map((reg) => `<p class="nota">Fila ${esc(reg._numero)} de la hoja</p><div class="rejilla">${reg._todas.filter(([, val]) => val).map(([k, val]) => `<div><span>${esc(k)}</span>${esc(val)}</div>`).join("")}</div>`).join("<hr>");
    const hist = f.historialVur.length
      ? `<table><thead><tr><th>Fecha</th><th>No. consulta</th><th>Propietarios</th></tr></thead><tbody>${f.historialVur.map((h) => `<tr><td>${esc(h.fecha_consulta)} ${esc(h.hora_consulta)}</td><td class="cod">${esc(h.no_consulta)}</td><td>${esc(h.propietarios_texto)}</td></tr>`).join("")}</tbody></table>` : "";

    return `<article class="ficha" id="ficha-${esc(f.matricula)}">
      <div class="cab">
        <div>
          <div class="fmi">${esc(f.matricula)} <button type="button" class="mini" data-copiar="${esc(f.matricula)}">Copiar</button></div>
          <div class="lugar">${esc(lugar || "Sin ubicación")}${v.vereda ? ` · ${esc(v.vereda)}` : ""}${r.encargado ? ` · Encargado: ${esc(r.encargado)}` : ""}${r.estado ? ` · Estado: ${esc(r.estado)}` : ""}</div>
          ${predial ? `<div class="lugar cod">Predial: ${esc(predial)} <button type="button" class="mini" data-copiar="${esc(predial)}">Copiar</button></div>` : ""}
        </div>
        <div class="acciones">${insignia(f)}
          <button type="button" class="mini" data-actualizar="${esc(f.matricula)}">Actualizar</button>
          <button type="button" class="mini" data-cerrar="${esc(f.matricula)}">Cerrar</button>
        </div>
      </div>
      ${f.alertas.length ? `<div class="alertas">${f.alertas.map((x) => `<span class="alerta">${esc(x)}</span>`).join("")}</div>` : ""}
      <div class="cuerpo">
        <div>
          <h3>Contraste</h3>
          <table class="contraste"><colgroup><col class="c1"><col class="c2"><col class="c3"><col class="c4"><col class="c5"></colgroup>
            <thead><tr><th>Campo</th><th>Excel empresa</th><th>VUR</th><th>Catastro</th><th>Estado</th></tr></thead>
            <tbody>${f.contraste.map(filaContraste).join("")}</tbody></table>
          <h3>Dónde se encontró la información</h3>
          ${tablaDonde(f)}
          <h3>Propietarios (VUR${v.fecha_consulta ? " " + esc(v.fecha_consulta) : ""})</h3>
          <table><tbody>${props}</tbody></table>
          ${f.vur ? `<h3>Folio</h3><dl class="datos">
            ${[["Fecha de apertura", v.fecha_apertura], ["Estado", v.estado_folio], ["Tipo de instrumento", v.tipo_instrumento], ["NUPRE", v.nupre],
               ["Matrícula(s) matriz", v.matriculas_matriz], ["Matrícula(s) derivada(s)", v.matriculas_derivadas], ["Cabida", v.area_cabida_texto],
               ["Dirección", v.direccion], ["Direcciones anteriores", v.direcciones_anteriores], ["Destinación", v.destinacion_economica]]
              .filter(([, x]) => U.limpiar(x)).map(([k, x]) => `<dt>${esc(k)}</dt><dd>${esc(x)}</dd>`).join("")}</dl>` : ""}
        </div>
        <div class="lado">
          ${c.lat != null && window.L ? `<div class="mapa" id="mapa${i}"></div><p class="nota pie-mapa">Polígono: ${esc(c.mapa_fuente)}</p>` : ""}
          <h3>Catastro</h3>
          ${fuentes}
          <div class="caja"><div class="tit">Gestor catastral</div>
            ${esc(c.gestor || "No identificado")}${c.codigo_dane ? ` · DANE <span class="cod">${esc(c.codigo_dane)}</span>` : ""}
            ${contacto ? `<div class="nota" style="margin-top:6px">${contacto}</div>` : ""}</div>
          <h3>Enlaces</h3>
          <ul class="enlaces">${enlaces}</ul>
        </div>
      </div>
      ${f.excel.registros.length ? `<details class="extra"><summary>Fila completa del Excel de la empresa${f.excel.registros.length > 1 ? ` (${f.excel.registros.length} filas)` : ""}</summary>${regs}</details>` : ""}
      ${salv ? `<details class="extra"><summary>Salvedades (${v.salvedades.length})</summary>${salv}</details>` : ""}
      ${v.cabida_linderos ? `<details class="extra"><summary>Cabida y linderos</summary><p>${esc(v.cabida_linderos)}</p></details>` : ""}
      ${v.complementaciones ? `<details class="extra"><summary>Complementaciones</summary><p>${esc(v.complementaciones)}</p></details>` : ""}
      ${hist ? `<details class="extra"><summary>Consultas del VUR guardadas (${f.historialVur.length})</summary>${hist}</details>` : ""}
    </article>`;
  }

  function pintarFichas() {
    E.mapas.forEach((m) => m.remove());
    E.mapas = [];
    const n = E.fichas.length;
    $("#tituloRes").textContent = n ? `Fichas (${n})` : "Fichas";
    $("#descargar").hidden = !n;
    $("#limpiar").hidden = !n;
    if (!n) {
      $("#fichas").innerHTML = `<div class="vacio"><p><b>Busque una matrícula</b> arriba, o pegue una consulta del VUR a la izquierda.</p>
        <p class="nota">Para investigar muchos predios a la vez use la pestaña <b>Varios predios</b>.</p></div>`;
      return;
    }
    $("#fichas").innerHTML = E.fichas.map(tarjeta).join("");
    if (!window.L) return;
    E.fichas.forEach((f, i) => {
      const c = f.catastro;
      const el = document.getElementById("mapa" + i);
      if (c.lat == null || !el) return;
      const calles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" });
      const sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Esri World Imagery" });
      const m = L.map(el, { scrollWheelZoom: false, layers: [sat] }).setView([c.lat, c.lon], 16);
      L.control.layers({ "Satélite": sat, "Calles": calles }, null, { position: "topright" }).addTo(m);
      if ((c.anillos || []).length) {
        const capa = L.polygon(c.anillos.map((an) => an.map((p) => [p[1], p[0]])), { color: "#ff8c2e", weight: 2, fillOpacity: 0.12 }).addTo(m);
        m.fitBounds(capa.getBounds(), { maxZoom: 18, padding: [12, 12] });
      } else L.marker([c.lat, c.lon]).addTo(m);
      E.mapas.push(m);
    });
  }

  $("#fichas").addEventListener("click", async (ev) => {
    const t = ev.target;
    if (t.dataset.copiar) {
      try { await navigator.clipboard.writeText(t.dataset.copiar); aviso("Copiado: " + t.dataset.copiar); }
      catch (e) { aviso("No se pudo copiar"); }
    } else if (t.dataset.cerrar) {
      E.fichas = E.fichas.filter((f) => f.matricula !== t.dataset.cerrar);
      pintarFichas();
    } else if (t.dataset.actualizar) buscar(t.dataset.actualizar);
  });
  $("#limpiar").addEventListener("click", () => { E.fichas = []; pintarFichas(); history.replaceState(null, "", location.pathname); });
  $("#descargar").addEventListener("click", () => descargar(IP.generarReporte(E.fichas, E.excel), `investigacion_predios_${marcaTiempo()}.xlsx`));

  /* ---------------- Varios predios ---------------- */
  function listaMatriculas(texto) {
    const out = [];
    for (const parte of String(texto || "").split(/[\n;,\t]+/)) {
      const p = parte.trim();
      if (!p || !/\d/.test(p)) continue;
      const m = U.normalizarMatricula(p);
      if (m && !out.includes(m)) out.push(m);
    }
    return out;
  }
  previa($("#loteTexto"), $("#lotePrevia"));

  function pintarFiltrosLote() {
    const ex = E.excel;
    $("#loteExcel").hidden = !ex;
    $("#loteSinExcel").hidden = Boolean(ex);
    if (!ex) return;
    for (const [sel, clave] of [["#filtroEstado", "estado"], ["#filtroEncargado", "encargado"], ["#filtroMunicipio", "municipio"]]) {
      const el = $(sel), antes = el.value;
      el.innerHTML = `<option value="">Todos</option>` + ex.valoresDistintos(clave).map(([v, n]) => `<option value="${esc(v)}">${esc(v)} (${n})</option>`).join("");
      el.value = antes;
      el.disabled = ex.mapa[clave] === undefined;
    }
  }
  $("#agregarDesdeExcel").addEventListener("click", () => {
    if (!E.excel) return;
    const ms = E.excel.matriculas({ estado: $("#filtroEstado").value, encargado: $("#filtroEncargado").value, municipio: $("#filtroMunicipio").value });
    if (!ms.length) { aviso("No hay matrículas con esos filtros"); return; }
    const actuales = listaMatriculas($("#loteTexto").value);
    const nuevas = ms.filter((m) => !actuales.includes(m));
    $("#loteTexto").value = [...actuales, ...nuevas].join("\n");
    $("#loteTexto").dispatchEvent(new Event("input"));
    aviso(`${nuevas.length} matrícula(s) agregadas del Excel`);
  });

  function filaLote(f, i) {
    if (f.error) return `<tr class="r-error"><td>${i + 1}</td><td class="cod">${esc(f.matricula)}</td><td colspan="6" class="nota">Error: ${esc(f.error)}</td><td></td></tr>`;
    const v = f.vur || {}, r = f.registro || {}, d = f.catastro.datos || {};
    const encontrados = (f.catastro.fuentes || []).map((s) => {
      const conf = ((s.enlaces || [])[0] || {}).url;
      const txt = `${s.estado === "ok" ? "✓" : "✗"} ${s.fuente}`;
      return `<span class="fuente-lote ${s.estado === "ok" ? "si" : "no"}">${conf ? `<a href="${esc(conf)}" target="_blank" rel="noopener" title="Confirmar la búsqueda">${esc(txt)}</a>` : esc(txt)} ${chipOrigen(s.origen)}</span>`;
    }).join("");
    const aV = Number(v.area_terreno_m2) || null, aC = Number(d.area_terreno_m2) || null;
    return `<tr><td>${i + 1}</td><td class="cod">${esc(f.matricula)}</td>
      <td>${esc(v.municipio || r.municipio || d.municipio || "")}</td><td>${esc(r.encargado || "")}</td>
      <td>${insignia(f)}</td>
      <td class="cod">${esc(v.referencia_catastral || d.numero_predial || "")}</td>
      <td>${encontrados || '<span class="nota">—</span>'}${f.excel.registros.length ? `<span class="fuente-lote si">✓ Excel fila ${esc(f.excel.registros[0]._numero)}</span>` : ""}${f.vur ? `<span class="fuente-lote si">✓ VUR ${esc(v.fecha_consulta || "")}</span>` : ""}</td>
      <td>${aV || aC ? `${esc(U.formatoArea(aV) || "—")}<br><span class="nota">catastro: ${esc(U.formatoArea(aC) || "—")}</span>` : ""}</td>
      <td><button type="button" class="mini" data-ver="${esc(f.matricula)}">Ver ficha</button></td></tr>
      ${f.alertas.length ? `<tr class="sub"><td></td><td colspan="8">${f.alertas.map((x) => `<span class="alerta">${esc(x)}</span>`).join(" ")}</td></tr>` : ""}`;
  }
  function pintarLote() {
    const n = E.lote.length;
    $("#loteDescargar").hidden = !n || E.loteCorriendo;
    $("#loteLimpiar").hidden = !n || E.loteCorriendo;
    $("#loteResumen").textContent = n ? resumenLote() : "";
    $("#loteTabla").innerHTML = n
      ? `<table class="tabla-lote"><thead><tr><th>#</th><th>Matrícula</th><th>Municipio</th><th>Encargado</th><th>Resultado</th><th>Predial</th><th>Encontrado en (clic para confirmar)</th><th>Área VUR / catastro</th><th></th></tr></thead>
         <tbody>${E.lote.map(filaLote).join("")}</tbody></table>`
      : `<div class="vacio"><p>Escriba o pegue las matrículas (una por línea), o agréguelas desde el Excel, y presione <b>Investigar todas</b>.</p>
         <p class="nota">También puede pegar varias consultas del VUR seguidas: se guardan y se investigan juntas.</p></div>`;
  }
  function resumenLote() {
    const ok = E.lote.filter((f) => !f.error);
    const cuenta = (k) => ok.filter((f) => f.resumen.veredicto === k).length;
    const conCat = ok.filter((f) => f.catastro.estado === "ok").length;
    return `${E.lote.length} predio(s): ${cuenta("ok")} sin diferencias · ${cuenta("revisar")} por revisar · ${cuenta("diferente")} con diferencias · ${cuenta("sin_dato")} sin contraste · ${conCat} encontrados en el catastro` +
      (E.lote.length - ok.length ? ` · ${E.lote.length - ok.length} con error` : "");
  }

  $("#loteIniciar").addEventListener("click", async () => {
    if (E.loteCorriendo) return;
    const texto = $("#loteTexto").value;
    let tareas = [];
    try {
      const consultas = IP.vur.leerTexto(texto);
      if (consultas.length) {
        for (const d of consultas) tareas.push({ matricula: d.matricula_normalizada, vur: await IP.almacen.guardarVur(d) });
        pintarHistorial();
      } else tareas = listaMatriculas(texto).map((m) => ({ matricula: m }));
    } catch (e) { aviso("Error: " + e.message); return; }
    if (!tareas.length) { aviso("No encontré matrículas para investigar"); return; }
    if (tareas.length > 300 && !confirm(`Son ${tareas.length} matrículas. Puede tardar varios minutos. ¿Continuar?`)) return;

    E.lote = []; E.loteCorriendo = true; E.loteDetener = false;
    $("#loteIniciar").disabled = true; $("#loteDetener").hidden = false;
    const barra = $("#loteBarra"), txt = $("#loteProgreso");
    barra.hidden = false; barra.max = tareas.length; barra.value = 0;
    pintarLote();
    const catastro = $("#loteCatastro").checked;
    let siguiente = 0, hechas = 0;
    const resultados = new Array(tareas.length);
    async function trabajador() {
      while (siguiente < tareas.length && !E.loteDetener) {
        const i = siguiente++, t = tareas[i];
        try { resultados[i] = await IP.investigarMatricula(t.matricula, opciones(t.vur, catastro)); }
        catch (e) { resultados[i] = { matricula: t.matricula, error: e.message }; }
        hechas++;
        barra.value = hechas;
        txt.textContent = `${hechas} de ${tareas.length}…`;
        E.lote = resultados.filter(Boolean);
        pintarLote();
      }
    }
    txt.textContent = `0 de ${tareas.length}…`;
    await IP.gestores.asegurar();
    pintarGestores();
    await Promise.all([trabajador(), trabajador()]); // dos a la vez para no saturar los servidores
    E.loteCorriendo = false;
    txt.textContent = E.loteDetener ? `Detenido: ${hechas} de ${tareas.length} investigadas.` : `Listo: ${hechas} investigadas.`;
    $("#loteIniciar").disabled = false; $("#loteDetener").hidden = true;
    pintarLote();
  });
  $("#loteDetener").addEventListener("click", () => { E.loteDetener = true; $("#loteProgreso").textContent = "Deteniendo…"; });
  $("#loteLimpiar").addEventListener("click", () => { E.lote = []; $("#loteBarra").hidden = true; $("#loteProgreso").textContent = ""; pintarLote(); });
  $("#loteDescargar").addEventListener("click", () =>
    descargar(IP.generarReporte(E.lote.filter((f) => !f.error), E.excel), `investigacion_varios_${marcaTiempo()}.xlsx`));
  $("#loteTabla").addEventListener("click", (ev) => {
    const m = ev.target.dataset && ev.target.dataset.ver;
    if (!m) return;
    const f = E.lote.find((x) => x.matricula === m);
    if (!f) return;
    agregar(f);
    pestana("uno");
    pintarFichas();
    const el = document.getElementById("ficha-" + m);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  /* ---------------- Inicio ---------------- */
  (async function iniciar() {
    if (typeof DecompressionStream === "undefined") {
      const av = $("#avisoNavegador");
      av.hidden = false;
      av.textContent = "Este navegador es antiguo y no puede leer archivos .xlsx. Use Chrome, Edge o Firefox actualizados.";
    }
    IP.gestores.cargar();
    pintarGestores();
    try {
      const g = await IP.almacen.leerExcel();
      if (g) { E.excel = await IP.excelDesdeBuffer(g.buffer, g.nombre); pintarExcel(g.fecha); }
      else pintarExcel();
    } catch (e) { pintarExcel(); }
    await pintarHistorial();
    pintarLote();
    abrirDesdeEnlace();
    window.addEventListener("hashchange", abrirDesdeEnlace);
  })();
  function abrirDesdeEnlace() {
    const m = decodeURIComponent((location.hash.match(/m=([^&]+)/) || [])[1] || "");
    if (m && !(E.fichas[0] && E.fichas[0].matricula === U.normalizarMatricula(m))) buscar(m);
  }
})();
