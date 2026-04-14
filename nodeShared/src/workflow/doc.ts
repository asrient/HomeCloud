import { generateServicesDoc } from "shared/doc";
import { Service } from "shared/servicePrimatives";
import { SimpleSchema, ServiceDoc, ServiceDocTree, WorkflowConfigSchema, WorkflowTriggerSchema, PeerInfoSchema } from "shared/types";

export type WfDocSegment = {
    title: string;
    description: string;
    children?: WfDocSegment[];
}

// --- Schema-to-TypeScript conversion ---

function schemaToTs(s: SimpleSchema, types: Map<string, string>): string {
    if (!s.type && s.enum) return s.enum.map(v => JSON.stringify(v)).join(' | ');
    if (!s.type && s.oneOf) return s.oneOf.map(v => schemaToTs(v, types)).join(' | ');
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
            base = s.items ? `${schemaToTs(s.items, types)}[]` : 'any[]'; break;
        case 'object': {
            if (!s.properties) { base = 'object'; break; }
            const req = new Set(s.required ?? []);
            const fields = Object.entries(s.properties).map(([k, v]) =>
                `${k}${req.has(k) ? '' : '?'}: ${schemaToTs(v, types)}`
            );
            const expanded = `{ ${fields.join('; ')} }`;
            if (s.typeName) {
                if (!types.has(s.typeName)) types.set(s.typeName, expanded);
                base = s.typeName; break;
            }
            base = expanded; break;
        }
        default: base = 'any';
    }
    return s.nullable ? `${base} | null` : base;
}

function methodToSignature(doc: ServiceDoc, types: Map<string, string>): string {
    const schemas = doc.methodInfo?.inputSchema ?? [];
    const args = schemas
        .map(s => {
            const name = s.title || '?';
            const type = schemaToTs(s, types);
            const opt = s.optional ? '?' : '';
            return `${name}${opt}: ${type}`;
        })
        .join(', ');
    const ret = doc.methodInfo?.outputSchema
        ? schemaToTs(doc.methodInfo.outputSchema, types)
        : 'void';
    const shortName = doc.fqn!.split('.').pop()!;
    return `${shortName}(${args}): Promise<${ret}>`;
}

// --- Segment rendering ---

function segmentToMarkdown(doc: WfDocSegment, level = 1): string {
    let md = `${'#'.repeat(level)} ${doc.title}\n\n${doc.description}\n\n`;
    if (doc.children) {
        for (const child of doc.children) {
            md += segmentToMarkdown(child, level + 1);
        }
    }
    return md;
}

function typesToMarkdown(types: Map<string, string>): string {
    if (types.size === 0) return '';
    const lines = Array.from(types.entries()).map(([name, def]) => `### ${name}\n${def}`);
    return `\n## Type Definitions\n\n${lines.join('\n')}\n`;
}

// --- Build method segments from a ServiceDocTree ---

function buildMethodSegments(tree: ServiceDocTree, fqnPrefix: string, types: Map<string, string>): WfDocSegment[] {
    const segments: WfDocSegment[] = [];
    for (const [key, value] of Object.entries(tree)) {
        const doc = value as ServiceDoc;
        if (doc.__doctype__ === 'function' && doc.fqn) {
            if (doc.description && !doc.description.endsWith('.')) doc.description += '.';
            segments.push({
                title: doc.fqn!.split('.').pop()!,
                description: `- ${doc.description || ''}\n- ${methodToSignature(doc, types)}`,
            });
        } else if (!doc.__doctype__) {
            const childFqn = fqnPrefix ? `${fqnPrefix}.${key}` : key;
            const children = buildMethodSegments(value as ServiceDocTree, childFqn, types);
            if (children.length > 0) {
                segments.push({
                    title: key,
                    description: `Namespace: ${childFqn}`,
                    children,
                });
            }
        }
    }
    return segments;
}

// --- Cached parsed tree (single iteration) ---

type ParsedServiceEntry = {
    name: string;
    description: string;
    subtree: ServiceDocTree;
}

let cached: ParsedServiceEntry[] | null = null;

function getParsedServices(): ParsedServiceEntry[] {
    if (cached) return cached;
    const sc = modules.getLocalServiceController();
    const tree = generateServicesDoc(sc, null, (_key, value) => {
        return value.__doctype__ === 'function' ? value.methodInfo.isWfApi : false;
    });

    const services: ParsedServiceEntry[] = [];
    for (const [key, value] of Object.entries(tree)) {
        if ((value as ServiceDoc).__doctype__) continue;
        if (!(sc[key] instanceof Service)) {
            console.warn(`[WfDoc] Skipping non-service entry: ${key}`);
            continue;
        }
        const desc = (sc[key].constructor as typeof Service).serviceDescription || '';
        services.push({ name: key, description: desc, subtree: value as ServiceDocTree });
    }

    cached = services;
    return cached;
}

// --- Internal doc builders ---

const HEADER_LINES = [
    'HomeCloud is a remote-control and automation platform for user devices and AI harnesses.',
    'Scripts have access to Node.js APIs (cjs) and a set of special APIs.',
    '- exit(success: boolean, message?: string) - End the script with a result, always call this when done.',
    '',
    'The global `ctx` object contains execution context:',
    ' - ctx.inputs: { [key: string]: string | number | boolean } - Input values passed when executing the workflow',
    ' - ctx.config?: WorkflowConfig - The workflow configuration (null for ad-hoc scripts)',
    ' - ctx.trigger?: WorkflowTrigger - The trigger that started this execution (if any)',
    ' - ctx.host: PeerInfo - Info about the device.',
    '',
    'Secrets:',
    ' - getSecret(key: string): Promise<string | null> - Read a stored secret',
    ' - setSecret(key: string, value: string): Promise<void> - Store a secret',
    '',
    'Device APIs using a service controller:',
    ' - const local = getServiceController(null);         // this device',
    ' - const remote = getServiceController(fingerprint); // remote paired device',
    ' - Then call methods directly:',
    ' - const items = await remote.files.fs.readDir("/path");',
    ' - const info = await remote.system.deviceInfo();',
];

// Schemas referenced in the header text — resolving them populates the types map
const HEADER_SCHEMAS: SimpleSchema[] = [WorkflowConfigSchema, WorkflowTriggerSchema, PeerInfoSchema];

function getHeaderDoc(types: Map<string, string>): string {
    for (const s of HEADER_SCHEMAS) schemaToTs(s, types);
    return HEADER_LINES.join('\n');
}

function getServiceDoc(name: string, types: Map<string, string>): WfDocSegment | null {
    const entry = getParsedServices().find(s => s.name.toLowerCase() === name.toLowerCase());
    if (!entry) return null;
    return {
        title: entry.name,
        description: entry.description || `${entry.name} service methods.`,
        children: buildMethodSegments(entry.subtree, entry.name, types),
    };
}

// --- Exported ---

export function getFullDocMd(): string {
    const types = new Map<string, string>();
    let md = `# HomeCloud Scripting API\n\n${getHeaderDoc(types)}\n\n`;
    for (const svc of getParsedServices()) {
        const seg = getServiceDoc(svc.name, types)!;
        md += segmentToMarkdown(seg, 2);
    }
    md += typesToMarkdown(types);
    return md;
}

export function getMcpHeaderDocMd(): string {
    const types = new Map<string, string>();
    let md = `${getHeaderDoc(types)}\n\n`;
    md += `Use the get_api_doc tool to fetch detailed method signatures for a specific service.\n`;
    md += typesToMarkdown(types);
    return md;
}

export function getMcpServiceListDocMd(): string {
    let md = `Fetch API reference for a service in the service controller.\n\n`;
    md += `Available services:\n`;
    for (const svc of getParsedServices()) {
        md += `- **${svc.name}**${svc.description ? ` - ${svc.description}` : ''}\n`;
    }
    return md;
}

export function getServiceDocMd(serviceName: string): string | null {
    const types = new Map<string, string>();
    const seg = getServiceDoc(serviceName, types);
    if (!seg) return null;
    return segmentToMarkdown(seg, 1) + typesToMarkdown(types);
}

export function getServiceNames(): string[] {
    return getParsedServices().map(s => s.name);
}
