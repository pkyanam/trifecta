// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "TrifectaMac",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "TrifectaProtocol", targets: ["TrifectaProtocol"]),
        .library(name: "TrifectaCore", targets: ["TrifectaCore"]),
        .executable(name: "TrifectaConformance", targets: ["TrifectaConformance"]),
        .executable(name: "TrifectaApp", targets: ["TrifectaApp"]),
    ],
    targets: [
        .target(
            name: "TrifectaProtocol",
            path: "Sources/TrifectaProtocol"
        ),
        .target(
            name: "TrifectaCore",
            dependencies: ["TrifectaProtocol"],
            path: "Sources/TrifectaCore"
        ),
        .executableTarget(
            name: "TrifectaConformance",
            dependencies: ["TrifectaProtocol"],
            path: "Sources/TrifectaConformance"
        ),
        .executableTarget(
            name: "TrifectaApp",
            dependencies: ["TrifectaProtocol", "TrifectaCore"],
            path: "Sources/TrifectaApp"
        ),
    ]
)
