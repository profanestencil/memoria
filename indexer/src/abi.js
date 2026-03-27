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
      { indexed: false, name: 'note', type: 'string' }
    ]
  }
]

