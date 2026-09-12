# Deployment

Covers the phase 4 onchain layer: the registry contract, the `hash-receipt`
Edge Function, and the environment variables each needs.

---

## What an onchain record actually proves

State this accurately wherever it appears — in the UI, in comments, in a demo:

> The blockchain proves **record integrity and registration timing**: that this
> application registered this receipt digest and these warranty dates at a
> particular time, from a particular wallet.

It does **not** verify the retailer, the manufacturer, the purchase, or the
legal enforceability of any warranty. The registry never sees a receipt — only
a hash of one — and cannot distinguish a real purchase from an invented one.

A record is a **user-created proof**. The wallet that signs it is a
*registrant*, never an *issuer*, *manufacturer* or *verified retailer*.

---

## Environment variables

### Frontend — public, committed to `.env.example`

Anything prefixed `VITE_` is compiled into the client bundle and is readable by
anyone who loads the page.

| Variable | Required | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | yes | |
| `VITE_SUPABASE_ANON_KEY` | yes | Public by design; RLS is the boundary |
| `VITE_ARC_TESTNET_RPC_URL` | no | Falls back to `https://rpc.testnet.arc.network`, which is rate-limited |
| `VITE_WARRANTY_PASS_REGISTRY_ADDRESS` | no | Unset ⇒ onchain proof unavailable |

The app targets **Arc Testnet** (chain ID `5042002`), Circle's chain. Arc is
testnet-only today — there is no mainnet to point at.

A contract address is public information, so exposing it is fine. Leaving it
**unset is a supported state**: the app treats it as "proof unavailable" and
says so. It must never fall back to a hardcoded address — a wrong address
points at a contract that is not ours while appearing to work.

### Deployment-only — secret, never `VITE_`, never committed

These are read by `forge script` and by nothing under `src/`.

| Variable | Purpose |
|---|---|
| `ARC_TESTNET_RPC_URL` | RPC endpoint used to broadcast the deployment |
| `DEPLOYER_PRIVATE_KEY` | Deployer key, `0x`-prefixed, funded with testnet **USDC** |

> **Gas on Arc is USDC, not ETH.** Arc is Circle's chain and USDC is its native
> token, so a wallet holding only ETH cannot deploy or register anything here.
> Fund the deployer from <https://faucet.circle.com> first.
>
> One decimals trap: native USDC on Arc uses **18** decimals, like ether, while
> the ERC-20 USDC contract uses 6. Nothing in this app moves USDC as a token,
> so only the native form is in play — but do not conflate them if that changes.

> **A `VITE_DEPLOYER_PRIVATE_KEY` would compile a funded private key into a
> public JavaScript bundle.** The prefix is not a naming preference.

These deliberately do **not** appear in `.env.example`, which is client
configuration. Keep them in a shell profile, a password manager, or a
gitignored `.env.deploy` that you source manually.

Better still, avoid a plaintext key entirely by using a Foundry keystore:

```bash
cast wallet import warrantypass-deployer --interactive   # once
forge script ... --account warrantypass-deployer         # prompts for a password
```

### Supabase Edge Function secrets

```bash
supabase secrets set ANTHROPIC_API_KEY=...   # parse-receipt only
supabase secrets list                        # names and digests only
```

`hash-receipt` needs **no** secret of its own. It runs on `SUPABASE_URL` and
`SUPABASE_ANON_KEY`, which the platform injects, plus the caller's own token.

---

## Receipt hashing

Two digests are stored per receipt, over **the same original raw file bytes**:

| Column | Algorithm | Format | Computed by | Purpose |
|---|---|---|---|---|
| `receipt_hash` | SHA-256 | bare lowercase hex | browser, at upload | storage integrity |
| `receipt_keccak256` | keccak256 | `0x` + lowercase hex | `hash-receipt`, from Storage | the onchain anchor |

The anchored value is defined precisely as:

```
receipt_keccak256 = keccak256(original stored receipt file bytes)
```

"Original bytes" excludes, without exception: a resized or downscaled image, a
re-encode, a browser preview, OCR text, extracted JSON, and any base64
representation. keccak256 rather than SHA-256 because it maps directly onto
Solidity `bytes32` with no conversion step where an error could hide.

### Why the server hashes, not the browser

The digest is the entire substance of the onchain claim, so it has to describe
the bytes that are *actually in Storage*. If the browser computed it, the app
could anchor a hash of file A while Storage held file B, and nothing downstream
could detect the difference. `hash-receipt` downloads the stored object and
hashes exactly those bytes.

The client never supplies a hash, and one would be ignored if it did.

### Hashes are never overwritten

`hash-receipt` recomputes the phase 3 SHA-256 as a witness that the stored
object is unchanged since upload, and writes the keccak digest only when the
column is still null — a condition on the `UPDATE` itself, so the statement
cannot replace an existing value.

A recomputation that disagrees with a stored digest returns **409** and changes
nothing. That is an integrity problem for a person to investigate, not
something to repair automatically: a hash that gets rewritten whenever it stops
matching proves nothing, and once a digest is anchored onchain the old value is
permanent.

### Existing receipts

Receipts uploaded before phase 4 have `receipt_keccak256 = null`. They are
hashed lazily, from the stored object, the first time a proof is requested.
**No receipt ever needs to be re-uploaded.**

---

## Deploying the registry

```bash
forge build
forge test                      # expected: all green before deploying anything
```

Simulate first — this spends nothing:

```bash
forge script contracts/script/DeployWarrantyPassRegistry.s.sol \
  --rpc-url "$ARC_TESTNET_RPC_URL" -vvvv
```

Then broadcast:

```bash
forge script contracts/script/DeployWarrantyPassRegistry.s.sol \
  --rpc-url "$ARC_TESTNET_RPC_URL" --broadcast -vvvv
```

The registry takes no constructor arguments and has no initialiser, owner or
admin, so a deployment is complete the moment the transaction confirms. There
is no post-deploy setup step to forget or to front-run.

### Record the result

Fill this in after deploying, and set
`VITE_WARRANTY_PASS_REGISTRY_ADDRESS` to the address:

| Field | Value |
|---|---|
| Network | Arc Testnet |
| Chain ID | 5042002 |
| Contract address | _not yet deployed_ |
| Deployment tx | _not yet deployed_ |
| Block number | _not yet deployed_ |
| Compiler | solc 0.8.24, optimizer on, 200 runs |
| Source verified | _not yet_ |

### Source verification (optional)

Not required for the app to work, and not a blocker.

Arc's explorer is **ArcScan** (<https://testnet.arcscan.app>), not Etherscan, so
the usual `--chain sepolia --etherscan-api-key` incantation does not apply. The
chain metadata advertises a Blockscout-style API at
`https://testnet.arcscan.app/api`, which would make the command roughly:

```bash
forge verify-contract <ADDRESS> \
  contracts/src/WarrantyPassRegistry.sol:WarrantyPassRegistry \
  --verifier blockscout \
  --verifier-url https://testnet.arcscan.app/api \
  --watch
```

⚠️ **This command has not been run and is not confirmed to work.** It is
inferred from the explorer's advertised API, not from a successful verification.
Check ArcScan's own documentation before relying on it, and do not record the
contract as "verified" until an explorer page actually shows the source.

---

## Deploying `hash-receipt`

```bash
supabase functions deploy hash-receipt
```

Docker is not required; the "Docker is not running" warning is harmless.

Smoke-test it without spending anything — none of these reach Storage.

**Last run: all six passed** on project `qzldrsejwnnvfmwnhzdq`.

| Request | Expected | Got |
|---|---|---|
| no `Authorization` | 401 from the platform gateway | `401 UNAUTHORIZED_NO_AUTH_HEADER` |
| anon key, no user session | 401 from the function itself | `401 Authentication required.` |
| malformed `receiptId` | 400 | `400 A valid receiptId is required.` |
| no JSON body | 400 | `400 Expected a JSON body.` |
| `GET` | 405 | `405 Method not allowed.` |
| `OPTIONS` | 204 + CORS headers | `204`, origin `*`, methods `POST, OPTIONS` |

The first two rows are the security property worth re-checking after any change:
the gateway rejects a missing header, and the **function** rejects the anon key
on its own. Holding the public key gets you nothing without a real user session.

What these do **not** cover: the Storage download, the SHA-256 witness check, and
the keccak write. Those need a real session and a real receipt.

```bash
BASE="$VITE_SUPABASE_URL/functions/v1/hash-receipt"

curl -s -o /dev/null -w '%{http_code}\n' -X POST "$BASE"                 # 401 (gateway)
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$BASE" \
  -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" \
  -H 'content-type: application/json' -d '{"receiptId":"nope"}'          # 401 (no user)
curl -s -o /dev/null -w '%{http_code}\n' -X OPTIONS "$BASE"              # 204 + CORS
```

---

## ABI synchronisation

`src/contracts/warrantyPassRegistry.ts` is **generated**. After any contract
change:

```bash
forge build && pnpm sync:abi
```

Never hand-edit it, and never paste an ABI into a second file. A stale
hand-copied ABI fails quietly — viem encodes against the old signature and the
transaction reverts for reasons that look unrelated to the cause.

The deployed address is intentionally not in that file, because it is
overwritten on every sync. Address configuration lives in
`src/lib/contracts/warrantyPass.ts`.
