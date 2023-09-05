const CopyPlugin = require("copy-webpack-plugin");
const nodeExternals = require('webpack-node-externals');

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

// Need to pack webdav since it's only available as a esm module
const externals = [nodeExternals({
    allowlist: ['webdav', '@buttercup/fetch', 'hot-patcher'],
})];

module.exports = [
    {
        ...baseconfig,
        entry: './src/desktop/index.ts',
        target: 'electron-main',
        externals, // in order to ignore all modules in node_modules folder
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
        externalsPresets: { node: true }, // in order to ignore built-in modules like path, fs, etc.
        externals, // in order to ignore all modules in node_modules folder
        output: {
            path: __dirname + '/bin/node',
            filename: 'index.js'
        },
    }
];
