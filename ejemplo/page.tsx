import type { Metadata } from "next";
import { ArchitecturalSite } from "@/components/ArchitecturalSite";

export const metadata: Metadata = {
  title: "Obra en dibujo — estudio de movimiento",
  description:
    "Animación monocroma de una obra que se dibuja y se construye a la vez.",
  robots: { index: false, follow: false },
};

/**
 * Preview route for the architectural construction animation: the loop as a
 * hero background with type over it, then the same scene in two other
 * proportions so the framing can be checked at a glance.
 */
export default function MotionArchitecturePage() {
  return (
    <main className="min-h-screen bg-white text-brand-black">
      <section className="relative h-[100svh] min-h-[620px] w-full overflow-hidden bg-white">
        <ArchitecturalSite className="absolute inset-0" intensity={0.92} />

        <div className="relative z-10 flex h-full flex-col justify-between px-8 py-10 md:px-16 md:py-14">
          <p className="font-mono text-[10px] uppercase tracking-[0.45em] text-brand-black/45">
            Estudio de arquitectura
          </p>

          <div className="max-w-3xl">
            <h1 className="font-display text-[13vw] font-medium leading-[0.86] tracking-tighter sm:text-[9vw] md:text-[6.5rem]">
              Dibujar
              <br />
              es construir
            </h1>
            <p className="mt-6 max-w-md text-sm leading-relaxed text-brand-black/55">
              Un proyecto aparece línea a línea: replanteo, cimentación,
              estructura, andamio, grúa y obra en marcha, en un ciclo continuo.
            </p>
          </div>

          <div className="flex items-end justify-between font-mono text-[10px] uppercase tracking-[0.3em] text-brand-black/35">
            <span>Ciclo 40 s — bucle continuo</span>
            <span className="hidden sm:block">Tinta, grafito, papel</span>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-8 py-20 md:grid-cols-2 md:px-16">
        <figure className="space-y-3">
          <div className="relative aspect-square w-full overflow-hidden border border-brand-black/10">
            <ArchitecturalSite className="absolute inset-0" offset={0.35} />
          </div>
          <figcaption className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand-black/35">
            Formato cuadrado — estructura en montaje
          </figcaption>
        </figure>

        <figure className="space-y-3">
          <div className="relative aspect-[3/4] w-full overflow-hidden border border-brand-black/10">
            <ArchitecturalSite className="absolute inset-0" offset={0.68} />
          </div>
          <figcaption className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand-black/35">
            Formato vertical — encuadre sobre la grúa
          </figcaption>
        </figure>
      </section>
    </main>
  );
}
