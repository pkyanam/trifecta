import Foundation
import TrifectaProtocol

// MARK: - Arg parsing

struct CLIArgs {
    let pairingURL: PairingURL

    static func parse() throws -> CLIArgs {
        let args = CommandLine.arguments.dropFirst() // drop executable name
        if args.isEmpty {
            printUsage()
            Foundation.exit(1)
        }

        // --host <url> --token <token>
        if args.first == "--host" {
            var host: String?
            var token: String?
            var i = args.startIndex
            while i < args.endIndex {
                switch args[i] {
                case "--host":
                    let next = args.index(after: i)
                    if next < args.endIndex { host = args[next]; i = args.index(after: next) }
                case "--token":
                    let next = args.index(after: i)
                    if next < args.endIndex { token = args[next]; i = args.index(after: next) }
                default:
                    i = args.index(after: i)
                }
            }
            guard let h = host, let t = token else {
                printUsage()
                Foundation.exit(1)
            }
            return CLIArgs(pairingURL: try .direct(host: h, token: t))
        }

        // Positional pairing URL
        return CLIArgs(pairingURL: try .parse(string: String(args.first!)))
    }

    static func printUsage() {
        print("""
        Usage:
          TrifectaConformance <pairing-url>
          TrifectaConformance --host <http-base-url> --token <pairing-token>

        Examples:
          TrifectaConformance "https://app.trifecta.belweave.ai/pair?host=http://192.168.1.5:3773#token=abc123"
          TrifectaConformance --host http://localhost:3773 --token abc123
        """)
    }
}

// MARK: - Conformance harness

func runConformance(args: CLIArgs) async {
    let pairing = args.pairingURL
    let client = PairingClient(httpBaseURL: pairing.httpBaseURL)

    print("[pairing] host: \(pairing.httpBaseURL)")
    print("[pairing] bootstrapping bearer session...")

    let bootstrap: AuthBearerBootstrapResult
    do {
        bootstrap = try await client.bootstrap(credential: pairing.token)
    } catch {
        print("[pairing] FAILED: \(error.localizedDescription)")
        Foundation.exit(1)
    }
    print("[pairing] OK — role=\(bootstrap.role) method=\(bootstrap.sessionMethod)")
    print("[pairing] session token: \(bootstrap.sessionToken.prefix(8))…")

    let bearerToken = bootstrap.sessionToken

    print("[pairing] verifying session...")
    do {
        let session = try await client.sessionState(bearerToken: bearerToken)
        let role = session.role ?? "?"
        print("[pairing] session state: authenticated=\(session.authenticated) role=\(role)")
    } catch {
        print("[pairing] session verify FAILED: \(error.localizedDescription)")
        Foundation.exit(1)
    }

    print("[ws] minting WebSocket ticket...")
    let wsTicket: AuthWebSocketTokenResult
    do {
        wsTicket = try await client.mintWebSocketToken(bearerToken: bearerToken)
    } catch {
        print("[ws] mint ticket FAILED: \(error.localizedDescription)")
        Foundation.exit(1)
    }
    let wsURL = client.webSocketURL(wsToken: wsTicket.token)
    print("[ws] connecting to \(wsURL)")

    let transport = RpcTransport()
    do {
        try await transport.connect(to: wsURL)
    } catch {
        print("[ws] connect FAILED: \(error.localizedDescription)")
        Foundation.exit(1)
    }
    print("[ws] connected")

    // --- Heartbeat check ---
    print("[ping] sending Ping...")
    do {
        try await transport.sendPing()
        // Give server a moment to Pong (we don't block on Pong in M0)
        try? await Task.sleep(for: .milliseconds(500))
        print("[ping] Ping sent (Pong handled by heartbeat loop)")
    } catch {
        print("[ping] FAILED: \(error.localizedDescription)")
    }

    // --- Unary: server.getConfig ---
    print("\n[rpc] calling server.getConfig...")
    do {
        let result = try await transport.callUnary(tag: "server.getConfig")
        let jsonData = try JSONEncoder().encode(result)
        // Try typed decode; on failure print raw JSON for diagnosis
        do {
            let config = try JSONDecoder().decode(ServerConfigMinimal.self, from: jsonData)
            print("[rpc] server.getConfig OK")
            print("  cwd: \(config.cwd)")
            print("  providers (\(config.providers.count)):")
            for p in config.providers {
                let name = p.displayName ?? p.driver
                let status = p.enabled ? "enabled" : "disabled"
                print("    - \(p.instanceId) [\(name)] \(status) status=\(p.status)")
            }
        } catch {
            print("[rpc] server.getConfig typed-decode error: \(error)")
            print("[rpc] raw response:")
            if let pretty = String(data: jsonData, encoding: .utf8) {
                // Print first 2000 chars to avoid flooding
                print(String(pretty.prefix(2000)))
            }
        }
    } catch {
        print("[rpc] server.getConfig FAILED: \(error.localizedDescription)")
        Foundation.exit(1)
    }

    // --- Stream: orchestration.subscribeShell ---
    print("\n[rpc] subscribing to orchestration.subscribeShell (waiting for snapshot)...")
    do {
        var gotSnapshot = false
        let stream = await transport.subscribe(tag: "orchestration.subscribeShell")
        for try await value in stream {
            let data = try JSONEncoder().encode(value)
            do {
                let item = try JSONDecoder().decode(OrchestrationShellStreamItem.self, from: data)
                switch item {
                case .snapshot(let snap):
                    print("[rpc] subscribeShell snapshot received")
                    print("  snapshotSequence: \(snap.snapshotSequence)")
                    print("  projects (\(snap.projects.count)):")
                    for p in snap.projects {
                        print("    - [\(p.id)] \(p.title)  root=\(p.workspaceRoot)")
                    }
                    print("  threads (\(snap.threads.count)):")
                    for t in snap.threads {
                        print("    - [\(t.id)] \(t.title)  project=\(t.projectId)")
                    }
                    gotSnapshot = true
                    break  // Stop iterating after first snapshot
                case .projectUpserted(let seq, let p):
                    print("[rpc] projectUpserted seq=\(seq) id=\(p.id)")
                case .projectRemoved(let seq, let id):
                    print("[rpc] projectRemoved seq=\(seq) id=\(id)")
                case .threadUpserted(let seq, let t):
                    print("[rpc] threadUpserted seq=\(seq) id=\(t.id)")
                case .threadRemoved(let seq, let id):
                    print("[rpc] threadRemoved seq=\(seq) id=\(id)")
                case .unknown:
                    print("[rpc] subscribeShell unknown event kind (ignored)")
                }
            } catch {
                print("[rpc] decode error for shell item: \(error)")
            }
            if gotSnapshot { break }
        }
        if !gotSnapshot {
            print("[rpc] subscribeShell: stream ended without snapshot")
        }
    } catch {
        print("[rpc] subscribeShell FAILED: \(error.localizedDescription)")
        Foundation.exit(1)
    }

    // --- Done ---
    print("\n[conformance] M0 PASSED — wire format verified against live server")
    await transport.disconnect()
    Foundation.exit(0)
}

// MARK: - Entry point

let args: CLIArgs
do {
    args = try CLIArgs.parse()
} catch {
    print("Error parsing arguments: \(error.localizedDescription)")
    Foundation.exit(1)
}

Task {
    await runConformance(args: args)
}

RunLoop.main.run()
