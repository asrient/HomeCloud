{
  "targets": [
    {
      "target_name": "SystemWin",
      "conditions": [
        ["OS=='win'", {
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
        }]
      ]
    },
    {
      "target_name": "ThumbnailWin",
      "conditions": [
        ["OS=='win'", {
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
        }]
      ]
    },
    {
      "target_name": "MediaControlWin",
      "conditions": [
        ["OS=='win'", {
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
        }]
      ]
    },
    {
      "target_name": "DiscoveryWin",
      "conditions": [
        ["OS=='win'", {
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
        }]
      ]
    },
    {
      "target_name": "DatagramWin",
      "conditions": [
        ["OS=='win'", {
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
        }]
      ]
    },
    {
      "target_name": "AppContainerWin",
      "conditions": [
        ["OS=='win'", {
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
        }]
      ]
    },
    {
      "target_name": "ThumbnailMac",
      "conditions": [
        ["OS=='mac'", {
          "sources": ["addons/ThumbnailMac.mm"],
          "cflags": ["-fobjc-arc"],
          "libraries": ["-framework QuickLookThumbnailing", "-framework Foundation"],
          "xcode_settings": {
            "CLANG_ENABLE_OBJC_ARC": "YES"
          },
          "dependencies": [
            "<!(node -p \"require('node-addon-api').targets\"):node_addon_api"
          ]
        }]
      ]
    },
  ]
}
