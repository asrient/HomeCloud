import ExpoModulesCore
import AVFoundation

class H264PlayerView: ExpoView {
  private let displayLayer = AVSampleBufferDisplayLayer()
  private var currentSession: H264Session?

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    displayLayer.videoGravity = .resizeAspect
    displayLayer.backgroundColor = UIColor.black.cgColor
    layer.addSublayer(displayLayer)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    displayLayer.frame = bounds
    CATransaction.commit()
  }

  func attachSession(_ session: H264Session?) {
    if currentSession === session { return }
    currentSession?.attachLayer(nil)
    currentSession = session
    displayLayer.flush()
    session?.attachLayer(displayLayer)
  }

  deinit {
    currentSession?.attachLayer(nil)
  }
}
