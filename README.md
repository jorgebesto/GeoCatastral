# Investigador de predios

Página web para reunir toda la información de una **matrícula inmobiliaria**:

- la fila del Excel de la empresa;
- la consulta "Datos Básicos" del VUR: propietarios, número predial nuevo y anterior, salvedades, alertas y cabida;
- el catastro:
  - la base catastral nacional **SINIC** del IGAC, que tiene lo que reportan todos los gestores del país;
  - el geoportal local cuando hay uno (Bogotá y Medellín).

Con eso arma una ficha que compara las tres fuentes campo por campo y deja descargar todo en Excel.

Es una página estática: solo HTML y JavaScript, sin servidor. El Excel de la empresa y las consultas del VUR se guardan **solo en el navegador** de quien la usa. Al catastro solo se envía el número predial.

## Publicarla en GitHub Pages

1. En GitHub cree un repositorio nuevo, por ejemplo `investigador-predios`. Puede ser público: no contiene datos de nadie.
2. Suba el contenido de esta carpeta: **Add file → Upload files** y arrastre todo, incluido `.nojekyll`.
   - O por consola:
     ```
     git init
     git add .
     git commit -m "Investigador de predios"
     git branch -M main
     git remote add origin https://github.com/SU_USUARIO/investigador-predios.git
     git push -u origin main
     ```
3. En el repositorio entre a **Settings → Pages**. En "Branch" elija `main` y la carpeta `/ (root)`, y luego **Save**.
4. En uno o dos minutos la página queda en `https://SU_USUARIO.github.io/investigador-predios/`.

También funciona como "Static Site" en Render, o abriendo `index.html` con doble clic.

**Importante:** no suba al repositorio Excel reales de la empresa ni PDF del VUR. El `.gitignore` ya los bloquea.

## Cómo se usa

La página tiene dos pestañas: **Un predio** y **Varios predios**.

### Un predio

1. **Excel de la empresa.** Se carga una vez y queda guardado en ese navegador.
   - La página busca la fila de encabezados que tiene "FMI".
   - Reconoce las columnas de su formato: FMI, CÍRCULO REGISTRAL, MUNICIPIO, DIRECCIÓN, CÉDULA CATASTRAL, ENCARGADO, ESTADO…
   - Tiene que ser .xlsx.
2. **Consulta del VUR.** En el VUR abra "Datos Básicos" de la matrícula.
   - Seleccione toda la pantalla (Ctrl+A), cópiela (Ctrl+C), péguela en la página y presione **Leer y buscar**.
   - También puede subir el PDF de la consulta.
   - Cada consulta queda guardada en el navegador.
3. **Buscar una matrícula.** Escriba la matrícula arriba. La ficha muestra:
   - **Contraste** Excel / VUR / Catastro, campo por campo. Debajo de cada dato del catastro aparece de qué fuente salió.
   - **Dónde se encontró la información:** una fila por fuente con lo siguiente:
     - la página donde se encontró;
     - si es del **IGAC** o del **geoportal del gestor**;
     - la fila exacta del Excel y el número de consulta del VUR;
     - el **enlace de la búsqueda** para confirmarla, que abre la misma consulta en la página del servicio.
   - Propietarios, folio, salvedades, cabida y linderos, mapa del polígono, gestor catastral con su contacto y consultas anteriores del VUR.
4. **Descargar Excel.** Baja un libro con estas hojas:
   - Resumen
   - Contraste
   - Fuentes, con los enlaces de confirmación
   - Propietarios
   - Salvedades y alertas
   - VUR completo
   - Catastro
   - Excel enriquecido

### Varios predios

1. Escriba o pegue las matrículas, una por línea. También puede pegar varias consultas del VUR seguidas, o presionar **Agregar matrículas del Excel**, filtrando por estado, encargado o municipio.
2. Presione **Investigar todas**. La página consulta de a dos predios a la vez y muestra el avance. Se puede detener.
3. La tabla muestra, por predio:
   - el resultado del contraste;
   - el número predial;
   - **en qué fuentes se encontró**: cada una es un enlace para confirmar la búsqueda, con su etiqueta IGAC o gestor;
   - el área según el VUR y según el catastro;
   - las alertas.
4. **Ver ficha** abre la ficha completa de ese predio en la otra pestaña. **Descargar Excel** baja el resultado de todos los predios.

## De dónde sale la información del catastro

La página primero averigua quién es el gestor catastral del municipio. Para eso usa el código DANE del número predial y el directorio oficial del IGAC. Luego consulta, en este orden:

| Fuente | Origen | Se busca por | Qué trae | Cobertura |
|---|---|---|---|---|
| Catastro Bogotá – IDECA | Gestor | Número predial, CHIP, cédula catastral | Dirección, barrio, áreas, destino, uso, polígono | Bogotá |
| Catastro Medellín – GeoMedellín | Gestor | Número predial (21 dígitos) | CBML, área y polígono del lote | Medellín |
| Catastro Barranquilla – datos abiertos | Gestor | **Matrícula inmobiliaria (círculo 040)**, número predial nuevo o anterior | Estado y apertura del folio, áreas catastral y registral, destino, estrato, NUPRE, dirección, polígono | Barranquilla |
| Área Metropolitana de Bucaramanga | Gestor | Número predial nuevo o anterior | Polígono del terreno | Bucaramanga, Girón, Piedecuesta |
| Cali – información histórica de predios (datos abiertos) | Gestor | Número predial | Áreas, avalúo, usos (vigencia 2022). **No probado** | Cali |
| Base catastral pública del IGAC | IGAC | **Número predial nuevo o anterior (20 dígitos)** | Dirección, destino, áreas de terreno y construida, zonas físicas y económicas, construcciones (pisos, habitaciones, baños), polígono | Municipios a cargo del IGAC |
| SINIC – IGAC | IGAC | Número predial nacional (30) | Tipo y condición del predio, destino, área catastral, zona, vigencia, tipo de derecho, polígono | Todo el país |

Con el predial anterior de 20 dígitos (la "cédula catastral" de su Excel), los municipios del IGAC se pueden investigar sin la consulta del VUR. En Barranquilla basta la matrícula.

Los demás gestores (Antioquia, Cundinamarca, Valle de Aburrá, AMCO, Santa Marta, Cúcuta, Ibagué, Villavicencio, Neiva, Montería, Soacha y los municipios con catastro propio) no publican un servicio consultable. Para ellos queda el SINIC.

Para agregar otro geoportal edite `js/config.js` (sección `por_municipio`).

## Cosas a tener en cuenta

- **Propietarios:** el catastro público no publica propietarios, así que solo salen del VUR.
  - Si hubo ventas parciales, el VUR solo muestra a quienes intervinieron en la última.
  - Si hay usufructo, muestra a los beneficiarios.
- **Áreas:** la cabida del VUR se lee del texto (ha, m², varas, fanegadas, plazas, cuadras). Al compararla con el catastro:
  - hasta 5 % de diferencia es "Coincide";
  - hasta 15 % es "Revisar";
  - más de 15 % es "Diferente".
- **PDF del VUR:** la lectura se hizo para el texto copiado de la pantalla, que está probado. La del PDF no se ha probado con un PDF real.
- **Servicios caídos:** si un servicio del catastro no responde, la ficha muestra el error y deja el enlace para consultarlo a mano.
- **Enlaces de confirmación:** abren la misma búsqueda en la página del servicio (formato de tabla del servidor ArcGIS o JSON de datos abiertos). Así se ve el registro original tal como lo publica el IGAC o el gestor.
- **Datos guardados:** quedan en ese navegador y en ese computador. Si se borran los datos de navegación, se pierden. El botón "Borrar todos los datos de este navegador" los quita a propósito.

## Archivos

```
index.html          la página
css/estilos.css     diseño
js/utils.js         textos, matrículas, áreas
js/vur.js           lector de la consulta del VUR (texto y PDF)
js/xlsx.js          lectura y escritura de .xlsx sin librerías
js/excel.js         Excel de la empresa y búsqueda por FMI
js/config.js        fuentes del catastro (aquí se agregan geoportales)
js/arcgis.js        consultas a servicios ArcGIS (fetch y JSONP)
js/gestores.js      directorio de gestores catastrales del IGAC
js/geoportales.js   SINIC, base pública IGAC, Bogotá, Medellín, Barranquilla, AMB, Cali
js/contraste.js     comparación campo a campo
js/almacen.js       lo que se guarda en el navegador
js/investigar.js    arma la ficha de una matrícula
js/reporte.js       Excel de salida
js/app.js           interfaz
tests/prueba.mjs    pruebas sin internet:  node tests/prueba.mjs
ejemplos/           consulta del VUR y Excel de prueba (datos ficticios)
```
