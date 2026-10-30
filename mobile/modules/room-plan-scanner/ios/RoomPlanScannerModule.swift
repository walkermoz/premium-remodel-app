import ExpoModulesCore
import RoomPlan
import simd
import UIKit

public final class RoomPlanScannerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RoomPlanScanner")

    AsyncFunction("isSupported") { () -> Bool in
      if #available(iOS 16.0, *) {
        return RoomCaptureSession.isSupported
      }
      return false
    }

    AsyncFunction("startScan") { (roomName: String, promise: Promise) in
      guard #available(iOS 16.0, *), RoomCaptureSession.isSupported else {
        promise.reject("ERR_ROOMPLAN_UNAVAILABLE", "Room scanning requires a LiDAR-equipped iPhone or iPad running iOS 16 or later.")
        return
      }
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.reject("ERR_NO_VIEW_CONTROLLER", "The room scanner could not open.")
        return
      }
      DispatchQueue.main.async {
        let scanner = RoomScanViewController(roomName: roomName) { result in
          switch result {
          case .success(let value):
            promise.resolve(value)
          case .failure(let error):
            promise.reject("ERR_ROOM_SCAN", error.localizedDescription)
          }
        }
        let navigation = UINavigationController(rootViewController: scanner)
        navigation.modalPresentationStyle = .fullScreen
        presenter.present(navigation, animated: true)
      }
    }
  }
}

@available(iOS 16.0, *)
private final class RoomScanViewController: UIViewController, RoomCaptureViewDelegate {
  private let roomName: String
  private let completion: (Result<[String: Any], Error>) -> Void
  private let captureView = RoomCaptureView(frame: .zero)
  private var finished = false

  init(roomName: String, completion: @escaping (Result<[String: Any], Error>) -> Void) {
    self.roomName = roomName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Room" : roomName
    self.completion = completion
    super.init(nibName: nil, bundle: nil)
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    title = roomName
    view.backgroundColor = .systemBackground
    captureView.translatesAutoresizingMaskIntoConstraints = false
    captureView.delegate = self
    view.addSubview(captureView)
    NSLayoutConstraint.activate([
      captureView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      captureView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      captureView.topAnchor.constraint(equalTo: view.topAnchor),
      captureView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
    ])
    navigationItem.leftBarButtonItem = UIBarButtonItem(
      barButtonSystemItem: .cancel,
      target: self,
      action: #selector(cancelScan)
    )
    navigationItem.rightBarButtonItem = UIBarButtonItem(
      title: "Finish",
      style: .done,
      target: self,
      action: #selector(finishScan)
    )
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    captureView.captureSession.run(configuration: RoomCaptureSession.Configuration())
  }

  @objc private func finishScan() {
    guard !finished else { return }
    navigationItem.rightBarButtonItem?.isEnabled = false
    captureView.captureSession.stop(pauseARSession: false)
  }

  @objc private func cancelScan() {
    guard !finished else { return }
    finished = true
    captureView.captureSession.stop(pauseARSession: true)
    dismiss(animated: true) {
      self.completion(.failure(RoomScanError.cancelled))
    }
  }

  func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool {
    return error == nil
  }

  func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
    guard !finished else { return }
    if let error {
      finished = true
      dismiss(animated: true) { self.completion(.failure(error)) }
      return
    }
    do {
      let result = try RoomScanExporter.export(room: processedResult, roomName: roomName)
      finished = true
      dismiss(animated: true) { self.completion(.success(result)) }
    } catch {
      finished = true
      dismiss(animated: true) { self.completion(.failure(error)) }
    }
  }
}

private enum RoomScanError: LocalizedError {
  case cancelled
  case previewFailed

  var errorDescription: String? {
    switch self {
    case .cancelled: return "Room scan cancelled."
    case .previewFailed: return "The floor-plan preview could not be created."
    }
  }
}

@available(iOS 16.0, *)
private enum RoomScanExporter {
  private static let feetPerMeter = 3.280839895
  private static let squareFeetPerSquareMeter = 10.76391042

  static func export(room: CapturedRoom, roomName: String) throws -> [String: Any] {
    let directory = FileManager.default.temporaryDirectory
      .appendingPathComponent("room-scan-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let modelURL = directory.appendingPathComponent("room.usdz")
    let previewURL = directory.appendingPathComponent("floor-plan.png")
    try room.export(to: modelURL)

    let wallWidthMeters = room.walls.reduce(0) { $0 + Double($1.dimensions.x) }
    let wallHeightMeters = room.walls.isEmpty
      ? 0
      : room.walls.reduce(0) { $0 + Double($1.dimensions.y) } / Double(room.walls.count)
    let openingAreaMeters = (room.doors + room.windows + room.openings)
      .reduce(0) { $0 + Double($1.dimensions.x * $1.dimensions.y) }
    let grossWallAreaMeters = room.walls.reduce(0) {
      $0 + Double($1.dimensions.x * $1.dimensions.y)
    }
    let bounds = planBounds(room)
    let widthMeters = max(bounds.maxX - bounds.minX, 0)
    let depthMeters = max(bounds.maxY - bounds.minY, 0)
    let floorAreaMeters = measuredFloorArea(
      room: room,
      fallback: widthMeters * depthMeters
    )
    let measurements: [String: Any] = [
      "floorAreaSqFt": rounded(floorAreaMeters * squareFeetPerSquareMeter),
      "wallAreaSqFt": rounded(max(grossWallAreaMeters - openingAreaMeters, 0) * squareFeetPerSquareMeter),
      "ceilingHeightFt": rounded(wallHeightMeters * feetPerMeter),
      "perimeterFt": rounded(wallWidthMeters * feetPerMeter),
      "widthFt": rounded(widthMeters * feetPerMeter),
      "depthFt": rounded(depthMeters * feetPerMeter),
      "doors": room.doors.count,
      "windows": room.windows.count,
      "openings": room.openings.count
    ]
    let surfaces =
      room.walls.map { surface($0, kind: "wall") } +
      room.doors.map { surface($0, kind: "door") } +
      room.windows.map { surface($0, kind: "window") } +
      room.openings.map { surface($0, kind: "opening") } +
      room.objects.map { object($0) }
    let capture: [String: Any] = [
      "schemaVersion": 1,
      "roomName": roomName,
      "capturedAt": ISO8601DateFormatter().string(from: Date()),
      "device": [
        "model": UIDevice.current.model,
        "systemName": UIDevice.current.systemName,
        "systemVersion": UIDevice.current.systemVersion
      ],
      "measurements": measurements,
      "surfaces": surfaces
    ]
    let preview = floorPlanImage(room: room, roomName: roomName, bounds: bounds, measurements: measurements)
    guard let png = preview.pngData() else { throw RoomScanError.previewFailed }
    try png.write(to: previewURL, options: .atomic)
    return [
      "modelUri": modelURL.absoluteString,
      "previewUri": previewURL.absoluteString,
      "capture": capture
    ]
  }

  private static func rounded(_ value: Double) -> Double {
    return (value * 10).rounded() / 10
  }

  private static func measuredFloorArea(room: CapturedRoom, fallback: Double) -> Double {
    if #available(iOS 17.0, *), let polygonArea = capturedFloorArea(room), polygonArea > 0 {
      return polygonArea
    }
    return fallback
  }

  @available(iOS 17.0, *)
  private static func capturedFloorArea(_ room: CapturedRoom) -> Double? {
    let areas = room.floors.compactMap { floor -> Double? in
      let area = polygonArea(floor.polygonCorners)
      return area.isFinite && area > 0.01 ? area : nil
    }
    guard !areas.isEmpty else { return nil }
    return areas.reduce(0, +)
  }

  private static func polygonArea(_ corners: [SIMD3<Float>]) -> Double {
    guard corners.count >= 3 else { return 0 }
    var areaVector = SIMD3<Double>(repeating: 0)
    for index in corners.indices {
      let nextIndex = corners.index(after: index) == corners.endIndex
        ? corners.startIndex
        : corners.index(after: index)
      let current = SIMD3<Double>(
        Double(corners[index].x),
        Double(corners[index].y),
        Double(corners[index].z)
      )
      let next = SIMD3<Double>(
        Double(corners[nextIndex].x),
        Double(corners[nextIndex].y),
        Double(corners[nextIndex].z)
      )
      areaVector += simd_cross(current, next)
    }
    return simd_length(areaVector) / 2
  }

  private static func confidence(_ value: CapturedRoom.Confidence) -> String {
    switch value {
    case .low: return "low"
    case .medium: return "medium"
    case .high: return "high"
    @unknown default: return "low"
    }
  }

  private static func surface(_ value: CapturedRoom.Surface, kind: String) -> [String: Any] {
    return [
      "id": value.identifier.uuidString,
      "kind": kind,
      "widthFt": rounded(Double(value.dimensions.x) * feetPerMeter),
      "heightFt": rounded(Double(value.dimensions.y) * feetPerMeter),
      "depthFt": rounded(Double(value.dimensions.z) * feetPerMeter),
      "confidence": confidence(value.confidence)
    ]
  }

  private static func object(_ value: CapturedRoom.Object) -> [String: Any] {
    return [
      "id": value.identifier.uuidString,
      "kind": "object",
      "category": objectCategory(value),
      "widthFt": rounded(Double(value.dimensions.x) * feetPerMeter),
      "heightFt": rounded(Double(value.dimensions.y) * feetPerMeter),
      "depthFt": rounded(Double(value.dimensions.z) * feetPerMeter),
      "confidence": confidence(value.confidence)
    ]
  }

  private static func objectCategory(_ value: CapturedRoom.Object) -> String {
    switch value.category {
    case .bathtub: return "bathtub"
    case .bed: return "bed"
    case .chair: return "chair"
    case .dishwasher: return "dishwasher"
    case .fireplace: return "fireplace"
    case .oven: return "oven"
    case .refrigerator: return "refrigerator"
    case .sink: return "sink"
    case .sofa: return "sofa"
    case .stairs: return "stairs"
    case .storage:
      if #available(iOS 17.0, *), let storageType = storageType(value) {
        return storageType
      }
      return "storage"
    case .stove: return "stove"
    case .table: return "table"
    case .television: return "television"
    case .toilet: return "toilet"
    case .washerDryer: return "washerDryer"
    @unknown default: return "object"
    }
  }

  @available(iOS 17.0, *)
  private static func storageType(_ value: CapturedRoom.Object) -> String? {
    for attribute in value.attributes {
      guard let storage = attribute as? StorageType else { continue }
      switch storage {
      case .cabinet: return "cabinet"
      case .shelf: return "shelf"
      @unknown default: return nil
      }
    }
    return nil
  }

  private struct Bounds {
    let minX: Double
    let maxX: Double
    let minY: Double
    let maxY: Double
  }

  private static func endpoints(_ wall: CapturedRoom.Surface) -> ((Double, Double), (Double, Double)) {
    let centerX = Double(wall.transform.columns.3.x)
    let centerY = Double(wall.transform.columns.3.z)
    let directionX = Double(wall.transform.columns.0.x)
    let directionY = Double(wall.transform.columns.0.z)
    let length = max(hypot(directionX, directionY), 0.0001)
    let halfWidth = Double(wall.dimensions.x) / 2
    let dx = directionX / length * halfWidth
    let dy = directionY / length * halfWidth
    return ((centerX - dx, centerY - dy), (centerX + dx, centerY + dy))
  }

  private static func planPoint(
    _ localPoint: SIMD3<Float>,
    transform: simd_float4x4
  ) -> (Double, Double) {
    let worldPoint = transform * SIMD4<Float>(
      localPoint.x,
      localPoint.y,
      localPoint.z,
      1
    )
    return (Double(worldPoint.x), Double(worldPoint.z))
  }

  @available(iOS 17.0, *)
  private static func floorPolygons(_ room: CapturedRoom) -> [[(Double, Double)]] {
    return room.floors.compactMap { floor in
      let points = floor.polygonCorners.map {
        planPoint($0, transform: floor.transform)
      }
      return points.count >= 3 ? points : nil
    }
  }

  private static func objectCorners(_ object: CapturedRoom.Object) -> [(Double, Double)] {
    let halfWidth = object.dimensions.x / 2
    let halfDepth = object.dimensions.z / 2
    return [
      SIMD3<Float>(-halfWidth, 0, -halfDepth),
      SIMD3<Float>(halfWidth, 0, -halfDepth),
      SIMD3<Float>(halfWidth, 0, halfDepth),
      SIMD3<Float>(-halfWidth, 0, halfDepth)
    ].map { planPoint($0, transform: object.transform) }
  }

  private static func planBounds(_ room: CapturedRoom) -> Bounds {
    var points = room.walls.flatMap { wall -> [(Double, Double)] in
      let pair = endpoints(wall)
      return [pair.0, pair.1]
    }
    points.append(contentsOf: room.objects.flatMap { objectCorners($0) })
    if #available(iOS 17.0, *) {
      points.append(contentsOf: floorPolygons(room).flatMap { $0 })
    }
    guard let first = points.first else {
      return Bounds(minX: -1, maxX: 1, minY: -1, maxY: 1)
    }
    return Bounds(
      minX: points.reduce(first.0) { min($0, $1.0) },
      maxX: points.reduce(first.0) { max($0, $1.0) },
      minY: points.reduce(first.1) { min($0, $1.1) },
      maxY: points.reduce(first.1) { max($0, $1.1) }
    )
  }

  private static func floorPlanImage(
    room: CapturedRoom,
    roomName: String,
    bounds: Bounds,
    measurements: [String: Any]
  ) -> UIImage {
    let size = CGSize(width: 1600, height: 900)
    let renderer = UIGraphicsImageRenderer(size: size)
    return renderer.image { context in
      let cg = context.cgContext
      UIColor(red: 0.95, green: 0.97, blue: 0.98, alpha: 1).setFill()
      cg.fill(CGRect(origin: .zero, size: size))
      let drawing = CGRect(x: 90, y: 130, width: 1420, height: 620)
      let roomWidth = max(bounds.maxX - bounds.minX, 0.1)
      let roomDepth = max(bounds.maxY - bounds.minY, 0.1)
      let scale = min(drawing.width / roomWidth, drawing.height / roomDepth)
      func point(_ value: (Double, Double)) -> CGPoint {
        CGPoint(
          x: drawing.midX + CGFloat((value.0 - (bounds.minX + bounds.maxX) / 2) * scale),
          y: drawing.midY + CGFloat((value.1 - (bounds.minY + bounds.maxY) / 2) * scale)
        )
      }

      var polygons: [[(Double, Double)]] = []
      if #available(iOS 17.0, *) {
        polygons = floorPolygons(room)
      }
      UIColor(red: 0.88, green: 0.93, blue: 0.97, alpha: 1).setFill()
      for polygon in polygons {
        guard let first = polygon.first else { continue }
        cg.beginPath()
        cg.move(to: point(first))
        for vertex in polygon.dropFirst() {
          cg.addLine(to: point(vertex))
        }
        cg.closePath()
        cg.fillPath()
      }

      for object in room.objects {
        let corners = objectCorners(object)
        guard let first = corners.first else { continue }
        cg.beginPath()
        cg.move(to: point(first))
        for corner in corners.dropFirst() {
          cg.addLine(to: point(corner))
        }
        cg.closePath()
        UIColor(red: 0.73, green: 0.84, blue: 0.93, alpha: 0.8).setFill()
        UIColor(red: 0.24, green: 0.48, blue: 0.68, alpha: 1).setStroke()
        cg.setLineWidth(4)
        cg.drawPath(using: .fillStroke)

        let center = corners.reduce((0.0, 0.0)) {
          ($0.0 + $1.0, $0.1 + $1.1)
        }
        let centerPoint = point((
          center.0 / Double(corners.count),
          center.1 / Double(corners.count)
        ))
        let label = objectDisplayName(objectCategory(object)) as NSString
        let attributes: [NSAttributedString.Key: Any] = [
          .font: UIFont.systemFont(ofSize: 15, weight: .semibold),
          .foregroundColor: UIColor(red: 0.05, green: 0.18, blue: 0.28, alpha: 1)
        ]
        let labelSize = label.size(withAttributes: attributes)
        label.draw(
          at: CGPoint(
            x: centerPoint.x - labelSize.width / 2,
            y: centerPoint.y - labelSize.height / 2
          ),
          withAttributes: attributes
        )
      }

      func drawSurfaces(
        _ surfaces: [CapturedRoom.Surface],
        color: UIColor,
        width: CGFloat,
        dash: [CGFloat] = []
      ) {
        cg.setLineCap(.round)
        cg.setLineWidth(width)
        cg.setLineDash(phase: 0, lengths: dash)
        color.setStroke()
        for surface in surfaces {
          let pair = endpoints(surface)
          cg.move(to: point(pair.0))
          cg.addLine(to: point(pair.1))
          cg.strokePath()
        }
        cg.setLineDash(phase: 0, lengths: [])
      }

      cg.setLineCap(.round)
      drawSurfaces(
        room.walls,
        color: UIColor(red: 0.09, green: 0.31, blue: 0.52, alpha: 1),
        width: 14
      )
      drawSurfaces(
        room.openings,
        color: UIColor(red: 0.52, green: 0.60, blue: 0.66, alpha: 1),
        width: 9,
        dash: [14, 10]
      )
      drawSurfaces(
        room.windows,
        color: UIColor(red: 0.12, green: 0.62, blue: 0.84, alpha: 1),
        width: 10
      )
      drawSurfaces(
        room.doors,
        color: UIColor(red: 0.18, green: 0.58, blue: 0.36, alpha: 1),
        width: 11
      )
      let title = roomName as NSString
      title.draw(at: CGPoint(x: 90, y: 48), withAttributes: [
        .font: UIFont.systemFont(ofSize: 34, weight: .bold),
        .foregroundColor: UIColor(red: 0.05, green: 0.12, blue: 0.18, alpha: 1)
      ])
      let summary = "\(measurements["floorAreaSqFt"] ?? 0) sq ft floor · \(measurements["ceilingHeightFt"] ?? 0) ft ceiling · \(room.doors.count) doors · \(room.windows.count) windows" as NSString
      summary.draw(at: CGPoint(x: 90, y: 92), withAttributes: [
        .font: UIFont.systemFont(ofSize: 20, weight: .medium),
        .foregroundColor: UIColor(red: 0.27, green: 0.37, blue: 0.45, alpha: 1)
      ])
      let note = "RoomPlan estimate · verify critical dimensions before ordering" as NSString
      note.draw(at: CGPoint(x: 90, y: 820), withAttributes: [
        .font: UIFont.systemFont(ofSize: 18),
        .foregroundColor: UIColor(red: 0.36, green: 0.44, blue: 0.50, alpha: 1)
      ])
    }
  }

  private static func objectDisplayName(_ category: String) -> String {
    switch category {
    case "bathtub": return "Bathtub"
    case "bed": return "Bed"
    case "cabinet": return "Cabinet"
    case "chair": return "Chair"
    case "dishwasher": return "Dishwasher"
    case "fireplace": return "Fireplace"
    case "oven": return "Oven"
    case "refrigerator": return "Refrigerator"
    case "shelf": return "Shelf"
    case "sink": return "Sink"
    case "sofa": return "Sofa"
    case "stairs": return "Stairs"
    case "storage": return "Storage"
    case "stove": return "Stove"
    case "table": return "Table"
    case "television": return "Television"
    case "toilet": return "Toilet"
    case "washerDryer": return "Washer / dryer"
    default: return "Object"
    }
  }
}
