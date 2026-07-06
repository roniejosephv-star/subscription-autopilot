/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // Browser calls /api/signer/* on the dashboard's own origin; Next proxies
    // server-side to SpendGuard. No CORS, no public signer URL, and a down
    // signer returns a clean 502 instead of cross-origin connection spam.
    const signer = process.env.SIGNER_INTERNAL_URL ?? "http://localhost:5001";
    return [{ source: "/api/signer/:path*", destination: `${signer}/:path*` }];
  },
};

export default nextConfig;
