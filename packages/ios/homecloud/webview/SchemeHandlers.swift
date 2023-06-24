//
//  SchemeHandlers.swift
//  homecloud
//
//  Created by Aritra Sen on 24/06/23.
//

import Foundation
import UniformTypeIdentifiers
import WebKit


class WebSchemeHandler : NSObject, WKURLSchemeHandler {

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        DispatchQueue.global().async {
            guard let url = urlSchemeTask.request.url,
                  let fileUrl = self.fileUrlFromUrl(url),
                  let mimeType = self.mimeType(ofFileAtUrl: fileUrl),
                  let data = try? Data(contentsOf: fileUrl) else {
                print("err resolving file:", urlSchemeTask.request)
                return
            }
            print("Resolving web scheme:", url)
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
        let assetName = String(url.absoluteString.split(separator: "://").last!)
        //print("asset name", assetName)
        if(assetName == "") {
            return nil
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
