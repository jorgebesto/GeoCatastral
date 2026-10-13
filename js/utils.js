/* Funciones de apoyo: textos, códigos, matrículas y áreas. */
(function (g) {
  const IP = (g.IP = g.IP || {});
  const U = (IP.util = {});

  U.sinTildes = (s) => String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "");
  U.normalizar = (s) =>
    U.sinTildes(s).toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  U.soloDigitos = (s) => String(s ?? "").replace(/\D/g, "");

  const VACIOS = new Set(["", "NAN", "NONE", "NULL", "NAT", "UNDEFINED", "SIN INFORMACION", "N/A", "-"]);
  U.vacio = (v) => v == null || VACIOS.has(U.sinTildes(String(v).trim()).toUpperCase());
  U.limpiar = (v) => (U.vacio(v) ? "" : String(v).trim());

  /* ---------------- Matrícula inmobiliaria ---------------- */
  // Devuelve 'CCC-NNNN': círculo (3 dígitos, o alfanumérico como 50C) y número sin ceros a la izquierda.
  U.normalizarMatricula = function (fmi, circulo) {
    let s = U.limpiar(fmi);
    if (!s) return "";
    if (/^\d+\.0$/.test(s)) s = s.slice(0, -2);
    const partes = s.match(/[0-9A-Za-z]+/g) || [];
    let circ = "", num = "";
    if (partes.length >= 2) {
      circ = partes[0];
      num = partes[partes.length - 1];
    } else {
      num = partes[0] || "";
      const m = U.limpiar(circulo).match(/[0-9][0-9A-Za-z]*/);
      circ = m ? m[0] : "";
    }
    num = num.replace(/^0+/, "") || "0";
    circ = circ.toUpperCase();
    if (/^\d+$/.test(circ)) circ = circ.padStart(3, "0");
    return circ ? `${circ}-${num.toUpperCase()}` : num.toUpperCase();
  };
  U.numeroDeMatricula = (fmi) => {
    const s = U.normalizarMatricula(fmi);
    return s ? s.split("-").pop() : "";
  };
  U.circuloDeMatricula = (fmi) => {
    const s = U.normalizarMatricula(fmi);
    return s.includes("-") ? s.split("-")[0] : "";
  };

  /* ---------------- Número predial ---------------- */
  U.tipoCodigo = function (codigo) {
    const s = U.limpiar(codigo).replace(/\s+/g, "");
    if (!s) return "";
    if (/^AAA\w{8}$/i.test(s)) return "chip";
    if (/^\d{30}$/.test(s)) return "nacional30";
    if (/^\d{20}$/.test(s)) return "anterior20";
    return "otro";
  };
  U.codigoDane = function (predial) {
    const s = U.limpiar(predial).replace(/\s+/g, "");
    return /^\d{20}$|^\d{30}$/.test(s) ? s.slice(0, 5) : "";
  };
  U.codigosIguales = function (a, b) {
    const da = U.soloDigitos(a), db = U.soloDigitos(b);
    if (da && db) return da.replace(/^0+/, "") === db.replace(/^0+/, "");
    return U.normalizar(a).replace(/ /g, "") === U.normalizar(b).replace(/ /g, "");
  };

  /* ---------------- Comparación de textos ---------------- */
  const ABREV = {
    CALLE: "CL", CLL: "CL", CARRERA: "KR", CRA: "KR", CR: "KR", KRA: "KR", AVENIDA: "AV", AVDA: "AV",
    TRANSVERSAL: "TV", TRANSV: "TV", TR: "TV", DIAGONAL: "DG", DIAG: "DG", NUMERO: "", NO: "", N: "",
    APARTAMENTO: "AP", APTO: "AP", INTERIOR: "IN", INT: "IN", TORRE: "TO", BLOQUE: "BL", LOTE: "LT",
    MANZANA: "MZ", VEREDA: "VDA", FINCA: "", PREDIO: "", SUR: "S", ESTE: "E",
  };
  U.normalizarDireccion = (t) =>
    U.normalizar(t).split(" ").map((p) => (p in ABREV ? ABREV[p] : p)).filter(Boolean).join(" ");

  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++)
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  U.similitud = function (a, b, direccion) {
    a = direccion ? U.normalizarDireccion(a) : U.normalizar(a);
    b = direccion ? U.normalizarDireccion(b) : U.normalizar(b);
    if (!a || !b) return 0;
    if (a === b || a.includes(b) || b.includes(a)) return 1;
    return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  };

  /* ---------------- Áreas escritas en texto ---------------- */
  const UNIDADES = [
    [/^(?:HECTAREAS?|HAS?\.?|HS\.?|HTS?\.?)$/, 10000, "ha"],
    [/^(?:FANEGADAS?|FGS?\.?)$/, 6400, "fanegada"],
    [/^PLAZAS?$/, 6400, "plaza"],
    [/^CUADRAS?$/, 6400, "cuadra"],
    [/^(?:VARAS?\s*(?:CUADRADAS|2|²)|V2|VRS?\.?\s*(?:2|CUADRADAS))$/, 0.64, "vara2"],
    [/^(?:METROS?|MTS?|MTRS?|M)\.?\s*(?:CUADRADOS?|2|²)$/, 1, "m2"],
  ];
  const NUM = "(\\d{1,3}(?:[.,]\\d{3})+(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)?)";
  const UNI =
    "(HECTAREAS?|HAS?\\b\\.?|HS\\b\\.?|HTS?\\b\\.?|FANEGADAS?|FGS?\\b\\.?|PLAZAS?\\b|CUADRAS?\\b|" +
    "VARAS?\\s*(?:CUADRADAS|2|²)|V2\\b|VRS?\\.?\\s*(?:2|CUADRADAS)|(?:METROS?|MTS?|MTRS?|M)\\.?\\s*(?:CUADRADOS?|2|²))";

  U.numeroColombiano = function (texto) {
    let s = String(texto).trim();
    if (s.includes(".") && s.includes(",")) {
      s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
    } else if (s.includes(".")) {
      const g = s.split(".");
      if (g.slice(1).every((x) => x.length === 3)) s = s.replace(/\./g, "");
    } else if (s.includes(",")) {
      const g = s.split(",");
      s = g.length > 2 && g.slice(1).every((x) => x.length === 3) ? s.replace(/,/g, "") : s.replace(",", ".");
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  function factor(u) {
    const t = u.trim();
    for (const [re, f, nombre] of UNIDADES) if (re.test(t)) return [f, nombre];
    return [null, null];
  }

  // Busca la primera expresión de área (suma las seguidas: '18 HS. Y 5.000 M2') y la devuelve en m².
  U.areaDesdeTexto = function (texto) {
    if (!texto) return { m2: null, texto: "" };
    const t = U.sinTildes(texto).toUpperCase();
    const re = new RegExp(NUM + "\\s*" + UNI, "g");
    const ms = [...t.matchAll(re)];
    if (!ms.length) return { m2: null, texto: "" };
    let total = 0, inicio = ms[0].index, fin = ms[0].index;
    const usadas = new Set();
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i];
      if (i > 0) {
        const entre = t.slice(fin, m.index);
        if (entre.length > 12 || !/^[\s.,Y+]*(?:CON)?[\s.,Y+]*$/.test(entre)) break;
      }
      const v = U.numeroColombiano(m[1]);
      const [f, nombre] = factor(m[2]);
      if (v == null || f == null || usadas.has(nombre)) break;
      usadas.add(nombre);
      total += v * f;
      fin = m.index + m[0].length;
    }
    if (fin === inicio) return { m2: null, texto: "" };
    return { m2: Math.round(total * 100) / 100, texto: String(texto).slice(inicio, fin).trim() };
  };

  U.formatoNumero = (n, dec = 2) =>
    Number(n).toLocaleString("es-CO", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  U.formatoArea = function (m2) {
    if (m2 == null || m2 === "" || !Number.isFinite(Number(m2))) return "";
    m2 = Number(m2);
    return m2 >= 10000
      ? `${U.formatoNumero(m2)} m² (${U.formatoNumero(m2 / 10000, 4)} ha)`
      : `${U.formatoNumero(m2)} m²`;
  };

  U.esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  U.ahora = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
})(typeof window !== "undefined" ? window : globalThis);
