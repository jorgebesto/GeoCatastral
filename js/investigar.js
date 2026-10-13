/* Arma la ficha de una matrícula: Excel de la empresa + consultas del VUR guardadas + catastro + contraste. */
(function (g) {
  const IP = (g.IP = g.IP || {});
  const U = IP.util;

  // opciones: { vur: consulta recién leída, excel: ExcelEmpresa | null, catastro: true/false }
  IP.investigarMatricula = async function (matricula, opciones = {}) {
    const excel = opciones.excel || null;
    let clave = U.normalizarMatricula(matricula);
    const resExcel = excel ? excel.buscar(clave) : { registros: [], como: "no se ha cargado el Excel" };
    // Si se buscó solo el número y el Excel tiene una única fila, se toma su matrícula completa
    if (!clave.includes("-") && resExcel.registros.length === 1 && resExcel.registros[0].fmi)
      clave = U.normalizarMatricula(resExcel.registros[0].fmi, resExcel.registros[0].circulo) || clave;

    const historialVur = await IP.almacen.vurDe(opciones.vur ? opciones.vur.matricula_normalizada : clave);
    const vur = opciones.vur || historialVur[0] || null;
    if (vur) clave = vur.matricula_normalizada;
    const reg = resExcel.registros[0] || null;

    let catastro;
    if (opciones.catastro === false) {
      catastro = { estado: "omitido", fuentes: [], datos: {}, claves: IP.clavesBusqueda(vur, reg), codigo_dane: "", gestor: "", gestor_info: {}, lat: null, lon: null, anillos: [], visor: "" };
    } else {
      await IP.gestores.asegurar();
      catastro = await IP.consultarCatastro(vur, reg, clave);
    }
    const contraste = IP.contrastar(vur, reg, catastro);

    const alertas = vur ? IP.vur.alertas(vur) : ["No hay consulta del VUR guardada para esta matrícula"];
    if (excel && !resExcel.registros.length) alertas.push("Excel: " + resExcel.como);
    else if (resExcel.registros.length > 1) alertas.push(`Excel: ${resExcel.registros.length} filas con esta matrícula`);
    else if (/revise|sin círculo/.test(resExcel.como)) alertas.push("Excel: encontrada " + resExcel.como);
    if (vur && historialVur.length > 1) {
      const anterior = historialVur.find((h) => h !== vur && h.id !== vur.id);
      if (anterior && anterior.propietarios_texto !== vur.propietarios_texto) alertas.push("Los propietarios cambiaron respecto a una consulta anterior del VUR");
    }
    // Dónde se encontró la información
    const E = IP.CONFIG.enlaces;
    const donde = [];
    donde.push({
      fuente: "Excel de la empresa", origen: "Empresa", estado: reg ? "ok" : (excel ? "no_encontrado" : "sin_datos"),
      etiqueta: reg ? "Encontrado" : (excel ? "No está" : "Sin Excel"),
      detalle: reg ? `${excel.nombreArchivo} · hoja “${excel.hoja}” · fila ${resExcel.registros.map((r) => r._numero).join(", ")}` : (excel ? resExcel.como : "No se ha cargado el Excel"),
      enlaces: [],
    });
    donde.push({
      fuente: "VUR – Superintendencia de Notariado y Registro", origen: "SNR", estado: vur ? "ok" : "sin_datos",
      etiqueta: vur ? "Consulta guardada" : "Sin consulta",
      detalle: vur ? `Consulta${vur.no_consulta ? " No. " + vur.no_consulta : ""} del ${vur.fecha_consulta || vur.guardado || ""} ${vur.hora_consulta || ""} (guardada en este navegador)`.replace(/\s+/g, " ")
                   : "No hay consulta del VUR guardada para esta matrícula",
      enlaces: [{ texto: "Abrir el VUR", url: E.vur }, { texto: "Certificado de tradición (SNR)", url: E.certificado }],
    });
    for (const f of catastro.fuentes || [])
      donde.push({ fuente: f.fuente, origen: f.origen, estado: f.estado, detalle: f.pagina + (f.mensaje ? " — " + f.mensaje : ""), enlaces: [...(f.enlaces || []), ...(f.visor ? [{ texto: "Abrir el visor", url: f.visor }] : [])], no_probado: f.no_probado });

    return {
      donde,
      matricula: clave, vur, historialVur, excel: resExcel, registro: reg, catastro,
      contraste: contraste.filas, resumen: contraste.resumen, alertas, fecha: U.ahora(),
    };
  };
})(typeof window !== "undefined" ? window : globalThis);
