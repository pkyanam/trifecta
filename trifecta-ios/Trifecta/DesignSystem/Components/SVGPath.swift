import SwiftUI

/// SwiftUI `Shape` that parses raw SVG path data and renders it scaled into the bounding rect,
/// preserving the source viewBox aspect ratio (xMidYMid meet).
///
/// Used by `ProviderIcon` so the iOS picker renders the same brand glyphs the desktop app ships.
struct SVGPath: Shape {
    let pathData: String
    let viewBox: CGRect

    init(_ pathData: String, viewBox: CGRect) {
        self.pathData = pathData
        self.viewBox = viewBox
    }

    func path(in rect: CGRect) -> Path {
        guard viewBox.width > 0, viewBox.height > 0,
              rect.width > 0, rect.height > 0 else {
            return Path()
        }
        let scale = min(rect.width / viewBox.width, rect.height / viewBox.height)
        let drawnW = viewBox.width * scale
        let drawnH = viewBox.height * scale
        let tx = rect.minX + (rect.width - drawnW) / 2 - viewBox.minX * scale
        let ty = rect.minY + (rect.height - drawnH) / 2 - viewBox.minY * scale
        let transform = CGAffineTransform(translationX: tx, y: ty).scaledBy(x: scale, y: scale)

        var parser = SVGPathParser(data: pathData)
        return parser.parse().applying(transform)
    }
}

private struct SVGPathParser {
    private let chars: [Character]
    private var i: Int = 0
    private var path = Path()
    private var cursor: CGPoint = .zero
    private var subStart: CGPoint = .zero
    private var lastCubicCtrl: CGPoint?
    private var lastQuadCtrl: CGPoint?
    private var lastCmd: Character = "M"

    init(data: String) {
        self.chars = Array(data)
    }

    mutating func parse() -> Path {
        while i < chars.count {
            skipSeparators()
            guard i < chars.count else { break }
            let c = chars[i]
            if c.isLetter {
                i += 1
                lastCmd = c
                execute(c)
            } else {
                let cmd: Character
                switch lastCmd {
                case "M": cmd = "L"
                case "m": cmd = "l"
                default: cmd = lastCmd
                }
                execute(cmd)
            }
        }
        return path
    }

    private mutating func skipSeparators() {
        while i < chars.count, chars[i].isWhitespace || chars[i] == "," { i += 1 }
    }

    private mutating func readNumber() -> CGFloat {
        skipSeparators()
        let start = i
        if i < chars.count, chars[i] == "+" || chars[i] == "-" { i += 1 }
        var sawDigit = false
        var sawDot = false
        while i < chars.count {
            let c = chars[i]
            if c.isNumber {
                i += 1
                sawDigit = true
            } else if c == "." && !sawDot {
                i += 1
                sawDot = true
            } else {
                break
            }
        }
        if i < chars.count, chars[i] == "e" || chars[i] == "E" {
            i += 1
            if i < chars.count, chars[i] == "+" || chars[i] == "-" { i += 1 }
            while i < chars.count, chars[i].isNumber { i += 1 }
        }
        guard sawDigit || sawDot else { return 0 }
        return CGFloat(Double(String(chars[start..<i])) ?? 0)
    }

    private mutating func readFlag() -> Bool {
        skipSeparators()
        guard i < chars.count else { return false }
        let c = chars[i]
        i += 1
        return c == "1"
    }

    private mutating func readPoint() -> CGPoint {
        let x = readNumber()
        let y = readNumber()
        return CGPoint(x: x, y: y)
    }

    private mutating func execute(_ cmd: Character) {
        switch cmd {
        case "M":
            let p = readPoint()
            path.move(to: p)
            cursor = p
            subStart = p
            lastCubicCtrl = nil; lastQuadCtrl = nil
        case "m":
            let d = readPoint()
            let p = CGPoint(x: cursor.x + d.x, y: cursor.y + d.y)
            path.move(to: p)
            cursor = p
            subStart = p
            lastCubicCtrl = nil; lastQuadCtrl = nil
        case "L":
            let p = readPoint()
            path.addLine(to: p)
            cursor = p
            lastCubicCtrl = nil; lastQuadCtrl = nil
        case "l":
            let d = readPoint()
            let p = CGPoint(x: cursor.x + d.x, y: cursor.y + d.y)
            path.addLine(to: p)
            cursor = p
            lastCubicCtrl = nil; lastQuadCtrl = nil
        case "H":
            let x = readNumber()
            let p = CGPoint(x: x, y: cursor.y)
            path.addLine(to: p)
            cursor = p
            lastCubicCtrl = nil; lastQuadCtrl = nil
        case "h":
            let dx = readNumber()
            let p = CGPoint(x: cursor.x + dx, y: cursor.y)
            path.addLine(to: p)
            cursor = p
            lastCubicCtrl = nil; lastQuadCtrl = nil
        case "V":
            let y = readNumber()
            let p = CGPoint(x: cursor.x, y: y)
            path.addLine(to: p)
            cursor = p
            lastCubicCtrl = nil; lastQuadCtrl = nil
        case "v":
            let dy = readNumber()
            let p = CGPoint(x: cursor.x, y: cursor.y + dy)
            path.addLine(to: p)
            cursor = p
            lastCubicCtrl = nil; lastQuadCtrl = nil
        case "C":
            let c1 = readPoint(), c2 = readPoint(), p = readPoint()
            path.addCurve(to: p, control1: c1, control2: c2)
            cursor = p
            lastCubicCtrl = c2; lastQuadCtrl = nil
        case "c":
            let c1d = readPoint(), c2d = readPoint(), pd = readPoint()
            let c1 = CGPoint(x: cursor.x + c1d.x, y: cursor.y + c1d.y)
            let c2 = CGPoint(x: cursor.x + c2d.x, y: cursor.y + c2d.y)
            let p = CGPoint(x: cursor.x + pd.x, y: cursor.y + pd.y)
            path.addCurve(to: p, control1: c1, control2: c2)
            cursor = p
            lastCubicCtrl = c2; lastQuadCtrl = nil
        case "S":
            let c2 = readPoint(), p = readPoint()
            let c1 = lastCubicCtrl.map { CGPoint(x: 2 * cursor.x - $0.x, y: 2 * cursor.y - $0.y) } ?? cursor
            path.addCurve(to: p, control1: c1, control2: c2)
            cursor = p
            lastCubicCtrl = c2; lastQuadCtrl = nil
        case "s":
            let c2d = readPoint(), pd = readPoint()
            let c1 = lastCubicCtrl.map { CGPoint(x: 2 * cursor.x - $0.x, y: 2 * cursor.y - $0.y) } ?? cursor
            let c2 = CGPoint(x: cursor.x + c2d.x, y: cursor.y + c2d.y)
            let p = CGPoint(x: cursor.x + pd.x, y: cursor.y + pd.y)
            path.addCurve(to: p, control1: c1, control2: c2)
            cursor = p
            lastCubicCtrl = c2; lastQuadCtrl = nil
        case "Q":
            let c1 = readPoint(), p = readPoint()
            path.addQuadCurve(to: p, control: c1)
            cursor = p
            lastQuadCtrl = c1; lastCubicCtrl = nil
        case "q":
            let c1d = readPoint(), pd = readPoint()
            let c1 = CGPoint(x: cursor.x + c1d.x, y: cursor.y + c1d.y)
            let p = CGPoint(x: cursor.x + pd.x, y: cursor.y + pd.y)
            path.addQuadCurve(to: p, control: c1)
            cursor = p
            lastQuadCtrl = c1; lastCubicCtrl = nil
        case "T":
            let p = readPoint()
            let c1 = lastQuadCtrl.map { CGPoint(x: 2 * cursor.x - $0.x, y: 2 * cursor.y - $0.y) } ?? cursor
            path.addQuadCurve(to: p, control: c1)
            cursor = p
            lastQuadCtrl = c1; lastCubicCtrl = nil
        case "t":
            let pd = readPoint()
            let p = CGPoint(x: cursor.x + pd.x, y: cursor.y + pd.y)
            let c1 = lastQuadCtrl.map { CGPoint(x: 2 * cursor.x - $0.x, y: 2 * cursor.y - $0.y) } ?? cursor
            path.addQuadCurve(to: p, control: c1)
            cursor = p
            lastQuadCtrl = c1; lastCubicCtrl = nil
        case "A":
            let rx = readNumber(), ry = readNumber()
            let xRot = readNumber()
            let large = readFlag(), sweep = readFlag()
            let p = readPoint()
            arcTo(rx: rx, ry: ry, xAxisRotation: xRot, largeArc: large, sweep: sweep, end: p)
            cursor = p
            lastCubicCtrl = nil; lastQuadCtrl = nil
        case "a":
            let rx = readNumber(), ry = readNumber()
            let xRot = readNumber()
            let large = readFlag(), sweep = readFlag()
            let pd = readPoint()
            let p = CGPoint(x: cursor.x + pd.x, y: cursor.y + pd.y)
            arcTo(rx: rx, ry: ry, xAxisRotation: xRot, largeArc: large, sweep: sweep, end: p)
            cursor = p
            lastCubicCtrl = nil; lastQuadCtrl = nil
        case "Z", "z":
            path.closeSubpath()
            cursor = subStart
            lastCubicCtrl = nil; lastQuadCtrl = nil
        default:
            break
        }
    }

    /// Endpoint-parameterised SVG arc → cubic-bezier approximation
    /// (https://www.w3.org/TR/SVG/implnote.html#ArcImplementationNotes).
    private mutating func arcTo(rx rxIn: CGFloat,
                                ry ryIn: CGFloat,
                                xAxisRotation: CGFloat,
                                largeArc: Bool,
                                sweep: Bool,
                                end: CGPoint) {
        let start = cursor
        if start == end { return }
        if rxIn == 0 || ryIn == 0 {
            path.addLine(to: end)
            return
        }
        var rx = abs(rxIn)
        var ry = abs(ryIn)
        let phi = xAxisRotation * .pi / 180
        let cosPhi = cos(phi), sinPhi = sin(phi)

        let dx = (start.x - end.x) / 2
        let dy = (start.y - end.y) / 2
        let x1p = cosPhi * dx + sinPhi * dy
        let y1p = -sinPhi * dx + cosPhi * dy

        let lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
        if lambda > 1 {
            let s = sqrt(lambda)
            rx *= s; ry *= s
        }

        let signC: CGFloat = (largeArc == sweep) ? -1 : 1
        let num = max(rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p, 0)
        let den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
        let coef = den == 0 ? 0 : signC * sqrt(num / den)
        let cxp = coef * (rx * y1p / ry)
        let cyp = coef * (-ry * x1p / rx)
        let cx = cosPhi * cxp - sinPhi * cyp + (start.x + end.x) / 2
        let cy = sinPhi * cxp + cosPhi * cyp + (start.y + end.y) / 2

        let theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
        var dTheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry,
                           (-x1p - cxp) / rx, (-y1p - cyp) / ry)
        let twoPi = 2 * CGFloat.pi
        dTheta = dTheta.truncatingRemainder(dividingBy: twoPi)
        if !sweep && dTheta > 0 { dTheta -= twoPi }
        if sweep && dTheta < 0 { dTheta += twoPi }

        let segments = max(1, Int(ceil(abs(dTheta) / (.pi / 2))))
        let segTheta = dTheta / CGFloat(segments)
        var t1 = theta1
        var prev = start
        for _ in 0..<segments {
            let t2 = t1 + segTheta
            let t = (4.0 / 3.0) * tan(segTheta / 4)
            let cos1 = cos(t1), sin1 = sin(t1)
            let cos2 = cos(t2), sin2 = sin(t2)
            let p2x = cosPhi * rx * cos2 - sinPhi * ry * sin2 + cx
            let p2y = sinPhi * rx * cos2 + cosPhi * ry * sin2 + cy
            let c1x = prev.x + cosPhi * (-rx * t * sin1) - sinPhi * (ry * t * cos1)
            let c1y = prev.y + sinPhi * (-rx * t * sin1) + cosPhi * (ry * t * cos1)
            let c2x = p2x - (cosPhi * (-rx * t * sin2) - sinPhi * (ry * t * cos2))
            let c2y = p2y - (sinPhi * (-rx * t * sin2) + cosPhi * (ry * t * cos2))
            path.addCurve(to: CGPoint(x: p2x, y: p2y),
                          control1: CGPoint(x: c1x, y: c1y),
                          control2: CGPoint(x: c2x, y: c2y))
            prev = CGPoint(x: p2x, y: p2y)
            t1 = t2
        }
    }

    private func angle(_ ux: CGFloat, _ uy: CGFloat, _ vx: CGFloat, _ vy: CGFloat) -> CGFloat {
        let lenU = sqrt(ux * ux + uy * uy)
        let lenV = sqrt(vx * vx + vy * vy)
        guard lenU > 0, lenV > 0 else { return 0 }
        let s: CGFloat = (ux * vy - uy * vx < 0) ? -1 : 1
        let cosA = max(-1, min(1, (ux * vx + uy * vy) / (lenU * lenV)))
        return s * acos(cosA)
    }
}
