// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title WarrantyPassRegistry
/// @notice An append-only registry of receipt digests and warranty dates.
///
/// @dev What a record in this contract means
/// ----------------------------------------
/// Exactly one thing:
///
///     "At block timestamp T, the address `registeredBy` submitted this
///      receipt digest and these warranty dates under this product key."
///
/// That is a claim about *registration*, made by whoever sent the transaction.
/// It is emphatically NOT any of the following, and no part of this contract
/// should be presented as though it were:
///
///   - a manufacturer confirming a warranty exists
///   - a retailer confirming a receipt is genuine
///   - anyone confirming the purchase happened
///   - a statement that a warranty is legally enforceable
///
/// The registry cannot know any of those things. It never sees the receipt —
/// only a hash of it — and it cannot distinguish a real purchase from an
/// invented one. Its value is integrity and timing: the digest recorded here
/// cannot later be altered, so a receipt produced afterwards can be checked
/// against what was committed to, and the commitment is dated by the chain.
///
/// @dev What is deliberately absent
/// -------------------------------
/// `address owner` — there is no ownership concept here. `registeredBy` is the
/// wallet that paid for the transaction, nothing more. It does not convey the
/// right to modify the record (nothing can), it is not the product's owner, and
/// it must not be rendered as one. Phase 5 introduces ENSv2 as the product
/// identity and ownership layer; having an ownership field here would create a
/// second, competing source of truth for it before that design exists.
///
/// `address issuer` — omitted because this contract has no way to verify an
/// issuer. A consumer typing "Sony" into a form must never produce an onchain
/// record that reads as Sony's attestation. The human-readable issuer stays in
/// the application database as what it actually is: user-entered text. A
/// verified-issuer model is a future feature with its own authorization design,
/// not a field to add speculatively.
///
/// No `Ownable`, no admin, no pause, and no proxy. Registration is
/// permissionless, reads are free, and there is no privileged action for an
/// admin to hold — so there is no reason to carry the attack surface of an
/// access-control system or an upgrade path.
///
/// @dev What must never be written here
/// -----------------------------------
/// Serial numbers, retailer order IDs, customer names, emails, addresses, card
/// details, storage paths, database user IDs, or the receipt itself. Chain data
/// is public and permanent. Every argument this contract accepts is either an
/// opaque digest or a date, and it should stay that way.
contract WarrantyPassRegistry {
    /// @notice Lifecycle state of a record.
    /// @dev `Expired` is intentionally not a member. Expiry is a pure function
    /// of `warrantyEnd` and the current time, so storing it would require
    /// someone to send a transaction each time a warranty lapses — and until
    /// they did, the contract would be confidently wrong. Derive it instead;
    /// `isExpired` below does, and so does the application.
    ///
    /// `Voided` is reserved but unreachable in this version. Voiding needs an
    /// answer to "who is allowed to void this?", and the honest answer today is
    /// that nobody in this contract has standing to: `registeredBy` is a
    /// registrant, not an owner, and letting it invalidate a record would hand
    /// whoever happened to pay gas a veto over the proof. The enum member is
    /// kept so the state space is explicit rather than implied, and so a future
    /// version with a real authorization model does not have to renumber it.
    enum WarrantyState {
        None,
        Active,
        Voided
    }

    /// @notice One registration.
    /// @dev Field order is chosen for storage packing. `receiptHash` fills slot
    /// 0; `purchaseDate` and `warrantyEnd` share slot 1 (8 bytes each);
    /// `registeredBy`, `state` and `warrantyTransferable` share slot 2 (20 + 1 +
    /// 1 bytes). Three slots, which is the minimum for this data. Reordering
    /// these fields will silently cost a fourth.
    struct WarrantyRecord {
        /// @dev keccak256 of the original, unmodified receipt file bytes.
        bytes32 receiptHash;
        /// @dev Unix seconds at UTC midnight of a calendar date.
        uint64 purchaseDate;
        /// @dev Unix seconds at UTC midnight. Inclusive last day of coverage.
        uint64 warrantyEnd;
        /// @dev The wallet that submitted this. NOT the product's owner.
        address registeredBy;
        WarrantyState state;
        /// @dev As claimed by the registrant, not verified by anyone.
        bool warrantyTransferable;
    }

    /// @dev Keyed by `keccak256(utf8 public_id)`, an opaque random identifier
    /// from the application database. Private, so the only way to read a record
    /// is through the accessors below, which can enforce existence.
    mapping(bytes32 => WarrantyRecord) private _records;

    /// @notice Emitted once per successful registration. Never re-emitted: a
    /// key can only be written one time, so one event per key is the complete
    /// history.
    event WarrantyRegistered(
        bytes32 indexed productKey,
        bytes32 indexed receiptHash,
        address indexed registeredBy,
        uint64 purchaseDate,
        uint64 warrantyEnd,
        bool warrantyTransferable
    );

    error InvalidProductKey();
    error InvalidReceiptHash();
    error InvalidPurchaseDate();
    error InvalidWarrantyEnd();
    error WarrantyAlreadyRegistered(bytes32 productKey);
    error WarrantyNotFound(bytes32 productKey);

    /// @notice Register a proof for a product key. Permissionless.
    /// @dev Write-once. There is no update path and no overwrite path, by
    /// design: a record that could be replaced would prove nothing, because the
    /// digest anyone reads today might not be the digest committed to
    /// originally. A second call for the same key reverts even when it comes
    /// from the address that made the first one.
    ///
    /// A consequence worth stating plainly: whoever registers a key first holds
    /// it permanently. `productKey` is derived from an opaque, randomly
    /// generated `public_id`, so a third party cannot guess one to squat it —
    /// but this is why that identifier must stay random and must never be
    /// derived from guessable product data.
    ///
    /// @param productKey keccak256 of the application's opaque public product id.
    /// @param receiptHash keccak256 of the original receipt file bytes.
    /// @param purchaseDate Unix seconds, UTC midnight of the purchase date.
    /// @param warrantyEnd Unix seconds, UTC midnight of the last covered day.
    /// @param warrantyTransferable Registrant's claim about transferability.
    function registerWarranty(
        bytes32 productKey,
        bytes32 receiptHash,
        uint64 purchaseDate,
        uint64 warrantyEnd,
        bool warrantyTransferable
    ) external {
        if (productKey == bytes32(0)) revert InvalidProductKey();
        if (receiptHash == bytes32(0)) revert InvalidReceiptHash();
        if (purchaseDate == 0) revert InvalidPurchaseDate();

        // Equal is allowed: a warranty covering only its purchase day is odd but
        // not incoherent, and rejecting it would be a judgement the registry has
        // no business making. Ordering, on the other hand, is incoherent.
        if (warrantyEnd < purchaseDate) revert InvalidWarrantyEnd();

        // Existence is keyed on `state`, not on `receiptHash`, because `state`
        // is the one field that cannot legitimately be zero after a write —
        // `registerWarranty` always sets it to Active.
        if (_records[productKey].state != WarrantyState.None) {
            revert WarrantyAlreadyRegistered(productKey);
        }

        _records[productKey] = WarrantyRecord({
            receiptHash: receiptHash,
            purchaseDate: purchaseDate,
            warrantyEnd: warrantyEnd,
            registeredBy: msg.sender,
            state: WarrantyState.Active,
            warrantyTransferable: warrantyTransferable
        });

        emit WarrantyRegistered(
            productKey, receiptHash, msg.sender, purchaseDate, warrantyEnd, warrantyTransferable
        );
    }

    /// @notice Read a record.
    /// @dev Reverts rather than returning a zeroed struct for an unknown key.
    /// A caller that forgot to check existence would otherwise receive a record
    /// with `receiptHash == 0` and `registeredBy == address(0)` and might render
    /// it as a real one; failing loudly removes that class of mistake. Use
    /// `exists` to probe.
    function getWarranty(bytes32 productKey) external view returns (WarrantyRecord memory) {
        WarrantyRecord memory record = _records[productKey];
        if (record.state == WarrantyState.None) revert WarrantyNotFound(productKey);
        return record;
    }

    /// @notice Whether a key has been registered. Never reverts.
    function exists(bytes32 productKey) external view returns (bool) {
        return _records[productKey].state != WarrantyState.None;
    }

    /// @notice Whether coverage has lapsed, as of the current block.
    /// @dev Derived, never stored — see the note on `WarrantyState`.
    ///
    /// `warrantyEnd` is the UTC midnight that *starts* the last covered day, so
    /// the warranty runs through the end of that day: expiry is
    /// `warrantyEnd + 1 day`. Comparing against `warrantyEnd` directly would
    /// expire every warranty a day early, which is the same off-by-one the
    /// application's date handling is careful about elsewhere.
    ///
    /// Block timestamps are miner-influenced by seconds. That is irrelevant at
    /// day granularity, but it does mean this is not a precise clock and should
    /// not be treated as one.
    function isExpired(bytes32 productKey) external view returns (bool) {
        WarrantyRecord memory record = _records[productKey];
        if (record.state == WarrantyState.None) revert WarrantyNotFound(productKey);
        return block.timestamp >= uint256(record.warrantyEnd) + 1 days;
    }
}
