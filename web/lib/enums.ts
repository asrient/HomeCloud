// With currently local npm package structure, enums does not play well with TypeScript imports.
// So we define the enum here again to ensure compatibility with the web app.

export enum SignalEvent {
    ADD = "add",
    REMOVE = "remove",
    UPDATE = "update",
    ERROR = "error"
}

export enum OSType {
    Windows = "windows",
    MacOS = "macos",
    Linux = "linux",
    Android = "android",
    iOS = "ios",
    Unknown = "unknown"
}
