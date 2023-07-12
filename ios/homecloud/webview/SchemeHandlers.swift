//
//  SchemeHandlers.swift
//  homecloud
//
//  Created by Aritra Sen on 24/06/23.
//

import Foundation
import UniformTypeIdentifiers
import WebKit
import Libx


class ResourceSchemeHandler : NSObject, WKURLSchemeHandler {

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        DispatchQueue.global().async {
            guard let url = urlSchemeTask.request.url,
                  let fileUrl = self.fileUrlFromUrl(url),
                  let mimeType = self.mimeType(ofFileAtUrl: fileUrl),
                  let data = try? Data(contentsOf: fileUrl) else {
                print("err resolving file:", urlSchemeTask.request)
                return
            }
            print("Resolving resource scheme:", url)
            let response = HTTPURLResponse(url: url,
                                           mimeType: mimeType,
                                           expectedContentLength: data.count, textEncodingName: nil)
            
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive(data)
            urlSchemeTask.didFinish()
        }
    }
    
    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        
    }
    
    // MARK: - Private
    
    private func fileUrlFromUrl(_ url: URL) -> URL? {
        //print("getting file url", url)
        var assetName = String(url.absoluteString.split(separator: "://").last!)
        //print("asset name", assetName)
        if(assetName == "" || assetName == "/") {
            assetName = "index.html"
        }
        return Bundle.main.url(forResource: assetName,
                               withExtension: "",
                               subdirectory: "dist")
    }
    
    private func mimeType(ofFileAtUrl url: URL) -> String? {
        guard let type = UTType(filenameExtension: url.pathExtension) else {
            print("err getting file type:", url)
            return nil
        }
        return type.preferredMIMEType
    }
}


//class ApiSchemeHandler : NSObject, WKURLSchemeHandler {
//    let app: LibxApp
//
//    init(goApp: LibxApp) {
//        app = goApp
//        super.init()
//    }
//
//    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
//        DispatchQueue.global().async {
//            guard let url = urlSchemeTask.request.url else {
//                print("err resolving api:", urlSchemeTask.request)
//                return
//            }
//            print("[Swift] api scheme:", url)
//            //let headers: [String : String]? = urlSchemeTask.request.allHTTPHeaderFields
//            //let body: Data? = urlSchemeTask.request.httpBody
//            let response = HTTPURLResponse(url: url,
//                                           mimeType: "application/json",
//                                           expectedContentLength: 0, textEncodingName: nil)
//            //let headersJson = try JSONEncoder().encode(headers)
//
//            guard let data = self.app.handleApi(url.absoluteString, headersJson: "", body: "") else {
//                print("Could not get resp from go")
//                return
//            }
//            urlSchemeTask.didReceive(response)
//            urlSchemeTask.didReceive(Data(data.body.utf8))
//            urlSchemeTask.didFinish()
//        }
//    }
//
//    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
//
//    }
//}
