
const BASE_URL = "https://asrient.github.io/homecloud";

export const helpLinks = {
    Privacy: `${BASE_URL}/privacy`,
    Terms: `${BASE_URL}/terms`,
    Website: BASE_URL,
    Download: `${BASE_URL}/download`,
};

export type HelpLinkType = keyof typeof helpLinks;
