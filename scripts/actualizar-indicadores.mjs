// Descarga IPC mensual, dólar blue y RIPTE y los guarda en data/indicadores.json.
// Fuente principal: api.argentinadatos.com. Respaldo para el IPC: API de series de datos.gob.ar (INDEC).
// RIPTE: CSV de la serie mensual en datos.gob.ar (Secretaría de Trabajo).
import { writeFile, readFile } from "node:fs/promises";

const SALIDA = new URL("../data/indicadores.json", import.meta.url);
const DESDE = "2023-01";
const HEADERS = { "User-Agent": "cuota-del-cole-tracker (github.com/germanfagliano)" };

async function get(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res;
}
const getJSON = (url) => get(url).then((r) => r.json());

async function ipcArgentinaDatos() {
  const datos = await getJSON("https://api.argentinadatos.com/v1/finanzas/indices/inflacion");
  return datos
    .map((d) => ({ mes: d.fecha.slice(0, 7), variacion: d.valor }))
    .filter((d) => d.mes >= DESDE);
}

async function ipcDatosGobAr() {
  // Índice IPC nacional nivel general, base dic-2016
  const url = "https://apis.datos.gob.ar/series/api/series/?ids=148.3_INIVELNAL_DICI_M_26&limit=5000&format=json&start_date=2022-12-01";
  const { data } = await getJSON(url);
  const out = [];
  for (let i = 1; i < data.length; i++) {
    out.push({ mes: data[i][0].slice(0, 7), variacion: +((data[i][1] / data[i - 1][1] - 1) * 100).toFixed(1) });
  }
  return out.filter((d) => d.mes >= DESDE);
}

async function blueMensual() {
  const datos = await getJSON("https://api.argentinadatos.com/v1/cotizaciones/dolares/blue");
  const porMes = new Map();
  for (const d of datos) {
    const mes = d.fecha.slice(0, 7);
    if (mes < DESDE) continue;
    if (!porMes.has(mes)) porMes.set(mes, []);
    porMes.get(mes).push(d);
  }
  return [...porMes.entries()].map(([mes, dias]) => ({
    mes,
    promedio_venta: Math.round(dias.reduce((s, d) => s + d.venta, 0) / dias.length),
    cierre_venta: dias[dias.length - 1].venta,
  }));
}

async function ripteMensual() {
  const url = "https://infra.datos.gob.ar/catalog/sspm/dataset/158/distribution/158.1/download/remuneracion-imponible-promedio-trabajadores-estables-ripte-total-pais-pesos-serie-mensual.csv";
  const filas = (await get(url).then((r) => r.text())).trim().split(/\r?\n/).slice(1);
  const out = filas
    .map((f) => f.split(","))
    .map(([fecha, valor]) => ({ mes: fecha.slice(0, 7), valor: Math.round(+valor) }))
    .filter((d) => d.mes >= DESDE && d.valor > 0);
  if (!out.length) throw new Error("CSV de RIPTE vacío");
  return out;
}

async function blueHoy() {
  const d = await getJSON("https://dolarapi.com/v1/dolares/blue");
  return { fecha: d.fechaActualizacion, compra: d.compra, venta: d.venta };
}

async function intentar(nombre, ...fuentes) {
  for (const f of fuentes) {
    try {
      return await f();
    } catch (e) {
      console.warn(`${nombre}: ${e.message}`);
    }
  }
  return null;
}

const anterior = await readFile(SALIDA, "utf8").then(JSON.parse).catch(() => ({}));

const ipc = await intentar("IPC", ipcArgentinaDatos, ipcDatosGobAr);
const blue = await intentar("Blue", blueMensual);
const hoy = await intentar("Blue hoy", blueHoy);
const ripte = await intentar("RIPTE", ripteMensual);

const salida = {
  actualizado: new Date().toISOString(),
  ipc: ipc ?? anterior.ipc,
  blue: blue ?? anterior.blue,
  blue_hoy: hoy ?? (blue ? { fecha: blue.at(-1).mes, venta: blue.at(-1).cierre_venta } : anterior.blue_hoy),
  ripte: ripte ?? anterior.ripte,
};

if (!salida.ipc || !salida.blue || !salida.ripte) {
  console.error("No se pudieron obtener los indicadores y no hay datos previos.");
  process.exit(1);
}

await writeFile(SALIDA, JSON.stringify(salida, null, 1) + "\n");
console.log(`IPC hasta ${salida.ipc.at(-1).mes}, blue hasta ${salida.blue.at(-1).mes}, blue hoy $${salida.blue_hoy.venta}, RIPTE hasta ${salida.ripte.at(-1).mes}`);
