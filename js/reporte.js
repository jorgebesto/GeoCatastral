/* Excel de salida con todas las fichas investigadas. */
(function (g) {
  const IP = (g.IP = g.IP || {});
  const U = IP.util;
  const VEREDICTO = { ok: "Sin diferencias", revisar: "Revisar", diferente: "Con diferencias", sin_dato: "Sin contraste" };
  const ESTADO = { ok: "Coincide", revisar: "Revisar", diferente: "Diferente", sin_dato: "—" };
  const CAT = { ok: "Encontrado", no_encontrado: "No encontrado", sin_datos: "Sin código para buscar", error: "Error", omitido: "No consultado" };
  IP.textos = { VEREDICTO, ESTADO, CAT };
  // Lista corta de las fuentes catastrales donde sí apareció el predio
  IP.encontradoEn = (f) => (f.catastro.fuentes || []).filter((x) => x.estado === "ok").map((x) => `${x.fuente} (${x.origen === "IGAC" ? "IGAC" : "gestor"})`).join("; ");

  IP.generarReporte = function (fichas, excel) {
    const S = IP.xlsx.ESTILO;
    const hojas = [];

    hojas.push({
      nombre: "Resumen",
      columnas: ["Matrícula", "Departamento", "Municipio", "Encargado", "Resultado", "Diferencias", "Por revisar", "Alertas",
        "Predial nacional", "Predial anterior", "Propietarios (VUR)", "Estado folio", "Área VUR (m²)", "Área catastro (m²)",
        "Destino (catastro)", "Gestor catastral", "Catastro", "Encontrado en", "No. consulta VUR", "Fecha consulta VUR", "Fecha investigación"],
      anchos: { Alertas: 45, "Propietarios (VUR)": 45 },
      filas: fichas.map((f) => {
        const v = f.vur || {}, r = f.registro || {}, c = f.catastro, d = c.datos || {};
        return [f.matricula, v.departamento || r.departamento || d.departamento, v.municipio || r.municipio || d.municipio, r.encargado,
          { v: VEREDICTO[f.resumen.veredicto], s: S[f.resumen.veredicto] }, f.resumen.diferencias, f.resumen.revisar, f.alertas.join("; "),
          v.referencia_catastral || d.numero_predial || c.claves.predial30, v.referencia_catastral_anterior, v.propietarios_texto, v.estado_folio,
          v.area_terreno_m2 ?? "", d.area_terreno_m2 ?? "", d.destino_economico, c.gestor, CAT[c.estado] || c.estado,
          IP.encontradoEn(f), v.no_consulta, v.fecha_consulta, f.fecha];
      }),
    });

    hojas.push({
      nombre: "Contraste",
      columnas: ["Matrícula", "Campo", "Excel empresa", "VUR", "Catastro", "Fuente del dato catastral", "Estado", "Nota"],
      anchos: { "Excel empresa": 35, VUR: 40, Catastro: 35, "Fuente del dato catastral": 30, Nota: 35 },
      filas: fichas.flatMap((f) => f.contraste.map((x) => {
        const s = S[x.estado];
        return [f.matricula, x.campo, { v: x.excel, s }, { v: x.vur, s }, { v: x.catastro, s }, x.fuente_catastro || "", { v: ESTADO[x.estado], s }, x.nota];
      })),
    });

    hojas.push({
      nombre: "Fuentes",
      columnas: ["Matrícula", "Fuente", "Origen", "Resultado", "Dónde / detalle", "Enlace para confirmar", "Otros enlaces"],
      anchos: { "Dónde / detalle": 60, "Enlace para confirmar": 60, "Otros enlaces": 60 },
      filas: fichas.flatMap((f) => (f.donde || []).map((x) => {
        const est = { ok: "ok", no_encontrado: "diferente", error: "diferente" }[x.estado] || "sin_dato";
        return [f.matricula, x.fuente, x.origen, { v: (x.etiqueta || CAT[x.estado] || x.estado) + (x.no_probado ? " (fuente no probada)" : ""), s: S[est] }, x.detalle,
          (x.enlaces[0] || {}).url || "", x.enlaces.slice(1).map((e) => `${e.texto}: ${e.url}`).join("\n")];
      })),
    });

    hojas.push({
      nombre: "Propietarios",
      columnas: ["Matrícula", "Nombre / razón social", "Tipo documento", "Documento", "Participación", "Fecha consulta VUR"],
      filas: fichas.flatMap((f) => ((f.vur || {}).propietarios || []).map((p) => [f.matricula, p.nombre, p.tipo_documento, p.documento, p.participacion, f.vur.fecha_consulta])),
    });

    hojas.push({
      nombre: "Salvedades y alertas",
      columnas: ["Matrícula", "Tipo", "Fecha", "Radicación", "Descripción"],
      anchos: { "Descripción": 90 },
      filas: fichas.flatMap((f) => {
        const v = f.vur || {};
        return [
          ...(v.salvedades || []).map((s) => [f.matricula, "Salvedad", s.fecha, s.radicacion, `Anotación ${s.anotacion} / corrección ${s.correccion}: ${s.descripcion}`]),
          ...(v.alertas_proteccion || []).map((a) => [f.matricula, "Alerta protección/restitución", "", "", a]),
          ...(v.alertas_procesales || []).map((a) => [f.matricula, "Alerta procesal", "", "", a]),
          ...(v.tramites_en_curso || []).map((a) => [f.matricula, "Trámite en curso", "", "", a]),
        ];
      }),
    });

    const campos = ["matricula", "fecha_consulta", "hora_consulta", "no_consulta", "referencia_catastral", "referencia_catastral_anterior",
      "cedula_catastral", "nupre", "departamento", "municipio", "vereda", "direccion", "direcciones_anteriores", "determinacion",
      "destinacion_economica", "modalidad", "fecha_apertura", "tipo_instrumento", "fecha_instrumento", "estado_folio",
      "matriculas_matriz", "matriculas_derivadas", "tipo_predio", "area_terreno_m2", "area_construida_m2", "area_privada_m2",
      "coeficiente", "area_cabida_texto", "cabida_linderos", "complementaciones"];
    hojas.push({
      nombre: "VUR completo", columnas: campos, anchos: { cabida_linderos: 80, complementaciones: 60 },
      filas: fichas.filter((f) => f.vur).map((f) => campos.map((c) => f.vur[c] ?? "")),
    });

    const camposCat = ["numero_predial", "departamento", "municipio", "zona", "tipo_predio", "condicion_predio", "tipo_derecho",
      "destino_economico", "area_terreno_m2", "area_construida_m2", "vigencia", "nombre_predio", "chip", "cedula_catastral",
      "direccion", "barrio", "codigo_local", "numero_predial_anterior", "matricula_inmobiliaria", "estado_fmi", "fecha_apertura_fmi",
      "area_registral_m2", "estrato", "zona_fisica", "zona_economica", "construcciones", "area_poligono_m2", "avaluo", "uso"];
    hojas.push({
      nombre: "Catastro",
      columnas: ["Matrícula", "Fuente", "Origen", "Estado", "Mensaje", "Enlace para confirmar", ...camposCat, "Latitud", "Longitud"],
      filas: fichas.flatMap((f) => (f.catastro.fuentes || []).map((s) =>
        [f.matricula, s.fuente, s.origen, CAT[s.estado] || s.estado, s.mensaje, ((s.enlaces || [])[0] || {}).url || "", ...camposCat.map((c) => (s.datos || {})[c] ?? ""), s.lat ?? "", s.lon ?? ""])),
    });

    if (excel) {
      const con = fichas.filter((f) => f.registro);
      if (con.length) {
        hojas.push({
          nombre: "Excel enriquecido",
          columnas: [...excel.columnasOriginales.map((c, i) => c || `Columna ${i + 1}`), "MATRÍCULA VUR", "PREDIAL NACIONAL",
            "PREDIAL ANTERIOR VUR", "PROPIETARIOS VUR", "ESTADO FOLIO VUR", "ÁREA VUR (m²)", "ÁREA CATASTRO (m²)", "GESTOR CATASTRAL",
            "RESULTADO CONTRASTE", "ALERTAS", "FECHA INVESTIGACIÓN"],
          filas: con.flatMap((f) => f.excel.registros.map((r) => {
            const v = f.vur || {}, d = f.catastro.datos || {};
            return [...excel.columnasOriginales.map((_, j) => U.limpiar(excel.filas[r._fila][j])),
              v.matricula_normalizada, v.referencia_catastral || d.numero_predial, v.referencia_catastral_anterior, v.propietarios_texto,
              v.estado_folio, v.area_terreno_m2 ?? "", d.area_terreno_m2 ?? "", f.catastro.gestor,
              { v: VEREDICTO[f.resumen.veredicto], s: S[f.resumen.veredicto] }, f.alertas.join("; "), f.fecha];
          })),
        });
      }
    }
    return IP.xlsx.escribir(hojas);
  };
})(typeof window !== "undefined" ? window : globalThis);
