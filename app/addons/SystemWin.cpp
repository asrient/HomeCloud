#include <napi.h>
#include <windows.h>
#include <string>

std::string GetDriveTypeString(UINT driveType)
{
    switch (driveType)
    {
    case DRIVE_REMOVABLE:
        return "Removable";
    case DRIVE_FIXED:
        return "Fixed";
    case DRIVE_REMOTE:
        return "Network";
    case DRIVE_CDROM:
        return "CD-ROM";
    case DRIVE_RAMDISK:
        return "RAM Disk";
    case DRIVE_NO_ROOT_DIR:
        return "No Root Directory";
    default:
        return "Unknown";
    }
}

Napi::Array GetDriveInfo(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    Napi::Array drives = Napi::Array::New(env);

    char driveLetter[4] = "A:\\";
    DWORD drivesBitmask = GetLogicalDrives();

    if (drivesBitmask == 0)
    {
        Napi::Error::New(env, "Failed to retrieve drive information").ThrowAsJavaScriptException();
        return drives;
    }

    int index = 0;
    for (int i = 0; i < 26; ++i)
    {
        if (drivesBitmask & (1 << i))
        {
            driveLetter[0] = 'A' + i;

            UINT driveType = GetDriveTypeA(driveLetter);
            std::string type = GetDriveTypeString(driveType);

            ULARGE_INTEGER freeBytesAvailableToCaller;
            ULARGE_INTEGER totalBytes;
            ULARGE_INTEGER totalFreeBytes;
            char volumeName[MAX_PATH] = {0};

            // Get volume information (Drive Label)
            if (GetVolumeInformationA(driveLetter, volumeName, sizeof(volumeName), NULL, NULL, NULL, NULL, 0))
            {
                if (GetDiskFreeSpaceExA(driveLetter, &freeBytesAvailableToCaller, &totalBytes, &totalFreeBytes))
                {
                    Napi::Object drive = Napi::Object::New(env);
                    drive.Set("path", driveLetter);
                    drive.Set("name", std::string(volumeName));  // Drive label
                    drive.Set("type", type);
                    drive.Set("totalSpace", Napi::Number::New(env, static_cast<double>(totalBytes.QuadPart)));
                    drive.Set("freeSpace", Napi::Number::New(env, static_cast<double>(totalFreeBytes.QuadPart)));
                    drive.Set("usedSpace", Napi::Number::New(env, static_cast<double>(totalBytes.QuadPart - totalFreeBytes.QuadPart)));
                    drives.Set(index++, drive);
                }
            }
        }
    }

    return drives;
}

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set("getDriveInfo", Napi::Function::New(env, GetDriveInfo));
    return exports;
}

NODE_API_MODULE(DiskInfoWin, Init);
