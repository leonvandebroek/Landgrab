// swift-tools-version: 6.0
import PackageDescription

// Core logic for the VirtuBattle iOS app. Everything here is UI-free so it can be unit tested
// with `swift test`, also on Linux in CI. Apple-only sensor code (Core Location, Nearby Interaction)
// lives in the app target or in Apple-only modules added later.
let package = Package(
    name: "VirtuBattleCore",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [
        .library(name: "GameClient", targets: ["GameClient"]),
        .library(name: "AimingEngine", targets: ["AimingEngine"]),
    ],
    targets: [
        .target(name: "GameClient"),
        .target(name: "AimingEngine"),
        .testTarget(name: "GameClientTests", dependencies: ["GameClient"]),
        .testTarget(name: "AimingEngineTests", dependencies: ["AimingEngine"]),
    ]
)
