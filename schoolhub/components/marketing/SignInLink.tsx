"use client";

import { useEffect, useState } from "react";

/**
 * Links to the admin dashboard, which lives on the reserved `app` subdomain.
 * Computed from window.location so it works on localhost, anchorpointja.com (dev)
 * and schoolhubja.com (prod) without configuration.
 */
export function SignInLink({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const [href, setHref] = useState("/login");

  useEffect(() => {
    const { protocol, hostname, port } = window.location;
    const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
    const base =
      hostname === "localhost" || isIp
        ? hostname
        : hostname.replace(/^www\./, "");
    const portPart = port ? `:${port}` : "";
    setHref(`${protocol}//app.${base}${portPart}/login`);
  }, []);

  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}
