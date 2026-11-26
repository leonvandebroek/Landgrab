import Foundation

/// One position fix, free of Core Location types so app logic stays testable.
struct LocationFix: Equatable, Sendable {
    var latitude: Double
    var longitude: Double
    /// Radius in meters of the 68% confidence circle.
    var horizontalAccuracy: Double
    var timestamp: Date
}

enum LocationEvent: Equatable, Sendable {
    case fix(LocationFix)
    /// The player has not allowed location access (or turned Location Services off).
    case denied
}

/// Where the app gets positions from. The real one is `CoreLocationSource`; previews and tests can fake it.
@MainActor
protocol LocationSource: AnyObject {
    /// Starts location updates; they stop when the stream's consumer stops iterating.
    func events() -> AsyncStream<LocationEvent>
}
