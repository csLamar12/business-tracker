import Link from "next/link";

interface SchoolFooterData {
  name: string;
  motto?: string | null;
  addressLine?: string | null;
  parish?: string | null;
  phone?: string | null;
  email?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  twitterUrl?: string | null;
  youtubeUrl?: string | null;
}

export function SiteFooter({ school }: { school: SchoolFooterData }) {
  const socials = [
    { url: school.facebookUrl, label: "Facebook" },
    { url: school.instagramUrl, label: "Instagram" },
    { url: school.twitterUrl, label: "Twitter / X" },
    { url: school.youtubeUrl, label: "YouTube" },
  ].filter((s) => !!s.url);

  return (
    <footer className="mt-16 bg-slate-900 text-slate-300">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 md:grid-cols-3">
        <div>
          <h3 className="text-lg font-bold text-white">{school.name}</h3>
          {school.motto && (
            <p className="mt-1 text-sm italic text-slate-400">“{school.motto}”</p>
          )}
        </div>
        <div className="text-sm">
          <h4 className="font-semibold text-white">Contact</h4>
          <ul className="mt-2 space-y-1 text-slate-400">
            {(school.addressLine || school.parish) && (
              <li>
                {[school.addressLine, school.parish].filter(Boolean).join(", ")}
              </li>
            )}
            {school.phone && <li>{school.phone}</li>}
            {school.email && (
              <li>
                <a href={`mailto:${school.email}`} className="hover:text-white">
                  {school.email}
                </a>
              </li>
            )}
          </ul>
        </div>
        <div className="text-sm">
          <h4 className="font-semibold text-white">Quick links</h4>
          <ul className="mt-2 space-y-1 text-slate-400">
            <li>
              <Link href="/admissions" className="hover:text-white">
                Admissions
              </Link>
            </li>
            <li>
              <Link href="/calendar" className="hover:text-white">
                Calendar
              </Link>
            </li>
            <li>
              <Link href="/alumni" className="hover:text-white">
                Alumni
              </Link>
            </li>
          </ul>
          {socials.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-3">
              {socials.map((s) => (
                <a
                  key={s.label}
                  href={s.url!}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-400 hover:text-white"
                >
                  {s.label}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-slate-500 sm:flex-row">
          <span>
            © {new Date().getFullYear()} {school.name}
          </span>
          <span>
            Powered by{" "}
            <span className="font-semibold text-slate-300">
              SchoolHub Jamaica
            </span>
          </span>
        </div>
      </div>
    </footer>
  );
}
