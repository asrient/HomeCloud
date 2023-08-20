const CopyPlugin = require("copy-webpack-plugin");

const baseconfig = {
    mode: 'development',
    module: {
        rules: [{
            test: /\.ts$/,
            include: /src/,
            loader: 'ts-loader',
            options: {
                compilerOptions: {
                    "noEmit": false,
                }
            }
        }]
    },
    resolve: {
        extensions: ['.js', '.ts', '.json'],
    },
}

module.exports = [
    {
        ...baseconfig,
        entry: './src/desktop/index.ts',
        target: 'electron-main',
        output: {
            path: __dirname + '/bin/desktop',
            filename: 'index.js'
        },
        plugins: [
            new CopyPlugin({
              patterns: [
                { from: "./src/desktop/public", to: __dirname + '/bin/desktop/public' },
              ],
            }),
          ],
    },
    {
        ...baseconfig,
        entry: './src/desktop/preload.ts',
        target: 'electron-preload',
        output: {
            path: __dirname + '/bin/desktop',
            filename: 'preload.js'
        },
    },
    {
        ...baseconfig,
        entry: './src/node/index.ts',
        target: 'node',
        output: {
            path: __dirname + '/bin/node',
            filename: 'index.js'
        },
    }
];