"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode, useMemo } from "react";

export default function ConvexClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  // Avoid setting up Convex on the server (including during static prerender
  // of routes like `/_not-found`). Convex's React auth stack is designed for
  // the browser and can return undefined context values when no provider is
  // mounted, which then breaks builds. On the server we just render children
  // without Convex; the client will re-render with the real provider.
  if (typeof window === "undefined") {
    return <>{children}</>;
  }

  return <ConvexClientProviderInner>{children}</ConvexClientProviderInner>;
}

function ConvexClientProviderInner({ children }: { children: ReactNode }) {
  const client = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) {
      console.warn(
        "Missing NEXT_PUBLIC_CONVEX_URL. Set it in .env.local. Convex features will not work."
      );
      return null;
    }
    return new ConvexReactClient(url);
  }, []);

  if (!client) {
    return <>{children}</>;
  }

  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
