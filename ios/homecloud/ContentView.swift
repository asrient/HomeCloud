//
//  ContentView.swift
//  musicroom
//
//  Created by Aritra Sen on 20/05/23.
//

import SwiftUI
import Libx
import Photos


class AppCallbacks: NSObject, LibxNativeCallbacksProtocol {
    func onWebEvent(_ Event: String?, dataStr DataStr: String?) -> String {
        print("got a sendEvent on swift", Event!, DataStr!)
        return ""
    }
}

class PhotosManager: NSObject, SharedDevicePhotosManagerProtocol {
    func deletePhotos(_ photoIds: String?) -> String {
        return ""
    }
    
    func requestPermission(_ cb: SharedPermissionCallbackProtocol?) -> Bool {
        if(isPermissionGranted()) {
            return true;
        }
        PHPhotoLibrary.requestAuthorization { status in
            cb?.onPermissionChange(status == .authorized)
        }
        return false
    }
    
    override init() {
        super.init()
    }
    
    func getAlbums() -> String {
        return "{id: \"nfn\"}"
    }
    
    func getPhotoBuffer(_ photoId: String?) -> Data? {
        print("get photo", photoId as Any)
        return Data()
    }
    
    func getPhotos(_ albumId: String?, start: Int, limit: Int) -> String {
        //let jsonEncoder = JSONEncoder()
        print("get photos", albumId as Any, start, limit)
        let allPhotosOptions = PHFetchOptions()
        allPhotosOptions.sortDescriptors = [
          NSSortDescriptor(
            key: "creationDate",
            ascending: false)
        ]
        let allPhotos = PHAsset.fetchAssets(with: allPhotosOptions)
        print("All photos count:",allPhotos.count)
        //let res: [String] = []
        allPhotos.enumerateObjects { asset, ind, _ in
            print("asset", asset.localIdentifier, asset.mediaType, asset.creationDate as Any)
        }
        return ""
    }
    
    func isPermissionGranted() -> Bool {
        return PHPhotoLibrary.authorizationStatus() == .authorized
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
        config.photos = PhotosManager()
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
