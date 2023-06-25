//
//  Webview.swift
//  homecloud
//
//  Created by Aritra Sen on 20/05/23.
//

import Foundation
import SwiftUI
import WebKit
import Libx


class AppCallbacks: NSObject, LibxNativeCallbacksProtocol {
    func onEvent(_ Event: String?, dataStr DataStr: String?) -> String {
        print("got a sendEvent on swift", Event!, DataStr!)
        return ""
    }
}

struct SwiftUIWebView: UIViewRepresentable {
    typealias UIViewType = WKWebView
    let manager: WebViewManager
    let app: LibxApp
    
    init() {
        let staticPath = Bundle(path: "dist")?.bundlePath ?? ""
        app = LibxNewApp(staticPath, AppCallbacks())!
        app.start()
        let handlers = [
            SchemaHandlerItem(id: "resource", handler: ResourceSchemeHandler()),
            //SchemaHandlerItem(id: "api", handler: ApiSchemeHandler(goApp: app)),
        ]
        manager = WebViewManager(schemaHandlers: handlers)
        manager.start()
    }
    
    func makeUIView(context: Context) -> WKWebView {
        manager.webView
    }
    func updateUIView(_ uiView: WKWebView, context: Context) {
    }
}
