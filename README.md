# Cuota del Cole * Tracker

Compara la cuota y el comedor del colegio con la inflación (IPC) y el dólar blue, mes a mes.

**Ver:** https://germanfagliano.github.io/cuota-del-cole-tracker/

## Cómo actualizar

- **IPC y dólar blue:** se actualizan solos todos los días (GitHub Actions, `scripts/actualizar-indicadores.mjs`).
- **Cuotas:** cuando llega un comunicado nuevo, agregar una entrada al final de `data/aranceles.json` con el mes desde el que rige (`"desde": "AAAA-MM"`), los valores de lista y con pronto pago.
- **Comedor:** igual, en `data/comedor.json`. Si el comunicado solo da un porcentaje, calcular los valores y marcar `"calculado": true`.
- **Reserva de vacante:** agregar el ciclo nuevo en `data/reserva.json`.

Cualquier cambio que se suba a `main` vuelve a publicar la página.

## Probar localmente

```sh
python3 -m http.server 8000
# abrir http://localhost:8000
```

Fuentes: comunicados del colegio a las familias, [ArgentinaDatos](https://argentinadatos.com) (IPC INDEC y dólar blue), [datos.gob.ar](https://datos.gob.ar) y [DolarApi](https://dolarapi.com).
