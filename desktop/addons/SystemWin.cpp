#include <napi.h>
#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>
#include <string>
#include <vector>

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

// Convert wide string to UTF-8 string
std::string WideToUtf8(const std::wstring &wide)
{
    if (wide.empty())
        return std::string();
    int size = WideCharToMultiByte(CP_UTF8, 0, wide.c_str(), -1, nullptr, 0, nullptr, nullptr);
    if (size <= 0)
        return std::string();
    std::string utf8(size - 1, 0);
    WideCharToMultiByte(CP_UTF8, 0, wide.c_str(), -1, &utf8[0], size, nullptr, nullptr);
    return utf8;
}

// Convert UTF-8 string to wide string
std::wstring Utf8ToWide(const std::string &utf8)
{
    if (utf8.empty())
        return std::wstring();
    int size = MultiByteToWideChar(CP_UTF8, 0, utf8.c_str(), -1, nullptr, 0);
    if (size <= 0)
        return std::wstring();
    std::wstring wide(size - 1, 0);
    MultiByteToWideChar(CP_UTF8, 0, utf8.c_str(), -1, &wide[0], size);
    return wide;
}

/**
 * Read file paths from clipboard (CF_HDROP format)
 * Returns an array of file paths or empty array if no files in clipboard
 */
Napi::Array GetClipboardFilePaths(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    Napi::Array result = Napi::Array::New(env);

    if (!OpenClipboard(nullptr))
    {
        return result;
    }

    HANDLE hDrop = GetClipboardData(CF_HDROP);
    if (hDrop != nullptr)
    {
        HDROP hdrop = static_cast<HDROP>(hDrop);
        UINT fileCount = DragQueryFileW(hdrop, 0xFFFFFFFF, nullptr, 0);

        for (UINT i = 0; i < fileCount; i++)
        {
            UINT pathLen = DragQueryFileW(hdrop, i, nullptr, 0);
            if (pathLen > 0)
            {
                std::wstring filePath(pathLen + 1, L'\0');
                DragQueryFileW(hdrop, i, &filePath[0], pathLen + 1);
                filePath.resize(pathLen); // Remove null terminator from length

                std::string utf8Path = WideToUtf8(filePath);
                result.Set(i, Napi::String::New(env, utf8Path));
            }
        }
    }

    CloseClipboard();
    return result;
}

/**
 * Write file paths to clipboard (CF_HDROP format)
 * Accepts an array of file paths
 * Returns true on success, false on failure
 */
Napi::Boolean SetClipboardFilePaths(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsArray())
    {
        Napi::TypeError::New(env, "Expected an array of file paths").ThrowAsJavaScriptException();
        return Napi::Boolean::New(env, false);
    }

    Napi::Array pathsArray = info[0].As<Napi::Array>();
    uint32_t pathCount = pathsArray.Length();

    if (pathCount == 0)
    {
        return Napi::Boolean::New(env, false);
    }

    // Convert paths to wide strings and calculate total size needed
    std::vector<std::wstring> widePaths;
    size_t totalChars = 0;

    for (uint32_t i = 0; i < pathCount; i++)
    {
        Napi::Value val = pathsArray.Get(i);
        if (!val.IsString())
            continue;

        std::string utf8Path = val.As<Napi::String>().Utf8Value();
        // Normalize forward slashes to backslashes
        for (char &c : utf8Path)
        {
            if (c == '/')
                c = '\\';
        }

        std::wstring widePath = Utf8ToWide(utf8Path);
        if (!widePath.empty())
        {
            totalChars += widePath.length() + 1; // +1 for null terminator
            widePaths.push_back(widePath);
        }
    }

    if (widePaths.empty())
    {
        return Napi::Boolean::New(env, false);
    }

    totalChars += 1; // Double null terminator at the end

    // Calculate total size: DROPFILES header + file paths
    size_t totalSize = sizeof(DROPFILES) + (totalChars * sizeof(wchar_t));

    // Allocate global memory for DROPFILES structure
    HGLOBAL hGlobal = GlobalAlloc(GHND | GMEM_SHARE, totalSize);
    if (hGlobal == nullptr)
    {
        return Napi::Boolean::New(env, false);
    }

    DROPFILES *pDropFiles = static_cast<DROPFILES *>(GlobalLock(hGlobal));
    if (pDropFiles == nullptr)
    {
        GlobalFree(hGlobal);
        return Napi::Boolean::New(env, false);
    }

    // Fill DROPFILES structure
    pDropFiles->pFiles = sizeof(DROPFILES); // Offset to file list
    pDropFiles->pt.x = 0;
    pDropFiles->pt.y = 0;
    pDropFiles->fNC = FALSE;
    pDropFiles->fWide = TRUE; // Unicode paths

    // Copy file paths after the DROPFILES structure
    wchar_t *pFilePath = reinterpret_cast<wchar_t *>(reinterpret_cast<BYTE *>(pDropFiles) + sizeof(DROPFILES));

    for (const auto &path : widePaths)
    {
        wcscpy(pFilePath, path.c_str());
        pFilePath += path.length() + 1; // Move past string and null terminator
    }
    *pFilePath = L'\0'; // Double null terminator

    GlobalUnlock(hGlobal);

    // Open clipboard and set data
    if (!OpenClipboard(nullptr))
    {
        GlobalFree(hGlobal);
        return Napi::Boolean::New(env, false);
    }

    EmptyClipboard();

    if (SetClipboardData(CF_HDROP, hGlobal) == nullptr)
    {
        GlobalFree(hGlobal);
        CloseClipboard();
        return Napi::Boolean::New(env, false);
    }

    CloseClipboard();
    // Note: Don't free hGlobal - clipboard owns it now

    return Napi::Boolean::New(env, true);
}

/**
 * Check if clipboard contains file paths (CF_HDROP format)
 */
Napi::Boolean HasClipboardFilePaths(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    if (!OpenClipboard(nullptr))
    {
        return Napi::Boolean::New(env, false);
    }

    bool hasFiles = IsClipboardFormatAvailable(CF_HDROP) != 0;
    CloseClipboard();

    return Napi::Boolean::New(env, hasFiles);
}

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set("getDriveInfo", Napi::Function::New(env, GetDriveInfo));
    exports.Set("getClipboardFilePaths", Napi::Function::New(env, GetClipboardFilePaths));
    exports.Set("setClipboardFilePaths", Napi::Function::New(env, SetClipboardFilePaths));
    exports.Set("hasClipboardFilePaths", Napi::Function::New(env, HasClipboardFilePaths));
    return exports;
}

NODE_API_MODULE(DiskInfoWin, Init);
