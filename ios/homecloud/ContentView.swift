//
//  ContentView.swift
//  musicroom
//
//  Created by Aritra Sen on 20/05/23.
//

import SwiftUI
import Libx


class AppCallbacks: NSObject, LibxNativeCallbacksProtocol {
    func onWebEvent(_ Event: String?, dataStr DataStr: String?) -> String {
        print("got a sendEvent on swift", Event!, DataStr!)
        return ""
    }
}

func getDocumentsDirectory() -> String {
    let paths = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)
    let documentsDirectory = paths[0]
    return documentsDirectory.path()
}

struct ContentView: View {
    let app: LibxMobileApp
    init() {
        let config = LibxMobileAppConfig()
        config.platform = "mobile:ios"
        config.dataDir = getDocumentsDirectory()
        config.webDir = Bundle(path: "dist")?.bundlePath ?? ""
        app = LibxNewMobileApp(config, AppCallbacks())!
        print("--APP START--")
        app.start()
        print("--APP START END--")
    }
    var body: some View {
        SwiftUIWebView()
    }
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
    }
}
