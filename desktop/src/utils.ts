export function importModule(moduleName: string) {
    return require(`../build/Release/${moduleName}.node`);
}
