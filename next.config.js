/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Service worker is hand-written at public/sw.js and registered in app/field/layout.tsx.
  // Never cache API/PHI responses in the SW — see public/sw.js.
  headers: async () => [
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
