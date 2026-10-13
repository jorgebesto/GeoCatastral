/* Consultas a servicios web desde el navegador.
   Primero intenta fetch normal; si el servidor no permite consultas desde otra página (CORS), usa JSONP
   (los servidores ArcGIS y CKAN aceptan el parámetro 'callback'). */
(function (g) {
  const IP = (g.IP = g.IP || {});
  let contador = 0;

  function jsonp(url, ms) {
    return new Promise((resolve, reject) => {
      if (typeof document === "undefined") return reject(new Error("JSONP no disponible"));
      const nombre = "__ip_cb" + Date.now() + "_" + contador++;
      const s = document.createElement("script");
      const limpiar = () => { delete g[nombre]; s.remove(); clearTimeout(t); };
      const t = setTimeout(() => { limpiar(); reject(new Error("tiempo agotado")); }, ms);
      g[nombre] = (js) => { limpiar(); resolve(js); };
      s.onerror = () => { limpiar(); reject(new Error("no se pudo conectar")); };
      s.src = url + (url.includes("?") ? "&" : "?") + "callback=" + nombre;
      document.head.appendChild(s);
    });
  }

  class ErrorServicio extends Error {}

  const conQuery = (url, params) => {
    const qs = new URLSearchParams(params).toString();
    return qs ? url + (url.includes("?") ? "&" : "?") + qs : url;
  };

  IP.http = {
    ErrorServicio,
    conQuery,
    // Trae JSON con fetch y, si el navegador lo bloquea, con JSONP.
    async json(url, ms = 25000) {
      try {
        const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
        const t = ctrl ? setTimeout(() => ctrl.abort(), ms) : null;
        const r = await fetch(url, ctrl ? { signal: ctrl.signal } : {});
        if (t) clearTimeout(t);
        if (!r.ok) throw new Error("HTTP " + r.status);
        return await r.json();
      } catch (e) {
        return await jsonp(url, ms);
      }
    },
  };

  function revisar(js) {
    if (js && js.error) throw new ErrorServicio(js.error.message || JSON.stringify(js.error));
    return js;
  }

  IP.arcgis = {
    ErrorServicio,
    async get(url, params = {}, ms) {
      return revisar(await IP.http.json(conQuery(url, { ...params, f: "json" }), ms));
    },
    parametrosQuery: (params) => ({ outFields: "*", returnGeometry: "false", ...params }),
    query(urlCapa, params, ms) {
      return IP.arcgis.get(urlCapa.replace(/\/$/, "") + "/query", IP.arcgis.parametrosQuery(params), ms);
    },
    // Enlace para ver la misma búsqueda en la página del servicio (formato HTML), para confirmar.
    enlaceQuery(urlCapa, params) {
      const p = { ...IP.arcgis.parametrosQuery(params), f: "html" };
      delete p.outSR;
      p.returnGeometry = "false";
      return conQuery(urlCapa.replace(/\/$/, "") + "/query", p);
    },
    sql: (v) => "'" + String(v).replace(/'/g, "''") + "'",
    centroide(geom) {
      if (!geom) return [null, null];
      if ("x" in geom && "y" in geom) return [geom.y, geom.x];
      const pts = (geom.rings || [])[0];
      if (!pts || !pts.length) return [null, null];
      return [pts.reduce((s, p) => s + p[1], 0) / pts.length, pts.reduce((s, p) => s + p[0], 0) / pts.length];
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
