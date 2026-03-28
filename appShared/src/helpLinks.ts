
const BASE_URL = "https://asrient.github.io/homecloud";
const BASE_REPO_URL = 'https://github.com/asrient/HomeCloud';

export const helpLinks = {
    Privacy: `${BASE_URL}/docs/help/privacy`,
    Terms: `${BASE_URL}/docs/help/privacy`,
    Website: BASE_URL,
    Download: `${BASE_URL}/download`,
    ReportIssue: `${BASE_REPO_URL}/issues`,
};

export type HelpLinkType = keyof typeof helpLinks;

export function createCrashReportLink(appType: string, title: string, details: string): string {
    const issueTitle = encodeURIComponent(`[${appType}] Crash Report: ${title}`);
    const body = encodeURIComponent(details);
    return `${helpLinks.ReportIssue}/new?title=${issueTitle}&body=${body}`;
}
