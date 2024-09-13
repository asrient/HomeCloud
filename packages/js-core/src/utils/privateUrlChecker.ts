import dns from "dns";
import ip from "ip";

async function lookup(hostname: string): Promise<string> {
    return new Promise((resolve, reject) => {
        dns.lookup(hostname, (err, address, family) => {
            if (err) {
                reject(err);
            } else {
                resolve(address);
            }
        });
    });
}

export async function isUrlPrivate(url: string) {
    if (!url.includes("://")) {
        url = `http://${url}`;
    }
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    const ipAddr = await lookup(hostname);
    return ip.isPrivate(ipAddr) || ip.isLoopback(ipAddr);
}
