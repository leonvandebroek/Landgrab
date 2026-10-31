import Foundation

/// A WGS84 coordinate in degrees. Independent of Core Location so this module builds and tests anywhere.
public struct GeoPoint: Sendable, Hashable, Codable {
    public var latitude: Double
    public var longitude: Double

    public init(latitude: Double, longitude: Double) {
        self.latitude = latitude
        self.longitude = longitude
    }
}

/// Spherical-earth geometry. At game distances (under a few km) the error versus the ellipsoid is far
/// below GPS noise, so the simple formulas are fine.
public enum GeoMath {
    public static let earthRadiusMeters = 6_371_008.8

    /// Great-circle distance in meters (haversine).
    public static func distance(from a: GeoPoint, to b: GeoPoint) -> Double {
        let lat1 = radians(a.latitude), lat2 = radians(b.latitude)
        let dLat = lat2 - lat1
        let dLon = radians(b.longitude - a.longitude)
        let h = sin(dLat / 2) * sin(dLat / 2) + cos(lat1) * cos(lat2) * sin(dLon / 2) * sin(dLon / 2)
        return 2 * earthRadiusMeters * asin(min(1, sqrt(h)))
    }

    /// Initial bearing from `a` to `b` in degrees clockwise from true north, in [0, 360).
    public static func bearing(from a: GeoPoint, to b: GeoPoint) -> Double {
        let lat1 = radians(a.latitude), lat2 = radians(b.latitude)
        let dLon = radians(b.longitude - a.longitude)
        let y = sin(dLon) * cos(lat2)
        let x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dLon)
        return normalizeDegrees(degrees(atan2(y, x)))
    }

    /// Smallest signed angle from `from` to `to` in degrees, in (-180, 180].
    public static func signedAngle(from: Double, to: Double) -> Double {
        var delta = normalizeDegrees(to - from)
        if delta > 180 { delta -= 360 }
        return delta
    }

    /// The point reached by travelling `distance` meters from `origin` along `bearing` degrees.
    public static func destination(from origin: GeoPoint, bearing: Double, distance: Double) -> GeoPoint {
        let angular = distance / earthRadiusMeters
        let theta = radians(bearing)
        let lat1 = radians(origin.latitude), lon1 = radians(origin.longitude)
        let lat2 = asin(sin(lat1) * cos(angular) + cos(lat1) * sin(angular) * cos(theta))
        let lon2 = lon1 + atan2(sin(theta) * sin(angular) * cos(lat1), cos(angular) - sin(lat1) * sin(lat2))
        return GeoPoint(latitude: degrees(lat2), longitude: normalizeLongitude(degrees(lon2)))
    }

    public static func normalizeDegrees(_ value: Double) -> Double {
        let r = value.truncatingRemainder(dividingBy: 360)
        return r < 0 ? r + 360 : r
    }

    static func normalizeLongitude(_ value: Double) -> Double {
        let r = normalizeDegrees(value + 180) - 180
        return r == -180 ? 180 : r
    }

    static func radians(_ degrees: Double) -> Double { degrees * .pi / 180 }
    static func degrees(_ radians: Double) -> Double { radians * 180 / .pi }
}
