Pod::Spec.new do |s|
  s.name           = 'H264Player'
  s.version        = '1.0.0'
  s.summary        = 'Hardware-accelerated H.264 video player view for Expo'
  s.description    = 'Decodes and renders H.264 NAL units via AVSampleBufferDisplayLayer'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.frameworks = 'AVFoundation', 'VideoToolbox', 'CoreMedia'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
