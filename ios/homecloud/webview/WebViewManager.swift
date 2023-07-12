//
//  WebViewManager.swift
//  homecloud
//
//  Created by Aritra Sen on 24/06/23.
//

import Foundation
import WebKit
import Libx


class NavManager: NSObject, WKNavigationDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if (navigationAction.request.url != nil && (navigationAction.request.url!.isFileURL || navigationAction.request.url!.scheme == "resource")) {
            decisionHandler(.allow)
            return
        }
        print("Opening external site in browser app:", navigationAction.request)
        UIApplication.shared.open(navigationAction.request.url!)
        decisionHandler(.cancel)
    }
}

struct SchemaHandlerItem {
    var id: String
    var handler: WKURLSchemeHandler
}

class WebViewManager {
    let webView: WKWebView
    let navManager: NavManager
    
    init(schemaHandlers: [SchemaHandlerItem]){
        let configuration = WKWebViewConfiguration()
        configuration.setValue(true, forKey: "allowUniversalAccessFromFileURLs")
        
        schemaHandlers.forEach { schemaHandler in
            configuration.setURLSchemeHandler(schemaHandler.handler, forURLScheme: schemaHandler.id)
        }
        
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.allowsLinkPreview = false
        
        navManager =  NavManager()
        webView.navigationDelegate = navManager
    }
    
    func start() {
        let req = URLRequest(url: URL(string: "resource:///")!)
        webView.load(req)
    }
    
    func postEvent(type: String, data: String) {
        webView.evaluateJavaScript("!!window.onMobileEvent && window.onMobileEvent(\"\(type)\",\"\(data)\"")
    }
}
