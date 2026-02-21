# Privacy Policy

- **Effective Date:** February 22, 2026
- **Last Updated:** February 22, 2026

HomeCloud ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how HomeCloud collects, uses, stores, and shares information when you use our desktop and mobile applications (collectively, the "App"). By using the App, you agree to the practices described in this policy.

## 1. Overview

HomeCloud is a companion app for accessing and controlling your devices directly. HomeCloud is built with privacy at its core, your personal data are transferred directly between your devices using peer-to-peer connections and are **never** stored on or routed through our servers.

## 2. Information We Collect

### 2.1 Account Information

When you create an account and link a device, we collect:

- **Email address** — used for account identification and verification.

We do **not** collect passwords, names, phone numbers, or social media profiles.

### 2.2 Device Information

When you link a device to your account, the following information is sent to our server:

- **Device name** (e.g., "Julia's MacBook")
- **Device type** (desktop, laptop, mobile, or tablet)
- **Operating system and version** (e.g., macOS Sequoia, Windows 11, iOS 18, Android 15)
- **App version**
- **Device fingerprint** — a SHA-256 hash of a locally generated public key, used as a unique device identifier
- **Public key** — used for cryptographic authentication between devices

### 2.3 Transient Connection Data

To facilitate device-to-device connections, our server temporarily processes:

- **IP addresses** — used only for NAT traversal (establishing peer-to-peer connections over the internet). These are held transiently (typically 2–5 minutes) and are **not** permanently stored.
- **Online/offline status** — so your devices know which other devices are currently available.

### 2.4 Information Stored Only on Your Device

The following data is stored locally on your device and is **never** sent to our servers:

- Authentication tokens and session data
- User preferences and settings
- Pinned folder bookmarks
- Photo library locations
- Cached peer addresses (for faster reconnection)
- Files, photos, clipboard content, and any data you transfer between devices

### 2.5 Information We Do NOT Collect

- **No analytics or telemetry.** We do not use any analytics SDKs, crash reporting tools, or tracking services (e.g., no Google Analytics, Firebase Analytics, Sentry, Amplitude, or similar).
- **No advertising identifiers.** We do not collect or use advertising IDs.
- **No location data.** We do not access GPS, geolocation services, or any location information.
- **No contacts, calendars, or call logs.**
- **No browsing history or search queries.**
- **No health or financial data.**
- **No usage tracking or behavioral profiling.**

## 3. How We Use Your Information

We use the information we collect solely for the following purposes:

| Information | Purpose |
|---|---|
| Email address | Account creation, login verification (PIN delivery), and account identification |
| Device information | Displaying your devices in the App and facilitating connections between them |
| Device fingerprint & public key | Cryptographic authentication to ensure only your devices can connect to each other |
| IP addresses (transient) | Establishing peer-to-peer connections between your devices via NAT traversal |

We do **not** use your information for advertising, marketing, profiling, or any purpose unrelated to the App's core functionality.

## 4. How Data Is Transferred Between Devices

### 4.1 Peer-to-Peer Architecture

All data transfers between your devices (files, photos, clipboard content, media control commands, etc.) happen **directly between your devices** using peer-to-peer connections. Our servers **never** see, store, relay, or have access to this data.

### 4.2 Local Network (LAN)

On the same Wi-Fi network, devices discover each other using mDNS (Bonjour) and connect directly over TCP. Only the device name, a truncated fingerprint, version, and icon identifier are broadcast on the local network.

### 4.3 Remote Connections (Over the Internet)

For connections across different networks, our server facilitates the initial connection setup (signaling) only. Once the peer-to-peer connection is established via UDP hole-punching, all data flows directly between devices without passing through our servers.

## 5. Encryption & Security

- **Mutual authentication:** Each device generates an RSA key pair. Devices mutually authenticate each other by exchanging encrypted one-time challenges — only the holder of the correct private key can complete authentication. This prevents impersonation and man-in-the-middle attacks.
- **End-to-end encryption:** All connections between devices are end-to-end encrypted. A unique random symmetric encryption key is generated and securely exchanged via RSA for each connection session. All subsequent data in that session is encrypted with this key.
- **Session isolation:** Each connection uses a freshly generated encryption key. Compromising one session's key does not affect the confidentiality of any other past or future session.
- **Zero-knowledge architecture:** Our servers facilitate connection setup only. They never have access to the encryption keys used between your devices and cannot decrypt any data transferred between them.
- **Server communication:** All communication between the App and our authentication server uses HTTPS/WSS (TLS-encrypted connections).
- **Verification PINs:** Login PINs are short-lived (15 minutes) and stored transiently.

## 6. Data Sharing & Third Parties

### 6.1 Third-Party Services

We use the following third-party service in connection with the App:

- **Azure Communication Services (Microsoft)** — used solely to send verification PIN emails during login. Only your email address and the PIN are provided to this service. No other personal data is shared.

### 6.2 No Data Selling or Sharing

We do **not** sell, rent, trade, or share your personal information with third parties for advertising, marketing, or any commercial purpose. We do not share data with data brokers, ad networks, or analytics providers.

### 6.3 Legal Requirements

We may disclose your information if required to do so by law or in response to valid legal process (e.g., a court order or subpoena), or to protect the rights, property, or safety of HomeCloud, our users, or others.

## 7. Data Storage & Retention

### 7.1 Server-Side Storage

- **Account data** (email, account ID, creation date) and **device data** (device name, fingerprint, OS, app version) are stored in our database for as long as your account exists.
- **Transient data** (verification PINs, connection signaling data, online status) is automatically deleted after a short period (2–15 minutes).

### 7.2 On-Device Storage

Account credentials, preferences, and cached data are stored locally on your device using the App's private storage. This data remains on your device and can be removed by unlinking your device or uninstalling the App.

### 7.3 Data Deletion

You may request deletion of your account and all associated data at any time. Upon account deletion:
- Your email, account record, and all linked device records are permanently removed from our servers.
- Local data on your devices can be removed by uninstalling the App.

## 8. Device Permissions

HomeCloud requests the following permissions on your device, each directly related to the App's functionality:

### 8.1 Mobile (iOS & Android)

| Permission | Purpose |
|---|---|
| Local Network Access | Discover and connect to other HomeCloud devices on your Wi-Fi network |
| Photo Library Access | Browse and send photos to your other devices |
| File/Document Access | Browse and transfer files between devices |
| Network State & Wi-Fi State (Android) | Detect network availability for device discovery |
| Storage Access (Android) | Access files for transfer between devices |

### 8.2 Desktop (macOS & Windows)

The desktop App accesses:
- **Files and folders** you explicitly select or pin for sharing
- **System information** (OS, battery, disk space) to display on connected devices
- **Clipboard** content (text, images, file paths) when you explicitly share it or a connected device requests it
- **Media playback** information and controls (track info, play/pause, volume) for remote control from connected devices
- **Local network** for device discovery via mDNS

All access is limited to data you choose to share. The App does **not** run background scans, index your files, or access data without user-initiated action.

## 9. Your Rights & Controls

You have the following rights and controls over your data:

- **Unlinking devices:** You can unlink any device from your account at any time, removing its record from our server.
- **Account deletion:** You may request full account deletion, which removes all server-side data.
- **Clipboard sharing:** Clipboard content is only accessed when explicitly triggered. You control whether to accept received clipboard content.
- **File and photo access:** Only folders and files you explicitly select or pin are accessible to connected devices.
- **Peer authorization:** Only devices linked to your account can connect to each other. Unauthorized devices cannot access your data.

## 10. Children's Privacy

HomeCloud is not directed at children under the age of 13 (or the applicable age in your jurisdiction). We do not knowingly collect personal information from children. If we become aware that we have collected personal information from a child without parental consent, we will take steps to delete that information promptly.

## 11. International Data Transfers

Our authentication server may be hosted in a different country than where you are located. By using the App, you consent to the transfer of your account and device information (as described in Sections 2.1 and 2.2) to these servers. However, since all personal content (files, photos, clipboard, etc.) is transferred peer-to-peer and never reaches our servers, it is not subject to international data transfer.

## 12. Changes to This Privacy Policy

We may update this Privacy Policy from time to time to reflect changes in our practices or for legal, regulatory, or operational reasons. We will update the "Last Updated" date at the top of this page. We encourage you to review this policy periodically. Continued use of the App after changes constitutes acceptance of the updated policy.

## 13. Compliance

This Privacy Policy is designed to comply with the requirements of:

- **Microsoft Store Policies** (Section 10.5 — Personal Information)
- **Apple App Store Review Guidelines** (Section 5.1 — Privacy)
- **Google Play Developer Policy** (User Data policy)
- **General Data Protection Regulation (GDPR)**
- **California Consumer Privacy Act (CCPA)**
- **Children's Online Privacy Protection Act (COPPA)**

## 14. Contact Us

If you have any questions, concerns, or requests regarding this Privacy Policy or your personal data, please contact us:

- **Email:** support@asrient.com
- **GitHub:** [https://github.com/asrient/HomeCloud/issues](https://github.com/asrient/HomeCloud/issues)
