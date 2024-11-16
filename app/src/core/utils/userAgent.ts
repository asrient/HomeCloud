export function parseUserAgent(userAgent: string) {
    let browser = 'Unknown Browser';
    let os = 'Unknown OS';

    // Parse Operating System (OS)
    if (/Windows NT 10.0/.test(userAgent)) {
        os = 'Windows 10';
    } else if (/Windows NT 6.1/.test(userAgent)) {
        os = 'Windows 7';
    } else if (/Mac OS X/.test(userAgent)) {
        os = 'Mac OS X';
    } else if (/Linux/.test(userAgent)) {
        os = 'Linux';
    } else if (/Android/.test(userAgent)) {
        os = 'Android';
    } else if (/iPhone/.test(userAgent)) {
        os = 'iPhone iOS';
    } else if (/iPad/.test(userAgent)) {
        os = 'iPad iOS';
    }

    // Parse Browser
    if (/Chrome\/([0-9.]+)/.test(userAgent)) {
        browser = 'Chrome';
    } else if (/Safari\/([0-9.]+)/.test(userAgent) && !/Chrome/.test(userAgent)) {
        browser = 'Safari';
    } else if (/Firefox\/([0-9.]+)/.test(userAgent)) {
        browser = 'Firefox';
    } else if (/MSIE/.test(userAgent) || /Trident/.test(userAgent)) {
        browser = 'Internet Explorer';
    } else if (/Edg/.test(userAgent)) {
        browser = 'Microsoft Edge';
    }

    return {
        browser,
        os
    };
}

// Example Usage
// 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
// { browser: 'Chrome', os: 'Windows 10' }
