/* Excel de la empresa: encuentra la fila de encabezados, reconoce las columnas y busca por matrícula (FMI).
   Tu Excel trae dos bloques: el de seguimiento (ENCARGADO ... OBS) y el de datos de la empresa (el segundo FMI
   en adelante). Las columnas repetidas del segundo bloque quedan con el sufijo " (2)". */
(function (g) {
  const IP = (g.IP = g.IP || {});
  const U = IP.util;

  const COLUMNAS = {
    fmi: ["FMI (2)", "FMI", "MATRICULA", "MATRICULA INMOBILIARIA", "FOLIO DE MATRICULA", "FOLIO"],
    circulo: ["CIRCULO REGISTRAL", "CIRCULO", "ORIP"],
    orip: ["ORIP"],
    departamento: ["DEPARTAMENTO"],
    municipio: ["MUNICIPIO (2)", "MUNICIPIO", "NUNICIPIO"],
    vereda: ["VEREDA"],
    direccion: ["DIRECCION (2)", "DIRECCION"],
    cedula_catastral: ["CEDULA CATASTRAL", "NUMERO PREDIAL", "NUMERO PREDIAL NACIONAL", "CHIP", "REFERENCIA CATASTRAL"],
    cedula_vur: ["CEDULA VUR"],
    tipo_predio_informado: ["TIPO DE PREDIO INFORMADO"],
    tipo_predio_vur: ["TIPO DE PREDIO CONSULTA VUR"],
    encargado: ["ENCARGADO"],
    estado: ["ESTADO"],
    numero_matrix: ["NUMERO MATRIX"],
    propiedad_horizontal: ["PROPIEDAD HORIZONTAL"],
    descripcion: ["DESCRIPCION"],
    observaciones: ["OBS", "OBSERVACIONES"],
  };
  const sinFechaFinal = (n) => n.split(" ").filter((p, i, a) => !(/^\d+$/.test(p) && a.slice(i).every((x) => /^\d+$/.test(x)))).join(" ");

  class ExcelEmpresa {
    constructor(libro, nombreArchivo) {
      const hoja = libro.hojas.reduce((a, b) => (b.filas.length > a.filas.length ? b : a), libro.hojas[0]);
      if (!hoja) throw new Error("El Excel no tiene hojas");
      let cab = 0;
      for (let i = 0; i < Math.min(20, hoja.filas.length); i++) {
        const v = (hoja.filas[i] || []).map(U.normalizar);
        if (v.includes("FMI") || v.includes("MATRICULA") || v.includes("MATRICULA INMOBILIARIA") || v.includes("FOLIO DE MATRICULA")) { cab = i; break; }
      }
      const originales = (hoja.filas[cab] || []).map((x) => String(x ?? "").trim());
      const vistos = {};
      this.columnas = originales.map((n) => {
        const base = U.normalizar(n) || "COLUMNA";
        vistos[base] = (vistos[base] || 0) + 1;
        return vistos[base] === 1 ? base : `${base} (${vistos[base]})`;
      });
      this.columnasOriginales = originales;
      const pares = hoja.filas.map((f, i) => [f, i + 1]).slice(cab + 1).filter(([f]) => f && f.some((x) => U.limpiar(x)));
      this.filas = pares.map((p) => p[0]);
      this.numeros = pares.map((p) => p[1]); // número de fila en la hoja de Excel
      this.hoja = hoja.nombre;
      this.nombreArchivo = nombreArchivo || "";
      this.mapa = {};
      const sinFecha = {};
      this.columnas.forEach((c, i) => { sinFecha[sinFechaFinal(c)] = sinFecha[sinFechaFinal(c)] ?? i; });
      for (const [clave, opciones] of Object.entries(COLUMNAS)) {
        for (const op of opciones) {
          const i = this.columnas.indexOf(op);
          if (i >= 0) { this.mapa[clave] = i; break; }
          if (op in sinFecha) { this.mapa[clave] = sinFecha[op]; break; }
        }
      }
      // Índice por matrícula, con todas las columnas que parezcan FMI
      const colsFmi = this.columnas.map((c, i) => (/^(FMI|MATRICULA|MATRICULA INMOBILIARIA|FOLIO DE MATRICULA)( \(\d+\))?$/.test(c) ? i : -1)).filter((i) => i >= 0);
      this.completo = new Map();
      this.porNumero = new Map();
      this.filas.forEach((f, i) => {
        const circ = this.valor(f, "circulo");
        const claves = new Set(colsFmi.map((c) => U.normalizarMatricula(f[c], circ)).filter(Boolean));
        for (const k of claves) {
          if (!this.completo.has(k)) this.completo.set(k, new Set());
          this.completo.get(k).add(i);
          const n = U.numeroDeMatricula(k);
          if (!this.porNumero.has(n)) this.porNumero.set(n, new Set());
          this.porNumero.get(n).add(i);
        }
      });
    }

    valor(fila, clave) {
      const i = this.mapa[clave];
      return i === undefined ? "" : U.limpiar(fila[i]);
    }
    get total() { return this.filas.length; }
    get columnasDetectadas() {
      const r = {};
      for (const [k, i] of Object.entries(this.mapa)) r[k] = this.columnasOriginales[i];
      return r;
    }

    valoresDistintos(clave) {
      const v = new Map();
      for (const f of this.filas) { const x = this.valor(f, clave); if (x) v.set(x, (v.get(x) || 0) + 1); }
      return [...v.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"));
    }
    // Matrículas de todas las filas que cumplan los filtros { clave: valor }
    matriculas(filtros = {}) {
      const out = [];
      this.filas.forEach((f) => {
        for (const [k, v] of Object.entries(filtros)) if (v && this.valor(f, k) !== v) return;
        const m = U.normalizarMatricula(this.valor(f, "fmi"), this.valor(f, "circulo"));
        if (m && !out.includes(m)) out.push(m);
      });
      return out;
    }

    registro(i) {
      const f = this.filas[i];
      const d = { _fila: i, _numero: this.numeros[i] };
      for (const k of Object.keys(COLUMNAS)) d[k] = this.valor(f, k);
      d._todas = this.columnasOriginales.map((c, j) => [c || `Columna ${j + 1}`, U.limpiar(f[j])]);
      return d;
    }

    // Devuelve { registros: [...], como: "..." }
    buscar(matricula) {
      const clave = U.normalizarMatricula(matricula);
      if (!clave) return { registros: [], como: "matrícula vacía" };
      if (this.completo.has(clave)) return { registros: [...this.completo.get(clave)].map((i) => this.registro(i)), como: "matrícula completa" };
      const cands = [...(this.porNumero.get(U.numeroDeMatricula(clave)) || [])];
      if (!cands.length) return { registros: [], como: "no está en el Excel" };
      const como = clave.includes("-") ? "solo por número: revise el círculo registral" : "por número de matrícula (sin círculo)";
      return { registros: cands.map((i) => this.registro(i)), como };
    }
  }

  IP.ExcelEmpresa = ExcelEmpresa;
  IP.excelDesdeBuffer = async (buffer, nombre) => new ExcelEmpresa(await IP.xlsx.leer(buffer), nombre);
})(typeof window !== "undefined" ? window : globalThis);
