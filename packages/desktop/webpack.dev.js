const path = require('path');

module.exports = {
  entry: './src/index.ts',
  mode: 'development',
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  devServer: {
    static: {
      directory: path.join(__dirname, 'public'),
    },
    proxy: {
      '/api': 'http://localhost:3000',
    },
    compress: true,
    port: 8080,
    devMiddleware: {
      index: true,
      mimeTypes: { phtml: 'text/html' },
    },
  },
  devtool: 'inline-source-map',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist/'),
    publicPath: '/dist/',
  },
};