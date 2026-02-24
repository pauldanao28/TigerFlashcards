/** @type {import('next').NextConfig} */
const nextConfig = {
  // If you are using images from external sources
  images: {
    unoptimized: true, 
  },
  // This helps Vercel optimize the build
  output: 'standalone', 
}

module.exports = nextConfig