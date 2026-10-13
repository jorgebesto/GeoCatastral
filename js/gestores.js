/* Directorio de gestores catastrales (quién lleva el catastro de cada municipio), tomado de la capa
   pública del IGAC. Se descarga una vez y se guarda en este navegador. */
(function (g) {
  const IP = (g.IP = g.IP || {});
  const U = IP.util;
  const CLAVE = "ip_gestores_v1";
  const CAMPOS = ["mpio_cdpmp", "dpto_cnmbr", "mpio_cnmbr", "Gestor", "DTerritori", "GESTOR_DIR",
                  "NOMBRE_DE_", "RESPONSABL", "CARGO", "CORREOS_JU"];

  const D = (IP.gestores = { municipios: {}, actualizado: null, error: "" });

  function indexar() {
    D.porNombre = new Map();
    D.porMpio = new Map();
    for (const [cod, m] of Object.entries(D.municipios)) {
      const dp = U.normalizar(m.dpto_cnmbr), mp = U.normalizar(m.mpio_cnmbr);
      D.porNombre.set(dp + "|" + mp, cod);
      if (!D.porMpio.has(mp)) D.porMpio.set(mp, []);
      D.porMpio.get(mp).push(cod);
    }
  }

  D.cargar = function () {
    try {
      const js = JSON.parse(localStorage.getItem(CLAVE) || "null");
      if (js && js.municipios) { D.municipios = js.municipios; D.actualizado = js.actualizado; }
    } catch (e) { /* sin almacenamiento disponible */ }
    indexar();
    return Object.keys(D.municipios).length;
  };

  D.descargar = async function () {
    const filas = [];
    let offset = 0;
    for (;;) {
      const js = await IP.arcgis.query(IP.CONFIG.gestores, {
        where: "1=1", outFields: CAMPOS.join(","), resultOffset: offset, resultRecordCount: 2000,
        orderByFields: "mpio_cdpmp",
      }, 40000);
      const lote = (js.features || []).map((f) => f.attributes);
      filas.push(...lote);
      if (!js.exceededTransferLimit || !lote.length) break;
      offset += lote.length;
    }
    const mun = {};
    for (const a of filas) {
      const cod = String(a.mpio_cdpmp || "").trim().padStart(5, "0");
      if (!/^0*$/.test(cod)) {
        mun[cod] = {};
        for (const c of CAMPOS) mun[cod][c] = a[c] == null ? "" : String(a[c]);
      }
    }
    if (!Object.keys(mun).length) throw new Error("La capa del IGAC no devolvió municipios");
    D.municipios = mun;
    D.actualizado = U.ahora();
    D.error = "";
    try { localStorage.setItem(CLAVE, JSON.stringify({ actualizado: D.actualizado, municipios: mun })); } catch (e) { /* lleno o bloqueado */ }
    indexar();
    return Object.keys(mun).length;
  };

  D.asegurar = async function () {
    if (Object.keys(D.municipios).length) return true;
    try { await D.descargar(); return true; }
    catch (e) { D.error = "No se pudo descargar el directorio de gestores del IGAC: " + e.message; return false; }
  };

  D.porCodigo = (c) => (c ? D.municipios[String(c).padStart(5, "0")] || null : null);

  D.codigoPorNombre = function (dpto, mpio) {
    const dp = U.normalizar(dpto), mp = U.normalizar(mpio);
    if (!mp) return "";
    if (mp.startsWith("BOGOTA")) return "11001";
    if (!D.porNombre) indexar();
    if (D.porNombre.has(dp + "|" + mp)) return D.porNombre.get(dp + "|" + mp);
    for (const [k, cod] of D.porNombre) {
      const [d, m] = k.split("|");
      if ((!dp || d === dp || d.includes(dp) || dp.includes(d)) && (m.startsWith(mp) || mp.startsWith(m))) return cod;
    }
    const c = D.porMpio.get(mp) || [];
    return c.length === 1 ? c[0] : "";
  };

  D.resumen = function () {
    const cuenta = {};
    for (const m of Object.values(D.municipios)) {
      const n = m.Gestor || "SIN DATO";
      cuenta[n] = (cuenta[n] || 0) + 1;
    }
    return { municipios: Object.keys(D.municipios).length, gestores: Object.keys(cuenta).length,
             actualizado: D.actualizado, error: D.error,
             lista: Object.entries(cuenta).sort((a, b) => b[1] - a[1]) };
  };
})(typeof window !== "undefined" ? window : globalThis);
