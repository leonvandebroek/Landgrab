import Foundation

/// The aiming rule from the research report: a shot hits when the target's bearing lies inside a cone
/// around the shooter's heading. The cone widens at short range, where GPS error makes the bearing jumpy.
///
/// M0 ships the math with tests; the app starts using it in M2 (aim and fire) and the server will run
/// the same rule as the authority.
public struct AimCone: Sendable, Hashable {
    /// Half-angle in degrees used at and beyond `farDistance`.
    public var farHalfAngle: Double
    /// Half-angle in degrees used at and below `nearDistance`.
    public var nearHalfAngle: Double
    public var nearDistance: Double
    public var farDistance: Double
    /// Shots beyond this range always miss.
    public var maxRange: Double

    public init(farHalfAngle: Double = 12, nearHalfAngle: Double = 35, nearDistance: Double = 10, farDistance: Double = 60, maxRange: Double = 150) {
        precondition(nearDistance < farDistance, "nearDistance must be below farDistance")
        self.farHalfAngle = farHalfAngle
        self.nearHalfAngle = nearHalfAngle
        self.nearDistance = nearDistance
        self.farDistance = farDistance
        self.maxRange = maxRange
    }

    /// Half-angle at a distance, interpolated linearly between near and far.
    public func halfAngle(atDistance distance: Double) -> Double {
        if distance <= nearDistance { return nearHalfAngle }
        if distance >= farDistance { return farHalfAngle }
        let t = (distance - nearDistance) / (farDistance - nearDistance)
        return nearHalfAngle + (farHalfAngle - nearHalfAngle) * t
    }

    public struct Result: Sendable, Hashable {
        public let isHit: Bool
        public let distance: Double
        /// How far off the target was, in degrees (negative = target is to the left).
        public let offsetDegrees: Double
        public let halfAngle: Double
    }

    public func evaluate(shooter: GeoPoint, headingDegrees: Double, target: GeoPoint) -> Result {
        let distance = GeoMath.distance(from: shooter, to: target)
        let bearing = GeoMath.bearing(from: shooter, to: target)
        let offset = GeoMath.signedAngle(from: headingDegrees, to: bearing)
        let half = halfAngle(atDistance: distance)
        let hit = distance <= maxRange && abs(offset) <= half
        return Result(isHit: hit, distance: distance, offsetDegrees: offset, halfAngle: half)
    }
}
