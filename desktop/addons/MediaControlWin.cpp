#include <napi.h>
#include <windows.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Media.Control.h>
#include <string>
#include <mutex>

using namespace winrt;
using namespace Windows::Foundation;
using namespace Windows::Media::Control;

// Global state for event handling
static Napi::ThreadSafeFunction tsfn;
static std::mutex callbackMutex;
static event_token playbackInfoToken;
static event_token mediaPropertiesToken;
static event_token sessionChangedToken;
static GlobalSystemMediaTransportControlsSession currentSession = nullptr;
static GlobalSystemMediaTransportControlsSessionManager sessionManager = nullptr;

std::string ConvertWStringToString(const std::wstring& wstr)
{
    if (wstr.empty()) return std::string();
    int size_needed = WideCharToMultiByte(CP_UTF8, 0, &wstr[0], (int)wstr.size(), NULL, 0, NULL, NULL);
    std::string strTo(size_needed, 0);
    WideCharToMultiByte(CP_UTF8, 0, &wstr[0], (int)wstr.size(), &strTo[0], size_needed, NULL, NULL);
    return strTo;
}

struct PlaybackInfoData
{
    std::string status;
    std::string title;
    std::string artist;
    std::string albumTitle;
    double position;
    double duration;
    bool hasPosition;
    bool hasDuration;
};

void CallJSCallback(Napi::Env env, Napi::Function jsCallback, PlaybackInfoData* data)
{
    Napi::Object result = Napi::Object::New(env);
    result.Set("status", data->status);
    
    if (!data->title.empty())
        result.Set("title", data->title);
    if (!data->artist.empty())
        result.Set("artist", data->artist);
    if (!data->albumTitle.empty())
        result.Set("albumTitle", data->albumTitle);
    if (data->hasPosition)
        result.Set("position", data->position);
    if (data->hasDuration)
        result.Set("duration", data->duration);
    
    jsCallback.Call({result});
    delete data;
}

// Forward declaration
void NotifyPlaybackInfoChanged();

void AttachToSession(GlobalSystemMediaTransportControlsSession session)
{
    if (!session || !tsfn)
        return;

    try
    {
        // Unregister old session handlers if any
        if (currentSession)
        {
            try
            {
                currentSession.PlaybackInfoChanged(playbackInfoToken);
                currentSession.MediaPropertiesChanged(mediaPropertiesToken);
            }
            catch (...) {}
        }

        currentSession = session;

        // Register for PlaybackInfoChanged events (play/pause)
        playbackInfoToken = currentSession.PlaybackInfoChanged([](auto&&, auto&&)
        {
            NotifyPlaybackInfoChanged();
        });

        // Register for MediaPropertiesChanged events (track changes)
        mediaPropertiesToken = currentSession.MediaPropertiesChanged([](auto&&, auto&&)
        {
            NotifyPlaybackInfoChanged();
        });

        // Immediately notify with current state
        NotifyPlaybackInfoChanged();
    }
    catch (...) {}
}

void NotifyPlaybackInfoChanged()
{
    std::lock_guard<std::mutex> lock(callbackMutex);
    
    if (!tsfn || !currentSession)
        return;

    try
    {
        PlaybackInfoData* data = new PlaybackInfoData();
        data->hasPosition = false;
        data->hasDuration = false;

        // Get playback status
        auto playbackInfo = currentSession.GetPlaybackInfo();
        auto status = playbackInfo.PlaybackStatus();

        switch (status)
        {
        case GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing:
            data->status = "playing";
            break;
        case GlobalSystemMediaTransportControlsSessionPlaybackStatus::Paused:
            data->status = "paused";
            break;
        case GlobalSystemMediaTransportControlsSessionPlaybackStatus::Stopped:
            data->status = "stopped";
            break;
        default:
            data->status = "unknown";
            break;
        }

        // Get media properties
        try
        {
            auto mediaPropertiesOp = currentSession.TryGetMediaPropertiesAsync();
            mediaPropertiesOp.get();
            auto mediaProperties = mediaPropertiesOp.GetResults();

            if (mediaProperties)
            {
                data->title = ConvertWStringToString(std::wstring(mediaProperties.Title()));
                data->artist = ConvertWStringToString(std::wstring(mediaProperties.Artist()));
                data->albumTitle = ConvertWStringToString(std::wstring(mediaProperties.AlbumTitle()));
            }
        }
        catch (...) {}

        // Get timeline properties
        try
        {
            auto timelineProps = currentSession.GetTimelineProperties();
            if (timelineProps)
            {
                data->position = timelineProps.Position().count() / 10000000.0;
                data->duration = timelineProps.EndTime().count() / 10000000.0;
                data->hasPosition = true;
                data->hasDuration = true;
            }
        }
        catch (...) {}

        tsfn.BlockingCall(data, CallJSCallback);
    }
    catch (...) {}
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

Napi::Value OnAudioPlaybackInfoChanged(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsFunction())
    {
        Napi::TypeError::New(env, "Expected a callback function").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    Napi::Function callback = info[0].As<Napi::Function>();

    try
    {
        std::lock_guard<std::mutex> lock(callbackMutex);

        // Clean up existing callback and event handlers
        if (tsfn)
        {
            tsfn.Release();
        }

        if (currentSession)
        {
            try
            {
                currentSession.PlaybackInfoChanged(playbackInfoToken);
                currentSession.MediaPropertiesChanged(mediaPropertiesToken);
            }
            catch (...) {}
            currentSession = nullptr;
        }

        if (sessionManager)
        {
            try
            {
                sessionManager.CurrentSessionChanged(sessionChangedToken);
            }
            catch (...) {}
            sessionManager = nullptr;
        }

        // Create new thread-safe function
        tsfn = Napi::ThreadSafeFunction::New(
            env,
            callback,
            "MediaControlCallback",
            0,
            1,
            [](Napi::Env) {}
        );

        // Get session manager
        sessionManager = GetSessionManager();
        if (!sessionManager)
        {
            Napi::TypeError::New(env, "Failed to get session manager").ThrowAsJavaScriptException();
            return env.Undefined();
        }

        // Register for session changed events
        sessionChangedToken = sessionManager.CurrentSessionChanged([](auto&&, auto&&)
        {
            std::lock_guard<std::mutex> lock(callbackMutex);
            if (sessionManager)
            {
                auto session = sessionManager.GetCurrentSession();
                if (session)
                {
                    AttachToSession(session);
                }
            }
        });

        // Try to attach to current session if one exists
        auto session = sessionManager.GetCurrentSession();
        if (session)
        {
            AttachToSession(session);
        }
        // If no session exists now, the CurrentSessionChanged handler will catch it when one becomes available

        return env.Undefined();
    }
    catch (const hresult_error &e)
    {
        std::string errorMsg = "WinRT error: " + ConvertWStringToString(e.message().c_str());
        Napi::Error::New(env, errorMsg).ThrowAsJavaScriptException();
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
    exports.Set("onAudioPlaybackInfoChanged", Napi::Function::New(env, OnAudioPlaybackInfoChanged));
    return exports;
}

NODE_API_MODULE(MediaControlWin, Init);
