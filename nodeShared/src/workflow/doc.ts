import { generateServicesDoc } from "shared/doc";
import { SimpleSchema, ServiceDoc, ServiceDocTree } from "shared/types";

export type WfDocSegment = {
    title: string;
    description: string;
    children?: WfDocSegment[];
}

// Collects named types during schema-to-TS conversion
const namedTypes = new Map<string, string>();

function getWfApiDoc(sc: object, prefix = null): ServiceDocTree {
    const docTree = generateServicesDoc(sc, prefix, (key, value) => {
        if (value.__doctype__ === 'function') {
            return value.methodInfo.isWfApi;
        }
        return false;
    });
    return docTree;
}

function schemaToTs(s: SimpleSchema): string {
    if (!s.type && s.enum) return s.enum.map(v => JSON.stringify(v)).join(' | ');
    if (!s.type && s.oneOf) return s.oneOf.map(schemaToTs).join(' | ');
    if (!s.type && s.nullable) return 'any | null';
    if (!s.type && s.optional) return 'any';
    let base: string;
    switch (s.type) {
        case 'string': base = 'string'; break;
        case 'number':
        case 'integer': base = 'number'; break;
        case 'boolean': base = 'boolean'; break;
        case 'date': base = 'string'; break;
        case 'stream': base = 'ReadableStream'; break;
        case 'null': return 'null';
        case 'array':
            base = s.items ? `${schemaToTs(s.items)}[]` : 'any[]'; break;
        case 'object': {
            if (!s.properties) { base = 'object'; break; }
            const req = new Set(s.required ?? []);
            const fields = Object.entries(s.properties).map(([k, v]) =>
                `${k}${req.has(k) ? '' : '?'}: ${schemaToTs(v)}`
            );
            const expanded = `{ ${fields.join('; ')} }`;
            if (s.typeName) {
                if (!namedTypes.has(s.typeName)) namedTypes.set(s.typeName, expanded);
                base = s.typeName; break;
            }
            base = expanded; break;
        }
        default: base = 'any';
    }
    return s.nullable ? `${base} | null` : base;
}

function methodToSignature(doc: ServiceDoc): string {
    const schemas = doc.methodInfo?.inputSchema ?? [];
    const args = schemas
        .map(s => {
            const name = s.title || '?';
            const type = schemaToTs(s);
            const opt = s.optional ? '?' : '';
            return `${name}${opt}: ${type}`;
        })
        .join(', ');
    const ret = doc.methodInfo?.outputSchema
        ? schemaToTs(doc.methodInfo.outputSchema)
        : 'void';
    // Strip service prefix from fqn for display: "files.fs.readDir" -> "readDir"
    const shortName = doc.fqn!.split('.').pop()!;
    return `${shortName}(${args}): Promise<${ret}>`;
}

function buildServiceSegments(tree: ServiceDocTree, fqnPrefix = ''): WfDocSegment[] {
    const segments: WfDocSegment[] = [];
    for (const [key, value] of Object.entries(tree)) {
        const doc = value as ServiceDoc;
        if (doc.__doctype__ === 'function' && doc.fqn) {
            segments.push({
                title: doc.fqn!.split('.').pop()!,
                description: `${doc.description || ''}\n${methodToSignature(doc)}`,
            });
        } else if (!doc.__doctype__) {
            // Sub-service (e.g. fs under files)
            const childFqn = fqnPrefix ? `${fqnPrefix}.${key}` : key;
            const children = buildServiceSegments(value as ServiceDocTree, childFqn);
            segments.push({
                title: key,
                description: `Namespace: ${childFqn}`,
                children,
            });
        }
    }
    return segments;
}

let cachedDoc: WfDocSegment | null = null;

export function getScriptingDoc(): WfDocSegment {
    if (cachedDoc) return cachedDoc;
    namedTypes.clear();
    const sc = modules.getLocalServiceController();
    const tree = getWfApiDoc(sc);

    // Build service segments
    const serviceChildren: WfDocSegment[] = [];
    for (const [key, value] of Object.entries(tree)) {
        const doc = value as ServiceDoc;
        if (!doc.__doctype__) {
            const children = buildServiceSegments(value as ServiceDocTree, key);
            serviceChildren.push({
                title: key,
                description: `${key} service methods.`,
                children,
            });
        }
    }

    // Build type definitions segment
    // Force schemaToTs to run on all output schemas so named types are collected
    const typeDefsDescription = namedTypes.size > 0
        ? Array.from(namedTypes.entries())
            .map(([name, def]) => `type ${name} = ${def}`)
            .join('\n')
        : 'No named types.';

    cachedDoc = {
        title: 'Scripting Guide',
        description: [
            'Scripts are JavaScript code with access to standard Node.js APIs and a set of special globals.',
            '- exit(success: boolean, message?: string) — End the script with a result, always call this when done.',
            '',
            '- The global `ctx` object contains execution context:',
            '   ctx.inputs: { [key: string]: string | number | boolean } — Input values passed when executing the workflow',
            '   ctx.config?: WorkflowConfig — The workflow configuration (null for ad-hoc scripts)',
            '   ctx.trigger?: WorkflowTrigger — The trigger that started this execution (if any)',
            '   ctx.host: PeerInfo — Info about the device running this workflow',
            '',
            '- Secrets:',
            '   getSecret(key: string): Promise<string | null> — Read a stored secret',
            '   setSecret(key: string, value: string): Promise<void> — Store a secret',
            '',
            '- Device APIs using a service controller:',
            '   const local = getServiceController(null);         // this device',
            '   const remote = getServiceController(fingerprint); // remote paired device',
            '   Then call methods directly:',
            '   const items = await remote.files.fs.readDir("/path");',
            '   const info = await remote.system.deviceInfo();',
        ].join('\n'),
        children: [
            {
                title: 'Service Controller',
                description: 'A service controller represents a device and provides access to its services.',
                children: serviceChildren,
            },
            {
                title: 'Type Definitions',
                description: typeDefsDescription,
            },
        ],
    };
    return cachedDoc;
}

export function docToMarkdown(doc: WfDocSegment, level = 1): string {
    let md = `${'#'.repeat(level)} ${doc.title}\n\n${doc.description}\n\n`;
    if (doc.children) {
        for (const child of doc.children) {
            md += docToMarkdown(child, level + 1);
        }
    }
    return md;
}

export function getScriptingDocMarkdown(): string {
    const doc = getScriptingDoc();
    return docToMarkdown(doc);
}
