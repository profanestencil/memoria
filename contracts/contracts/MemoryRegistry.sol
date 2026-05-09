// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract MemoryRegistry {
    struct Memory {
        address creator;
        uint64 timestamp;
        int64 latitudeE7;
        int64 longitudeE7;
        bool isPublic;
        string title;
        string note;
    }

    uint256 public nextMemoryId;
    mapping(uint256 => Memory) private _memories;

    event MemoryMinted(
        uint256 indexed memoryId,
        address indexed creator,
        uint64 timestamp,
        int64 latitudeE7,
        int64 longitudeE7,
        bool isPublic,
        string title,
        string note
    );

    function mintMemory(
        string calldata title,
        string calldata note,
        int64 latitudeE7,
        int64 longitudeE7,
        bool isPublic
    ) external returns (uint256 memoryId) {
        memoryId = nextMemoryId++;

        Memory storage m = _memories[memoryId];
        m.creator = msg.sender;
        m.timestamp = uint64(block.timestamp);
        m.latitudeE7 = latitudeE7;
        m.longitudeE7 = longitudeE7;
        m.isPublic = isPublic;
        m.title = title;
        m.note = note;

        emit MemoryMinted(
            memoryId,
            msg.sender,
            m.timestamp,
            latitudeE7,
            longitudeE7,
            isPublic,
            title,
            note
        );
    }

    function getMemory(uint256 memoryId) external view returns (Memory memory m) {
        m = _memories[memoryId];
    }
}

