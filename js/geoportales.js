/* Consulta catastral de un predio en todas las fuentes que apliquen:
   1) Geoportal del gestor catastral del municipio (Bogotá, Medellín, Barranquilla, AMB, Cali...).
   2) Base catastral pública del IGAC (municipios a cargo del IGAC; también por predial anterior).
   3) SINIC del IGAC (todo el país, por número predial de 30 dígitos).
   Cada resultado dice en qué página se encontró y trae el enlace de la búsqueda para confirmarla. */
(function (g) {
  const IP = (g.IP = g.IP || {});
  const U = IP.util;
  const A = () => IP.arcgis;

  function resultado(estado, cfg, extra = {}) {
    return {
      estado, fuente: cfg.nombre, origen: cfg.origen || "", pagina: cfg.pagina || "", visor: cfg.visor || "",
      no_probado: Boolean(cfg.no_probado), mensaje: "", datos: {}, enlaces: [], lat: null, lon: null, anillos: [], ...extra,
    };
  }
  const fecha = (v) => {
    if (v == null || v === "") return "";
    if (typeof v === "number") return new Date(v).toISOString().slice(0, 10);
    return String(v).slice(0, 10);
  };
  const enlace = (texto, url) => ({ texto, url });
  const consultaHtml = (texto, capa, params) => enlace(texto, A().enlaceQuery(capa, params));
  function ponerGeometria(r, geo) {
    if (!geo) return;
    [r.lat, r.lon] = A().centroide(geo);
    r.anillos = geo.rings || [];
  }

  /* ---------------- SINIC (IGAC) ---------------- */
  async function sinic(cfg, claves) {
    const s = A().sql, p = claves.predial30;
    let params = { where: `numero_predial_nacional = ${s(p)}` };
    let js = await A().query(cfg.predio, params);
    let feats = js.features || [], nota = "";
    if (!feats.length) {
      params = { where: `numero_predial_nacional LIKE ${s(p.slice(0, 21) + "%")}`, resultRecordCount: 50 };
      js = await A().query(cfg.predio, params);
      feats = js.features || [];
      if (feats.length) nota = ` No está el número exacto; hay ${feats.length >= 50 ? "50 o más" : feats.length} predio(s) en el mismo terreno y se muestra el primero.`;
    }
    const enlaces = [consultaHtml("Ver la búsqueda en el SINIC", cfg.predio, params)];
    if (!feats.length) return resultado("no_encontrado", cfg, { mensaje: "El SINIC no tiene ese número predial.", enlaces });
    const a = feats[0].attributes;
    const datos = {
      numero_predial: U.limpiar(a.numero_predial_nacional), departamento: U.limpiar(a.departamento), municipio: U.limpiar(a.municipio),
      tipo_predio: U.limpiar(a.tipo_predio).replace(/^Predio\./, ""), condicion_predio: U.limpiar(a.condicion_predio),
      destino_economico: U.limpiar(a.destinacion_economica), area_terreno_m2: a.area_catastral_terreno, zona: U.limpiar(a.zona),
      nombre_predio: U.limpiar(a.nombre_predio), tipo_derecho: U.limpiar(a.tipo_derecho), vigencia: fecha(a.vigencia_actualizacion_catastral),
    };
    const r = resultado("ok", cfg, { mensaje: "Predio encontrado." + nota, datos, crudo: a, enlaces });
    try {
      const pt = { where: `numero_predial_nacional = ${s(datos.numero_predial)}`, outFields: "numero_predial_nacional" };
      let t = await A().query(cfg.terreno, { ...pt, returnGeometry: "true", outSR: 4326 });
      if (!(t.features || []).length)
        t = await A().query(cfg.terreno, { where: `numero_predial_nacional LIKE ${s(datos.numero_predial.slice(0, 21) + "%")}`, outFields: "numero_predial_nacional", returnGeometry: "true", outSR: 4326, resultRecordCount: 1 });
      ponerGeometria(r, ((t.features || [])[0] || {}).geometry);
      if (r.lat != null) enlaces.push(consultaHtml("Ver el terreno en el SINIC", cfg.terreno, pt));
    } catch (e) { r.mensaje += " Sin polígono (" + e.message + ")."; }
    return r;
  }

  /* ---------------- Base pública del IGAC (R1, R2 y terrenos) ---------------- */
  async function igacPublico(cfg, claves) {
    const s = A().sql;
    const intentos = [];
    if (claves.predial30) intentos.push({ where: `NUMERO_PREDIAL = ${s(claves.predial30)}` });
    if (claves.predial20) intentos.push({ where: `NUMERO_PREDIAL_ANTERIOR = ${s(claves.predial20)}` });
    if (!intentos.length) return resultado("sin_datos", cfg, { mensaje: "Hace falta el número predial nuevo (30) o anterior (20)." });
    let feats = [], usado = intentos[0];
    for (const p of intentos) {
      const js = await A().query(cfg.r1, p);
      feats = js.features || [];
      usado = p;
      if (feats.length) break;
    }
    const enlaces = [consultaHtml("Ver la búsqueda en la base del IGAC (registro 1)", cfg.r1, usado)];
    if (!feats.length) return resultado("no_encontrado", cfg, { mensaje: "No está en la base pública del IGAC (el municipio puede tener otro gestor).", enlaces });
    const a = feats[0].attributes;
    const destino = U.limpiar(a.DESTINO_ECONOMICO);
    const datos = {
      numero_predial: U.limpiar(a.NUMERO_PREDIAL), numero_predial_anterior: U.limpiar(a.NUMERO_PREDIAL_ANTERIOR),
      direccion: U.limpiar(a.DIRECCION),
      destino_economico: destino ? `${destino}${IP.DESTINOS_IGAC[destino] ? " – " + IP.DESTINOS_IGAC[destino] : ""}` : "",
      area_terreno_m2: a.AREA_TERRENO, area_construida_m2: a.AREA_CONSTRUIDA,
    };
    const porAnterior = usado.where.startsWith("NUMERO_PREDIAL_ANTERIOR");
    const r = resultado("ok", cfg, { mensaje: porAnterior ? "Predio encontrado por el número predial anterior." : "Predio encontrado.", datos, crudo: a, enlaces });
    const p30 = datos.numero_predial;
    // Registro 2: zonas físicas/económicas y construcciones
    try {
      const p2 = { where: `NUMERO_PREDIAL = ${s(p30)}` };
      const js2 = await A().query(cfg.r2, p2);
      const b = ((js2.features || [])[0] || {}).attributes;
      if (b) {
        datos.zona_fisica = [b.ZONA_FISICA_1, b.ZONA_FISICA_2].filter((x) => U.limpiar(x)).join(", ");
        datos.zona_economica = [b.ZONA_ECONOMICA_1, b.ZONA_ECONOMICA_2].filter((x) => U.limpiar(x)).join(", ");
        const cons = [1, 2, 3].filter((i) => Number(b["AREA_CONSTRUIDA_" + i]) > 0).map((i) =>
          `${U.formatoNumero(b["AREA_CONSTRUIDA_" + i], 0)} m²` + [["PISOS_", "piso(s)"], ["HABITACIONES_", "hab."], ["BANOS_", "baño(s)"], ["LOCALES_", "local(es)"]]
            .filter(([k]) => Number(b[k + i]) > 0).map(([k, n]) => ` · ${b[k + i]} ${n}`).join("") + (b["PUNTAJE_" + i] ? ` · puntaje ${b["PUNTAJE_" + i]}` : ""));
        if (cons.length) datos.construcciones = cons.join(" | ");
        enlaces.push(consultaHtml("Ver zonas y construcciones (registro 2)", cfg.r2, p2));
      }
    } catch (e) { /* el registro 2 es un complemento */ }
    // Polígono del terreno: zona 00 = rural
    try {
      const capas = p30.slice(5, 7) === "00" ? [cfg.r_terreno, cfg.u_terreno] : [cfg.u_terreno, cfg.r_terreno];
      for (const capa of capas) {
        let pt = { where: `CODIGO = ${s(p30)}`, outFields: "CODIGO,CODIGO_ANTERIOR" };
        let t = await A().query(capa, { ...pt, returnGeometry: "true", outSR: 4326 });
        if (!(t.features || []).length) {
          pt = { where: `CODIGO LIKE ${s(p30.slice(0, 21) + "%")}`, outFields: "CODIGO,CODIGO_ANTERIOR", resultRecordCount: 1 };
          t = await A().query(capa, { ...pt, returnGeometry: "true", outSR: 4326 });
        }
        const geo = ((t.features || [])[0] || {}).geometry;
        if (geo) { ponerGeometria(r, geo); enlaces.push(consultaHtml("Ver el terreno en la base del IGAC", capa, pt)); break; }
      }
    } catch (e) { /* el polígono es un complemento */ }
    return r;
  }

  /* ---------------- Bogotá (IDECA) ---------------- */
  async function bogota(cfg, claves) {
    const s = A().sql;
    const cond = [];
    if (claves.predial30) cond.push(`PRENUPRE = ${s(claves.predial30)}`);
    for (const c of claves.chips) cond.push(`PRECHIP = ${s(c)}`);
    for (const c of claves.cedulas) cond.push(`PRECEDCATA = ${s(c)}`);
    if (!cond.length) return resultado("sin_datos", cfg, { mensaje: "No hay CHIP, cédula catastral ni número predial para buscar en Bogotá." });
    const params = { where: cond.join(" OR ") };
    const js = await A().query(cfg.predio, params);
    const feats = js.features || [];
    const enlaces = [consultaHtml("Ver la búsqueda en IDECA (Catastro Bogotá)", cfg.predio, params)];
    if (!feats.length) return resultado("no_encontrado", cfg, { mensaje: "Catastro Bogotá no devolvió ningún predio con esos códigos.", enlaces });
    const a = feats[0].attributes;
    const datos = {
      numero_predial: U.limpiar(a.PRENUPRE), chip: U.limpiar(a.PRECHIP), cedula_catastral: U.limpiar(a.PRECEDCATA),
      direccion: U.limpiar(a.PREDIRECC), barrio: U.limpiar(a.PRENBARRIO), area_terreno_m2: a.PREATERRE,
      area_construida_m2: a.PREACONST, destino_economico: U.limpiar(a.PRECDESTIN), tipo_predio: U.limpiar(a.PRETPROP),
      uso: U.limpiar(a.PRECUSO), vetustez: U.limpiar(a.PREVETUSTZ), codigo_lote: U.limpiar(a.BARMANPRE),
    };
    const r = resultado("ok", cfg, { datos, crudo: a, enlaces,
      mensaje: "Predio encontrado." + (feats.length > 1 ? ` Hubo ${feats.length} coincidencias; se muestra la primera.` : "") });
    if (datos.codigo_lote) {
      try {
        const pl = { where: `LOTCODIGO = ${s(datos.codigo_lote)}`, outFields: "LOTCODIGO" };
        const l = await A().query(cfg.lote, { ...pl, returnGeometry: "true", outSR: 4326 });
        ponerGeometria(r, ((l.features || [])[0] || {}).geometry);
        if (r.lat != null) enlaces.push(consultaHtml("Ver el lote en IDECA", cfg.lote, pl));
      } catch (e) { /* el polígono es un extra */ }
    }
    return r;
  }

  /* ---------------- Barranquilla (también por matrícula) ---------------- */
  async function barranquilla(cfg, claves) {
    const s = A().sql;
    const cond = [];
    if (claves.predial30) cond.push(`numero_predial_nacional = ${s(claves.predial30)}`);
    if (claves.predial20) cond.push(`numero_predial_anterior = ${s(claves.predial20)}`);
    const circ = U.circuloDeMatricula(claves.matricula);
    const num = U.numeroDeMatricula(claves.matricula);
    const porMatricula = /^\d+$/.test(num) && (!circ || circ === cfg.circulo);
    if (porMatricula) cond.push(`matricula_inmobiliaria = ${Number(num)}`);
    if (!cond.length) return resultado("sin_datos", cfg, { mensaje: `Hace falta el número predial o una matrícula del círculo ${cfg.circulo}.` });
    const params = { where: cond.join(" OR ") };
    const js = await A().query(cfg.predio, params);
    const feats = js.features || [];
    const enlaces = [consultaHtml("Ver la búsqueda en Catastro Barranquilla", cfg.predio, params)];
    if (!feats.length) return resultado("no_encontrado", cfg, { mensaje: "Catastro Barranquilla no devolvió ningún predio.", enlaces });
    // Si hay varios, se prefiere el que coincide con el número predial
    const f = feats.find((x) => x.attributes.numero_predial_nacional === claves.predial30) || feats[0];
    const a = f.attributes;
    const datos = {
      numero_predial: U.limpiar(a.numero_predial_nacional), numero_predial_anterior: U.limpiar(a.numero_predial_anterior),
      matricula_inmobiliaria: a.matricula_inmobiliaria ? `${cfg.circulo}-${a.matricula_inmobiliaria}` : "",
      estado_fmi: U.limpiar(a.estado_fmi), fecha_apertura_fmi: fecha(a.fecha_apertura_fmi),
      condicion_predio: U.limpiar(a.condicion_predio), destino_economico: U.limpiar(a.destinacion_economica).replace(/_/g, " "),
      tipo_predio: U.limpiar(a.tipo_predio).replace(/^Predio_/, "").replace(/_/g, " "), area_terreno_m2: a.area_catastral_terreno,
      area_registral_m2: a.area_registral_m2, estrato: U.limpiar(a.estrato).replace(/_/g, " "), nupre: U.limpiar(a.nupre),
      nombre_predio: U.limpiar(a.nombre), vigencia: fecha(a.vigencia_actualizacion),
    };
    const como = porMatricula && String(a.matricula_inmobiliaria) === String(Number(num)) && a.numero_predial_nacional !== claves.predial30 ? " por matrícula inmobiliaria" : "";
    const r = resultado("ok", cfg, { datos, crudo: a, enlaces, mensaje: `Predio encontrado${como}.` + (feats.length > 1 ? ` Hubo ${feats.length} coincidencias.` : "") });
    const rel = async (id, extra) => A().get(cfg.predio + "/queryRelatedRecords", { objectIds: a.objectid, relationshipId: id, outFields: "*", ...extra });
    try {
      const d = await rel(cfg.rel_direccion, { returnGeometry: "false" });
      const regs = ((d.relatedRecordGroups || [])[0] || {}).relatedRecords || [];
      const dir = regs.find((x) => String(x.attributes.es_direccion_principal) === "1" || x.attributes.es_direccion_principal === "Si") || regs[0];
      if (dir) {
        const x = dir.attributes;
        datos.direccion = [x.clase_via_principal, x.valor_via_principal, x.letra_via_principal, x.valor_via_generadora ? "# " + x.valor_via_generadora + (x.letra_via_generadora || "") : "", x.numero_predio ? "- " + x.numero_predio : "", x.complemento]
          .filter((v) => U.limpiar(v)).join(" ").replace(/\s+/g, " ").trim() || U.limpiar(x.nombre_predio);
      }
    } catch (e) { /* dirección opcional */ }
    try {
      const t = await rel(cfg.rel_terreno, { returnGeometry: "true", outSR: 4326, outFields: "objectid" });
      const regs = ((t.relatedRecordGroups || [])[0] || {}).relatedRecords || [];
      ponerGeometria(r, (regs[0] || {}).geometry);
    } catch (e) { /* polígono opcional */ }
    return r;
  }

  /* ---------------- Capas ArcGIS genéricas (Medellín, AMB, ...) ---------------- */
  async function capas(cfg, claves) {
    const s = A().sql;
    const cond = [];
    const n = Number(cfg.digitos || 30);
    if (claves.predial30) cond.push(`${cfg.campo_codigo} = ${s(claves.predial30.slice(0, n))}`);
    if (cfg.campo_anterior && claves.predial20) cond.push(`${cfg.campo_anterior} = ${s(claves.predial20)}`);
    if (!cond.length) return resultado("sin_datos", cfg, { mensaje: "Hace falta el número predial." });
    const params = { where: cond.join(" OR ") };
    let ultima = cfg.capas[0];
    for (const capa of cfg.capas) {
      ultima = capa;
      const js = await A().query(capa, { ...params, returnGeometry: "true", outSR: 4326 });
      const feats = js.features || [];
      if (!feats.length) continue;
      const a = feats[0].attributes;
      const datos = { numero_predial: U.limpiar(a[cfg.campo_codigo]) };
      if (cfg.campo_anterior) datos.numero_predial_anterior = U.limpiar(a[cfg.campo_anterior]);
      for (const [k, campo] of Object.entries(cfg.campos || {})) datos[k] = a[campo];
      const r = resultado("ok", cfg, { datos, crudo: a, mensaje: "Terreno encontrado.", enlaces: [consultaHtml("Ver la búsqueda en el geoportal del gestor", capa, params)] });
      ponerGeometria(r, feats[0].geometry);
      return r;
    }
    return resultado("no_encontrado", cfg, { mensaje: "El geoportal no devolvió el terreno.", enlaces: [consultaHtml("Ver la búsqueda en el geoportal del gestor", ultima, params)] });
  }

  /* ---------------- Datos abiertos CKAN (Cali) ---------------- */
  async function ckan(cfg, claves) {
    const codigo = claves.predial30 || claves.predial20;
    if (!codigo) return resultado("sin_datos", cfg, { mensaje: "Hace falta el número predial." });
    const url = IP.http.conQuery(cfg.api, { resource_id: cfg.recurso, q: codigo, limit: 5 });
    const enlaces = [enlace("Ver la búsqueda en datos abiertos (JSON)", url), enlace("Página del conjunto de datos", cfg.visor)];
    const js = await IP.http.json(url);
    if (!js || js.success === false) throw new IP.http.ErrorServicio((js && js.error && (js.error.message || JSON.stringify(js.error))) || "respuesta inválida");
    const recs = ((js.result || {}).records || []).filter((x) => Object.values(x).some((v) => U.soloDigitos(v).includes(codigo)));
    if (!recs.length) return resultado("no_encontrado", cfg, { mensaje: "No aparece en la información histórica de predios.", enlaces });
    const a = { ...recs[0] };
    delete a._id; delete a._full_text; delete a.rank;
    const datos = {};
    for (const [k, v] of Object.entries(a)) {
      const nk = U.normalizar(k);
      if (!datos.numero_predial && /PREDIAL|NPN/.test(nk)) datos.numero_predial = U.limpiar(v);
      else if (!datos.direccion && /DIRECCION/.test(nk)) datos.direccion = U.limpiar(v);
      else if (!datos.area_terreno_m2 && /AREA/.test(nk) && /TERRENO/.test(nk)) datos.area_terreno_m2 = U.numeroColombiano(v);
      else if (!datos.area_construida_m2 && /AREA/.test(nk) && /CONSTRU/.test(nk)) datos.area_construida_m2 = U.numeroColombiano(v);
      else if (!datos.avaluo && /AVALUO/.test(nk)) datos.avaluo = U.limpiar(v);
      else if (!datos.uso && /USO/.test(nk)) datos.uso = U.limpiar(v);
    }
    return resultado("ok", cfg, { datos, crudo: a, enlaces, mensaje: "Predio encontrado (vigencia 2022)." });
  }

  /* ---------------- Enrutador ---------------- */
  IP.clavesBusqueda = function (vur, excel, matricula) {
    const claves = { predial30: "", predial20: "", chips: [], cedulas: [], matricula: "" };
    claves.matricula = (vur && vur.matricula_normalizada) || (excel && excel.fmi ? U.normalizarMatricula(excel.fmi, excel.circulo) : "") || U.normalizarMatricula(matricula);
    const cands = [vur && vur.referencia_catastral, vur && vur.referencia_catastral_anterior, vur && vur.cedula_catastral,
                   excel && excel.cedula_catastral, excel && excel.cedula_vur];
    for (const c0 of cands) {
      const c = U.limpiar(c0);
      if (!c) continue;
      const t = U.tipoCodigo(c);
      const sin = c.replace(/\s+/g, "");
      if (t === "nacional30") { if (!claves.predial30) claves.predial30 = sin; }
      else if (t === "anterior20") { if (!claves.predial20) claves.predial20 = sin; }
      else if (t === "chip") { if (!claves.chips.includes(sin.toUpperCase())) claves.chips.push(sin.toUpperCase()); }
      else if (!claves.cedulas.includes(c)) claves.cedulas.push(c);
    }
    return claves;
  };

  async function protegido(fn, cfg) {
    try { return await fn(); }
    catch (e) {
      const servicio = e instanceof IP.arcgis.ErrorServicio || e instanceof IP.http.ErrorServicio;
      return resultado("error", cfg, { mensaje: (servicio ? "El servicio respondió con error: " : "No se pudo conectar: ") + e.message });
    }
  }
  const PRIORIDAD = { "Gestor catastral": 0, IGAC: 1 };

  IP.consultarCatastro = async function (vur, excel, matricula) {
    vur = vur || {};
    const C = IP.CONFIG;
    const claves = IP.clavesBusqueda(vur, excel, matricula);
    let dane = vur.codigo_dane || U.codigoDane(claves.predial30) || U.codigoDane(claves.predial20);
    if (!dane && claves.chips.length) dane = "11001"; // el CHIP solo existe en Bogotá
    if (!dane) dane = IP.gestores.codigoPorNombre(vur.departamento || (excel || {}).departamento, vur.municipio || (excel || {}).municipio);
    // Sin código ni municipio, una matrícula del círculo de Barranquilla se intenta en su catastro
    if (!dane && U.circuloDeMatricula(claves.matricula) === C.por_municipio["08001"].circulo) dane = "08001";
    const gestor = IP.gestores.porCodigo(dane) || {};
    const esIgac = /igac/i.test(gestor.Gestor || "");
    const fuentes = [];

    const local = C.por_municipio[dane];
    if (local) {
      const fn = { bogota, barranquilla, capas, ckan }[local.conector];
      const r = fn ? await protegido(() => fn(local, claves), local) : resultado("error", local, { mensaje: "Conector desconocido" });
      fuentes.push(r);
      if (U.tipoCodigo(r.datos.numero_predial) === "nacional30" && !claves.predial30) claves.predial30 = r.datos.numero_predial;
      if (U.tipoCodigo(r.datos.numero_predial_anterior) === "anterior20" && !claves.predial20) claves.predial20 = r.datos.numero_predial_anterior;
    }
    if (!local && (esIgac || !gestor.Gestor) && (claves.predial30 || claves.predial20)) {
      const r = await protegido(() => igacPublico(C.igac_publico, claves), C.igac_publico);
      fuentes.push(r);
      if (U.tipoCodigo(r.datos.numero_predial) === "nacional30" && !claves.predial30) claves.predial30 = r.datos.numero_predial;
    }
    if (claves.predial30) {
      fuentes.push(await protegido(() => sinic(C.sinic, claves), C.sinic));
    } else if (!fuentes.some((f) => f.estado === "ok")) {
      fuentes.push(resultado("sin_datos", C.sinic, {
        mensaje: "Para consultar el catastro hace falta el número predial nacional de 30 dígitos (en el VUR aparece como 'Referencia Catastral') o, en municipios del IGAC, el predial anterior de 20 dígitos." }));
    }

    // Datos combinados: manda el gestor, luego la base del IGAC y luego el SINIC. Se anota de dónde salió cada dato.
    const datos = {}, origenDatos = {};
    for (const f of fuentes.filter((x) => x.estado === "ok").sort((a, b) => (PRIORIDAD[a.origen] ?? 2) - (PRIORIDAD[b.origen] ?? 2) || (a === b ? 0 : a.fuente.startsWith("SINIC") ? 1 : -1)))
      for (const [k, v] of Object.entries(f.datos)) if (U.limpiar(v) !== "" && U.limpiar(datos[k]) === "") { datos[k] = v; origenDatos[k] = f.fuente; }
    const conMapa = fuentes.find((f) => f.lat != null && (f.anillos || []).length) || fuentes.find((f) => f.lat != null);
    const ok = fuentes.some((f) => f.estado === "ok");
    return {
      estado: ok ? "ok" : fuentes.some((f) => f.estado === "error") ? "error" : (fuentes[0] || {}).estado || "sin_datos",
      fuentes, datos, origenDatos, claves, codigo_dane: dane,
      gestor: gestor.Gestor || (local ? local.nombre : ""), gestor_info: gestor,
      lat: conMapa ? conMapa.lat : null, lon: conMapa ? conMapa.lon : null, anillos: conMapa ? conMapa.anillos : [],
      mapa_fuente: conMapa ? conMapa.fuente : "",
      visor: (local && local.visor) || C.sinic.visor,
    };
  };
})(typeof window !== "undefined" ? window : globalThis);
