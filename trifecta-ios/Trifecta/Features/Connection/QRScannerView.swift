import SwiftUI
import AVFoundation

struct QRScannerView: UIViewControllerRepresentable {
    let onScan: (String) -> Void
    @Binding var isPresented: Bool

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    func makeUIViewController(context: Context) -> UIViewController {
        let vc = UIViewController()
        let session = AVCaptureSession()
        context.coordinator.session = session

        guard let device = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: device),
              session.canAddInput(input) else {
            vc.view.backgroundColor = .black
            return vc
        }

        session.addInput(input)

        let output = AVCaptureMetadataOutput()
        if session.canAddOutput(output) {
            session.addOutput(output)
            output.setMetadataObjectsDelegate(context.coordinator, queue: .main)
            output.metadataObjectTypes = [.qr]
        }

        let preview = AVCaptureVideoPreviewLayer(session: session)
        preview.videoGravity = .resizeAspectFill
        vc.view.layer.addSublayer(preview)
        context.coordinator.preview = preview

        DispatchQueue.global(qos: .userInitiated).async {
            session.startRunning()
        }

        return vc
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {
        if let preview = context.coordinator.preview {
            preview.frame = uiViewController.view.bounds
        }
    }

    static func dismantleUIViewController(_ uiViewController: UIViewController, coordinator: Coordinator) {
        coordinator.session?.stopRunning()
    }

    class Coordinator: NSObject, AVCaptureMetadataOutputObjectsDelegate {
        let parent: QRScannerView
        var session: AVCaptureSession?
        var preview: AVCaptureVideoPreviewLayer?
        private var didScan = false

        init(parent: QRScannerView) {
            self.parent = parent
        }

        func metadataOutput(
            _ output: AVCaptureMetadataOutput,
            didOutput metadataObjects: [AVMetadataObject],
            from connection: AVCaptureConnection
        ) {
            guard !didScan,
                  let obj = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
                  let string = obj.stringValue else { return }
            didScan = true
            session?.stopRunning()
            parent.onScan(string)
            parent.isPresented = false
        }
    }
}
