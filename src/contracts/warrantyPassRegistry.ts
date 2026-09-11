/*
 * GENERATED FILE — DO NOT EDIT.
 *
 * Produced by scripts/sync-abi.mjs from the Foundry artifact for
 * contracts/src/WarrantyPassRegistry.sol. Regenerate with:
 *
 *     forge build && pnpm sync:abi
 *
 * Compiler: solc 0.8.24+commit.e11b9ed9
 *
 * The deployed address is deliberately not here — this file is overwritten on
 * every sync. See src/lib/contracts/warrantyPass.ts for address configuration.
 */

/**
 * The registry ABI, `as const` so viem can infer argument and return types
 * from it rather than falling back to `unknown`.
 */
export const warrantyPassRegistryAbi = [
  {
    "type": "function",
    "name": "exists",
    "inputs": [
      {
        "name": "productKey",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getWarranty",
    "inputs": [
      {
        "name": "productKey",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct WarrantyPassRegistry.WarrantyRecord",
        "components": [
          {
            "name": "receiptHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "purchaseDate",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "warrantyEnd",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "registeredBy",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "state",
            "type": "uint8",
            "internalType": "enum WarrantyPassRegistry.WarrantyState"
          },
          {
            "name": "warrantyTransferable",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isExpired",
    "inputs": [
      {
        "name": "productKey",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "registerWarranty",
    "inputs": [
      {
        "name": "productKey",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "receiptHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "purchaseDate",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "warrantyEnd",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "warrantyTransferable",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "WarrantyRegistered",
    "inputs": [
      {
        "name": "productKey",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "receiptHash",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "registeredBy",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "purchaseDate",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "warrantyEnd",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "warrantyTransferable",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "InvalidProductKey",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidPurchaseDate",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidReceiptHash",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidWarrantyEnd",
    "inputs": []
  },
  {
    "type": "error",
    "name": "WarrantyAlreadyRegistered",
    "inputs": [
      {
        "name": "productKey",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "WarrantyNotFound",
    "inputs": [
      {
        "name": "productKey",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  }
] as const
