/* Contraste campo a campo entre el Excel de la empresa, el VUR y el catastro. */
(function (g) {
  const IP = (g.IP = g.IP || {});
  const U = IP.util;
  const OK = "ok", REVISAR = "revisar", DIFERENTE = "diferente", SIN = "sin_dato";

  const fila = (campo, excel = "", vur = "", catastro = "", estado = SIN, nota = "") =>
    ({ campo, excel: U.limpiar(excel), vur: U.limpiar(vur), catastro: U.limpiar(catastro), estado, nota });

  function comparar(valores, fn) {
    const v = valores.map((x) => (typeof x === "number" ? x : U.limpiar(x))).filter((x) => x !== "" && x != null);
    if (v.length < 2) return [SIN, ""];
    let peor = 1;
    for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) peor = Math.min(peor, fn(v[i], v[j]));
    if (peor >= 0.999) return [OK, ""];
    if (peor === 0.65) return [REVISAR, "formatos distintos; compárelos a ojo"];
    if (peor >= 0.6) return [REVISAR, `parecido ${Math.round(peor * 100)} %`];
    return [DIFERENTE, ""];
  }
  const texto = (a, b) => (U.normalizar(a) === U.normalizar(b) ? 1 : U.similitud(a, b));
  const direccion = (a, b) => { const s = U.similitud(a, b, true); return s >= 0.9 ? 1 : s; };
  function codigo(a, b) {
    const da = U.soloDigitos(a), db = U.soloDigitos(b);
    if ((da.length === 30 && [21, 30].includes(db.length)) || (db.length === 30 && [21, 30].includes(da.length))) {
      const n = Math.min(da.length, db.length);
      return da.slice(0, n) === db.slice(0, n) ? 1 : 0;
    }
    return U.codigosIguales(a, b) ? 1 : 0;
  }
  function codigoAnterior(a, b) {
    const da = U.soloDigitos(a).replace(/^0+/, ""), db = U.soloDigitos(b).replace(/^0+/, "");
    if (da && db && da.length !== db.length) return da.endsWith(db) || db.endsWith(da) ? 0.95 : 0.65;
    return codigo(a, b);
  }
  function area(a, b) {
    a = Number(a); b = Number(b);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    if (a === b) return 1;
    const dif = Math.abs(a - b) / Math.max(a, b);
    return dif <= 0.05 ? 1 : dif <= 0.15 ? 0.7 : 0;
  }
  const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) || Number(v) === 0 ? null : Number(v));

  IP.contrastar = function (vur, excel, cat) {
    vur = vur || {}; excel = excel || {};
    const cd = (cat && cat.datos) || {};
    const filas = [];
    let e;

    const fmiExcel = excel.fmi ? U.normalizarMatricula(excel.fmi, excel.circulo) : "";
    const fmiVur = vur.matricula_normalizada || "";
    const fmiCat = cd.matricula_inmobiliaria ? U.normalizarMatricula(cd.matricula_inmobiliaria) : "";
    e = comparar([fmiExcel, fmiVur, fmiCat], (a, b) => (a === b ? 1 : 0));
    filas.push(fila("Matrícula inmobiliaria", fmiExcel, fmiVur, fmiCat, ...e));

    const circVur = U.circuloDeMatricula(fmiVur);
    const codCirc = (x) => (String(x).match(/[0-9][0-9A-Za-z]*/) || [""])[0].replace(/^0+/, "").toUpperCase();
    e = comparar([excel.circulo, circVur], (a, b) => (codCirc(a) === codCirc(b) ? 1 : 0));
    filas.push(fila("Círculo registral", excel.circulo, circVur, "", ...e));

    for (const [nombre, k] of [["Departamento", "departamento"], ["Municipio", "municipio"]]) {
      e = comparar([excel[k], vur[k], cd[k]], texto);
      filas.push(fila(nombre, excel[k], vur[k], cd[k], ...e));
    }
    e = comparar([excel.vereda, vur.vereda], texto);
    filas.push(fila("Vereda", excel.vereda, vur.vereda, "", ...e));
    e = comparar([excel.direccion, vur.direccion, cd.direccion], direccion);
    filas.push(fila("Dirección", excel.direccion, vur.direccion, cd.direccion, ...e));

    // Códigos
    const ref = U.limpiar(vur.referencia_catastral);
    const chipVur = U.tipoCodigo(ref) === "chip" ? ref.replace(/\s+/g, "").toUpperCase() : "";
    const nuevoVur = U.tipoCodigo(ref) === "nacional30" ? ref.replace(/\s+/g, "") : "";
    const cedExcel = excel.cedula_catastral || excel.cedula_vur || "";
    const excel30 = U.tipoCodigo(cedExcel) === "nacional30" ? cedExcel.replace(/\s+/g, "") : "";
    e = comparar([excel30, nuevoVur, cd.numero_predial], codigo);
    if (e[0] === OK && U.soloDigitos(cd.numero_predial).length === 21) e[1] = "el catastro local guarda solo los 21 dígitos del terreno";
    filas.push(fila("Número predial nacional (30)", excel30, nuevoVur, cd.numero_predial, ...e));

    let antVur = U.limpiar(vur.referencia_catastral_anterior) || U.limpiar(vur.cedula_catastral);
    if (!antVur && ref && !chipVur && !nuevoVur) antVur = ref;
    const antExcel = cedExcel && !excel30 && cedExcel.toUpperCase() !== chipVur && U.tipoCodigo(cedExcel) !== "chip" ? cedExcel : "";
    const antCat = cd.numero_predial_anterior || cd.cedula_catastral;
    e = comparar([antExcel, antVur, antCat], codigoAnterior);
    filas.push(fila("Predial anterior / cédula catastral", antExcel, antVur, antCat, ...e));

    const chipExcel = U.tipoCodigo(cedExcel) === "chip" ? cedExcel.toUpperCase() : "";
    if (chipVur || chipExcel || cd.chip) {
      e = comparar([chipExcel, chipVur, cd.chip], (a, b) => (a.toUpperCase() === b.toUpperCase() ? 1 : 0));
      filas.push(fila("CHIP (Bogotá)", chipExcel, chipVur, cd.chip, ...e));
    }
    if (cd.codigo_local) filas.push(fila("Código local del catastro", "", "", cd.codigo_local));

    // Tipo, destino
    const tipoExcel = excel.tipo_predio_vur || excel.tipo_predio_informado;
    const zona = (x) => { const n = U.normalizar(x); return n.startsWith("URBAN") ? "URBANO" : n.includes("RURAL") ? "RURAL" : n; };
    e = comparar([tipoExcel, vur.tipo_predio, cd.zona], (a, b) => (zona(a) === zona(b) ? 1 : texto(a, b)));
    filas.push(fila("Urbano / rural", tipoExcel, vur.tipo_predio, cd.zona, ...e));
    const tipoCat = [cd.tipo_predio, cd.condicion_predio, cd.tipo_derecho].filter((x) => U.limpiar(x)).join(" · ");
    if (tipoCat) filas.push(fila("Tipo / condición catastral", "", "", tipoCat));
    e = comparar([vur.destinacion_economica, cd.destino_economico], texto);
    filas.push(fila("Destino económico", "", vur.destinacion_economica, cd.destino_economico, ...e));

    // Áreas
    const aVur = num(vur.area_terreno_m2), aCat = num(cd.area_terreno_m2);
    e = comparar([aVur, aCat], area);
    if (aVur && aCat) e[1] = `diferencia ${U.formatoNumero((Math.abs(aVur - aCat) / Math.max(aVur, aCat)) * 100, 1)} %`;
    filas.push(fila("Área de terreno", "", U.formatoArea(aVur), U.formatoArea(aCat), ...e));
    const rCat = num(cd.area_registral_m2);
    if (rCat) {
      e = comparar([aVur, rCat], area);
      filas.push(fila("Área registral (según catastro)", "", U.formatoArea(aVur), U.formatoArea(rCat), ...e));
    }
    const cVur = num(vur.area_construida_m2), cCat = num(cd.area_construida_m2);
    if (cVur || cCat) {
      e = comparar([cVur, cCat], area);
      filas.push(fila("Área construida", "", U.formatoArea(cVur), U.formatoArea(cCat), ...e));
    }
    if (U.limpiar(vur.estado_folio) || U.limpiar(cd.estado_fmi)) {
      const activos = [vur.estado_folio, cd.estado_fmi].filter((x) => U.limpiar(x));
      filas.push(fila("Estado del folio", "", vur.estado_folio, cd.estado_fmi, activos.every((x) => U.normalizar(x) === "ACTIVO") ? OK : REVISAR));
    }

    // De qué fuente salió cada valor de la columna Catastro
    const origen = (cat && cat.origenDatos) || {};
    const CLAVE = {
      "Matrícula inmobiliaria": "matricula_inmobiliaria", Departamento: "departamento", Municipio: "municipio", "Dirección": "direccion",
      "Número predial nacional (30)": "numero_predial", "Predial anterior / cédula catastral": cd.numero_predial_anterior ? "numero_predial_anterior" : "cedula_catastral",
      "CHIP (Bogotá)": "chip", "Código local del catastro": "codigo_local", "Urbano / rural": "zona", "Tipo / condición catastral": "tipo_predio",
      "Destino económico": "destino_economico", "Área de terreno": "area_terreno_m2", "Área registral (según catastro)": "area_registral_m2",
      "Área construida": "area_construida_m2", "Estado del folio": "estado_fmi",
    };
    for (const f of filas) if (f.catastro) f.fuente_catastro = origen[CLAVE[f.campo]] || "";

    const diferencias = filas.filter((f) => f.estado === DIFERENTE).length;
    const revisar = filas.filter((f) => f.estado === REVISAR).length;
    const comparadas = filas.filter((f) => f.estado !== SIN && f.campo !== "Estado del folio").length;
    const veredicto = diferencias ? DIFERENTE : revisar ? REVISAR : comparadas ? OK : SIN;
    return { filas, resumen: { veredicto, diferencias, revisar } };
  };
})(typeof window !== "undefined" ? window : globalThis);
