import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { SignInLink } from "./SignInLink";

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 md:grid-cols-4">
        <div className="sm:col-span-2 md:col-span-1">
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-slate-500">
            Affordable, professional websites for Jamaican high schools.
          </p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Platform</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li>
              <Link href="/features" className="hover:text-slate-900">
                Features
              </Link>
            </li>
            <li>
              <Link href="/pricing" className="hover:text-slate-900">
                Pricing
              </Link>
            </li>
            <li>
              <SignInLink className="hover:text-slate-900">
                School sign in
              </SignInLink>
            </li>
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Company</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li>
              <Link href="/contact" className="hover:text-slate-900">
                Contact us
              </Link>
            </li>
            <li>
              <a href="mailto:hello@schoolhubja.com" className="hover:text-slate-900">
                hello@schoolhubja.com
              </a>
            </li>
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Get in touch</h3>
          <p className="mt-3 text-sm text-slate-600">
            Kingston, Jamaica
            <br />
            Mon–Fri, 9am–5pm
          </p>
        </div>
      </div>
      <div className="border-t border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-slate-500">
          © {new Date().getFullYear()} SchoolHub Jamaica. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
