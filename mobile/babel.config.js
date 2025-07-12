module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      '@babel/plugin-transform-class-static-block',
      ['@babel/plugin-proposal-decorators', { 'legacy': true }], // required for @exposed etc
    ]
  };
};
