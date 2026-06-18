/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdfjs-dist ships a canvas optional dependency we don't need server-side.
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
  serverExternalPackages: ["pdfjs-dist"],
  // pdfjs-dist's legacy build dynamically imports its worker to spin up a
  // "fake worker" on the main thread. Next's file tracer can't see that
  // dynamic import, so on Vercel the file is missing from the function bundle
  // ("Cannot find module .../pdf.worker.mjs"). Force-include it for all routes.
  outputFileTracingIncludes: {
    "/**/*": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
};

export default nextConfig;
