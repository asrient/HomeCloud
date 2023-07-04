//
//  Webview.swift
//  homecloud
//
//  Created by Aritra Sen on 20/05/23.
//

import Foundation
import SwiftUI
import WebKit


struct SwiftUIWebView: UIViewRepresentable {
    typealias UIViewType = WKWebView
    let manager: WebViewManager
    
    init() {
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
