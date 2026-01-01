#include <napi.h>
#include <windows.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Media.Control.h>
#include <string>

using namespace winrt;
using namespace Windows::Foundation;
using namespace Windows::Media::Control;

std::string ConvertWStringToString(const std::wstring& wstr)
{
    if (wstr.empty()) return std::string();
    int size_needed = WideCharToMultiByte(CP_UTF8, 0, &wstr[0], (int)wstr.size(), NULL, 0, NULL, NULL);
    std::string strTo(size_needed, 0);
    WideCharToMultiByte(CP_UTF8, 0, &wstr[0], (int)wstr.size(), &strTo[0], size_needed, NULL, NULL);
    return strTo;
}

GlobalSystemMediaTransportControlsSessionManager GetSessionManager()
{
    try
    {
        auto requestOp = GlobalSystemMediaTransportControlsSessionManager::RequestAsync();
        requestOp.get();
        return requestOp.GetResults();
    }
    catch (...)
    {
        return nullptr;
    }
}

Napi::Value GetAudioPlaybackInfo(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    try
    {
        auto sessionManager = GetSessionManager();
        
        if (!sessionManager)
        {
            Napi::TypeError::New(env, "Failed to get session manager").ThrowAsJavaScriptException();
            return env.Null();
        }

        auto session = sessionManager.GetCurrentSession();
        if (!session)
        {
            Napi::TypeError::New(env, "No active media session").ThrowAsJavaScriptException();
            return env.Null();
        }

        Napi::Object result = Napi::Object::New(env);

        // Get playback info
        auto playbackInfo = session.GetPlaybackInfo();
        auto status = playbackInfo.PlaybackStatus();

        std::string playbackStatus;
        switch (status)
        {
        case GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing:
            playbackStatus = "playing";
            break;
        case GlobalSystemMediaTransportControlsSessionPlaybackStatus::Paused:
            playbackStatus = "paused";
            break;
        case GlobalSystemMediaTransportControlsSessionPlaybackStatus::Stopped:
            playbackStatus = "stopped";
            break;
        default:
            playbackStatus = "unknown";
            break;
        }

        result.Set("status", playbackStatus);

        // Get media properties
        try
        {
            auto mediaPropertiesOp = session.TryGetMediaPropertiesAsync();
            mediaPropertiesOp.get();
            auto mediaProperties = mediaPropertiesOp.GetResults();

            if (mediaProperties)
            {
                result.Set("title", ConvertWStringToString(std::wstring(mediaProperties.Title())));
                result.Set("artist", ConvertWStringToString(std::wstring(mediaProperties.Artist())));
                result.Set("albumTitle", ConvertWStringToString(std::wstring(mediaProperties.AlbumTitle())));
            }
        }
        catch (...)
        {
            // Media properties not available
        }

        // Get timeline properties
        try
        {
            auto timelineProps = session.GetTimelineProperties();
            if (timelineProps)
            {
                result.Set("position", Napi::Number::New(env, timelineProps.Position().count() / 10000000.0));
                result.Set("duration", Napi::Number::New(env, timelineProps.EndTime().count() / 10000000.0));
            }
        }
        catch (...)
        {
            // Timeline properties not available
        }

        return result;
    }
    catch (const hresult_error &e)
    {
        std::string errorMsg = "WinRT error: " + ConvertWStringToString(e.message().c_str());
        Napi::Error::New(env, errorMsg).ThrowAsJavaScriptException();
        return env.Null();
    }
    catch (const std::exception &e)
    {
        Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        return env.Null();
    }
    catch (...)
    {
        Napi::Error::New(env, "Unknown error occurred").ThrowAsJavaScriptException();
        return env.Null();
    }
}

Napi::Value PauseAudioPlayback(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    try
    {
        auto sessionManager = GetSessionManager();
        
        if (!sessionManager)
        {
            Napi::TypeError::New(env, "Failed to get session manager").ThrowAsJavaScriptException();
            return env.Undefined();
        }

        auto session = sessionManager.GetCurrentSession();
        if (!session)
        {
            Napi::TypeError::New(env, "No active media session").ThrowAsJavaScriptException();
            return env.Undefined();
        }

        auto pauseOp = session.TryPauseAsync();
        pauseOp.get();
        bool success = pauseOp.GetResults();

        if (!success)
        {
            Napi::Error::New(env, "Failed to pause playback").ThrowAsJavaScriptException();
        }

        return env.Undefined();
    }
    catch (const std::exception &e)
    {
        Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        return env.Undefined();
    }
    catch (...)
    {
        Napi::Error::New(env, "Unknown error occurred").ThrowAsJavaScriptException();
        return env.Undefined();
    }
}

Napi::Value PlayAudioPlayback(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    try
    {
        auto sessionManager = GetSessionManager();
        
        if (!sessionManager)
        {
            Napi::TypeError::New(env, "Failed to get session manager").ThrowAsJavaScriptException();
            return env.Undefined();
        }

        auto session = sessionManager.GetCurrentSession();
        if (!session)
        {
            Napi::TypeError::New(env, "No active media session").ThrowAsJavaScriptException();
            return env.Undefined();
        }

        auto playOp = session.TryPlayAsync();
        playOp.get();
        bool success = playOp.GetResults();

        if (!success)
        {
            Napi::Error::New(env, "Failed to play playback").ThrowAsJavaScriptException();
        }

        return env.Undefined();
    }
    catch (const std::exception &e)
    {
        Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        return env.Undefined();
    }
    catch (...)
    {
        Napi::Error::New(env, "Unknown error occurred").ThrowAsJavaScriptException();
        return env.Undefined();
    }
}

Napi::Value NextAudioTrack(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    try
    {
        auto sessionManager = GetSessionManager();
        
        if (!sessionManager)
        {
            Napi::TypeError::New(env, "Failed to get session manager").ThrowAsJavaScriptException();
            return env.Undefined();
        }

        auto session = sessionManager.GetCurrentSession();
        if (!session)
        {
            Napi::TypeError::New(env, "No active media session").ThrowAsJavaScriptException();
            return env.Undefined();
        }

        auto nextOp = session.TrySkipNextAsync();
        nextOp.get();
        bool success = nextOp.GetResults();

        if (!success)
        {
            Napi::Error::New(env, "Failed to skip to next track").ThrowAsJavaScriptException();
        }

        return env.Undefined();
    }
    catch (const std::exception &e)
    {
        Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        return env.Undefined();
    }
    catch (...)
    {
        Napi::Error::New(env, "Unknown error occurred").ThrowAsJavaScriptException();
        return env.Undefined();
    }
}

Napi::Value PreviousAudioTrack(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    try
    {
        auto sessionManager = GetSessionManager();
        
        if (!sessionManager)
        {
            Napi::TypeError::New(env, "Failed to get session manager").ThrowAsJavaScriptException();
            return env.Undefined();
        }

        auto session = sessionManager.GetCurrentSession();
        if (!session)
        {
            Napi::TypeError::New(env, "No active media session").ThrowAsJavaScriptException();
            return env.Undefined();
        }

        auto prevOp = session.TrySkipPreviousAsync();
        prevOp.get();
        bool success = prevOp.GetResults();

        if (!success)
        {
            Napi::Error::New(env, "Failed to skip to previous track").ThrowAsJavaScriptException();
        }

        return env.Undefined();
    }
    catch (const std::exception &e)
    {
        Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        return env.Undefined();
    }
    catch (...)
    {
        Napi::Error::New(env, "Unknown error occurred").ThrowAsJavaScriptException();
        return env.Undefined();
    }
}

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set("getAudioPlaybackInfo", Napi::Function::New(env, GetAudioPlaybackInfo));
    exports.Set("pauseAudioPlayback", Napi::Function::New(env, PauseAudioPlayback));
    exports.Set("playAudioPlayback", Napi::Function::New(env, PlayAudioPlayback));
    exports.Set("nextAudioTrack", Napi::Function::New(env, NextAudioTrack));
    exports.Set("previousAudioTrack", Napi::Function::New(env, PreviousAudioTrack));
    return exports;
}

NODE_API_MODULE(MediaControlWin, Init);
