const path = require('path')
const { resolveUITheme } = require('./lib/resolveUITheme')

const uiTheme = resolveUITheme();

console.log(`Building with UI_THEME=${uiTheme}`);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true
  },
  output: 'export',
  env: {
    NEXT_PUBLIC_UI_THEME: uiTheme,
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
}

module.exports = nextConfig
