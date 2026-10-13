/* Lector y escritor mínimo de archivos .xlsx, sin librerías externas.
   Lectura: descomprime el zip con DecompressionStream (navegadores actuales) y lee el XML.
   Escritura: arma un .xlsx sin compresión, con encabezados, colores y anchos de columna. */
(function (g) {
  const IP = (g.IP = g.IP || {});
  const X = (IP.xlsx = {});

  /* ---------------- ZIP: lectura ---------------- */
  async function inflar(bytes) {
    const ds = new DecompressionStream("deflate-raw");
    const flujo = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(flujo).arrayBuffer());
  }

  async function leerZip(buffer) {
    const b = new Uint8Array(buffer);
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let eocd = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("El archivo no es un .xlsx válido (guárdelo como Libro de Excel .xlsx)");
    const total = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const dec = new TextDecoder();
    const archivos = {};
    for (let k = 0; k < total; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const metodo = dv.getUint16(p + 10, true);
      const tamComp = dv.getUint32(p + 20, true);
      const lnNombre = dv.getUint16(p + 28, true);
      const lnExtra = dv.getUint16(p + 30, true);
      const lnComent = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const nombre = dec.decode(b.subarray(p + 46, p + 46 + lnNombre));
      archivos[nombre] = { metodo, tamComp, local };
      p += 46 + lnNombre + lnExtra + lnComent;
    }
    return {
      nombres: Object.keys(archivos),
      async texto(nombre) {
        const a = archivos[nombre];
        if (!a) return null;
        const n = dv.getUint16(a.local + 26, true), e = dv.getUint16(a.local + 28, true);
        const ini = a.local + 30 + n + e;
        const datos = b.subarray(ini, ini + a.tamComp);
        const crudo = a.metodo === 0 ? datos : await inflar(datos);
        return new TextDecoder().decode(crudo);
      },
    };
  }

  /* ---------------- XLSX: lectura ---------------- */
  const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  const desXml = (s) =>
    String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) =>
      e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()]);
  const attr = (s, n) => {
    const m = s.match(new RegExp("\\b" + n + '="([^"]*)"'));
    return m ? desXml(m[1]) : null;
  };
  const textoRico = (xml) =>
    [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => desXml(m[1])).join("");

  function columna(ref) {
    const letras = ref.match(/^[A-Z]+/)[0];
    let n = 0;
    for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
    return n - 1;
  }
  const FORMATOS_FECHA = new Set([14, 15, 16, 17, 22, 27, 30, 36, 45, 46, 47, 50, 57]);
  function fechaExcel(n) {
    const d = new Date(Math.round((n - 25569) * 86400000));
    const p = (x) => String(x).padStart(2, "0");
    return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  }

  // Devuelve { hojas: [{ nombre, filas: [[...]] }] } con todos los valores como texto.
  X.leer = async function (buffer) {
    const zip = await leerZip(buffer);
    const wb = await zip.texto("xl/workbook.xml");
    if (!wb) throw new Error("No encontré el libro dentro del archivo. ¿Es un .xlsx?");
    const rels = (await zip.texto("xl/_rels/workbook.xml.rels")) || "";
    const destinos = {};
    for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) destinos[attr(m[0], "Id")] = attr(m[0], "Target");
    const compartidos = [];
    const ss = await zip.texto("xl/sharedStrings.xml");
    if (ss) for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) compartidos.push(textoRico(m[1]));
    // Estilos de fecha
    const estilosFecha = new Set();
    const st = await zip.texto("xl/styles.xml");
    if (st) {
      const propios = new Set();
      for (const m of st.matchAll(/<numFmt\b[^>]*>/g)) {
        const cod = (attr(m[0], "formatCode") || "").replace(/"[^"]*"|\[[^\]]*\]/g, "").toLowerCase();
        if (/[dy]/.test(cod) || /m+\W*[dy]|[dy]\W*m+/.test(cod)) propios.add(Number(attr(m[0], "numFmtId")));
      }
      const xfs = (st.match(/<cellXfs\b[\s\S]*?<\/cellXfs>/) || [""])[0];
      [...xfs.matchAll(/<xf\b[^>]*\/?>/g)].forEach((m, i) => {
        const id = Number(attr(m[0], "numFmtId") || 0);
        if (FORMATOS_FECHA.has(id) || propios.has(id)) estilosFecha.add(i);
      });
    }
    const hojas = [];
    for (const m of wb.matchAll(/<sheet\b[^>]*\/?>/g)) {
      const nombre = attr(m[0], "name");
      let destino = destinos[attr(m[0], "r:id")] || "";
      destino = destino.startsWith("/") ? destino.slice(1) : "xl/" + destino.replace(/^\.\//, "");
      const xml = await zip.texto(destino);
      if (!xml) continue;
      const filas = [];
      for (const fr of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
        const r = Number(attr(fr[1], "r")) - 1;
        const fila = [];
        let col = 0;
        for (const c of (fr[2] || "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
          const ref = attr(c[1], "r");
          if (ref) col = columna(ref);
          const t = attr(c[1], "t") || "n";
          const s = Number(attr(c[1], "s") || 0);
          const cuerpo = c[2] || "";
          const v = (cuerpo.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
          let valor = "";
          if (t === "s") valor = v != null ? compartidos[Number(v)] ?? "" : "";
          else if (t === "inlineStr") valor = textoRico(cuerpo);
          else if (t === "b") valor = v === "1" ? "VERDADERO" : "FALSO";
          else if (v != null) {
            valor = desXml(v);
            if (t === "n" && estilosFecha.has(s) && /^\d+(\.\d+)?$/.test(valor)) valor = fechaExcel(Number(valor));
            else if (t === "n" && /^-?\d+\.\d{10,}$/.test(valor)) valor = String(Number(Number(valor).toPrecision(12)));
          }
          fila[col] = valor;
          col++;
        }
        filas[Number.isFinite(r) && r >= 0 ? r : filas.length] = Array.from(fila, (x) => x ?? "");
      }
      hojas.push({ nombre, filas: Array.from(filas, (f) => f || []) });
    }
    return { hojas };
  };

  /* ---------------- ZIP: escritura (sin compresión) ---------------- */
  const TABLA_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(b) {
    let c = 0xffffffff;
    for (let i = 0; i < b.length; i++) c = TABLA_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function crearZip(archivos) {
    const enc = new TextEncoder();
    const partes = [], central = [];
    let pos = 0;
    for (const [nombre, contenido] of archivos) {
      const n = enc.encode(nombre), d = enc.encode(contenido), crc = crc32(d);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
      h.setUint16(8, 0, true); h.setUint16(10, 0, true); h.setUint16(12, 0x21, true);
      h.setUint32(14, crc, true); h.setUint32(18, d.length, true); h.setUint32(22, d.length, true);
      h.setUint16(26, n.length, true); h.setUint16(28, 0, true);
      partes.push(new Uint8Array(h.buffer), n, d);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true);
      c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, 0, true); c.setUint16(14, 0x21, true);
      c.setUint32(16, crc, true); c.setUint32(20, d.length, true); c.setUint32(24, d.length, true);
      c.setUint16(28, n.length, true); c.setUint32(42, pos, true);
      central.push(new Uint8Array(c.buffer), n);
      pos += 30 + n.length + d.length;
    }
    const tamCentral = central.reduce((s, x) => s + x.length, 0);
    const fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true);
    fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
    fin.setUint32(12, tamCentral, true); fin.setUint32(16, pos, true);
    return new Blob([...partes, ...central, new Uint8Array(fin.buffer)],
      { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  /* ---------------- XLSX: escritura ---------------- */
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  function letra(i) {
    let s = "";
    for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
    return s;
  }
  // Estilos: 0 normal, 1 encabezado, 2 verde, 3 amarillo, 4 rojo, 5 gris
  X.ESTILO = { normal: 0, encabezado: 1, ok: 2, revisar: 3, diferente: 4, sin_dato: 5 };
  const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="7"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1F3A5F"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFD9F2E3"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFF1CC"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF9D6D5"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="3" borderId="0" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="4" borderId="0" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="5" borderId="0" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="6" borderId="0" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  function hojaXml(h) {
    const anchos = h.columnas.map((c, i) => {
      const largo = Math.max(String(c).length, ...h.filas.map((f) => String((f[i] && f[i].v !== undefined ? f[i].v : f[i]) ?? "").length));
      return (h.anchos && h.anchos[c]) || Math.min(Math.max(10, largo + 2), 55);
    });
    let x = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`;
    x += `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`;
    x += `<cols>${anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols><sheetData>`;
    const todas = [h.columnas.map((c) => ({ v: c, s: 1 })), ...h.filas];
    todas.forEach((fila, r) => {
      x += `<row r="${r + 1}">`;
      fila.forEach((celda, c) => {
        const o = celda && typeof celda === "object" && "v" in celda ? celda : { v: celda };
        if (o.v === null || o.v === undefined || o.v === "") {
          if (o.s) x += `<c r="${letra(c)}${r + 1}" s="${o.s}"/>`;
          return;
        }
        const ref = `${letra(c)}${r + 1}`, s = o.s ? ` s="${o.s}"` : "";
        if (typeof o.v === "number" && Number.isFinite(o.v)) x += `<c r="${ref}"${s}><v>${o.v}</v></c>`;
        else x += `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(o.v).slice(0, 32000)}</t></is></c>`;
      });
      x += `</row>`;
    });
    x += `</sheetData>`;
    if (h.filas.length) x += `<autoFilter ref="A1:${letra(h.columnas.length - 1)}${h.filas.length + 1}"/>`;
    return x + `</worksheet>`;
  }

  // hojas: [{ nombre, columnas: [..], filas: [[valor | {v, s}]], anchos: {col: ancho} }]
  X.escribir = function (hojas) {
    const usados = new Set();
    const nombres = hojas.map((h) => {
      let n = String(h.nombre).replace(/[\[\]:*?\/\\]/g, " ").slice(0, 31) || "Hoja";
      let k = 2;
      while (usados.has(n.toLowerCase())) n = n.slice(0, 28) + " " + k++;
      usados.add(n.toLowerCase());
      return n;
    });
    const archivos = [
      ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`],
      ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
      ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nombres.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`],
      ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
      ["xl/styles.xml", ESTILOS],
      ...hojas.map((h, i) => [`xl/worksheets/sheet${i + 1}.xml`, hojaXml(h)]),
    ];
    return crearZip(archivos);
  };
})(typeof window !== "undefined" ? window : globalThis);
