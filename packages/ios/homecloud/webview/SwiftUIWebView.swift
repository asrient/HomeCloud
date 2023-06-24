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
        manager = WebViewManager()
    }
    
    func makeUIView(context: Context) -> WKWebView {
        manager.webView
    }
    func updateUIView(_ uiView: WKWebView, context: Context) {
    }
}
