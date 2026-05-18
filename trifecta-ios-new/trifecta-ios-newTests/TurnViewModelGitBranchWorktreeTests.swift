// FILE: TurnViewModelGitBranchWorktreeTests.swift
// Purpose: Verifies worktree-backed branches are exposed to the UI only when Git reports them as checked out elsewhere.
// Layer: Unit Test
// Exports: TurnViewModelGitBranchWorktreeTests
// Depends on: XCTest, TrifectaIOS

import XCTest
@testable import TrifectaIOS

@MainActor
final class TurnViewModelGitBranchWorktreeTests: XCTestCase {
    func testWorktreePathResolvesOnlyForBranchesCheckedOutElsewhere() {
        let viewModel = TurnViewModel()
        viewModel.gitBranchesCheckedOutElsewhere = ["trifecta/feature-a"]
        viewModel.gitWorktreePathsByBranch = [
            "trifecta/feature-a": "/tmp/trifecta-feature-a",
            "main": "/tmp/trifecta-main"
        ]

        XCTAssertEqual(
            viewModel.worktreePathForCheckedOutElsewhereBranch("trifecta/feature-a"),
            "/tmp/trifecta-feature-a"
        )
        XCTAssertNil(viewModel.worktreePathForCheckedOutElsewhereBranch("main"))
        XCTAssertNil(viewModel.worktreePathForCheckedOutElsewhereBranch("trifecta/missing"))
    }

    func testApplyGitBranchTargetsStoresTrueLocalCheckoutPath() {
        let viewModel = TurnViewModel()
        let result = GitBranchesWithStatusResult(
            from: [
                "branches": .array([.string("main")]),
                "branchesCheckedOutElsewhere": .array([]),
                "worktreePathByBranch": .object([:]),
                "localCheckoutPath": .string("/tmp/trifecta-local/phodex-bridge"),
                "current": .string("main"),
                "default": .string("main"),
            ]
        )

        viewModel.applyGitBranchTargets(result)

        XCTAssertEqual(viewModel.gitLocalCheckoutPath, "/tmp/trifecta-local/phodex-bridge")
    }

    func testApplyGitBranchTargetsKeepsSelectedBaseBranchEmptyWhenDefaultIsRemoteOnly() {
        let viewModel = TurnViewModel()
        let result = GitBranchesWithStatusResult(
            from: [
                "branches": .array([.string("trifecta/topic")]),
                "branchesCheckedOutElsewhere": .array([]),
                "worktreePathByBranch": .object([:]),
                "localCheckoutPath": .string("/tmp/trifecta-local/phodex-bridge"),
                "current": .string("trifecta/topic"),
                "default": .string("main"),
            ]
        )

        viewModel.applyGitBranchTargets(result)

        XCTAssertEqual(viewModel.gitDefaultBranch, "main")
        XCTAssertEqual(viewModel.selectedGitBaseBranch, "")
    }

    func testApplyGitBranchTargetsPreservesValidLocalBaseBranchSelection() {
        let viewModel = TurnViewModel()
        viewModel.selectedGitBaseBranch = "release/1.0"
        let result = GitBranchesWithStatusResult(
            from: [
                "branches": .array([.string("main"), .string("release/1.0"), .string("trifecta/topic")]),
                "branchesCheckedOutElsewhere": .array([]),
                "worktreePathByBranch": .object([:]),
                "localCheckoutPath": .string("/tmp/trifecta-local/phodex-bridge"),
                "current": .string("trifecta/topic"),
                "default": .string("main"),
            ]
        )

        viewModel.applyGitBranchTargets(result)

        XCTAssertEqual(viewModel.selectedGitBaseBranch, "release/1.0")
    }
}
