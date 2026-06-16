/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdfjs-dist ships a canvas optional dependency we don't need server-side.
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
