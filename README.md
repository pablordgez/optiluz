# OptiLuz

PWA local para planificar varias cargas domésticas con precios horarios PVPC o una tarifa indexada importada. Sin cuentas ni control de aparatos.

## Desarrollo

Node.js 22 o superior. `npm ci`, `npm run dev`. Interfaz: http://127.0.0.1:5173. Proxy oficial: puerto 3001.

`npm test` verifica las restricciones y los datos. `npm run build` comprueba TypeScript y genera la PWA. `npm start` sirve `dist` y el proxy en http://localhost:3001. En producción, usar HTTPS para instalación, compartir y notificaciones.

## Alcance

- Hoy y mañana; PVPC REE/e·sios, regiones PCB y CYM; caché en memoria del proxy y datos locales en IndexedDB.
- Importación de precios horarios con coma decimal; 23/24/25 precios según la fecha y zona.
- Cinco plantillas, hasta cinco cargas activas, duración en medias horas, consumo medio, potencia simultánea, ventanas, plazo, hora habitual e interrupciones.
- Optimización MILP local en Web Worker con HiGHS (MIT); comparación con el horario habitual.
- Plan compartible mediante enlace autocontenido, PNG, texto y calendario ICS con alarmas.
- Recordatorios mientras la aplicación está abierta, con deduplicación persistente. Para avisos con la aplicación cerrada, importar el ICS en un calendario.
- Modo claro, oscuro y del sistema; instalación PWA y uso sin conexión después de la primera visita.

Los costes son estimaciones de energía con consumo uniforme. El PVPC oficial se convierte de €/MWh a €/kWh, sin añadir impuestos, potencia contratada ni otros conceptos de factura. El límite se aplica únicamente a las cargas incluidas; se reserva margen para otros consumos configurando un límite menor. No se inventan precios cuando la fuente no está disponible. Los días de cambio de hora usan instantes reales y etiquetas con UTC para distinguir horas repetidas.

## Fuente

[API oficial e·sios](https://api.esios.ree.es/doc/archive/download_archive.html), archivo 70 (`PVPC`, columnas `PCB`/`CYM`). Endpoint fijo con validación de fecha, timeout y caché limitada. Ningún dato doméstico se envía al servidor. Los enlaces compartidos incluyen únicamente el plan visible y sus costes en el fragmento URL.
