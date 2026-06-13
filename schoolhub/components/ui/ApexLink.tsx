"use client";

import { useEffect, useState } from "react";

/** Links to the platform's marketing apex (strips any app./www. subdomain). */
export function ApexLink({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const [href, setHref] = useState("/");

  useEffect(() => {
    const { protocol, hostname, port } = window.location;
    const base =
      hostname === "localhost"
        ? hostname
        : hostname.replace(/^app\./, "").replace(/^www\./, "");
    const portPart = port ? `:${port}` : "";
    setHref(`${protocol}//${base}${portPart}`);
  }, []);

  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}
