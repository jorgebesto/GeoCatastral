/* Lo que se guarda queda solo en este navegador (IndexedDB): el Excel de la empresa y las consultas del VUR
   que se peguen. Nada se envía a ningún servidor. Si el navegador no deja guardar, se trabaja en memoria. */
(function (g) {
  const IP = (g.IP = g.IP || {});
  const U = IP.util;
  const memoria = { ajustes: new Map(), vur: [] };
  let db = null, intentado = false;

  function abrir() {
    if (intentado) return Promise.resolve(db);
    intentado = true;
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open("investigador_predios", 1);
        req.onupgradeneeded = () => {
          const d = req.result;
          if (!d.objectStoreNames.contains("ajustes")) d.createObjectStore("ajustes");
          if (!d.objectStoreNames.contains("vur")) d.createObjectStore("vur", { keyPath: "id", autoIncrement: true }).createIndex("matricula", "matricula_normalizada");
        };
        req.onsuccess = () => { db = req.result; resolve(db); };
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }
  function tx(store, modo, fn) {
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, modo);
      const r = fn(t.objectStore(store));
      t.oncomplete = () => resolve(r && "result" in r ? r.result : undefined);
      t.onerror = () => reject(t.error);
    });
  }

  const S = (IP.almacen = {
    async disponible() { return Boolean(await abrir()); },

    async guardarExcel(nombre, buffer) {
      const v = { nombre, buffer, fecha: U.ahora() };
      if (!(await abrir())) { memoria.ajustes.set("excel", v); return; }
      await tx("ajustes", "readwrite", (s) => s.put(v, "excel"));
    },
    async leerExcel() {
      if (!(await abrir())) return memoria.ajustes.get("excel") || null;
      return (await tx("ajustes", "readonly", (s) => s.get("excel"))) || null;
    },
    async borrarExcel() {
      if (!(await abrir())) { memoria.ajustes.delete("excel"); return; }
      await tx("ajustes", "readwrite", (s) => s.delete("excel"));
    },

    async todasVur() {
      if (!(await abrir())) return memoria.vur.slice();
      return (await tx("vur", "readonly", (s) => s.getAll())) || [];
    },
    // Guarda una consulta; si ya existe la misma (mismo número de consulta o mismo contenido) no la repite.
    async guardarVur(d) {
      const todas = await S.todasVur();
      const igual = todas.find((x) => x.matricula_normalizada === d.matricula_normalizada &&
        ((d.no_consulta && x.no_consulta === d.no_consulta) || (x.fecha_consulta === d.fecha_consulta && x.hora_consulta === d.hora_consulta)));
      if (igual) return igual;
      const reg = { ...d, guardado: U.ahora() };
      delete reg.id;
      if (!(await abrir())) { reg.id = memoria.vur.length + 1; memoria.vur.push(reg); return reg; }
      reg.id = await tx("vur", "readwrite", (s) => s.add(reg));
      return reg;
    },
    async vurDe(matricula) {
      const clave = U.normalizarMatricula(matricula);
      const todas = await S.todasVur();
      const exacta = todas.filter((x) => x.matricula_normalizada === clave);
      const lista = exacta.length || clave.includes("-") ? exacta
        : todas.filter((x) => U.numeroDeMatricula(x.matricula_normalizada) === clave);
      return lista.sort((a, b) => ordenFecha(b) - ordenFecha(a));
    },
    async historial() {
      const grupos = new Map();
      for (const v of await S.todasVur()) {
        const k = v.matricula_normalizada;
        const g0 = grupos.get(k) || { matricula: k, municipio: v.municipio, departamento: v.departamento, consultas: 0, ultima: "" , orden: 0 };
        g0.consultas++;
        if (ordenFecha(v) >= g0.orden) { g0.orden = ordenFecha(v); g0.ultima = v.fecha_consulta || v.guardado; g0.municipio = v.municipio; }
        grupos.set(k, g0);
      }
      return [...grupos.values()].sort((a, b) => b.orden - a.orden);
    },
    async borrarTodo() {
      memoria.ajustes.clear(); memoria.vur = [];
      if (!(await abrir())) return;
      await tx("ajustes", "readwrite", (s) => s.clear());
      await tx("vur", "readwrite", (s) => s.clear());
    },
  });

  function ordenFecha(v) {
    const m = String(v.fecha_consulta || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
    const h = String(v.hora_consulta || "").match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    let hora = 0;
    if (h) { hora = (Number(h[1]) % 12) + (h[3] && h[3].toUpperCase() === "PM" ? 12 : (h[3] ? 0 : Math.floor(Number(h[1]) / 12) * 12)); hora = hora * 60 + Number(h[2]); }
    if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]) + hora * 60000;
    return Date.parse(String(v.guardado || "").replace(" ", "T")) || 0;
  }
})(typeof window !== "undefined" ? window : globalThis);
