"use client";

import { useEffect, useState } from "react";

/** Builds a link to a tenant subdomain that works on localhost and in prod. */
export function SubdomainLink({
  subdomain,
  className,
  children,
}: {
  subdomain: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [href, setHref] = useState("#");

  useEffect(() => {
    const { protocol, hostname, port } = window.location;
    const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
    const base =
      hostname === "localhost" || isIp
        ? hostname
        : hostname.replace(/^www\./, "");
    const portPart = port ? `:${port}` : "";
    setHref(`${protocol}//${subdomain}.${base}${portPart}`);
  }, [subdomain]);

  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}
