/** @type {import('next').NextConfig} */
const nextConfig = {
  // If you are using images from external sources
  images: {
    unoptimized: true, 
  },
  // This helps Vercel optimize the build
  output: 'standalone',
  // kuromoji reads its dictionary files from disk at runtime — keep it out of the
  // bundle and make sure the dict ships with the route that uses it.
  serverExternalPackages: ['kuromoji'],
  outputFileTracingIncludes: {
    '/api/reader/words': ['./node_modules/kuromoji/dict/**'],
    '/api/reader/forms': ['./node_modules/kuromoji/dict/**'],
  },
}

module.exports = nextConfig