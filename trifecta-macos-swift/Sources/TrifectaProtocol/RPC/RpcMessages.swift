import Foundation

// MARK: - Client → Server

struct RpcRequest: Encodable {
    let _tag = "Request"
    let id: String
    let tag: String
    let payload: JSONValue
    let headers: [[String]] = []
}

struct RpcAck: Encodable {
    let _tag = "Ack"
    let requestId: String
}

struct RpcInterrupt: Encodable {
    let _tag = "Interrupt"
    let requestId: String
    let interruptors: [Int] = []
}

struct RpcPing: Encodable {
    let _tag = "Ping"
}

// MARK: - Server → Client

/// Tag-only decode pass to identify the message type before full decode.
struct RpcServerMessageTag: Decodable {
    let _tag: String
}

struct RpcChunkMessage: Decodable {
    let requestId: String
    let values: [JSONValue]
}

struct RpcExitMessage: Decodable {
    let requestId: String
    let exit: RpcExitResult
}

struct RpcExitResult: Decodable {
    let _tag: String
    let value: JSONValue?
    let cause: [JSONValue]?
}

struct RpcDefectMessage: Decodable {
    let defect: JSONValue
}

struct RpcClientProtocolError: Decodable {
    let error: JSONValue
}

// MARK: - Parsed server message

enum RpcServerMessage {
    case chunk(requestId: String, values: [JSONValue])
    case exit(requestId: String, result: RpcExitResult)
    case defect(JSONValue)
    case pong
    case clientProtocolError(JSONValue)
    case unknown(tag: String)
}

// MARK: - Parse

private let decoder = JSONDecoder()

func parseServerMessage(_ text: String) -> RpcServerMessage? {
    guard let data = text.data(using: .utf8) else { return nil }
    guard let tagged = try? decoder.decode(RpcServerMessageTag.self, from: data) else { return nil }
    switch tagged._tag {
    case "Chunk":
        guard let msg = try? decoder.decode(RpcChunkMessage.self, from: data) else { return nil }
        return .chunk(requestId: msg.requestId, values: msg.values)
    case "Exit":
        guard let msg = try? decoder.decode(RpcExitMessage.self, from: data) else { return nil }
        return .exit(requestId: msg.requestId, result: msg.exit)
    case "Defect":
        let msg = try? decoder.decode(RpcDefectMessage.self, from: data)
        return .defect(msg?.defect ?? .null)
    case "Pong":
        return .pong
    case "ClientProtocolError":
        let msg = try? decoder.decode(RpcClientProtocolError.self, from: data)
        return .clientProtocolError(msg?.error ?? .null)
    default:
        return .unknown(tag: tagged._tag)
    }
}
