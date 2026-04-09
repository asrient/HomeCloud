import { getMethodInfo } from './servicePrimatives';
import { MethodInfo, ServiceDoc, ServiceDocTree } from './types';

const geProps = (obj: any): any[] => {
    let properties = Object.getOwnPropertyNames(obj)
        .filter((item: string) => (typeof obj[item] === 'function' || typeof obj[item] === 'object') && item !== 'constructor' && !item.startsWith('_'));
    if (Object.getPrototypeOf(obj) !== null && Object.getPrototypeOf(obj) !== Object.prototype) {
        // Recursively get properties from the prototype chain
        properties = [...properties, ...geProps(Object.getPrototypeOf(obj))];
    }
    // Filter out non-enumerable properties and constructor
    return properties;
}

export function generateServicesDoc(sc: object, prefix = null, filter = (key: string, value: ServiceDoc) => true): ServiceDocTree {
    const doc: ServiceDocTree = {};
    geProps(sc).forEach((key) => {
        const fqn = prefix ? `${prefix}.${key}` : key;
        try {
            const service = sc[key];
            if (service && typeof service === 'object') {
                doc[key] = generateServicesDoc(service, fqn);
            } else if (typeof service === 'function') {
                const methodInfo = getMethodInfo(service);
                const docEntry: ServiceDoc = {
                    __doctype__: 'function',
                    description: methodInfo.info || 'No info available',
                    methodInfo,
                    fqn,
                };
                if (filter(key, docEntry)) {
                    doc[key] = docEntry;
                }
            }
        } catch (error) {
            const errorDoc: ServiceDoc = {
                __doctype__: 'error',
                description: `Error generating doc: ${error.message}`
            };
            if (filter(key, errorDoc)) {
                doc[key] = errorDoc;
            }
        }
    })
    return doc;
}
