import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Cursor's in-app preview loads the dev server from a forwarded host.
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "192.168.*.*",
    "10.*.*.*",
    ...Array.from({ length: 16 }, (_, index) => `172.${16 + index}.*.*`),
  ],
  async headers() {
    const headers = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
    // The Agents Window preview is an iframe. DENY makes that pane look blank.
    if (process.env.NODE_ENV === "production") {
      headers.push({ key: "X-Frame-Options", value: "DENY" });
    }
    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
