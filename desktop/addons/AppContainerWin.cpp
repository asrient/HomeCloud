#include <napi.h>
#include <windows.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.ApplicationModel.h>
#include <string>

namespace WinAppModel = winrt::Windows::ApplicationModel;

// ── Helpers ─────────────────────────────────────────────────────────

static std::string WideToUtf8(const std::wstring &wstr)
{
    if (wstr.empty())
        return {};
    int size = WideCharToMultiByte(CP_UTF8, 0, wstr.data(), (int)wstr.size(), nullptr, 0, nullptr, nullptr);
    std::string out(size, 0);
    WideCharToMultiByte(CP_UTF8, 0, wstr.data(), (int)wstr.size(), &out[0], size, nullptr, nullptr);
    return out;
}

// ── isPackaged() → boolean ──────────────────────────────────────────

/**
 * Check if the app is running in an MSIX/AppX packaged context.
 * Returns true if Windows.ApplicationModel.Package.Current succeeds,
 * meaning we have a package identity (AppContainer sandbox applies).
 */
Napi::Value IsPackaged(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    try
    {
        auto pkg = WinAppModel::Package::Current();
        // If we get here without throwing, we're packaged
        auto name = pkg.Id().Name();
        return Napi::Boolean::New(env, !name.empty());
    }
    catch (...)
    {
        return Napi::Boolean::New(env, false);
    }
}

// ── getPackageVersion() → string ────────────────────────────────────

/**
 * Get the MSIX package version as a string (e.g., "1.2.3.0").
 * Returns null if not running in a packaged context.
 */
Napi::Value GetPackageVersion(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    try
    {
        auto pkg = WinAppModel::Package::Current();
        auto ver = pkg.Id().Version();
        std::string version = std::to_string(ver.Major) + "." +
                              std::to_string(ver.Minor) + "." +
                              std::to_string(ver.Build) + "." +
                              std::to_string(ver.Revision);
        return Napi::String::New(env, version);
    }
    catch (...)
    {
        return env.Null();
    }
}

// ── StartupTask ─────────────────────────────────────────────────────

static const char *StartupTaskStateToString(WinAppModel::StartupTaskState state)
{
    switch (state)
    {
    case WinAppModel::StartupTaskState::Enabled:
        return "enabled";
    case WinAppModel::StartupTaskState::Disabled:
        return "disabled";
    case WinAppModel::StartupTaskState::DisabledByUser:
        return "disabledByUser";
    case WinAppModel::StartupTaskState::DisabledByPolicy:
        return "disabledByPolicy";
    case WinAppModel::StartupTaskState::EnabledByPolicy:
        return "enabledByPolicy";
    default:
        return "unknown";
    }
}

/**
 * Get the state of an MSIX StartupTask.
 * Returns: "enabled" | "disabled" | "disabledByUser" | "disabledByPolicy" | "enabledByPolicy" | "unknown"
 *
 * "disabledByUser" means the user turned it off in Settings > Apps > Startup
 * and the app cannot re-enable it programmatically.
 */
Napi::Value GetStartupTaskState(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString())
    {
        Napi::TypeError::New(env, "Expected taskId string").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string taskId = info[0].As<Napi::String>().Utf8Value();

    try
    {
        auto task = WinAppModel::StartupTask::GetAsync(winrt::to_hstring(taskId)).get();
        return Napi::String::New(env, StartupTaskStateToString(task.State()));
    }
    catch (const winrt::hresult_error &e)
    {
        Napi::Error::New(env, "StartupTask error: " + WideToUtf8(std::wstring(e.message()))).ThrowAsJavaScriptException();
        return env.Null();
    }
}

/**
 * Request enabling an MSIX StartupTask.
 * Returns the resulting state string.
 * Note: If user previously disabled via Settings, state will be "disabledByUser"
 * and the app cannot override it.
 */
Napi::Value RequestEnableStartupTask(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString())
    {
        Napi::TypeError::New(env, "Expected taskId string").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string taskId = info[0].As<Napi::String>().Utf8Value();

    try
    {
        auto task = WinAppModel::StartupTask::GetAsync(winrt::to_hstring(taskId)).get();
        auto resultState = task.RequestEnableAsync().get();
        return Napi::String::New(env, StartupTaskStateToString(resultState));
    }
    catch (const winrt::hresult_error &e)
    {
        Napi::Error::New(env, "StartupTask enable error: " + WideToUtf8(std::wstring(e.message()))).ThrowAsJavaScriptException();
        return env.Null();
    }
}

/**
 * Disable an MSIX StartupTask.
 */
Napi::Value DisableStartupTask(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString())
    {
        Napi::TypeError::New(env, "Expected taskId string").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    std::string taskId = info[0].As<Napi::String>().Utf8Value();

    try
    {
        auto task = WinAppModel::StartupTask::GetAsync(winrt::to_hstring(taskId)).get();
        task.Disable();
        return env.Undefined();
    }
    catch (const winrt::hresult_error &e)
    {
        Napi::Error::New(env, "StartupTask disable error: " + WideToUtf8(std::wstring(e.message()))).ThrowAsJavaScriptException();
        return env.Undefined();
    }
}

// ── Module init ─────────────────────────────────────────────────────

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set("isPackaged", Napi::Function::New(env, IsPackaged));
    exports.Set("getPackageVersion", Napi::Function::New(env, GetPackageVersion));
    exports.Set("getStartupTaskState", Napi::Function::New(env, GetStartupTaskState));
    exports.Set("requestEnableStartupTask", Napi::Function::New(env, RequestEnableStartupTask));
    exports.Set("disableStartupTask", Napi::Function::New(env, DisableStartupTask));
    return exports;
}

NODE_API_MODULE(AppContainerWin, Init)
