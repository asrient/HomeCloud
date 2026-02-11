// Reexport the native module. On web, it will be resolved to SupermanModule.web.ts
// and on native platforms to SupermanModule.ts
export { default } from './src/SupermanModule';
export * from  './src/Superman.types';
