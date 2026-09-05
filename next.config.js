/** @type {import('next').NextConfig} */

// Baseline security headers for a PHI application. No full CSP yet: Next's
// inline runtime scripts need nonces, which is a follow-up; frame-ancestors
// (clickjacking) is enforced here because it does not affect scripts.
const SECURITY_HEADERS = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // EVV needs geolocation on our own origin; nothing else needs sensors.
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(self), microphone=(), payment=(), usb=()" }
];

const nextConfig = {
  reactStrictMode: true,
  // Service worker is hand-written at public/sw.js and registered in app/field/layout.tsx.
  // It caches ONLY static assets and PHI-free client-rendered shells — see public/sw.js.
  headers: async () => [
    { source: "/(.*)", headers: SECURITY_HEADERS },
    {
      source: "/sw.js",
      headers: [
        { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        { key: "Service-Worker-Allowed", value: "/" }
      ]
    }
  ]
};

module.exports = nextConfig;
