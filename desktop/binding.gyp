{
  "targets": [],
  "conditions": [
    ["OS=='mac'", {
      "targets": [
        {
          "target_name": "ThumbnailMac",
          "sources": ["addons/ThumbnailMac.mm"],
          "cflags": ["-fobjc-arc"],
          "libraries": ["-framework QuickLookThumbnailing", "-framework Foundation"],
          "xcode_settings": {
            "CLANG_ENABLE_OBJC_ARC": "YES"
          },
          "dependencies": [
            "<!(node -p \"require('node-addon-api').targets\"):node_addon_api"
          ]
        },
        {
          "target_name": "AppsMac",
          "sources": ["addons/AppsMac.mm"],
          "cflags": ["-fobjc-arc"],
          "libraries": [
            "-framework Foundation",
            "-framework AppKit",
            "-framework CoreGraphics",
            "-framework ApplicationServices",
            "-framework Carbon"
          ],
          "xcode_settings": {
            "CLANG_ENABLE_OBJC_ARC": "YES",
            "OTHER_CPLUSPLUSFLAGS": ["-std=c++17"]
          },
          "dependencies": [
            "<!(node -p \"require('node-addon-api').targets\"):node_addon_api"
          ]
        }
      ]
    }],
    ["OS=='win'", {
      "targets": [
        {
          "target_name": "SystemWin",
          "sources": ["addons/SystemWin.cpp"],
          "defines": ["_WIN32", "NAPI_CPP_EXCEPTIONS"],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1
            }
          },
          "dependencies": [
            "<!(node -p \"require('node-addon-api').targets\"):node_addon_api"
          ]
        },
        {
          "target_name": "ThumbnailWin",
          "sources": ["addons/ThumbnailWin.cpp"],
          "defines": ["_WIN32", "NAPI_CPP_EXCEPTIONS", "_UNICODE"],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1
            }
          },
          "dependencies": [
            "<!(node -p \"require('node-addon-api').targets\"):node_addon_api"
          ]
        },
        {
          "target_name": "MediaControlWin",
          "sources": ["addons/MediaControlWin.cpp"],
          "defines": ["_WIN32", "NAPI_CPP_EXCEPTIONS"],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "AdditionalOptions": ["/std:c++17", "/await"]
            }
          },
          "libraries": [
            "windowsapp.lib"
          ],
          "dependencies": [
            "<!(node -p \"require('node-addon-api').targets\"):node_addon_api"
          ]
        },
        {
          "target_name": "DiscoveryWin",
          "sources": ["addons/DiscoveryWin.cpp"],
          "defines": ["_WIN32", "NAPI_CPP_EXCEPTIONS"],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1
            }
          },
          "libraries": [
            "dnsapi.lib"
          ],
          "dependencies": [
            "<!(node -p \"require('node-addon-api').targets\"):node_addon_api"
          ]
        },
        {
          "target_name": "DatagramWin",
          "sources": ["addons/DatagramWin.cpp"],
          "defines": ["_WIN32", "NAPI_CPP_EXCEPTIONS"],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "AdditionalOptions": ["/std:c++17", "/await"]
            }
          },
          "libraries": [
            "windowsapp.lib"
          ],
          "dependencies": [
            "<!(node -p \"require('node-addon-api').targets\"):node_addon_api"
          ]
        },
        {
          "target_name": "AppContainerWin",
          "sources": ["addons/AppContainerWin.cpp"],
          "defines": ["_WIN32", "NAPI_CPP_EXCEPTIONS"],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "AdditionalOptions": ["/std:c++17", "/await"]
            }
          },
          "libraries": [
            "windowsapp.lib"
          ],
          "dependencies": [
            "<!(node -p \"require('node-addon-api').targets\"):node_addon_api"
          ]
        },
        {
          "target_name": "AppsWin",
          "sources": ["addons/AppsWin.cpp"],
          "defines": ["_WIN32", "NAPI_CPP_EXCEPTIONS", "_UNICODE", "UNICODE"],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "AdditionalOptions": ["/std:c++17"]
            }
          },
          "libraries": [
            "gdi32.lib",
            "user32.lib",
            "shell32.lib",
            "gdiplus.lib",
            "ole32.lib",
            "dwmapi.lib",
            "psapi.lib",
            "shlwapi.lib"
          ],
          "dependencies": [
            "<!(node -p \"require('node-addon-api').targets\"):node_addon_api"
          ]
        }
      ]
    }]
  ]
}
