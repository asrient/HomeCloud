
const BASE_URL = "https://asrient.github.io/homecloud";
const BASE_REPO_URL = 'https://github.com/asrient/HomeCloud';

export const helpLinks = {
    Privacy: `${BASE_URL}/privacy`,
    Terms: `${BASE_URL}/terms`,
    Website: BASE_URL,
    Download: `${BASE_URL}/download`,
    ReportIssue: `${BASE_REPO_URL}/issues`,
};

export type HelpLinkType = keyof typeof helpLinks;
