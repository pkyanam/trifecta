// FILE: TurnGitBranchSelectorTests.swift
// Purpose: Verifies new branch creation names normalize toward the trifecta/ prefix without double-prefixing.
// Layer: Unit Test
// Exports: TurnGitBranchSelectorTests
// Depends on: XCTest, TrifectaIOS

import XCTest
@testable import TrifectaIOS

final class TurnGitBranchSelectorTests: XCTestCase {
    func testNormalizesCreatedBranchNamesTowardTrifectaPrefix() {
        XCTAssertEqual(trifectaNormalizedCreatedBranchName("foo"), "trifecta/foo")
        XCTAssertEqual(trifectaNormalizedCreatedBranchName("trifecta/foo"), "trifecta/foo")
        XCTAssertEqual(trifectaNormalizedCreatedBranchName("  foo  "), "trifecta/foo")
    }

    func testNormalizesEmptyBranchNamesToEmptyString() {
        XCTAssertEqual(trifectaNormalizedCreatedBranchName("   "), "")
    }

    func testCurrentBranchSelectionDisablesCheckedOutElsewhereRowsWhenWorktreePathIsMissing() {
        XCTAssertTrue(
            trifectaCurrentBranchSelectionIsDisabled(
                branch: "trifecta/feature-a",
                currentBranch: "main",
                gitBranchesCheckedOutElsewhere: ["trifecta/feature-a"],
                gitWorktreePathsByBranch: [:],
                allowsSelectingCurrentBranch: true
            )
        )
    }

    func testCurrentBranchSelectionKeepsCheckedOutElsewhereRowsEnabledWhenWorktreePathExists() {
        XCTAssertFalse(
            trifectaCurrentBranchSelectionIsDisabled(
                branch: "trifecta/feature-a",
                currentBranch: "main",
                gitBranchesCheckedOutElsewhere: ["trifecta/feature-a"],
                gitWorktreePathsByBranch: ["trifecta/feature-a": "/tmp/trifecta-feature-a"],
                allowsSelectingCurrentBranch: true
            )
        )
    }

    func testSelectableDefaultBranchReturnsNilWhenDefaultIsNotLocal() {
        XCTAssertNil(
            trifectaSelectableDefaultBranch(
                defaultBranch: "main",
                availableGitBranchTargets: ["trifecta/feature-a"]
            )
        )
    }

    func testSelectableDefaultBranchReturnsDefaultWhenItIsLocal() {
        XCTAssertEqual(
            trifectaSelectableDefaultBranch(
                defaultBranch: "main",
                availableGitBranchTargets: ["main", "trifecta/feature-a"]
            ),
            "main"
        )
    }
}
