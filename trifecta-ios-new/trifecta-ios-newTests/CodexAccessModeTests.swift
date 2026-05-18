// FILE: CodexAccessModeTests.swift
// Purpose: Guards the runtime access-mode strings used by fork/send fallbacks.
// Layer: Unit Test
// Exports: CodexAccessModeTests
// Depends on: XCTest, TrifectaIOS

import XCTest
@testable import TrifectaIOS

final class CodexAccessModeTests: XCTestCase {
    func testSandboxLegacyValuesMatchRuntimeEnums() {
        XCTAssertEqual(CodexAccessMode.approvalRequired.sandboxLegacyValue, "read-only")
        XCTAssertEqual(CodexAccessMode.autoAcceptEdits.sandboxLegacyValue, "workspace-write")
        XCTAssertEqual(CodexAccessMode.fullAccess.sandboxLegacyValue, "danger-full-access")
    }

    func testCanonicalRawValueMigratesLegacyOnRequest() {
        XCTAssertEqual(CodexAccessMode(canonicalRawValue: "on-request"), .approvalRequired)
        XCTAssertEqual(CodexAccessMode(canonicalRawValue: "approval-required"), .approvalRequired)
        XCTAssertEqual(CodexAccessMode(canonicalRawValue: "auto-accept-edits"), .autoAcceptEdits)
    }
}
