import Foundation

/// Decides which location fixes to send, so the phone follows the server's rate mode.
///
/// Core Location delivers roughly one fix per second while moving; this lets through at most one
/// per `interval`. Times are seconds on any monotonic clock (for example `ProcessInfo.systemUptime`).
public struct PositionThrottle: Sendable {
    public private(set) var interval: TimeInterval
    private var lastSent: TimeInterval?

    public init(interval: TimeInterval) {
        self.interval = interval
    }

    /// Changes the interval. A shorter interval applies to the very next fix.
    public mutating func setInterval(_ interval: TimeInterval) {
        self.interval = interval
    }

    /// Returns true, and records the send, when a fix taken at `now` should go to the server.
    /// A small tolerance keeps 1 Hz fixes from being dropped against a 1 s interval due to jitter.
    public mutating func shouldSend(at now: TimeInterval) -> Bool {
        if let lastSent, now - lastSent < interval * 0.9 {
            return false
        }
        lastSent = now
        return true
    }

    /// Forgets the last send, so the next fix goes out right away (for example after reconnecting).
    public mutating func reset() {
        lastSent = nil
    }
}

extension RateModeChangedEvent {
    public var interval: TimeInterval { TimeInterval(intervalMs) / 1000 }
}
