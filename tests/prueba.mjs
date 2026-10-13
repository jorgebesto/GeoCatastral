// Pruebas sin internet: carga los scripts de la página en Node y simula los servicios ArcGIS.
// Ejecutar desde la carpeta del proyecto:  node tests/prueba.mjs
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS = ["utils", "vur", "xlsx", "excel", "config", "arcgis", "gestores", "geoportales", "contraste", "almacen", "investigar", "reporte", "ejemplo"];

const llamadas = [];
function respuesta(url) {
  const u = new URL(url);
  const where = u.searchParams.get("where") || "";
  llamadas.push(u.pathname + " " + where);
  const f = (feats) => ({ features: feats });
  if (u.pathname.includes("SINIC_DA/FeatureServer/1/query")) {
    if (where.includes("051720001000000260020000000000"))
      return f([{ attributes: { cod_divipola: "05172", departamento: "ANTIOQUIA", municipio: "CHIGORODÓ", numero_predial_nacional: "051720001000000260020000000000",
        tipo_predio: "Predio.Privado", condicion_predio: "NPH", destinacion_economica: "Agricola", area_catastral_terreno: 411416.0,
        vigencia_actualizacion_catastral: "2015-01-01", zona: "Rural", nombre_predio: null, tipo_derecho: "Dominio" } }]);
    if (where.includes("080010001000000000048000000000"))
      return f([{ attributes: { departamento: "ATLÁNTICO", municipio: "BARRANQUILLA", numero_predial_nacional: "080010001000000000048000000000", tipo_predio: "Predio.Privado",
        condicion_predio: "NPH", destinacion_economica: "Comercial", area_catastral_terreno: 39605.0, zona: "Rural", tipo_derecho: "Dominio" } }]);
    if (where.includes("080780001000000000063000000000"))
      return f([{ attributes: { departamento: "ATLÁNTICO", municipio: "BARANOA", numero_predial_nacional: "080780001000000000063000000000", tipo_predio: "Predio.Privado",
        condicion_predio: "NPH", destinacion_economica: "Agropecuario", area_catastral_terreno: 4174.71, zona: "Rural", tipo_derecho: "Dominio" } }]);
    if (where.includes("110010108000000080003000000000"))
      return f([{ attributes: { departamento: "BOGOTÁ, D.C.", municipio: "BOGOTÁ, D.C.", numero_predial_nacional: "110010108000000080003000000000",
        tipo_predio: "Predio.Privado", condicion_predio: "NPH", destinacion_economica: "Habitacional", area_catastral_terreno: 120.5, zona: "Urbana", tipo_derecho: "Dominio" } }]);
    return f([]);
  }
  if (u.pathname.includes("SINIC_DA/FeatureServer/3/query"))
    return f([{ attributes: {}, geometry: { rings: [[[-76.68, 7.67], [-76.67, 7.67], [-76.67, 7.68], [-76.68, 7.67]]] } }]);
  if (u.pathname.includes("catastro/lote/MapServer/3/query")) {
    assert.ok(where.includes("PRECHIP = 'AAA0012ABCD'"), where);
    return f([{ attributes: { PRECHIP: "AAA0012ABCD", PRECEDCATA: "8 3 1", PRENUPRE: "110010108000000080003000000000", PREDIRECC: "KR 7 32 16",
      PREATERRE: 120.5, PREACONST: 300.0, PRECDESTIN: "01", BARMANPRE: "0081020003" } }]);
  }
  if (u.pathname.includes("catastro/lote/MapServer/0/query"))
    return f([{ attributes: { LOTCODIGO: "0081020003" }, geometry: { rings: [[[-74.07, 4.61], [-74.069, 4.61], [-74.069, 4.611], [-74.07, 4.61]]] } }]);
  if (u.pathname.includes("VC_Catastro_VCT/MapServer/7/query")) {
    if (where.includes("050010100071300670088"))
      return f([{ attributes: { mz_igac: "050010100071300670088", cbml: "07130670088", area_lote: 98, tipo_lote: "Edificacion" },
        geometry: { rings: [[[-75.59, 6.24], [-75.589, 6.24], [-75.589, 6.241], [-75.59, 6.24]]] } }]);
    return f([]);
  }
  if (u.pathname.includes("CATASTRO_PUBLICO_31082026/FeatureServer/17/query")) {
    if (where.includes("08078000100000063000") || where.includes("080780001000000000063000000000"))
      return f([{ attributes: { DIRECCION: "VILLA JOSE LO 5", DESTINO_ECONOMICO: "D", AREA_TERRENO: 4175, AREA_CONSTRUIDA: 492,
        NUMERO_PREDIAL: "080780001000000000063000000000", NUMERO_PREDIAL_ANTERIOR: "08078000100000063000", DEPARTAMENTO: "08", MUNICIPIO: "08078" } }]);
    return f([]);
  }
  if (u.pathname.includes("CATASTRO_PUBLICO_31082026/FeatureServer/18/query"))
    return f([{ attributes: { NUMERO_PREDIAL: "080780001000000000063000000000", ZONA_FISICA_1: "03", ZONA_ECONOMICA_1: "05", AREA_CONSTRUIDA_1: 492, PISOS_1: 1, HABITACIONES_1: 3, BANOS_1: 2, PUNTAJE_1: 35 } }]);
  if (u.pathname.includes("CATASTRO_PUBLICO_31082026/FeatureServer/14/query"))
    return f([{ attributes: { CODIGO: "080780001000000000063000000000" }, geometry: { rings: [[[-74.9, 10.8], [-74.89, 10.8], [-74.89, 10.81], [-74.9, 10.8]]] } }]);
  if (u.pathname.includes("CATASTRO_PUBLICO_31082026/FeatureServer/7/query")) return f([]);
  if (u.pathname.endsWith("datosabiertos/FeatureServer/500/query")) {
    if (where.includes("matricula_inmobiliaria = 30938") || where.includes("080010001000000000048000000000"))
      return f([{ attributes: { objectid: 1, numero_predial_nacional: "080010001000000000048000000000", numero_predial_anterior: "08001000100000048000",
        condicion_predio: "NPH", destinacion_economica: "Comercial", tipo_predio: "Predio_Privado", estado_fmi: "Activo", fecha_apertura_fmi: 190512000000,
        area_catastral_terreno: 39605.0, area_registral_m2: null, estrato: "No_Aplica", matricula_inmobiliaria: 30938, nupre: "AFT0024ERWB", vigencia_actualizacion: 1767225600000 } }]);
    return f([]);
  }
  if (u.pathname.includes("datosabiertos/FeatureServer/500/queryRelatedRecords")) {
    if (u.searchParams.get("relationshipId") === "2")
      return { relatedRecordGroups: [{ objectId: 1, relatedRecords: [{ attributes: { clase_via_principal: "Carretera", valor_via_principal: "A la playa", es_direccion_principal: 1 } }] }] };
    return { relatedRecordGroups: [{ objectId: 1, relatedRecords: [{ attributes: {}, geometry: { rings: [[[-74.837, 11.0367], [-74.836, 11.0367], [-74.836, 11.0377], [-74.837, 11.0367]]] } }] }] };
  }
  if (u.pathname.includes("CAPA_GESTORES"))
    return f([
      { attributes: { mpio_cdpmp: "05172", dpto_cnmbr: "ANTIOQUIA", mpio_cnmbr: "CHIGORODÓ", Gestor: "GOBERNACION DE ANTIOQUIA", CORREOS_JU: "catastro@ejemplo.gov.co" } },
      { attributes: { mpio_cdpmp: "05001", dpto_cnmbr: "ANTIOQUIA", mpio_cnmbr: "MEDELLÍN", Gestor: "MEDELLIN" } },
      { attributes: { mpio_cdpmp: "11001", dpto_cnmbr: "BOGOTÁ, D.C.", mpio_cnmbr: "BOGOTÁ, D.C.", Gestor: "UAECD" } },
      { attributes: { mpio_cdpmp: "08001", dpto_cnmbr: "ATLÁNTICO", mpio_cnmbr: "BARRANQUILLA", Gestor: "Distrito de Barranquilla" } },
      { attributes: { mpio_cdpmp: "08078", dpto_cnmbr: "ATLÁNTICO", mpio_cnmbr: "BARANOA", Gestor: "Igac" } },
    ]);
  return { error: { message: "ruta no simulada " + u.pathname } };
}

const almacenLocal = new Map();
const ctx = {
  console, URL, URLSearchParams, TextDecoder, TextEncoder, Blob, Response, DecompressionStream, AbortController, setTimeout, clearTimeout,
  localStorage: { getItem: (k) => almacenLocal.get(k) ?? null, setItem: (k, v) => almacenLocal.set(k, String(v)) },
  fetch: async (url) => ({ ok: true, status: 200, json: async () => respuesta(url) }),
};
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const s of SCRIPTS) vm.runInContext(fs.readFileSync(path.join(RAIZ, "js", s + ".js"), "utf8"), ctx, { filename: s + ".js" });
const IP = ctx.IP;
const U = IP.util;

// --- utilidades
assert.equal(U.normalizarMatricula("8-2077"), "008-2077");
assert.equal(U.normalizarMatricula("50c 0012345"), "50C-12345");
assert.equal(U.normalizarMatricula("2077", "008 - APARTADO"), "008-2077");
assert.equal(U.areaDesdeTexto("18 HS. Y 5.000 M2. ## PUNTO").m2, 185000);
assert.equal(U.areaDesdeTexto("LOTE DE 120,50 M2 Y LINDA").m2, 120.5);
assert.equal(U.areaDesdeTexto("2 FANEGADAS").m2, 12800);
assert.equal(U.areaDesdeTexto("EN 230 MTS. NORTE").m2, null);

// --- VUR
const v = IP.vur.leerTexto(IP.EJEMPLO_VUR)[0];
assert.equal(v.matricula_normalizada, "008-2077");
assert.equal(v.codigo_dane, "05172");
assert.equal(v.propietarios[0].nombre, "PROPIETARIO DE EJEMPLO");
assert.equal(v.area_terreno_m2, 185000);
assert.equal(v.salvedades.length, 2);
const varios = IP.vur.leerTexto(IP.EJEMPLO_VUR + "\n" + IP.EJEMPLO_VUR.replace("008-2077", "008-99").replace("000000000", "111"));
assert.equal(varios.length, 2);
// propietario en una sola línea (como sale del PDF)
const pdfLike = IP.EJEMPLO_VUR.replace("12345678\nCÉDULA CIUDADANÍA\nPROPIETARIO DE EJEMPLO", "800123456-1 NIT EMPRESA S.A.S. 50%\n7654321 CÉDULA DE CIUDADANÍA OTRA PERSONA");
const vp = IP.vur.leerTexto(pdfLike)[0];
assert.equal(JSON.stringify(vp.propietarios.map((p) => [p.documento, p.nombre, p.participacion])), JSON.stringify([["800123456-1", "EMPRESA S.A.S.", "50%"], ["7654321", "OTRA PERSONA", ""]]));

// --- Excel de la empresa (archivo .xlsx real creado con openpyxl)
const buf = fs.readFileSync(path.join(RAIZ, "ejemplos", "excel_prueba.xlsx"));
const ex = await IP.excelDesdeBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "prueba.xlsx");
assert.equal(ex.total, 5);
assert.equal(ex.columnasDetectadas.fmi, "FMI");
assert.equal(ex.buscar("008-2077").registros[0].encargado, "VICTOR");
assert.equal(ex.buscar("001-1555").registros[0].encargado, "ANA");
assert.match(ex.buscar("050-1555").como, /revise el círculo/);
assert.equal(ex.buscar("2077").registros.length, 1);

// --- Fichas
await IP.almacen.guardarVur(v);
const consultaMed = IP.EJEMPLO_VUR.replace("008-2077", "001-1555").replace("051720001000000260020000000000", "050010100071300670088000000000")
  .replace("Municipio: CHIGORODO", "Municipio: MEDELLIN").replace("PIEDRAS BLANCAS DE POLINES", "").replace("BUENAVISTA", "CALLE 10 40 20")
  .replace("18 HS. Y 5.000 M2", "96 M2").replace("000000000", "222");
const consultaBog = IP.EJEMPLO_VUR.replace("008-2077", "50C-99999").replace("051720001000000260020000000000", "AAA0012ABCD")
  .replace("Departamento: ANTIOQUIA", "Departamento: BOGOTA D.C.").replace("Municipio: CHIGORODO", "Municipio: BOGOTA D.C.").replace("000000000", "333");

const f1 = await IP.investigarMatricula("8-2077", { excel: ex });
assert.equal(f1.matricula, "008-2077");
assert.equal(f1.vur.no_consulta, "000000000");
assert.equal(f1.registro.encargado, "VICTOR");
assert.equal(f1.catastro.estado, "ok");
assert.equal(f1.catastro.gestor, "GOBERNACION DE ANTIOQUIA");
assert.equal(f1.catastro.datos.area_terreno_m2, 411416);
const areaFila = f1.contraste.find((x) => x.campo === "Área de terreno");
assert.equal(areaFila.estado, "diferente");
assert.ok(f1.catastro.lat > 7 && f1.catastro.anillos.length);

const vm2 = IP.vur.leerTexto(consultaMed)[0];
await IP.almacen.guardarVur(vm2);
const f2 = await IP.investigarMatricula("001-1555", { excel: ex });
assert.equal(f2.catastro.fuentes.map((x) => x.estado).join(","), "ok,no_encontrado"); // Medellín sí; el SINIC no lo tiene en la simulación
assert.equal(f2.contraste.find((x) => x.campo === "Número predial nacional (30)").estado, "ok");

const vb = IP.vur.leerTexto(consultaBog)[0];
const f3 = await IP.investigarMatricula(vb.matricula, { vur: vb, excel: ex });
assert.equal(f3.catastro.codigo_dane, "11001");
assert.equal(f3.catastro.datos.direccion, "KR 7 32 16");
assert.equal(f3.catastro.fuentes.length, 2, "Bogotá + SINIC con el predial que devolvió IDECA");
assert.ok(f3.alertas.some((a) => /no está en el Excel/.test(a)));

// Sin consulta del VUR: solo Excel
const f4 = await IP.investigarMatricula("001-1555-no", { excel: ex });
assert.ok(f4.alertas[0].startsWith("No hay consulta del VUR"));

// Barranquilla solo con la matrícula (sin VUR ni predial): catastro del gestor por matrícula y luego SINIC
const f5 = await IP.investigarMatricula("040-30938", { excel: ex });
assert.equal(f5.catastro.fuentes.map((x) => x.fuente.split(" ")[0] + ":" + x.estado).join(","), "Catastro:ok,SINIC:ok");
assert.equal(f5.catastro.datos.matricula_inmobiliaria, "040-30938");
assert.equal(f5.catastro.datos.direccion, "Carretera A la playa");
assert.equal(f5.contraste.find((x) => x.campo === "Matrícula inmobiliaria").estado, "ok");
assert.equal(f5.contraste.find((x) => x.campo === "Área de terreno").fuente_catastro, "Catastro Barranquilla – datos abiertos");
assert.ok(f5.donde.find((x) => x.fuente.startsWith("Catastro Barranquilla")).enlaces[0].url.includes("f=html"));
assert.match(f5.donde[0].detalle, /fila 5/);

// Municipio del IGAC con el predial anterior del Excel: base pública del IGAC y luego SINIC
const f6 = await IP.investigarMatricula("041-5555", { excel: ex });
assert.equal(f6.catastro.fuentes.map((x) => x.origen + ":" + x.estado).join(","), "IGAC:ok,IGAC:ok");
assert.equal(f6.catastro.datos.direccion, "VILLA JOSE LO 5");
assert.equal(f6.catastro.datos.destino_economico, "D – Agropecuario");
assert.match(f6.catastro.fuentes[0].mensaje, /predial anterior/);
assert.ok(f6.catastro.datos.construcciones.includes("3 hab."));
assert.equal(f6.contraste.find((x) => x.campo === "Predial anterior / cédula catastral").estado, "ok");

// Historial
const h = await IP.almacen.historial();
assert.equal(h.map((x) => x.matricula).sort().join(","), "001-1555,008-2077");

// --- Reporte
const blob = IP.generarReporte([f1, f2, f3, f5, f6], ex);
const salida = path.join(RAIZ, "tests", "salida_prueba.xlsx");
fs.writeFileSync(salida, Buffer.from(await blob.arrayBuffer()));
const relectura = await IP.xlsx.leer(await blob.arrayBuffer());
assert.equal(relectura.hojas.map((x) => x.nombre).join("|"), "Resumen|Contraste|Fuentes|Propietarios|Salvedades y alertas|VUR completo|Catastro|Excel enriquecido");
assert.equal(relectura.hojas[0].filas[1][0], "008-2077");

for (const f of [f1, f2, f3, f5, f6]) {
  console.log(f.matricula, f.resumen, f.alertas);
  for (const x of f.contraste) console.log("   ", x.estado.padEnd(9), x.campo, "|", x.excel, "|", x.vur, "|", x.catastro, "|", x.nota);
}
console.log("\nTodas las pruebas pasaron. Reporte de prueba:", salida);
