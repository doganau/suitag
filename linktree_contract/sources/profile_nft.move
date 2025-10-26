module linktree::profile_nft {
    use sui::object::{Self, UID, ID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use std::string::{Self, String};
    use sui::url::{Self, Url};
    use sui::event;
    use sui::display;
    use sui::package;

    // === Error Codes ===
    const ENotOwner: u64 = 2;

    // === Structs ===

    /// One-Time-Witness for the module
    public struct PROFILE_NFT has drop {}

    /// Profile Picture NFT
    public struct ProfilePicture has key, store {
        id: UID,
        name: String,
        description: String,
        image_url: Url,
        owner: address,
        created_at: u64,
        walrus_blob_id: String, // Walrus storage blob ID
    }

    // === Events ===

    public struct NFTMinted has copy, drop {
        nft_id: ID,
        owner: address,
        name: String,
    }

    public struct NFTBurned has copy, drop {
        nft_id: ID,
        owner: address,
    }

    // === Init Function ===

    fun init(otw: PROFILE_NFT, ctx: &mut TxContext) {
        let publisher = package::claim(otw, ctx);
        
        let keys = vector[
            string::utf8(b"name"),
            string::utf8(b"description"),
            string::utf8(b"image_url"),
            string::utf8(b"creator"),
        ];

        let values = vector[
            string::utf8(b"{name}"),
            string::utf8(b"{description}"),
            string::utf8(b"{image_url}"),
            string::utf8(b"SUI TAG Profile Picture"),
        ];

        let mut display = display::new_with_fields<ProfilePicture>(
            &publisher,
            keys,
            values,
            ctx
        );

        display::update_version(&mut display);
        transfer::public_transfer(display, tx_context::sender(ctx));
        transfer::public_transfer(publisher, tx_context::sender(ctx));
    }

    // === Public Functions ===

    /// Mint a new Profile Picture NFT from Walrus URL
    public fun mint_profile_picture(
        name: String,
        description: String,
        walrus_url: String,
        walrus_blob_id: String,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let nft_id = object::new(ctx);
        let id_copy = object::uid_to_inner(&nft_id);

        let nft = ProfilePicture {
            id: nft_id,
            name,
            description,
            image_url: url::new_unsafe(string::to_ascii(walrus_url)),
            owner: sender,
            created_at: tx_context::epoch(ctx),
            walrus_blob_id,
        };

        event::emit(NFTMinted {
            nft_id: id_copy,
            owner: sender,
            name: nft.name,
        });

        transfer::transfer(nft, sender);
    }

    /// Transfer NFT to another address
    public entry fun transfer_nft(
        nft: ProfilePicture,
        recipient: address,
        _ctx: &mut TxContext
    ) {
        transfer::public_transfer(nft, recipient);
    }

    /// Burn/Delete the NFT
    public entry fun burn_nft(
        nft: ProfilePicture,
        ctx: &mut TxContext
    ) {
        let ProfilePicture { 
            id, 
            name: _,
            description: _,
            image_url: _,
            owner,
            created_at: _,
            walrus_blob_id: _,
        } = nft;

        assert!(owner == tx_context::sender(ctx), ENotOwner);

        let nft_id = object::uid_to_inner(&id);
        
        event::emit(NFTBurned {
            nft_id,
            owner,
        });

        object::delete(id);
    }

    // === Getter Functions ===

    public fun get_name(nft: &ProfilePicture): String {
        nft.name
    }

    public fun get_description(nft: &ProfilePicture): String {
        nft.description
    }

    public fun get_image_url(nft: &ProfilePicture): Url {
        nft.image_url
    }

    public fun get_owner(nft: &ProfilePicture): address {
        nft.owner
    }

    public fun get_walrus_blob_id(nft: &ProfilePicture): String {
        nft.walrus_blob_id
    }

    public fun get_id(nft: &ProfilePicture): ID {
        object::uid_to_inner(&nft.id)
    }
}
