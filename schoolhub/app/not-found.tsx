import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="text-6xl font-extrabold text-slate-200">404</p>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">Page not found</h1>
      <p className="mt-2 text-slate-600">
        The page you're looking for doesn't exist.
      </p>
      <Link href="/" className="btn btn-primary mt-6">
        Back home
      </Link>
    </div>
  );
}
