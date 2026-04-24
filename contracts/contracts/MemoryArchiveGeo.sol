// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

/**
 * @title MemoryArchiveGeo
 * @notice ERC-721 "memory" NFT with onchain time/place/title/note and offchain tokenURI metadata.
 */
contract MemoryArchiveGeo is ERC721URIStorage {
    error TitleEmpty();
    error TitleTooLong(uint256 maxBytes);
    error NoteTooLong(uint256 maxBytes);
    error TokenURINotSet();

    struct MemoryData {
        uint64 timestamp;
        int64 latitudeE7;
        int64 longitudeE7;
        string title;
        string note;
    }

    uint256 private _nextTokenId;
    mapping(uint256 => MemoryData) private _memoryData;

    uint256 public constant MAX_TITLE_BYTES = 60;
    uint256 public constant MAX_NOTE_BYTES = 240;

    event MemoryMinted(
        uint256 indexed tokenId,
        address indexed to,
        uint64 timestamp,
        int64 latitudeE7,
        int64 longitudeE7,
        string title,
        string note,
        string tokenURI
    );

    constructor() ERC721("Memoria", "MEM") {}

    /**
     * @notice Mint a memory NFT to the caller.
     * @param tokenURI_ Offchain JSON metadata URI (typically includes image/photo URL).
     * @param title User-provided name for the memory.
     * @param note Optional short note.
     * @param latitudeE7 Latitude scaled by 1e7 (E7 fixed point).
     * @param longitudeE7 Longitude scaled by 1e7 (E7 fixed point).
     */
    function mint(
        string calldata tokenURI_,
        string calldata title,
        string calldata note,
        int64 latitudeE7,
        int64 longitudeE7
    ) external returns (uint256 tokenId) {
        if (bytes(tokenURI_).length == 0) revert TokenURINotSet();
        if (bytes(title).length == 0) revert TitleEmpty();
        if (bytes(title).length > MAX_TITLE_BYTES) revert TitleTooLong(MAX_TITLE_BYTES);
        if (bytes(note).length > MAX_NOTE_BYTES) revert NoteTooLong(MAX_NOTE_BYTES);

        tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, tokenURI_);

        MemoryData storage m = _memoryData[tokenId];
        m.timestamp = uint64(block.timestamp);
        m.latitudeE7 = latitudeE7;
        m.longitudeE7 = longitudeE7;
        m.title = title;
        m.note = note;

        emit MemoryMinted(
            tokenId,
            msg.sender,
            m.timestamp,
            latitudeE7,
            longitudeE7,
            title,
            note,
            tokenURI_
        );
    }

    function getMemoryData(uint256 tokenId) external view returns (MemoryData memory m, string memory uri) {
        m = _memoryData[tokenId];
        uri = tokenURI(tokenId);
    }
}

