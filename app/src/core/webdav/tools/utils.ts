export const nestedProp = {
    set: (obj: any, path: string, value: any) => {
        const parts = path.split(".");
        let ref = obj;
        for (let i = 0; i < parts.length - 1; i++) {
            if (ref[parts[i]] === undefined) {
                ref[parts[i]] = {};
            }
            ref = ref[parts[i]];
        }
        ref[parts[parts.length - 1]] = value;
    },
    get: (obj: any, path: string) => {
        const parts = path.split(".");
        let ref = obj;
        for (let i = 0; i < parts.length; i++) {
            if (ref[parts[i]] === undefined) {
                return undefined;
            }
            ref = ref[parts[i]];
        }
        return ref;
    }
}
