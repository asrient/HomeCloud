import path from "path";
import { normalisePath } from "./path.js";

export function extractURLPath(fullURL: string): string {
    const url = new URL(fullURL);
    let urlPath = url.pathname;
    if (urlPath.length <= 0) {
        urlPath = "/";
    }
    return normalisePath(urlPath);
}

export function joinURL(...parts: Array<string>): string {
    const p = parts.reduce((output, nextPart, partIndex) => {
        if (
            partIndex === 0 ||
            nextPart !== "/" ||
            (nextPart === "/" && output[output.length - 1] !== "/")
        ) {
            output.push(nextPart);
        }
        return output;
    }, []);
    return path.posix.join(...p);
}

export function normaliseHREF(href: string): string {
    try {
        const normalisedHref = href.replace(/^https?:\/\/[^\/]+/, "");
        return normalisedHref;
    } catch (err) {
        throw new Error(`Failed normalising href: ${err.message}`);
    }
}
