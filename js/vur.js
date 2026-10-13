/* Lector de la consulta "Datos Básicos - Certificado de Tradición y Libertad" del VUR.
   Recibe el texto copiado de la pantalla (Ctrl+A, Ctrl+C) o el texto de un PDF de la consulta.
   Si se pegan varias consultas seguidas, se separan por el encabezado "Datos Básicos - ...". */
(function (g) {
  const IP = (g.IP = g.IP || {});
  const U = IP.util;
  const V = (IP.vur = {});

  const CAMPOS = {
    fecha_consulta: ["FECHA"],
    hora_consulta: ["HORA"],
    no_consulta: ["NO CONSULTA", "N CONSULTA", "NUMERO CONSULTA"],
    matricula: ["N MATRICULA INMOBILIARIA", "NO MATRICULA INMOBILIARIA", "MATRICULA INMOBILIARIA"],
    referencia_catastral: ["REFERENCIA CATASTRAL"],
    referencia_catastral_anterior: ["REFERENCIA CATASTRAL ANTERIOR"],
    departamento: ["DEPARTAMENTO"],
    municipio: ["MUNICIPIO"],
    cedula_catastral: ["CEDULA CATASTRAL"],
    vereda: ["VEREDA"],
    nupre: ["NUPRE"],
    direccion: ["DIRECCION ACTUAL DEL INMUEBLE"],
    direcciones_anteriores: ["DIRECCIONES ANTERIORES"],
    determinacion: ["DETERMINACION"],
    destinacion_economica: ["DESTINACION ECONOMICA"],
    modalidad: ["MODALIDAD"],
    fecha_apertura: ["FECHA DE APERTURA DEL FOLIO"],
    tipo_instrumento: ["TIPO DE INSTRUMENTO"],
    fecha_instrumento: ["FECHA DE INSTRUMENTO"],
    estado_folio: ["ESTADO FOLIO"],
    matriculas_matriz: ["MATRICULA S MATRIZ", "MATRICULAS MATRIZ"],
    matriculas_derivadas: ["MATRICULA S DERIVADA S", "MATRICULAS DERIVADAS"],
    tipo_predio: ["TIPO DE PREDIO"],
  };
  V.CAMPOS = CAMPOS;
  const ETIQUETAS = {};
  for (const [campo, etqs] of Object.entries(CAMPOS)) for (const e of etqs) ETIQUETAS[e] = campo;

  const SECCIONES = {
    "ALERTAS EN PROTECCION RESTITUCION Y FORMALIZACION": "alertas_proteccion",
    "ALERTAS COMUNICACIONES SUSPENSIONES Y ACUMULACIONES PROCESALES": "alertas_procesales",
    PROPIETARIOS: "propietarios",
    COMPLEMENTACIONES: "complementaciones",
    "CABIDAD Y LINDEROS": "cabida",
    "CABIDA Y LINDEROS": "cabida",
    "LINDEROS TECNICAMENTE DEFINIDOS": "linderos_tecnicos",
    "AREA Y COEFICIENTE": "area_coeficiente",
    SALVEDADES: "salvedades",
    "TRAMITES EN CURSO": "tramites",
    IMPORTANTE: "importante",
  };
  const ENCABEZADOS = new Set([
    "ORIGEN", "DESCRIPCION", "FECHA", "DOCUMENTO", "NUMERO DOCUMENTO", "TIPO IDENTIFICACION",
    "NOMBRES APELLIDOS RAZON SOCIAL", "PARTICIPACION", "NUMERO DE ANOTACION", "NUMERO DE CORRECCION",
    "RADICACION DE ANOTACION", "FECHA DE SALVEDAD", "RADICACION DE SALVEDAD", "DESCRIPCION SALVEDAD FOLIO",
    "COMENTARIO SALVEDAD FOLIO", "RADICADO", "TIPO", "ENTIDAD ORIGEN", "CIUDAD",
  ]);
  const SEPARADOR = /Datos\s+B[aá]sicos\s*-\s*Certificado\s+de\s+Tradici[oó]n\s+y\s+Libertad/gi;
  const TIPO_ID = /^(C[EÉ]DULA|NIT|TARJETA|PASAPORTE|REGISTRO CIVIL|NUIP|SECUENCIAL|SIN INFORMACI|OTRO|PERMISO|CARN[EÉ])/i;
  const TIPO_EN_LINEA = /^([0-9][0-9.\-]*[0-9A-Za-z]?)\s+((?:C[EÉ]DULA(?: DE)? (?:CIUDADAN[IÍ]A|EXTRANJER[IÍ]A))|NIT|TARJETA DE IDENTIDAD|PASAPORTE|REGISTRO CIVIL|NUIP|SECUENCIAL|SIN INFORMACI[OÓ]N)\s+(.+)$/i;
  const DOC = /^[0-9][0-9.\- ]*[0-9A-Za-z]?$/;
  const PARTICIPACION = /^(\d+([.,]\d+)?\s*%?|\d+\s*\/\s*\d+|%)$/;

  V.separar = function (texto) {
    texto = String(texto || "").replace(/\r\n?/g, "\n");
    const pos = [...texto.matchAll(SEPARADOR)].map((m) => m.index);
    if (pos.length <= 1) return texto.trim() ? [texto] : [];
    const bloques = pos.map((p, i) => texto.slice(p, i + 1 < pos.length ? pos[i + 1] : texto.length));
    if (texto.slice(0, pos[0]).trim()) bloques[0] = texto.slice(0, pos[0]) + bloques[0];
    return bloques;
  };

  function etiqueta(linea) {
    const i = linea.indexOf(":");
    if (i < 0) return null;
    const campo = ETIQUETAS[U.normalizar(linea.slice(0, i))];
    return campo ? [campo, linea.slice(i + 1).trim()] : null;
  }
  const util = (lineas) => lineas.filter((l) => !ENCABEZADOS.has(U.normalizar(l)));

  function propietarios(lineas) {
    // En el PDF un propietario puede venir en una sola línea: "123 CÉDULA CIUDADANÍA NOMBRE 50%"
    const ls = [];
    for (const l of util(lineas)) {
      const m = l.match(TIPO_EN_LINEA);
      if (m) {
        ls.push(m[1], m[2]);
        const resto = m[3].match(/^(.*?)\s+(\d+(?:[.,]\d+)?\s*%)$/);
        if (resto) ls.push(resto[1], resto[2]);
        else ls.push(m[3]);
      } else ls.push(l);
    }
    const filas = [];
    let i = 0;
    while (i < ls.length) {
      if (TIPO_ID.test(ls[i])) {
        const doc = i > 0 && DOC.test(ls[i - 1]) ? ls[i - 1] : "";
        const nombre = ls[i + 1] || "";
        let part = "", salto = 2;
        if (i + 2 < ls.length && PARTICIPACION.test(ls[i + 2])) {
          const sigueTipo = i + 3 < ls.length && TIPO_ID.test(ls[i + 3]);
          if (!sigueTipo) { part = ls[i + 2]; salto = 3; }
        }
        filas.push({ documento: doc, tipo_documento: ls[i], nombre, participacion: part });
        i += salto;
      } else i += 1;
    }
    return filas;
  }

  function salvedades(lineas) {
    const ls = util(lineas);
    const regs = [];
    let actual = null;
    for (let i = 0; i < ls.length; i++) {
      if (/^\d+$/.test(ls[i]) && i + 1 < ls.length && /^\d+$/.test(ls[i + 1])) {
        actual = { anotacion: ls[i], correccion: ls[i + 1], partes: [] };
        regs.push(actual);
        i++;
        continue;
      }
      if (actual) actual.partes.push(ls[i]);
    }
    return regs.map((r) => {
      const fechas = r.partes.filter((p) => /^\d{2}\/\d{2}\/\d{4}$/.test(p));
      const radic = r.partes.filter((p) => /^[A-Z0-9]+-\d{4}$|^\d{4}-\d+$/.test(p));
      const textos = r.partes.filter((p) => !fechas.includes(p) && !radic.includes(p));
      return { anotacion: r.anotacion, correccion: r.correccion, fecha: fechas[0] || "",
               radicacion: radic.join(", "), descripcion: textos.join(" ") };
    });
  }

  function areasEstructuradas(lineas) {
    const t = lineas.join(" ");
    const r = {};
    let m = t.match(/terreno\s+Hect[aá]reas:\s*([\d.,]*)\s*Metros:\s*([\d.,]*)/i);
    if (m && (m[1] || m[2])) {
      const ha = m[1] ? U.numeroColombiano(m[1]) || 0 : 0;
      const mt = m[2] ? U.numeroColombiano(m[2]) || 0 : 0;
      r.area_terreno_m2 = Math.round((ha * 10000 + mt) * 100) / 100;
    }
    if ((m = t.match(/Privada\s+Metros:\s*([\d.,]+)/i))) r.area_privada_m2 = U.numeroColombiano(m[1]);
    if ((m = t.match(/Construida\s+Metros:\s*([\d.,]+)/i))) r.area_construida_m2 = U.numeroColombiano(m[1]);
    if ((m = t.match(/Coeficiente:\s*([\d.,]+)\s*%/i))) r.coeficiente = m[1];
    return r;
  }

  V.leerConsulta = function (texto) {
    const lineas = String(texto || "").split("\n").map((l) => l.trim()).filter(Boolean);
    const d = {};
    for (const c of Object.keys(CAMPOS)) d[c] = "";
    const secc = {};
    let actual = null, ultimo = null;
    for (const linea of lineas) {
      const sec = SECCIONES[U.normalizar(linea)];
      if (sec) { actual = sec; secc[sec] = secc[sec] || []; continue; }
      if (actual === null) {
        const par = etiqueta(linea);
        if (par) { d[par[0]] = par[1]; ultimo = par[0]; }
        else if (ultimo && d[ultimo] === "" && !/Datos\s+B[aá]sicos/i.test(linea)) { d[ultimo] = linea; ultimo = null; }
      } else secc[actual].push(linea);
    }
    d.matricula_normalizada = U.normalizarMatricula(d.matricula);
    d.propietarios = propietarios(secc.propietarios || []);
    d.alertas_proteccion = util(secc.alertas_proteccion || []);
    d.alertas_procesales = util(secc.alertas_procesales || []);
    d.complementaciones = (secc.complementaciones || []).join(" ");
    d.cabida_linderos = (secc.cabida || []).join(" ");
    d.linderos_tecnicos = (secc.linderos_tecnicos || []).join(" ");
    d.salvedades = salvedades(secc.salvedades || []);
    d.tramites_en_curso = util(secc.tramites || []);
    Object.assign(d, areasEstructuradas(secc.area_coeficiente || []));
    const a = U.areaDesdeTexto(d.cabida_linderos);
    d.area_cabida_m2 = a.m2;
    d.area_cabida_texto = a.texto;
    if (!d.area_terreno_m2) d.area_terreno_m2 = a.m2;
    d.tipo_referencia = U.tipoCodigo(d.referencia_catastral);
    d.codigo_dane = U.codigoDane(d.referencia_catastral) || U.codigoDane(d.referencia_catastral_anterior) ||
                    U.codigoDane(d.cedula_catastral);
    d.propietarios_texto = d.propietarios
      .map((p) => {
        const id = [p.tipo_documento, p.documento].filter(Boolean).join(" ");
        return p.nombre + (id ? ` (${id})` : "") + (p.participacion ? ` ${p.participacion}` : "");
      })
      .join("; ");
    d.valido = Boolean(d.matricula);
    return d;
  };

  V.leerTexto = (texto) => V.separar(texto).map(V.leerConsulta).filter((d) => d.valido);

  V.alertas = function (d) {
    const a = [];
    const est = U.normalizar(d.estado_folio);
    if (est && est !== "ACTIVO") a.push(`Folio en estado ${d.estado_folio}`);
    if ((d.alertas_proteccion || []).length) a.push("Alertas de protección, restitución o formalización");
    if ((d.alertas_procesales || []).length) a.push("Alertas de comunicaciones, suspensiones o acumulaciones procesales");
    if ((d.tramites_en_curso || []).length) a.push("Trámites en curso");
    if (U.limpiar(d.matriculas_derivadas)) a.push("Tiene matrículas derivadas");
    if (!(d.propietarios || []).length) a.push("La consulta no trae propietarios");
    if ((d.propietarios || []).length > 1) a.push("Varios propietarios: el VUR muestra solo los de la última venta parcial");
    return a;
  };

  /* Texto de un PDF con pdf.js: arma las líneas agrupando por altura. */
  V.textoDePdf = async function (archivo) {
    const pdfjs = g.pdfjsLib;
    if (!pdfjs) throw new Error("No se pudo cargar el lector de PDF (pdf.js). Revise la conexión a internet.");
    const datos = new Uint8Array(await archivo.arrayBuffer());
    const pdf = await pdfjs.getDocument({ data: datos }).promise;
    const lineas = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const pagina = await pdf.getPage(p);
      const cont = await pagina.getTextContent();
      const filas = new Map();
      for (const it of cont.items) {
        if (!it.str || !it.str.trim()) continue;
        const y = Math.round(it.transform[5] / 3) * 3;
        if (!filas.has(y)) filas.set(y, []);
        filas.get(y).push({ x: it.transform[4], s: it.str });
      }
      [...filas.entries()].sort((a, b) => b[0] - a[0]).forEach(([, items]) => {
        lineas.push(items.sort((a, b) => a.x - b.x).map((i) => i.s.trim()).join(" ").replace(/\s+/g, " "));
      });
    }
    return lineas.join("\n");
  };
})(typeof window !== "undefined" ? window : globalThis);
