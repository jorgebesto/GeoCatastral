/* Fuentes de información catastral.
   - "origen" dice si la fuente es del IGAC o del geoportal del gestor catastral del municipio.
   - Para agregar el geoportal de otro municipio copie un bloque de 'por_municipio' de tipo "capas",
     cambie el código DANE, las URL de las capas y el campo que guarda el número predial.
     'digitos' = cuántos dígitos del número predial nacional guarda ese campo (30 completo, 21 solo terreno). */
(function (g) {
  const IP = (g.IP = g.IP || {});
  const IGAC = "https://services2.arcgis.com/RVvWzU3lgJISqdke/arcgis/rest/services/CATASTRO_PUBLICO_31082026/FeatureServer";
  const AMB = "https://mapa.amb.gov.co/server/rest/services";

  IP.CONFIG = {
    // Base catastral nacional SINIC (IGAC): lo que reportan TODOS los gestores catastrales del país.
    sinic: {
      nombre: "SINIC – Base catastral nacional",
      origen: "IGAC",
      pagina: "IGAC · Sistema Nacional de Información Catastral (sigi.igac.gov.co)",
      predio: "https://sigi.igac.gov.co/habilitacion/rest/services/sinic/SINIC_DA/FeatureServer/1",
      terreno: "https://sigi.igac.gov.co/habilitacion/rest/services/sinic/SINIC_DA/FeatureServer/3",
      visor: "https://www.colombiaenmapas.gov.co/",
    },
    // Base catastral pública del IGAC como gestor (solo municipios a cargo del IGAC). Permite buscar por predial anterior.
    igac_publico: {
      nombre: "Base catastral pública del IGAC (agosto 2026)",
      origen: "IGAC",
      pagina: "IGAC · Base Catastral Pública del Gestor IGAC (ArcGIS Online)",
      r1: IGAC + "/17",
      r2: IGAC + "/18",
      u_terreno: IGAC + "/7",
      r_terreno: IGAC + "/14",
      visor: "https://www.colombiaenmapas.gov.co/",
    },
    // Directorio oficial de gestores catastrales (IGAC)
    gestores: "https://services2.arcgis.com/RVvWzU3lgJISqdke/arcgis/rest/services/CAPA_GESTORES_10062026/FeatureServer/0",

    // Geoportales de gestores catastrales con servicio consultable
    por_municipio: {
      "11001": {
        conector: "bogota",
        nombre: "Catastro Bogotá (UAECD) – IDECA",
        origen: "Gestor catastral",
        pagina: "Catastro Bogotá · IDECA (serviciosgis.catastrobogota.gov.co)",
        predio: "https://serviciosgis.catastrobogota.gov.co/arcgis/rest/services/catastro/lote/MapServer/3",
        lote: "https://serviciosgis.catastrobogota.gov.co/arcgis/rest/services/catastro/lote/MapServer/0",
        visor: "https://mapas.bogota.gov.co/",
      },
      "05001": {
        conector: "capas",
        nombre: "Catastro Medellín – GeoMedellín",
        origen: "Gestor catastral",
        pagina: "Catastro Medellín · GeoMedellín (medellin.gov.co/servidormapas)",
        capas: ["https://www.medellin.gov.co/servidormapas/rest/services/vivienda_ciudad_terri/VC_Catastro_VCT/MapServer/7"],
        campo_codigo: "mz_igac",
        digitos: 21,
        campos: { codigo_local: "cbml", area_terreno_m2: "area_lote", tipo_lote: "tipo_lote" },
        visor: "https://www.medellin.gov.co/geomedellin/",
      },
      "08001": {
        conector: "barranquilla",
        nombre: "Catastro Barranquilla – datos abiertos",
        origen: "Gestor catastral",
        pagina: "Catastro Barranquilla · Datos abiertos (miciudad.barranquilla.gov.co)",
        circulo: "040",
        predio: "https://miciudad.barranquilla.gov.co/gis/rest/services/catastro/datosabiertos/FeatureServer/500",
        rel_direccion: 2,
        rel_terreno: 8,
        visor: "https://catastro.barranquilla.gov.co/",
      },
      "68001": {
        conector: "capas",
        nombre: "Área Metropolitana de Bucaramanga – terrenos de Bucaramanga",
        origen: "Gestor catastral",
        pagina: "AMB · Servidor de mapas (mapa.amb.gov.co)",
        capas: [AMB + "/Unidad_terreno_BGA/MapServer/1", AMB + "/Unidad_terreno_BGA/MapServer/3"],
        campo_codigo: "terreno_codigo", digitos: 30, campo_anterior: "local_id",
        campos: { area_poligono_m2: "shape_Area" },
        visor: "https://mapa.amb.gov.co/",
      },
      "68307": {
        conector: "capas",
        nombre: "Área Metropolitana de Bucaramanga – terrenos de Girón",
        origen: "Gestor catastral",
        pagina: "AMB · Servidor de mapas (mapa.amb.gov.co)",
        capas: [AMB + "/VISOR/Unidad_Terreno_Giron/MapServer/1", AMB + "/VISOR/Unidad_Terreno_Giron/MapServer/3"],
        campo_codigo: "terreno_codigo", digitos: 30, campo_anterior: "local_id",
        campos: { area_poligono_m2: "shape_Area" },
        visor: "https://mapa.amb.gov.co/",
      },
      "68547": {
        conector: "capas",
        nombre: "Área Metropolitana de Bucaramanga – terrenos de Piedecuesta",
        origen: "Gestor catastral",
        pagina: "AMB · Servidor de mapas (mapa.amb.gov.co)",
        capas: [AMB + "/VISOR/Unidad_Terreno_Piedecuesta/MapServer/1", AMB + "/VISOR/Unidad_Terreno_Piedecuesta/MapServer/3"],
        campo_codigo: "terreno_codigo", digitos: 30, campo_anterior: "local_id",
        campos: { area_poligono_m2: "shape_Area" },
        visor: "https://mapa.amb.gov.co/",
      },
      "76001": {
        conector: "ckan",
        nombre: "Catastro Cali – información histórica de predios 2022",
        origen: "Gestor catastral",
        pagina: "Alcaldía de Cali · Datos abiertos (datos.cali.gov.co)",
        api: "https://datos.cali.gov.co/api/3/action/datastore_search",
        recurso: "3e57732e-cc1c-44fd-9f38-01515dd865b3",
        no_probado: true,
        visor: "https://datos.cali.gov.co/dataset/informacion-historica-de-predios-de-santiago-de-cali",
      },
    },

    enlaces: {
      vur: "https://www.vur.gov.co/",
      certificado: "https://certificados.supernotariado.gov.co/certificado",
      igac_tramites: "https://vivi.igac.gov.co/",
      colombia_en_mapas: "https://www.colombiaenmapas.gov.co/",
    },
  };

  // Destino económico (códigos IGAC, Resolución 70 de 2011)
  IP.DESTINOS_IGAC = {
    A: "Habitacional", B: "Industrial", C: "Comercial", D: "Agropecuario", E: "Minero", F: "Cultural",
    G: "Recreacional", H: "Salubridad", I: "Institucional", J: "Educativo", K: "Religioso", L: "Agrícola",
    M: "Pecuario", N: "Agroindustrial", O: "Forestal", P: "Uso público", Q: "Servicios especiales",
    R: "Lote urbanizable no urbanizado", S: "Lote urbanizable no edificado", T: "Lote no urbanizable",
  };
})(typeof window !== "undefined" ? window : globalThis);
