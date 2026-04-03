export const MEMORY_ARCHIVE_ABI = [
  {
    inputs: [
      { internalType: 'string', name: 'tokenURI_', type: 'string' },
      { internalType: 'string', name: 'title', type: 'string' },
      { internalType: 'string', name: 'note', type: 'string' },
      { internalType: 'int64', name: 'latitudeE7', type: 'int64' },
      { internalType: 'int64', name: 'longitudeE7', type: 'int64' },
    ],
    name: 'mint',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'getMemoryData',
    outputs: [
      {
        components: [
          { internalType: 'uint64', name: 'timestamp', type: 'uint64' },
          { internalType: 'int64', name: 'latitudeE7', type: 'int64' },
          { internalType: 'int64', name: 'longitudeE7', type: 'int64' },
          { internalType: 'string', name: 'title', type: 'string' },
          { internalType: 'string', name: 'note', type: 'string' },
        ],
        internalType: 'struct MemoryArchiveGeo.MemoryData',
        name: 'm',
        type: 'tuple',
      },
      { internalType: 'string', name: 'uri', type: 'string' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'to', type: 'address' },
      { indexed: false, internalType: 'uint64', name: 'timestamp', type: 'uint64' },
      { indexed: false, internalType: 'int64', name: 'latitudeE7', type: 'int64' },
      { indexed: false, internalType: 'int64', name: 'longitudeE7', type: 'int64' },
      { indexed: false, internalType: 'string', name: 'title', type: 'string' },
      { indexed: false, internalType: 'string', name: 'note', type: 'string' },
      { indexed: false, internalType: 'string', name: 'tokenURI', type: 'string' },
    ],
    name: 'MemoryMinted',
    type: 'event',
  },
] as const
