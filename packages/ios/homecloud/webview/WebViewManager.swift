//
//  WebViewManager.swift
//  homecloud
//
//  Created by Aritra Sen on 24/06/23.
//

import Foundation
import WebKit


class NavManager: NSObject, WKNavigationDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if (navigationAction.request.url != nil && navigationAction.request.url!.isFileURL) {
            decisionHandler(.allow)
            return
        }
        print("Opening external site in browser app:", navigationAction.request)
        UIApplication.shared.open(navigationAction.request.url!)
        decisionHandler(.cancel)
    }
}

class WebViewManager {
    let webView: WKWebView
    let navManager: NavManager
    
    init(){
        let configuration = WKWebViewConfiguration()
        configuration.setValue(true, forKey: "allowUniversalAccessFromFileURLs")
        configuration.setURLSchemeHandler(WebSchemeHandler(), forURLScheme: "web")
        
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.translatesAutoresizingMaskIntoConstraints = false
        navManager =  NavManager()
        webView.navigationDelegate = navManager
        
        guard let indexUrl = Bundle.main.url(forResource: "index",
                                                    withExtension: "html",
                                                    subdirectory: "dist") else { return }
        webView.loadFileURL(indexUrl, allowingReadAccessTo: indexUrl.deletingLastPathComponent())
    }
    
    func postEvent(type: String, data: String) {
        webView.evaluateJavaScript("!!window.onMobileEvent && window.onMobileEvent(\"\(type)\",\"\(data)\"")
    }
}
