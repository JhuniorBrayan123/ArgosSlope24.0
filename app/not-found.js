import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center">
      <h1 className="mb-4 text-9xl font-bold text-dark-accent">404</h1>
      <p className="mb-8 text-2xl text-dark-secondary">
        Página no encontrada
      </p>
      <Link
        href="/"
        className="rounded-lg bg-dark-accent px-6 py-3 font-semibold text-dark-primary transition-opacity hover:opacity-90"
      >
        Volver al Dashboard
      </Link>
    </div>
  );
}
