// Reexport the native module. On web, it will be resolved to SupermanModule.web.ts
// and on native platforms to SupermanModule.ts
export { default } from './src/SupermanModule';
export { default as SupermanView } from './src/SupermanView';
export * from  './src/Superman.types';
