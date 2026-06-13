import { ROOT_DOMAIN } from "@/lib/utils";

export default function SchoolNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="text-5xl">🏫</p>
      <h1 className="mt-4 text-2xl font-bold text-slate-900">
        This school site isn't available
      </h1>
      <p className="mt-2 max-w-md text-slate-600">
        The address you visited doesn't match a published school on SchoolHub
        Jamaica. It may be unpublished or the link may be incorrect.
      </p>
      <a href={`https://${ROOT_DOMAIN}`} className="btn btn-primary mt-6">
        Go to SchoolHub Jamaica
      </a>
    </div>
  );
}
