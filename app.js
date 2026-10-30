const SERIES = [
  { id: "primaria", corto: "Primaria", tipo: "cuota", color: 1, defecto: true },
  { id: "inicial_js", corto: "Inicial JS", tipo: "cuota", color: 2, defecto: true },
  { id: "inicial_jc", corto: "Inicial JC", tipo: "cuota", color: 3 },
  { id: "secundaria", corto: "Secundaria", tipo: "cuota", color: 4 },
  // `cuota`: contra qué cuota se compara el comedor en la vista "Comedor vs. cuota"
  { id: "comedor_maternal", corto: "Comedor maternal", tipo: "comedor", color: 5, defectoComedor: true, cuota: "inicial_jc" },
  { id: "comedor_infantes", corto: "Comedor jardín", tipo: "comedor", color: 6, defectoComedor: true, cuota: "inicial_jc" },
  { id: "comedor_primer_ciclo", corto: "Comedor 1er ciclo", tipo: "comedor", color: 7, defectoComedor: true, cuota: "primaria" },
  { id: "comedor_segundo_ciclo", corto: "Comedor 2do ciclo", tipo: "comedor", color: 8, cuota: "primaria" },
];
const NIVELES_RESERVA = ["inicial_js", "inicial_jc", "primaria", "secundaria"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const PRIMER_MES = "2023-09";

const $ = (s) => document.querySelector(s);
const SVGNS = "http://www.w3.org/2000/svg";
const nf0 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// ---------- utilidades de meses ----------
const sumarMes = (m, n) => {
  const [y, mm] = m.split("-").map(Number);
  const t = y * 12 + (mm - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};
const nombreMes = (m) => `${MESES[+m.slice(5) - 1]} ${m.slice(0, 4)}`;
const nombreMesCorto = (m) => `${MESES[+m.slice(5) - 1]}-${m.slice(2, 4)}`;
const mesActual = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
function rangoMeses(desde, hasta) {
  const out = [];
  for (let m = desde; m <= hasta; m = sumarMes(m, 1)) out.push(m);
  return out;
}

// ---------- formato ----------
const pesos = (v) => (v == null ? "–" : `$ ${nf0.format(Math.round(v))}`);
const usd = (v) => (v == null ? "–" : `US$ ${nf0.format(Math.round(v))}`);
const pct = (r) => (r == null ? "–" : `${r >= 0 ? "+" : "−"}${nf1.format(Math.abs(r * 100))}%`);
function pesosCorto(v) {
  if (Math.abs(v) >= 1e6) return `$ ${nf1.format(v / 1e6).replace(",0", "")} M`;
  if (Math.abs(v) >= 1e3) return `$ ${nf0.format(v / 1e3)} mil`;
  return `$ ${nf0.format(v)}`;
}

function el(tag, attrs = {}, ...hijos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "style") e.style.cssText = v;
    else e.setAttribute(k, v);
  }
  for (const h of hijos) if (h != null) e.append(h instanceof Node ? h : document.createTextNode(String(h)));
  return e;
}
function sv(tag, attrs = {}) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}
const colorDe = (s) => `var(--series-${s.color})`;

// ---------- datos ----------
const [aranceles, comedor, reserva, indicadores, paritaria] = await Promise.all(
  ["aranceles", "comedor", "reserva", "indicadores", "paritaria"].map((n) => fetch(`data/${n}.json`).then((r) => r.json())),
);

const nombres = Object.fromEntries([...aranceles.niveles, ...comedor.categorias].map((n) => [n.id, n.nombre]));
for (const s of SERIES) s.nombre = nombres[s.id];

const FIN = [mesActual(), indicadores.blue.at(-1).mes].sort().at(-1);
const MESES_TODOS = rangoMeses(PRIMER_MES, FIN);

// IPC como índice de nivel (fin de cada mes); los meses sin publicar repiten el último dato.
const ipcVar = new Map(indicadores.ipc.map((d) => [d.mes, d.variacion]));
const IPC_HASTA = indicadores.ipc.at(-1).mes;
const ipcNivel = new Map();
{
  let nivel = 100;
  for (const m of rangoMeses(indicadores.ipc[0].mes, FIN)) {
    if (ipcVar.has(m)) nivel *= 1 + ipcVar.get(m) / 100;
    ipcNivel.set(m, nivel);
  }
}
const bluePorMes = new Map(indicadores.blue.map((d) => [d.mes, d.promedio_venta]));
const blueDe = (m) => bluePorMes.get(m) ?? indicadores.blue_hoy.venta;
// RIPTE: los meses sin publicar repiten el último dato.
const riptePorMes = new Map(indicadores.ripte.map((d) => [d.mes, d.valor]));
const RIPTE_HASTA = indicadores.ripte.at(-1).mes;
const ripteDe = (m) => riptePorMes.get(m > RIPTE_HASTA ? RIPTE_HASTA : m);
const docenteDe = (m) => vigenciaEn(paritaria.vigencias, m)?.valor ?? null;
// Valor de cada referencia en un mes; las líneas de comparación usan el cociente entre dos meses.
const INDICES = { ipc: (m) => ipcNivel.get(m), blue: blueDe, ripte: ripteDe, docente: docenteDe };

function vigenciaEn(vigencias, mes) {
  let v = null;
  for (const x of vigencias) if (x.desde <= mes) v = x;
  return v;
}
function valorNominal(serie, mes, precio) {
  if (serie.tipo === "cuota") {
    const v = vigenciaEn(aranceles.vigencias, mes);
    return v ? v[precio][serie.id] : null;
  }
  const v = vigenciaEn(comedor.vigencias, mes);
  return v ? v.valores[serie.id] : null;
}

// ---------- estado ----------
const estado = {
  rango: "todo",
  precio: "lista",
  vista: "pesos",
  activas: new Set(SERIES.filter((s) => s.defecto).map((s) => s.id)),
  comedores: new Set(SERIES.filter((s) => s.defectoComedor).map((s) => s.id)), // series de la vista "Comedor vs. cuota"
  refs: new Set(["ipc"]), // líneas de comparación en la vista en pesos: "ipc", "blue", "ripte", "docente"
  cursor: null,
};
const REFS = {
  ipc: { clase: "ref-ipc", sufijo: "si siguiera al IPC" },
  blue: { clase: "ref-blue", sufijo: "si siguiera al blue" },
  ripte: { clase: "ref-ripte", sufijo: "si siguiera al RIPTE" },
  docente: { clase: "ref-docente", sufijo: "si siguiera al sueldo docente" },
};
const leerURL = () => {
  const p = new URLSearchParams(location.hash.slice(1));
  for (const k of ["rango", "precio", "vista"]) {
    const v = p.get(k);
    if (v && document.querySelector(`input[name=${k}][value="${v}"]`)) estado[k] = v;
  }
  for (const [param, clave] of [["series", "activas"], ["comedores", "comedores"]]) {
    if (!p.get(param)) continue;
    const ids = p.get(param).split(",").filter((id) => SERIES.some((s) => s.id === id && (clave === "activas" || s.tipo === "comedor")));
    if (ids.length) estado[clave] = new Set(ids);
  }
  if (p.has("comparar")) estado.refs = new Set(p.get("comparar").split(",").filter((r) => r in REFS));
};
const escribirURL = () => {
  const p = new URLSearchParams({ rango: estado.rango, precio: estado.precio, vista: estado.vista, series: [...estado.activas].join(",") });
  p.set("comedores", [...estado.comedores].join(","));
  p.set("comparar", [...estado.refs].join(","));
  history.replaceState(null, "", `#${p}`);
};

// ---------- cálculo del período ----------
function periodo() {
  let inicio = estado.rango === "todo" ? PRIMER_MES : estado.rango === "12m" ? sumarMes(FIN, -12) : estado.rango;
  if (inicio < PRIMER_MES) inicio = PRIMER_MES;
  const activas = SERIES.filter((s) => estado.activas.has(s.id));
  return { inicio, meses: rangoMeses(inicio, FIN), activas };
}

// La vista "Comedor vs. cuota" tiene su propia selección de comedores.
const seleccionActual = () => (estado.vista === "comedor" ? estado.comedores : estado.activas);
function seriesDelGrafico(activas) {
  return estado.vista === "comedor" ? SERIES.filter((s) => estado.comedores.has(s.id)) : activas;
}
const cuotaDe = (serie) => SERIES.find((s) => s.id === serie.cuota);

function transformar(serie, mes) {
  const v = valorNominal(serie, mes, estado.precio);
  if (v == null) return null;
  switch (estado.vista) {
    case "real":
      return (v * ipcNivel.get(IPC_HASTA)) / ipcNivel.get(mes);
    case "usd":
      return v / blueDe(mes);
    case "comedor": {
      const c = valorNominal(cuotaDe(serie), mes, estado.precio);
      return c ? (v / c) * 100 : null;
    }
    default:
      return v;
  }
}
// Cuánto costaría la serie si desde su primer mes en el período hubiera seguido al IPC, al dólar blue, al RIPTE o al sueldo docente.
function lineasReferencia(serie, meses) {
  const desde = meses.find((m) => valorNominal(serie, m, estado.precio) != null);
  if (!desde) return [];
  const v0 = valorNominal(serie, desde, estado.precio);
  return [...estado.refs].map((r) => ({
    r,
    valores: meses.map((m) => (m < desde ? null : (v0 * INDICES[r](m)) / INDICES[r](desde))),
  }));
}

const formatoVista = (v) =>
  estado.vista === "usd" ? usd(v) : estado.vista === "comedor" ? `${nf1.format(v)}%` : pesos(v);
const formatoEje = (v) =>
  estado.vista === "usd" ? `US$ ${nf0.format(v)}` : estado.vista === "comedor" ? `${nf0.format(v)}%` : pesosCorto(v);

// ---------- tiles ----------
function renderTiles() {
  const c = $("#tiles");
  c.replaceChildren();
  const tile = (etiqueta, valor, detalle) =>
    c.append(el("div", { class: "tile" }, el("div", { class: "etiqueta" }, etiqueta), el("div", { class: "valor" }, valor), el("div", { class: "detalle" }, detalle)));

  const bh = indicadores.blue_hoy;
  const fechaBlue = new Date(bh.fecha);
  tile("Dólar blue hoy", pesos(bh.venta), isNaN(fechaBlue) ? "venta" : `venta · ${fechaBlue.toLocaleDateString("es-AR")}`);

  tile(`Inflación de ${nombreMes(IPC_HASTA)}`, `${nf1.format(ipcVar.get(IPC_HASTA))}%`, "IPC INDEC, último dato publicado");
  const ipc12 = ipcNivel.get(IPC_HASTA) / ipcNivel.get(sumarMes(IPC_HASTA, -12)) - 1;
  tile("Inflación últimos 12 meses", pct(ipc12), `${nombreMesCorto(sumarMes(IPC_HASTA, -11))} a ${nombreMesCorto(IPC_HASTA)}`);

  const prim = SERIES[0];
  const hoy = valorNominal(prim, FIN, estado.precio);
  const hace12 = valorNominal(prim, sumarMes(FIN, -12), estado.precio);
  tile(
    `Cuota primaria ${estado.precio === "lista" ? "de lista" : "con pronto pago"}`,
    pesos(hoy),
    `${usd(hoy / blueDe(FIN))} blue · ${pct(hoy / hace12 - 1)} en 12 meses`,
  );
}

// ---------- selector de series (también es la leyenda) ----------
function renderSelectorSeries() {
  const c = $("#series");
  c.querySelectorAll(".serie, .separador").forEach((n) => n.remove());
  let tipoPrevio = null;
  for (const s of SERIES) {
    if (tipoPrevio && s.tipo !== tipoPrevio) c.append(el("span", { class: "separador" }));
    tipoPrevio = s.tipo;
    const input = el("input", { type: "checkbox", value: s.id });
    input.checked = seleccionActual().has(s.id);
    input.addEventListener("change", () => {
      const sel = seleccionActual();
      if (input.checked) sel.add(s.id);
      else sel.delete(s.id);
      if (!sel.size) {
        sel.add(s.id);
        input.checked = true;
      }
      render();
    });
    c.append(el("label", { class: "serie", "data-tipo": s.tipo, style: `--c:${colorDe(s)}`, title: s.nombre }, input, el("span", { class: "marca" }), el("span", { class: "clave" }), s.nombre));
  }
}

// ---------- gráfico ----------
function escalaLinda(max) {
  const crudo = max / 5;
  const pot = 10 ** Math.floor(Math.log10(crudo));
  const paso = [1, 2, 2.5, 5, 10].map((f) => f * pot).find((p) => p >= crudo);
  return { paso, tope: Math.ceil(max / paso) * paso };
}

const AYUDAS = {
  pesos: "Valor mensual en pesos, tal como lo cobra el colegio.",
  real: () => `Valores ajustados por inflación a pesos de ${nombreMes(IPC_HASTA)}. Si la línea sube, aumentó más que el IPC.`,
  usd: "Valor mensual dividido por el dólar blue promedio de cada mes.",
  comedor: () =>
    `Cuánto representa el comedor sobre la cuota ${estado.precio === "lista" ? "de lista" : "con pronto pago"} del mismo nivel: ` +
    "comedor maternal y jardín contra la cuota de inicial jornada completa; comedor de primaria contra la cuota de primaria. 100% = el comedor cuesta lo mismo que la cuota.",
};
const TITULOS = {
  pesos: "Valor mensual en pesos",
  real: "Valor mensual en pesos de hoy",
  usd: "Valor mensual en dólares blue",
  comedor: "Peso del comedor sobre la cuota",
};

let geom = null;

function renderGrafico() {
  const { meses, activas } = periodo();
  $("#series").classList.toggle("solo-comedor", estado.vista === "comedor");
  $("#titulo-grafico").textContent = TITULOS[estado.vista];
  const ayuda = AYUDAS[estado.vista];
  const conRefs = estado.vista === "pesos" && estado.refs.size > 0;
  $("#referencias").hidden = estado.vista !== "pesos";
  let textoAyuda = typeof ayuda === "function" ? ayuda() : ayuda;
  if (conRefs) {
    const partes = [];
    if (estado.refs.has("ipc")) partes.push("la raya larga muestra cuánto costaría si hubiera aumentado igual que el IPC");
    if (estado.refs.has("blue")) partes.push("la línea de puntos, si hubiera mantenido su valor en dólares blue");
    if (estado.refs.has("ripte")) partes.push("raya y punto, si hubiera aumentado igual que los salarios formales (RIPTE)");
    if (estado.refs.has("docente")) partes.push("raya y dos puntos, si hubiera aumentado igual que el sueldo docente bonaerense");
    textoAyuda += ` Desde ${nombreMes(meses[0])} (o el primer mes con dato), ${partes.join("; ")}.`;
  }
  $("#ayuda-vista").textContent = textoAyuda;

  const series = seriesDelGrafico(activas).map((s) => ({
    s,
    valores: meses.map((m) => transformar(s, m)),
    refs: conRefs ? lineasReferencia(s, meses) : [],
  }));

  const svg = $("#svg");
  svg.replaceChildren();
  const W = svg.clientWidth || 800;
  const H = svg.clientHeight || 420;
  const angosto = W < 640;
  const conEtiquetas = !angosto && series.length <= 5;
  const M = { l: 70, r: conEtiquetas ? 170 : 14, t: 14, b: 30 };
  const iw = W - M.l - M.r;
  const ih = H - M.t - M.b;

  const todos = series.flatMap((x) => [...x.valores, ...x.refs.flatMap((r) => r.valores)]).filter((v) => v != null);
  const { paso, tope } = escalaLinda(Math.max(...todos) * 1.04);
  const x = (i) => M.l + (meses.length === 1 ? 0 : (i / (meses.length - 1)) * iw);
  const y = (v) => M.t + ih - (v / tope) * ih;

  // grilla y eje Y
  const gGrid = sv("g", { class: "grid" });
  const gEje = sv("g", { class: "eje" });
  for (let v = 0; v <= tope + 1e-9; v += paso) {
    if (v > 0) gGrid.append(sv("line", { x1: M.l, x2: M.l + iw, y1: y(v), y2: y(v) }));
    const t = sv("text", { x: M.l - 10, y: y(v) + 4, "text-anchor": "end" });
    t.textContent = formatoEje(v);
    gEje.append(t);
  }
  svg.append(gGrid);
  svg.append(sv("line", { class: "base", x1: M.l, x2: M.l + iw, y1: y(0), y2: y(0) }));

  // eje X
  const anchoMes = iw / Math.max(1, meses.length - 1);
  let ultimaX = -Infinity;
  meses.forEach((m, i) => {
    const mm = +m.slice(5);
    let txt = null;
    if (anchoMes >= 34) txt = mm === 1 ? m.slice(0, 4) : MESES[mm - 1];
    else if (mm === 1) txt = m.slice(0, 4);
    else if (anchoMes >= 12 && mm % 3 === 1) txt = MESES[mm - 1];
    else if (anchoMes < 12 && mm === 7 && !angosto) txt = "jul";
    if (i === 0 && mm !== 1 && txt == null) txt = nombreMesCorto(m);
    if (txt == null) return;
    // evitar que la etiqueta del primer mes ("sep-23") se pise con la siguiente
    const separacion = i === 0 ? 0 : x(i) - ultimaX;
    if (i > 0 && separacion < (ultimaX === x(0) ? 58 : 30)) return;
    ultimaX = x(i);
    const t = sv("text", { x: x(i), y: M.t + ih + 20, "text-anchor": i === 0 ? "start" : "middle" });
    if (mm === 1) t.setAttribute("font-weight", "600");
    t.textContent = txt;
    gEje.append(t);
  });
  svg.append(gEje);

  // líneas escalonadas: cada valor rige todo el mes
  const camino = (valores) => {
    let d = "";
    let abierto = false;
    valores.forEach((v, i) => {
      if (v == null) {
        abierto = false;
        return;
      }
      if (!abierto) {
        d += `M${x(i)},${y(v)}`;
        abierto = true;
      } else {
        d += `H${x(i)}V${y(v)}`;
      }
    });
    return d;
  };
  for (const { s, refs } of series) {
    for (const { r, valores } of refs) {
      svg.append(sv("path", { class: `linea ${REFS[r].clase}`, d: camino(valores), style: `stroke:${colorDe(s)}` }));
    }
  }
  for (const { s, valores } of series) {
    svg.append(sv("path", { class: "linea", d: camino(valores), style: `stroke:${colorDe(s)}` }));
  }

  // etiquetas directas al final, separadas para que no se pisen
  if (conEtiquetas) {
    const items = [
      ...series.map(({ s, valores }) => ({ texto: s.corto, v: valores.at(-1), color: colorDe(s) })),
    ].filter((it) => it.v != null);
    items.forEach((it) => (it.y = y(it.v)));
    items.sort((a, b) => a.y - b.y);
    const gap = 17;
    for (let i = 1; i < items.length; i++) if (items[i].y - items[i - 1].y < gap) items[i].y = items[i - 1].y + gap;
    const desborde = items.length ? items.at(-1).y - (M.t + ih) : 0;
    if (desborde > 0) {
      items.at(-1).y -= desborde;
      for (let i = items.length - 2; i >= 0; i--) if (items[i + 1].y - items[i].y < gap) items[i].y = items[i + 1].y - gap;
    }
    for (const it of items) {
      svg.append(sv("line", { x1: M.l + iw + 4, x2: M.l + iw + 14, y1: it.y, y2: it.y, style: `stroke:${it.color};stroke-width:2` }));
      const t = sv("text", { class: "etiqueta-fin", x: M.l + iw + 18, y: it.y + 4 });
      const tv = sv("tspan", { class: "v" });
      tv.textContent = formatoVista(it.v);
      t.append(tv, document.createTextNode(` ${it.texto}`));
      svg.append(t);
    }
  }

  const gCursor = sv("g", { "pointer-events": "none" });
  svg.append(gCursor);
  geom = { meses, series, x, y, M, iw, ih, W, gCursor };
  if (estado.cursor != null && estado.cursor >= meses.length) estado.cursor = null;
  dibujarCursor();
}

function dibujarCursor() {
  const tip = $("#tooltip");
  if (!geom) return;
  const { meses, series, x, y, M, ih, W, gCursor } = geom;
  gCursor.replaceChildren();
  const i = estado.cursor;
  if (i == null) {
    tip.hidden = true;
    return;
  }
  const cx = x(i);
  gCursor.append(sv("line", { class: "cruz", x1: cx, x2: cx, y1: M.t, y2: M.t + ih }));

  // cada serie con sus líneas de comparación debajo; grupos ordenados de mayor a menor
  const grupos = series
    .filter(({ valores }) => valores[i] != null)
    .map(({ s, valores, refs }) => ({
      v: valores[i],
      filas: [
        { nombre: s.nombre, v: valores[i], color: colorDe(s), clase: "" },
        ...refs
          .filter((r) => r.valores[i] != null)
          .map((r) => ({ nombre: `${s.corto} ${REFS[r.r].sufijo}`, v: r.valores[i], color: colorDe(s), clase: REFS[r.r].clase, sub: true })),
      ],
    }));
  grupos.sort((a, b) => b.v - a.v);
  for (const g of grupos) {
    const f = g.filas[0];
    gCursor.append(sv("circle", { class: "punto", cx, cy: y(f.v), r: 4.5, style: `fill:${f.color}` }));
  }

  const mes = meses[i];
  tip.replaceChildren(el("div", { class: "mes" }, nombreMes(mes)));
  for (const f of grupos.flatMap((g) => g.filas)) {
    let texto = f.nombre;
    if (f.sub) {
      const principal = grupos.find((g) => g.filas.includes(f)).v;
      texto += ` · la real ${pct(principal / f.v - 1)}`;
    }
    tip.append(el("div", { class: `fila${f.sub ? " sub" : ""}`, style: `--c:${f.color}` }, el("i", { class: f.clase }), el("b", {}, formatoVista(f.v)), el("span", {}, texto)));
  }
  // aumentos que entraron en vigencia este mes
  const cambios = [];
  for (const { s } of series) {
    const ahora = valorNominal(s, mes, estado.precio);
    const antes = valorNominal(s, sumarMes(mes, -1), estado.precio);
    if (ahora && antes && ahora !== antes) cambios.push(`${s.corto} ${pct(ahora / antes - 1)}`);
  }
  if (cambios.length) tip.append(el("div", { class: "cambio" }, `Aumento este mes: ${cambios.join(" · ")}`));
  if (estado.vista === "comedor") {
    const detalle = series
      .filter(({ valores }) => valores[i] != null)
      .map(({ s }) => `${s.corto} ${pesos(valorNominal(s, mes, estado.precio))} / cuota ${cuotaDe(s).corto} ${pesos(valorNominal(cuotaDe(s), mes, estado.precio))}`);
    for (const d of detalle) tip.append(el("div", { class: "cambio" }, d));
  }
  if (mes > IPC_HASTA && (estado.vista === "real" || (estado.vista === "pesos" && estado.refs.has("ipc")))) tip.append(el("div", { class: "cambio" }, "IPC de este mes todavía no publicado"));
  if (mes > RIPTE_HASTA && estado.vista === "pesos" && estado.refs.has("ripte")) tip.append(el("div", { class: "cambio" }, "RIPTE de este mes todavía no publicado"));

  tip.hidden = false;
  const tw = tip.offsetWidth;
  const izquierda = cx + 16 + tw > W ? cx - 16 - tw : cx + 16;
  tip.style.left = `${Math.max(0, izquierda)}px`;
  tip.style.top = `${M.t + 4}px`;
}

function conectarInteraccion() {
  const g = $("#grafico");
  const mover = (ev) => {
    if (!geom) return;
    const r = $("#svg").getBoundingClientRect();
    const px = ev.clientX - r.left;
    const n = geom.meses.length;
    const i = Math.round(((px - geom.M.l) / geom.iw) * (n - 1));
    estado.cursor = Math.max(0, Math.min(n - 1, i));
    dibujarCursor();
  };
  g.addEventListener("pointermove", mover);
  g.addEventListener("pointerdown", mover);
  g.addEventListener("pointerleave", () => {
    estado.cursor = null;
    dibujarCursor();
  });
  g.addEventListener("keydown", (ev) => {
    if (!geom) return;
    const n = geom.meses.length;
    if (ev.key === "ArrowRight" || ev.key === "ArrowLeft") {
      ev.preventDefault();
      const d = ev.key === "ArrowRight" ? 1 : -1;
      estado.cursor = estado.cursor == null ? n - 1 : Math.max(0, Math.min(n - 1, estado.cursor + d));
      dibujarCursor();
    } else if (ev.key === "Escape") {
      estado.cursor = null;
      dibujarCursor();
    }
  });
  g.addEventListener("blur", () => {
    estado.cursor = null;
    dibujarCursor();
  });
}

// ---------- resumen ----------
function renderResumen() {
  const { inicio, activas } = periodo();
  const fin = FIN;
  const finIPC = fin > IPC_HASTA ? IPC_HASTA : fin;
  $("#ayuda-resumen").textContent =
    `De ${nombreMes(inicio)} a ${nombreMes(fin)}, ${estado.precio === "lista" ? "precio de lista" : "con pronto pago"}. ` +
    `La inflación se mide hasta ${nombreMes(finIPC)}, último IPC publicado.`;

  const t = $("#tabla-resumen");
  t.replaceChildren();
  const cab = ["", "Al inicio", "Hoy", "Aumento", "Inflación", "Vs. inflación", "Si hubiera seguido al IPC", "En dólares blue"];
  t.append(el("thead", {}, el("tr", {}, ...cab.map((c) => el("th", {}, c)))));
  const tb = el("tbody");
  for (const s of activas) {
    const desde = rangoMeses(inicio, fin).find((m) => valorNominal(s, m, estado.precio) != null);
    if (!desde) continue;
    const v0 = valorNominal(s, desde, estado.precio);
    const v1 = valorNominal(s, fin, estado.precio);
    const aum = v1 / v0 - 1;
    const ipc = ipcNivel.get(fin) / ipcNivel.get(desde) - 1;
    const real = (1 + aum) / (1 + ipc) - 1;
    const conIPC = v0 * (1 + ipc);
    tb.append(
      el(
        "tr",
        {},
        el("td", {}, el("span", { class: "clave", style: `--c:${colorDe(s)}` }), s.nombre),
        el("td", { title: nombreMes(desde) }, pesos(v0), desde !== inicio ? el("span", { class: "calc" }, ` (${nombreMesCorto(desde)})`) : null),
        el("td", {}, pesos(v1)),
        el("td", {}, pct(aum)),
        el("td", {}, pct(ipc)),
        el("td", { class: real > 0.005 ? "sube" : real < -0.005 ? "baja" : "" }, real > 0.005 ? `▲ ${pct(real)}` : real < -0.005 ? `▼ ${pct(real)}` : "≈ igual"),
        el("td", {}, pesos(conIPC)),
        el("td", {}, `${usd(v0 / blueDe(desde))} → ${usd(v1 / blueDe(fin))}`),
      ),
    );
  }
  t.append(tb);
}

// ---------- tabla mensual ----------
function renderTablaMensual() {
  const { inicio, activas } = periodo();
  const t = $("#tabla-mensual");
  t.replaceChildren();
  t.append(el("thead", {}, el("tr", {}, el("th", {}, "Mes"), ...activas.map((s) => el("th", {}, s.corto)), el("th", {}, "IPC del mes"), el("th", {}, "Blue promedio"), el("th", {}, "RIPTE"), el("th", {}, "Sueldo docente PBA"))));
  const tb = el("tbody");
  for (const m of rangoMeses(inicio, FIN).reverse()) {
    const celdas = activas.map((s) => {
      const v = valorNominal(s, m, estado.precio);
      const antes = valorNominal(s, sumarMes(m, -1), estado.precio);
      const calculado = s.tipo === "comedor" && vigenciaEn(comedor.vigencias, m)?.calculado;
      const td = el("td", calculado ? { title: "Calculado a partir del % informado" } : {}, pesos(v), calculado ? el("span", { class: "calc" }, "*") : null);
      if (v && antes && v !== antes) {
        td.style.fontWeight = "650";
        td.append(el("span", { class: "calc" }, ` ${pct(v / antes - 1)}`));
      }
      return td;
    });
    tb.append(
      el("tr", {}, el("td", {}, nombreMes(m)), ...celdas, el("td", {}, ipcVar.has(m) ? `${nf1.format(ipcVar.get(m))}%` : "–"), el("td", {}, pesos(blueDe(m))), el("td", {}, m <= RIPTE_HASTA ? pesos(ripteDe(m)) : "–"), el("td", {}, pesos(docenteDe(m)))),
    );
  }
  t.append(tb);
}

// ---------- reserva ----------
function renderReserva() {
  const idx = estado.precio === "lista" ? 0 : 1;
  const t = $("#tabla-reserva");
  t.replaceChildren();
  t.append(el("thead", {}, el("tr", {}, el("th", {}, "Ciclo"), ...NIVELES_RESERVA.map((id) => el("th", {}, nombres[id])), el("th", {}, "Fuente"))));
  const tb = el("tbody");
  reserva.ciclos.forEach((c, i) => {
    const previo = reserva.ciclos[i - 1];
    tb.append(
      el(
        "tr",
        {},
        el("td", {}, String(c.ciclo)),
        ...NIVELES_RESERVA.map((id) => {
          const [lista, pp, cuota3] = c.valores[id];
          const v = [lista, pp][idx];
          const ant = previo?.valores[id][idx];
          return el("td", { title: `De lista ${pesos(lista)} · pronto pago ${pesos(pp)} · o 3 cuotas de ${pesos(cuota3)}` }, pesos(v), ant ? el("span", { class: "calc" }, ` ${pct(v / ant - 1)}`) : null);
        }),
        el("td", { class: "calc" }, c.fuente),
      ),
    );
  });
  t.append(tb);
}

// ---------- historial ----------
function renderHistorial() {
  const ol = $("#historial");
  ol.replaceChildren();
  const items = [];
  const describir = (vig, lista, ids, previa) =>
    ids
      .map((id) => {
        const v = lista(vig)[id];
        const a = previa ? lista(previa)[id] : null;
        return `${SERIES.find((s) => s.id === id).corto} ${pesos(v)}${a ? ` (${pct(v / a - 1)})` : ""}`;
      })
      .join(" · ");
  aranceles.vigencias.forEach((v, i) =>
    items.push({ desde: v.desde, titulo: "Cuotas (de lista)", fuente: v.fuente, texto: describir(v, (x) => x.lista, ["primaria", "inicial_js", "inicial_jc", "secundaria"], aranceles.vigencias[i - 1]), nota: v.nota }),
  );
  comedor.vigencias.forEach((v, i) =>
    items.push({
      desde: v.desde,
      titulo: v.calculado ? "Comedor (calculado)" : "Comedor",
      fuente: v.fuente,
      texto: describir(v, (x) => x.valores, comedor.categorias.map((c) => c.id), comedor.vigencias[i - 1]),
      nota: v.nota,
    }),
  );
  items.sort((a, b) => (a.desde < b.desde ? 1 : -1));
  for (const it of items) {
    ol.append(
      el(
        "li",
        {},
        el("span", { class: "fecha" }, `Desde ${nombreMes(it.desde)} · ${it.titulo}`),
        el("div", { class: "detalle" }, it.texto),
        el("div", { class: "calc" }, it.fuente),
        it.nota ? el("div", { class: "calc" }, it.nota) : null,
      ),
    );
  }
}

// ---------- orquestación ----------
function render() {
  escribirURL();
  renderSelectorSeries();
  renderTiles();
  renderGrafico();
  renderResumen();
  renderTablaMensual();
  renderReserva();
  const ult = aranceles.vigencias.at(-1);
  $("#pie-grafico").textContent =
    `Pasá el mouse o usá las flechas del teclado para ver cada mes. Última actualización de cuotas: ${nombreMes(ult.desde)}.` +
    (estado.precio === "pronto_pago" ? " El comedor no tiene descuento por pronto pago." : "");
}

leerURL();
for (const k of ["rango", "precio", "vista"]) {
  document.querySelectorAll(`input[name=${k}]`).forEach((inp) => {
    inp.checked = inp.value === estado[k];
    inp.addEventListener("change", () => {
      estado[k] = inp.value;
      render();
    });
  });
}
document.querySelectorAll("input[name=ref]").forEach((inp) => {
  inp.checked = estado.refs.has(inp.value);
  inp.addEventListener("change", () => {
    if (inp.checked) estado.refs.add(inp.value);
    else estado.refs.delete(inp.value);
    render();
  });
});
renderHistorial();
conectarInteraccion();
render();
$("#actualizado").textContent = `IPC, dólar y RIPTE actualizados el ${new Date(indicadores.actualizado).toLocaleString("es-AR")}.`;
new ResizeObserver(() => renderGrafico()).observe($("#grafico"));
