export const MEMORY_REGISTRY_ABI = [
  {
    type: 'event',
    name: 'MemoryMinted',
    inputs: [
      { indexed: true, name: 'memoryId', type: 'uint256' },
      { indexed: true, name: 'creator', type: 'address' },
      { indexed: false, name: 'timestamp', type: 'uint64' },
      { indexed: false, name: 'latitudeE7', type: 'int64' },
      { indexed: false, name: 'longitudeE7', type: 'int64' },
      { indexed: false, name: 'isPublic', type: 'bool' },
      { indexed: false, name: 'title', type: 'string' },
      { indexed: false, name: 'note', type: 'string' },
    ],
  },
  {
    type: 'function',
    name: 'mintMemory',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'title', type: 'string' },
      { name: 'note', type: 'string' },
      { name: 'latitudeE7', type: 'int64' },
      { name: 'longitudeE7', type: 'int64' },
      { name: 'isPublic', type: 'bool' },
    ],
    outputs: [{ name: 'memoryId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'nextMemoryId',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getMemory',
    stateMutability: 'view',
    inputs: [{ name: 'memoryId', type: 'uint256' }],
    outputs: [
      {
        name: 'm',
        type: 'tuple',
        components: [
          { name: 'creator', type: 'address' },
          { name: 'timestamp', type: 'uint64' },
          { name: 'latitudeE7', type: 'int64' },
          { name: 'longitudeE7', type: 'int64' },
          { name: 'isPublic', type: 'bool' },
          { name: 'title', type: 'string' },
          { name: 'note', type: 'string' },
        ],
      },
    ],
  },
] as const

