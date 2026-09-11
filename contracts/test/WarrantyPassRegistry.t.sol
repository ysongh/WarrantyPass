// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {WarrantyPassRegistry} from "../src/WarrantyPassRegistry.sol";

/// @dev Tests for the phase 4 proof registry.
///
/// A note that is part of the specification, not commentary: these tests treat
/// `registeredBy` as *the wallet that paid for a transaction* and nothing else.
/// There is no test asserting that a registrant may modify, void, reclaim or
/// transfer a record, because the contract grants no such power to anyone —
/// see `test_RegistrantHasNoPrivilegeOverTheRecord`. Product ownership is not
/// modelled here at all, and a future phase introducing it must not read
/// `registeredBy` as the owner.
contract WarrantyPassRegistryTest is Test {
    WarrantyPassRegistry internal registry;

    // Timestamps are UTC midnight of the named calendar date, which is the
    // convention the application converts its date-only columns into. Values
    // verified against Date.parse('...T00:00:00Z') rather than hand-computed.
    uint64 internal constant SEP_08_2026 = 1788825600;
    uint64 internal constant SEP_07_2026 = 1788739200;
    uint64 internal constant SEP_08_2029 = 1883520000;
    uint64 internal constant FEB_29_2024 = 1709164800;
    uint64 internal constant FEB_28_2025 = 1740700800;

    // keccak256 of an opaque public id, exactly as the application derives it.
    bytes32 internal constant PRODUCT_KEY =
        keccak256(bytes("wp_550e8400e29b41d4a716446655440000"));
    bytes32 internal constant OTHER_PRODUCT_KEY =
        keccak256(bytes("wp_6f1c2b9d4e8a47f3b2c1d0e9f8a7b6c5"));
    bytes32 internal constant RECEIPT_HASH = keccak256("original receipt file bytes");
    bytes32 internal constant OTHER_RECEIPT_HASH = keccak256("a different receipt");

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    // Mirrors the contract's event so `expectEmit` has a definition to match.
    event WarrantyRegistered(
        bytes32 indexed productKey,
        bytes32 indexed receiptHash,
        address indexed registeredBy,
        uint64 purchaseDate,
        uint64 warrantyEnd,
        bool warrantyTransferable
    );

    function setUp() public {
        registry = new WarrantyPassRegistry();
        // Foundry starts at timestamp 1. Move to a point inside the warranty
        // window so expiry tests are not trivially true.
        vm.warp(SEP_08_2026 + 30 days);
    }

    // -----------------------------------------------------------------------
    // The product key derivation is shared with the frontend
    // -----------------------------------------------------------------------

    /// @dev `getProductKey` in src/lib/productKey.ts must produce exactly this,
    /// because the app registers under the key it derives and reads back under
    /// the same one. A divergence would not fail loudly — it would look like a
    /// proof that had never been created.
    ///
    /// The literals below were produced by `cast keccak`, independently of both
    /// viem and solc.
    function test_ProductKeyMatchesTheFrontendDerivation() public pure {
        assertEq(
            keccak256(bytes("wp_550e8400e29b41d4a716446655440000")),
            0x96156947ae700e998d10af1df879e0e2a8bab0ec228f1ec11378b5a6fc74239e,
            "keccak256(utf8 public_id) for A"
        );
        assertEq(
            keccak256(bytes("wp_6f1c2b9d4e8a47f3b2c1d0e9f8a7b6c5")),
            0x7b01f6581c0709ac00534ec2e3707e8a949ce9b1c3bd25330d92e4b17e7074ac,
            "keccak256(utf8 public_id) for B"
        );
    }

    // -----------------------------------------------------------------------
    // Registration success
    // -----------------------------------------------------------------------

    function test_RegisterStoresEveryField() public {
        vm.prank(alice);
        registry.registerWarranty(PRODUCT_KEY, RECEIPT_HASH, SEP_08_2026, SEP_08_2029, true);

        WarrantyPassRegistry.WarrantyRecord memory record = registry.getWarranty(PRODUCT_KEY);

        assertEq(record.receiptHash, RECEIPT_HASH, "receiptHash");
        assertEq(record.purchaseDate, SEP_08_2026, "purchaseDate");
        assertEq(record.warrantyEnd, SEP_08_2029, "warrantyEnd");
        assertEq(record.registeredBy, alice, "registeredBy is the caller");
        assertTrue(record.warrantyTransferable, "warrantyTransferable");
        assertEq(
            uint8(record.state),
            uint8(WarrantyPassRegistry.WarrantyState.Active),
            "state is Active"
        );
    }

    /// @dev `registeredBy` is `msg.sender`, not `tx.origin`. Asserted explicitly
    /// because the difference matters: a smart-contract wallet registering on a
    /// user's behalf is recorded as the contract, which is correct — the
    /// registry records who submitted, and has no way to resolve a human behind
    /// it.
    function test_RegisteredByIsCallerNotOrigin() public {
        vm.prank(alice, bob);
        registry.registerWarranty(PRODUCT_KEY, RECEIPT_HASH, SEP_08_2026, SEP_08_2029, false);

        assertEq(registry.getWarranty(PRODUCT_KEY).registeredBy, alice);
    }

    function test_RegisterStoresNonTransferable() public {
        vm.prank(alice);
        registry.registerWarranty(PRODUCT_KEY, RECEIPT_HASH, SEP_08_2026, SEP_08_2029, false);

        assertFalse(registry.getWarranty(PRODUCT_KEY).warrantyTransferable);
    }

    /// @dev A warranty covering only its purchase day. Allowed: it is unusual,
    /// not incoherent, and the registry does not second-guess terms.
    function test_RegisterAllowsWarrantyEndEqualToPurchaseDate() public {
        vm.prank(alice);
        registry.registerWarranty(PRODUCT_KEY, RECEIPT_HASH, SEP_08_2026, SEP_08_2026, true);

        assertEq(registry.getWarranty(PRODUCT_KEY).warrantyEnd, SEP_08_2026);
    }

    /// @dev Feb 29 purchase with a Feb 28 end the following year — what the
    /// application's `addMonths` clamping produces for a one-year warranty
    /// bought on a leap day. The registry must accept it.
    function test_RegisterAcceptsLeapDayClampedWarranty() public {
        vm.prank(alice);
        registry.registerWarranty(PRODUCT_KEY, RECEIPT_HASH, FEB_29_2024, FEB_28_2025, true);

        WarrantyPassRegistry.WarrantyRecord memory record = registry.getWarranty(PRODUCT_KEY);
        assertEq(record.purchaseDate, FEB_29_2024);
        assertEq(record.warrantyEnd, FEB_28_2025);
    }

    // -----------------------------------------------------------------------
    // Event
    // -----------------------------------------------------------------------

    function test_RegisterEmitsWarrantyRegistered() public {
        // All three indexed topics and the data payload are checked.
        vm.expectEmit(true, true, true, true, address(registry));
        emit WarrantyRegistered(
            PRODUCT_KEY, RECEIPT_HASH, alice, SEP_08_2026, SEP_08_2029, true
        );

        vm.prank(alice);
        registry.registerWarranty(PRODUCT_KEY, RECEIPT_HASH, SEP_08_2026, SEP_08_2029, true);
    }

    // -----------------------------------------------------------------------
    // Duplicate protection
    // -----------------------------------------------------------------------

    function test_RevertWhen_SameKeyRegisteredTwiceBySameWallet() public {
        vm.prank(alice);
        registry.registerWarranty(PRODUCT_KEY, RECEIPT_HASH, SEP_08_2026, SEP_08_2029, true);

        vm.expectRevert(
            abi.encodeWithSelector(
                WarrantyPassRegistry.WarrantyAlreadyRegistered.selector, PRODUCT_KEY
            )
        );
        vm.prank(alice);
        registry.registerWarranty(PRODUCT_KEY, RECEIPT_HASH, SEP_08_2026, SEP_08_2029, true);
    }

    /// @dev The important one. A second wallet must not be able to take over a
    /// key, and must not be able to replace the digest under it.
    function test_RevertWhen_SameKeyRegisteredByDifferentWallet() public {
        vm.prank(alice);
        registry.registerWarranty(PRODUCT_KEY, RECEIPT_HASH, SEP_08_2026, SEP_08_2029, true);

        vm.expectRevert(
            abi.encodeWithSelector(
                WarrantyPassRegistry.WarrantyAlreadyRegistered.selector, PRODUCT_KEY
            )
        );
        vm.prank(bob);
        registry.registerWarranty(PRODUCT_KEY, OTHER_RECEIPT_HASH, SEP_08_2026, SEP_08_2029, false);
    }

    /// @dev The original record survives a rejected takeover completely intact.
    function test_FailedOverwriteLeavesOriginalRecordUnchanged() public {
        vm.prank(alice);
        registry.registerWarranty(PRODUCT_KEY, RECEIPT_HASH, SEP_08_2026, SEP_08_2029, true);

        vm.expectRevert();
        vm.prank(bob);
        registry.registerWarranty(PRODUCT_KEY, OTHER_RECEIPT_HASH, FEB_29_2024, FEB_28_2025, false);

        WarrantyPassRegistry.WarrantyRecord memory record = registry.getWarranty(PRODUCT_KEY);
        assertEq(record.receiptHash, RECEIPT_HASH, "digest not replaced");
        assertEq(record.registeredBy, alice, "registrant not replaced");
        assertEq(record.purchaseDate, SEP_08_2026, "dates not replaced");
        assertEq(record.warrantyEnd, SEP_08_2029, "dates not replaced");
        assertTrue(record.warrantyTransferable, "flag not replaced");
    }

    // -----------------------------------------------------------------------
    // Argument validation
    // -----------------------------------------------------------------------

    function test_RevertWhen_ProductKeyIsZero() public {
        vm.expectRevert(WarrantyPassRegistry.InvalidProductKey.selector);
        vm.prank(alice);
        registry.registerWarranty(bytes32(0), RECEIPT_HASH, SEP_08_2026, SEP_08_2029, true);
    }

    function test_RevertWhen_ReceiptHashIsZero() public {
        vm.expectRevert(WarrantyPassRegistry.InvalidReceiptHash.selector);
        vm.prank(alice);
        registry.registerWarranty(PRODUCT_KEY, bytes32(0), SEP_08_2026, SEP_08_2029, true);
    }

    function test_RevertWhen_PurchaseDateIsZero() public {
        vm.expectRevert(WarrantyPassRegistry.InvalidPurchaseDate.selector);
        vm.prank(alice);
        registry.registerWarranty(PRODUCT_KEY, RECEIPT_HASH, 0, SEP_08_2029, true);
    }

    /// @dev Purchase Sep 8 2026, warranty ending Sep 7 2026 — coverage that
    /// ends before it starts.
    function test_RevertWhen_WarrantyEndsBeforePurchase() public {
        vm.expectRevert(WarrantyPassRegistry.InvalidWarrantyEnd.selector);
        vm.prank(alice);
        registry.registerWarranty(PRODUCT_KEY, RECEIPT_HASH, SEP_08_2026, SEP_07_2026, true);
    }

    /// @dev Nothing is written when validation fails.
    function test_RejectedRegistrationStoresNothing() public {
        vm.expectRevert();
        vm.prank(alice);
        registry.registerWarranty(PRODUCT_KEY, RECEIPT_HASH, SEP_08_2026, SEP_07_2026, true);

        assertFalse(registry.exists(PRODUCT_KEY));
    }

    // -----------------------------------------------------------------------
    // Independence of records
    // -----------------------------------------------------------------------

    function test_SameWalletRegistersMultipleProducts() public {
        vm.startPrank(alice);
        registry.registerWarranty(PRODUCT_KEY, RECEIPT_HASH, SEP_08_2026, SEP_08_2029, true);
        registry.registerWarranty(
            OTHER_PRODUCT_KEY, OTHER_RECEIPT_HASH, FEB_29_2024, FEB_28_2025, false
        );
        vm.stopPrank();

        assertEq(registry.getWarranty(PRODUCT_KEY).receiptHash, RECEIPT_HASH);
        assertEq(registry.getWarranty(OTHER_PRODUCT_KEY).receiptHash, OTHER_RECEIPT_HASH);
        assertEq(registry.getWarranty(OTHER_PRODUCT_KEY).registeredBy, alice);
    }

    function test_DifferentWalletsRegisterDifferentProducts() public {
        vm.prank(alice);
        registry.registerWarranty(PRODUCT_KEY, RECEIPT_HASH, SEP_08_2026, SEP_08_2029, true);

        vm.prank(bob);
        registry.registerWarranty(
            OTHER_PRODUCT_KEY, OTHER_RECEIPT_HASH, FEB_29_2024, FEB_28_2025, false
        );

        assertEq(registry.getWarranty(PRODUCT_KEY).registeredBy, alice);
        assertEq(registry.getWarranty(OTHER_PRODUCT_KEY).registeredBy, bob);
    }

    /// @dev Two products may legitimately share a receipt digest — one receipt
    /// often covers several items. The key is what must be unique, not the hash.
    function test_TwoProductsMayShareOneReceiptHash() public {
        vm.startPrank(alice);
        registry.registerWarranty(PRODUCT_KEY, RECEIPT_HASH, SEP_08_2026, SEP_08_2029, true);
        registry.registerWarranty(OTHER_PRODUCT_KEY, RECEIPT_HASH, SEP_08_2026, SEP_08_2029, true);
        vm.stopPrank();

        assertEq(registry.getWarranty(PRODUCT_KEY).receiptHash, RECEIPT_HASH);
        assertEq(registry.getWarranty(OTHER_PRODUCT_KEY).receiptHash, RECEIPT_HASH);
    }

    // -----------------------------------------------------------------------
    // Reads
    // -----------------------------------------------------------------------

    function test_ExistsIsFalseBeforeRegistrationAndTrueAfter() public {
        assertFalse(registry.exists(PRODUCT_KEY));

        vm.prank(alice);
        registry.registerWarranty(PRODUCT_KEY, RECEIPT_HASH, SEP_08_2026, SEP_08_2029, true);

        assertTrue(registry.exists(PRODUCT_KEY));
    }

    function test_ExistsIsFalseForZeroKeyAndNeverReverts() public view {
        assertFalse(registry.exists(bytes32(0)));
    }

    /// @dev An unknown key must fail loudly rather than return a zeroed struct a
    /// caller could mistake for a real record.
    function test_RevertWhen_GetWarrantyOnUnknownKey() public {
        vm.expectRevert(
            abi.encodeWithSelector(WarrantyPassRegistry.WarrantyNotFound.selector, PRODUCT_KEY)
        );
        registry.getWarranty(PRODUCT_KEY);
    }

    function test_RevertWhen_IsExpiredOnUnknownKey() public {
        vm.expectRevert(
            abi.encodeWithSelector(WarrantyPassRegistry.WarrantyNotFound.selector, PRODUCT_KEY)
        );
        registry.isExpired(PRODUCT_KEY);
    }

    // -----------------------------------------------------------------------
    // Expiry is derived, and the last covered day is inclusive
    // -----------------------------------------------------------------------

    function test_IsExpiredFalseDuringCoverage() public {
        vm.prank(alice);
        registry.registerWarranty(PRODUCT_KEY, RECEIPT_HASH, SEP_08_2026, SEP_08_2029, true);

        vm.warp(SEP_08_2029 - 1);
        assertFalse(registry.isExpired(PRODUCT_KEY));
    }

    /// @dev The boundary. `warrantyEnd` is the midnight starting the final
    /// covered day, so the whole of that day is still covered and expiry lands
    /// at the next midnight. Getting this wrong expires every warranty a day
    /// early — the same off-by-one the application's date helpers guard against.
    function test_IsExpiredIsInclusiveOfTheFinalDay() public {
        vm.prank(alice);
        registry.registerWarranty(PRODUCT_KEY, RECEIPT_HASH, SEP_08_2026, SEP_08_2029, true);

        vm.warp(SEP_08_2029);
        assertFalse(registry.isExpired(PRODUCT_KEY), "midnight starting the last day");

        vm.warp(SEP_08_2029 + 1 days - 1);
        assertFalse(registry.isExpired(PRODUCT_KEY), "last second of the last day");

        vm.warp(SEP_08_2029 + 1 days);
        assertTrue(registry.isExpired(PRODUCT_KEY), "midnight after the last day");
    }

    /// @dev Expiry changes with time alone, with no transaction and no state
    /// change — which is the reason `Expired` is not a stored state.
    function test_ExpiryChangesWithoutAnyStateChange() public {
        vm.prank(alice);
        registry.registerWarranty(PRODUCT_KEY, RECEIPT_HASH, SEP_08_2026, SEP_08_2029, true);

        assertFalse(registry.isExpired(PRODUCT_KEY));
        vm.warp(SEP_08_2029 + 365 days);
        assertTrue(registry.isExpired(PRODUCT_KEY));

        // Still Active. Expired is not a state, and nothing voided it.
        assertEq(
            uint8(registry.getWarranty(PRODUCT_KEY).state),
            uint8(WarrantyPassRegistry.WarrantyState.Active)
        );
    }

    // -----------------------------------------------------------------------
    // The registry models no ownership
    // -----------------------------------------------------------------------

    /// @dev Documents the contract's access model as an executable assertion:
    /// the registrant has no privilege the public does not have. There is no
    /// function that lets `alice` alter, void or reassign her own record, so the
    /// only thing she can attempt is a re-registration — and that reverts
    /// exactly as it does for a stranger.
    ///
    /// `registeredBy` therefore cannot be read as ownership. It is a historical
    /// fact about who submitted a transaction.
    function test_RegistrantHasNoPrivilegeOverTheRecord() public {
        vm.prank(alice);
        registry.registerWarranty(PRODUCT_KEY, RECEIPT_HASH, SEP_08_2026, SEP_08_2029, true);

        bytes memory expected = abi.encodeWithSelector(
            WarrantyPassRegistry.WarrantyAlreadyRegistered.selector, PRODUCT_KEY
        );

        vm.expectRevert(expected);
        vm.prank(alice);
        registry.registerWarranty(PRODUCT_KEY, OTHER_RECEIPT_HASH, SEP_08_2026, SEP_08_2029, false);

        vm.expectRevert(expected);
        vm.prank(bob);
        registry.registerWarranty(PRODUCT_KEY, OTHER_RECEIPT_HASH, SEP_08_2026, SEP_08_2029, false);

        // Identical outcome for the registrant and a stranger.
        assertEq(registry.getWarranty(PRODUCT_KEY).registeredBy, alice);
    }

    /// @dev Anyone may read any record. Reads are deliberately unrestricted —
    /// the data is opaque digests and dates, and chain data is public regardless.
    function test_AnyoneCanReadAnyRecord() public {
        vm.prank(alice);
        registry.registerWarranty(PRODUCT_KEY, RECEIPT_HASH, SEP_08_2026, SEP_08_2029, true);

        vm.prank(bob);
        assertEq(registry.getWarranty(PRODUCT_KEY).receiptHash, RECEIPT_HASH);
    }

    // -----------------------------------------------------------------------
    // Fuzz
    // -----------------------------------------------------------------------

    /// @dev Any accepted input round-trips unchanged.
    function testFuzz_ValidRegistrationRoundTrips(
        bytes32 productKey,
        bytes32 receiptHash,
        uint64 purchaseDate,
        uint64 warrantyEnd,
        bool transferable,
        address caller
    ) public {
        vm.assume(productKey != bytes32(0));
        vm.assume(receiptHash != bytes32(0));
        purchaseDate = uint64(bound(purchaseDate, 1, type(uint64).max - 1));
        warrantyEnd = uint64(bound(warrantyEnd, purchaseDate, type(uint64).max));
        vm.assume(caller != address(0));

        vm.prank(caller);
        registry.registerWarranty(productKey, receiptHash, purchaseDate, warrantyEnd, transferable);

        WarrantyPassRegistry.WarrantyRecord memory record = registry.getWarranty(productKey);
        assertEq(record.receiptHash, receiptHash);
        assertEq(record.purchaseDate, purchaseDate);
        assertEq(record.warrantyEnd, warrantyEnd);
        assertEq(record.registeredBy, caller);
        assertEq(record.warrantyTransferable, transferable);
        assertTrue(registry.exists(productKey));
    }

    /// @dev No input at all makes a second registration succeed.
    function testFuzz_SecondRegistrationAlwaysReverts(
        bytes32 productKey,
        bytes32 firstHash,
        bytes32 secondHash,
        address first,
        address second
    ) public {
        vm.assume(productKey != bytes32(0));
        vm.assume(firstHash != bytes32(0));
        vm.assume(secondHash != bytes32(0));

        vm.prank(first);
        registry.registerWarranty(productKey, firstHash, SEP_08_2026, SEP_08_2029, true);

        vm.expectRevert(
            abi.encodeWithSelector(
                WarrantyPassRegistry.WarrantyAlreadyRegistered.selector, productKey
            )
        );
        vm.prank(second);
        registry.registerWarranty(productKey, secondHash, FEB_29_2024, FEB_28_2025, false);

        assertEq(registry.getWarranty(productKey).receiptHash, firstHash);
    }
}
