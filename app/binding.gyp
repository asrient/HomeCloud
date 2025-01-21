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
      "target_name": "ThumbnailMac",
      "conditions": [
        ["OS=='mac'", {
          "sources": ["addons/ThumbnailMac.mm"],
          "cflags": ["-fobjc-arc"],
          "libraries": ["-framework QuickLookThumbnailing", "-framework Foundation"],
          "xcode_settings": {
            "CLANG_ENABLE_OBJC_ARC": "YES"
          }
        }]
      ]
    },
  ]
}
