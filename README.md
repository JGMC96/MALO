# MALO Architects

Web del estudio. Ahora mismo es una sola página en construcción —
`index.html` — con el logo, el contacto y, de fondo, la animación que se
describe más abajo. La marca vive en `assets/` (logo, iconos, imagen para
compartir y la Bodoni Moda autoalojada).

## Publicar

`.github/workflows/pages.yml` despliega la web en GitHub Pages con cada push
a la rama por defecto. **Hay que activar Pages una vez** en el repositorio:
Settings → Pages → Build and deployment → Source: **GitHub Actions**. A
partir de ahí queda en `https://jgmc96.github.io/MALO/`.

---

# Dibujar la obra

Animación monocroma de una obra que se dibuja y se construye a la vez, en
perspectiva y en un bucle de 40 segundos sin costura. Tinta negra y unas pocas
aguadas de grafito sobre papel blanco; pensada como fondo de hero o de sección,
con el aire suficiente para que la tipografía encima siempre gane.

El ciclo cierra con un **cambio de hoja**: el dibujo terminado nunca se
difumina — la lámina completa se levanta del tablero (se ve su canto y la
sombra que proyecta) y debajo, sobre papel limpio, el ciclo siguiente ya se
está dibujando. El último fotograma es idéntico al primero por construcción.

Se dibuja sola en Canvas 2D. **Sin imágenes, sin vídeo, sin dependencias**:
cero peticiones de red y ~63 KB de código sin minificar (~15 KB gzip).

## Qué hay aquí

```
src/     sketch.ts                 motor de tinta: temblor con semilla, trazos con
                                   horario, tramas, formas
         scene.ts                  la obra en 3D (metros), la cámara, la grúa con su
                                   coreografía, las figuras y el cambio de hoja
         ArchitecturalSite.tsx     componente React / Next.js
         usePrefersReducedMotion.ts

dist/    architectural-site.js     versión compilada para HTML plano (sin React)

ejemplo/ index.html                hero de ejemplo en HTML plano (usa dist/)
         page.tsx                  página de previsualización para Next.js

media/   dibujar-la-obra.mp4       un ciclo completo en vídeo (40 s, 1080p, bucle)

tools/   render-video.mjs          regenera el vídeo desde el código
```

## Uso en React / Next.js

Copia `src/` dentro del proyecto (por ejemplo en `components/obra/`) y colócalo
detrás de lo que quieras:

```tsx
<section className="relative h-screen bg-white">
  <ArchitecturalSite className="absolute inset-0" intensity={0.92} />
  <h1 className="relative">Dibujar es construir</h1>
</section>
```

Requiere React 18+. El componente es `"use client"`; en Next.js con App Router
no hace falta nada más.

## Uso en HTML plano

```html
<div id="fondo" style="position:absolute; inset:0"></div>

<script src="dist/architectural-site.js"></script>
<script>
  const anim = ArchitecturalSite.mount(document.getElementById("fondo"), {
    intensity: 0.92,
  });
  // anim.pause() · anim.play() · anim.seek(0.6) · anim.destroy()
</script>
```

El contenedor tiene que tener tamaño propio (por ejemplo `position:absolute;
inset:0` dentro de un padre `position:relative`).

## Opciones

| Opción | Por defecto | Qué hace |
| --- | --- | --- |
| `duration` | `40` | Segundos por ciclo. Más largo se lee más sereno. |
| `intensity` | `1` | Fuerza global de la tinta. Bájalo si el titular pide más aire. |
| `background` | `"#ffffff"` | Color del papel. `null` deja el canvas transparente (el cambio de hoja asume papel blanco). |
| `offset` | `0` | Punto del ciclo en el que arranca (0.6 = obra ya levantada y trabajando). |
| `detail` | automático | `"full"` o `"lite"` para forzar el nivel de detalle. |

## El ciclo (segundos, sobre 40)

| s | |
| --- | --- |
| 0–2 | La línea del solar, dos gestos, el volumen fantasma en discontinuo, ejes |
| 2–5 | Zanjas con taludes, zapatas, esperas de armadura; pilares de planta baja |
| 5–8 | Primer forjado con su sombra, torre de la grúa, planta primera, núcleo |
| 8–12 | Pluma y contrapluma, cubierta a medias, barandillas, puntales, acopios |
| 12–20 | Cotas, niveles, norte; la cuadrilla se despliega por la obra |
| 14–36 | La grúa hace una entrega completa: baja al acopio, engancha una viga, la iza, gira, la posa sobre los vanos abiertos y vuelve |
| 20–38 | Obra viva: carretilla cruzando, dos porteando un tablón, uno bajando la escalera, armadores en la zanja |
| 38–40 | La lámina se levanta del tablero; debajo ya se dibuja el ciclo siguiente |

## Cómo se sostiene

- **Perspectiva real.** Toda la obra está trazada en metros, en tres
  dimensiones, y cae sobre el papel a través de una cámara fija. Por eso la
  grúa gira de verdad en el espacio y la viga colgada se acerca y se aleja.
- **El bucle cierra por construcción.** El reloj de escena está desfasado para
  que un ciclo *empiece* en el instante en que la hoja anterior empieza a
  levantarse; todo lo que oscila completa un número entero de vueltas por
  ciclo. No hay fundido: hay un cambio de hoja.
- **Una mano, no un plóter.** Las líneas se desvían de la recta según la
  distancia recorrida sobre la propia línea y una semilla de cada elemento,
  nunca según el reloj: el temblor se queda pegado a la forma aunque se mueva.
- **Tinta y aguada.** Líneas a distinta presión y aguadas casi transparentes
  que dan cuerpo al hormigón. Nada llega al negro pleno.
- **Se comporta.** `aria-hidden`, no captura el ratón, se detiene fuera de
  pantalla y al cambiar de pestaña, y deja un fotograma fijo a quien pide
  menos movimiento. Menos de 1 ms por fotograma a 1600 × 900.

## Regenerar el vídeo

```bash
npm i -D playwright ffmpeg-static
npx playwright install chromium
node tools/render-video.mjs        # → media/dibujar-la-obra.mp4
```

## Cómo tocar la composición

Todo el dibujo vive en `src/scene.ts`, trazado en metros:

- La cámara (`EYE`, `TGT`, `FOCAL`) está al principio: mover el punto de vista
  es cambiar tres números.
- Las constantes de obra (`XL/XR/ZB/ZF`, `LVL`, `CORE`, `CR`…) fijan huella,
  alturas de planta, núcleo y grúa.
- La coreografía de la grúa son los fotogramas clave de `RIG_KEYS`
  (momento, ángulo de giro, radio del carro, altura del gancho).
- El ritmo global es la tabla `WARP` (tiempo real → tiempo de dibujo) y el
  cambio de hoja empieza en `SLIDE_START`.
- Cada elemento lleva el momento en que empieza a dibujarse (`t`), lo que
  tarda (`dur`), su grosor (`w`) y su presión de tinta (`a`).
- `viewport(aspect)` decide el encuadre por proporción de pantalla: apaisado
  ve todo el solar, vertical se acerca a la estructura y la grúa.
