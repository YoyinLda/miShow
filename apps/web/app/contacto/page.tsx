import type { Metadata } from "next";
import { ContactForm } from "../../components/ContactForm";

export const metadata: Metadata = {
  title: "Contacto y retiro de contenido · miShow",
  description: "Escríbenos o solicita el retiro de un contenido publicado en miShow."
};

/** Canal de contacto y retiro de contenido (brief 009 · C). Respuesta dentro de 24 h. */
export default function ContactoPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <h1 className="text-[2.125rem] font-bold leading-tight tracking-tight lg:text-5xl">Contacto y retiro de contenido</h1>
      <p className="text-[0.9375rem] text-text-muted lg:text-lg">
        ¿Eres titular de un evento, una imagen o una marca publicada en miShow y quieres que la retiremos o corrijamos?
        Cuéntanos aquí. Revisamos cada solicitud y respondemos dentro de 24 horas.
      </p>
      <ContactForm />
      <p className="text-xs text-text-muted">
        Usamos estos datos solo para responder tu solicitud. Más detalles en{" "}
        <a href="/privacidad" className="underline hover:text-text">
          Privacidad
        </a>
        .
      </p>
    </div>
  );
}
