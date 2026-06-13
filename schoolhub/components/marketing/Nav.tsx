import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { SignInLink } from "./SignInLink";

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex">
          <Link href="/features" className="hover:text-slate-900">
            Features
          </Link>
          <Link href="/pricing" className="hover:text-slate-900">
            Pricing
          </Link>
          <Link href="/contact" className="hover:text-slate-900">
            Contact
          </Link>
          <SignInLink className="hover:text-slate-900">School sign in</SignInLink>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/contact" className="btn btn-primary btn-sm sm:btn">
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
