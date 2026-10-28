// Marcador temporal: el agente de Antigravity reemplaza esta página por el feed (/)
// generado desde la pantalla de Stitch, según UX_MAPPING.md.
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-space-md px-margin-mobile md:px-margin">
      <h1 className="font-headline text-headline-xl-mobile text-text-primary md:text-headline-xl">Forfunable</h1>
      <p className="text-body-lg text-text-secondary">
        Base de Next.js lista. Las vistas /login, /register y el feed se generan a partir de Stitch.
      </p>
    </main>
  );
}
