export type createPhotoType = {
    directory: string;
    filename: string;
    mimeType: string;
    capturedOn: Date;
    size: number;
    duration: number | null;
    height: number | null;
    width: number | null;
    originDevice: string | null;
    metadata: string | null;
};

export type MetadataType = {
    cameraMake: string;
    cameraModel: string;
    orientation: string;
    focalLength?: string;
    aperture?: string;
    exposureTime?: string;
    isoSpeedRatings?: string;
    fps?: number;
    gpsLatitude?: string;
    gpsLongitude?: string;
};

export type AssetDetailType = {
    metadata: MetadataType;
    duration?: number;
    width?: number;
    height?: number;
    capturedOn: Date;
};
