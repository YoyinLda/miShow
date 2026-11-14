import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacidad · miShow",
  description: "Qué datos recoge miShow y para qué los usa."
};

/** Política de privacidad breve (brief 009 · C; exigida por los términos de la Discovery API). */
export default function PrivacidadPage() {
  return (
    <article className="flex max-w-2xl flex-col gap-5 text-[0.9375rem] leading-relaxed">
      <h1 className="text-[2.125rem] font-bold leading-tight tracking-tight lg:text-5xl">Privacidad</h1>
      <p className="text-text-muted">Última actualización: noviembre de 2026.</p>

      <section className="flex flex-col gap-2">
        <h2 className="text-[1.375rem] font-semibold">Qué es miShow</h2>
        <p>
          miShow reúne eventos musicales publicados en ticketeras y otras fuentes públicas. No vende entradas: cada
          evento enlaza a su sitio original para la compra.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[1.375rem] font-semibold">Datos que recogemos</h2>
        <ul className="list-disc pl-5">
          <li>
            <strong>Formulario de contacto:</strong> nombre, organización (opcional), correo, URL del evento y el motivo
            que escribas. Solo se usan para responder tu solicitud y dejar registro de cómo se resolvió.
          </li>
          <li>
            <strong>Navegación:</strong> no usamos cuentas, cookies de publicidad ni herramientas de analítica. Nuestro
            proveedor de hosting puede registrar datos técnicos (como la IP) para operar y proteger el sitio.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[1.375rem] font-semibold">Datos de eventos</h2>
        <p>
          La información de los eventos (nombre, fecha, recinto, precio e imagen) proviene de sus fuentes públicas y se
          muestra con un enlace a la fuente original. Si eres titular de un contenido y quieres que lo retiremos, usa la
          página de <a href="/contacto" className="underline hover:text-brand">contacto y retiro de contenido</a>: lo
          resolvemos dentro de 24 horas.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[1.375rem] font-semibold">Tus derechos</h2>
        <p>
          Puedes pedir acceso, corrección o eliminación de los datos que nos enviaste usando el mismo formulario.
        </p>
      </section>
    </article>
  );
}
