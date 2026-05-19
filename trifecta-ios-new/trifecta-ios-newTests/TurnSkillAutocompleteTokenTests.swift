// FILE: TurnSkillAutocompleteTokenTests.swift
// Purpose: Verifies trailing `$` token parsing and replacement for skill autocomplete.
// Layer: Unit Test
// Exports: TurnSkillAutocompleteTokenTests
// Depends on: XCTest, TrifectaIOS

import XCTest
@testable import TrifectaIOS

@MainActor
final class TurnSkillAutocompleteTokenTests: XCTestCase {
    func testTrailingTokenParsesOnlyWhenItIsFinalToken() {
        let token = TurnViewModel.trailingSkillAutocompleteToken(in: "run $rev")
        XCTAssertEqual(token?.query, "rev")
    }

    func testBareDollarParsesToOpenSkillList() {
        let token = TurnViewModel.trailingSkillAutocompleteToken(in: "$")
        XCTAssertEqual(token?.query, "")
    }

    func testPureNumericDollarTokenDoesNotParseAsSkill() {
        XCTAssertNil(TurnViewModel.trailingSkillAutocompleteToken(in: "$100"))
    }

    func testTrailingTokenDoesNotParseWhenDollarTokenIsNotFinal() {
        XCTAssertNil(TurnViewModel.trailingSkillAutocompleteToken(in: "run $rev now"))
    }

    func testReplacingTrailingTokenUpdatesOnlyFinalDollarToken() {
        let updated = TurnViewModel.replacingTrailingSkillAutocompleteToken(
            in: "compare $first and $rev",
            with: "review"
        )

        XCTAssertEqual(updated, "compare $first and $review ")
    }
}
