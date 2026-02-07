const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true
  },
  output: 'export',
  turbopack: {
    root: path.resolve(__dirname),
  },
}

module.exports = nextConfig
