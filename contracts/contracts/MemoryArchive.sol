// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MemoryArchive is ERC721URIStorage, Ownable {
    uint256 private _nextTokenId;

    event MemoryMinted(uint256 indexed tokenId, address indexed to, string tokenURI);

    constructor() ERC721("Memoria", "MEM") Ownable() {}

    /// @dev Mints a memory NFT to the caller. tokenURI_ points to JSON metadata (image, geo, date, author, etc.)
    function mint(string calldata tokenURI_) external returns (uint256) {
        address to = msg.sender;
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, tokenURI_);
        emit MemoryMinted(tokenId, to, tokenURI_);
        return tokenId;
    }
}
