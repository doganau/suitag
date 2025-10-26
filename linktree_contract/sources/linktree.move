module linktree::profile {
    // === Imports ===
    use sui::dynamic_field as df;
    use std::string;
    use sui::event;
    use sui::table;
    use sui::clock;
    use sui::tx_context;
    use sui::object;
    use sui::transfer;
    use linktree::profile_nft::{Self, ProfilePicture};

    // === Error Codes ===
    const EProfileNotFound: u64 = 2;
    const ENotAuthorized: u64 = 3;
    const EInvalidUsername: u64 = 4;
    const ETooManyLinks: u64 = 5;
    const EUsernameAlreadyTaken: u64 = 6;

    // === Constants ===
    const MAX_LINKS: u64 = 50;
    const MAX_USERNAME_LENGTH: u64 = 30;
    const MAX_BIO_LENGTH: u64 = 500;
    const MAX_TITLE_LENGTH: u64 = 100;

    // === Structs ===
    
    /// Global registry to store username -> profile mappings
    public struct ProfileRegistry has key {
        id: UID,
        profiles: table::Table<string::String, address>,
        total_profiles: u64,
        blocked_users: table::Table<address, bool>,  // Engellenen kullanıcılar
        blocked_usernames: table::Table<string::String, bool>  // Engellenen kullanıcı adları
    }

    /// User's LinkTree Profile - Core object
    public struct Profile has key {
        id: UID,
        owner: address,
        username: string::String,  // Artık opsiyonel (boş string olabilir)
        display_name: string::String,
        bio: string::String,
        avatar_url: string::String,  // Tus.ky NFT URL'i
        nft_avatar_id: string::String,  // NFT object ID
        theme: Theme,
        links: vector<Link>,
        created_at: u64,
        updated_at: u64,
        view_count: u64,
        verified: bool,
        walrus_site_id: string::String
    }

    /// Individual Link structure
    public struct Link has store, drop, copy {
        title: string::String,
        url: string::String,
        icon: string::String,
        clicks: u64,
        enabled: bool
    }

    /// Theme configuration
    public struct Theme has store, drop, copy {
        background_color: string::String,
        text_color: string::String,
        button_color: string::String,
        button_text_color: string::String,
        font_family: string::String,
        border_radius: u8
    }

    /// Analytics data stored as dynamic field
    public struct Analytics has store {
        daily_views: table::Table<u64, u64>,
        link_clicks: table::Table<string::String, u64>,
        referrers: table::Table<string::String, u64>
    }

    /// Social media links stored as dynamic field
    public struct SocialLinks has store {
        twitter: string::String,
        instagram: string::String,
        youtube: string::String,
        github: string::String,
        linkedin: string::String,
        tiktok: string::String,
        discord: string::String
    }

    /// Admin capability
    public struct AdminCap has key, store {
        id: UID
    }

    // === Events ===
    
    public struct ProfileCreated has copy, drop {
        profile_id: ID,
        owner: address,
        username: string::String
    }

    public struct ProfileUpdated has copy, drop {
        profile_id: ID,
        username: string::String
    }

    public struct LinkClicked has copy, drop {
        profile_id: ID,
        link_title: string::String,
        timestamp: u64
    }

    // === Init Function ===
    
    fun init(ctx: &mut TxContext) {
        // Create global registry
        let registry = ProfileRegistry {
            id: object::new(ctx),
            profiles: table::new(ctx),
            total_profiles: 0,
            blocked_users: table::new(ctx),
            blocked_usernames: table::new(ctx)
        };
        transfer::share_object(registry);

        // Create admin capability
        let admin = AdminCap {
            id: object::new(ctx)
        };
        transfer::transfer(admin, tx_context::sender(ctx));
    }

    // === Public Functions ===

    /// Create a new profile
    public fun create_profile(
        registry: &mut ProfileRegistry,
        username: string::String,
        display_name: string::String,
        bio: string::String,
        clock: &clock::Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        
        // Kullanıcı engellenmiş mi kontrol et
        assert!(!table::contains(&registry.blocked_users, sender), ENotAuthorized);
        
        // Username varsa kontrol et, yoksa boş geçilebilir
        if (string::length(&username) > 0) {
            assert!(string::length(&username) <= MAX_USERNAME_LENGTH, EInvalidUsername);
            assert!(!table::contains(&registry.blocked_usernames, username), EUsernameAlreadyTaken);
            assert!(!table::contains(&registry.profiles, username), EUsernameAlreadyTaken);
        };
        
        assert!(string::length(&bio) <= MAX_BIO_LENGTH, EInvalidUsername);

        // Create default theme
        let theme = Theme {
            background_color: string::utf8(b"#ffffff"),
            text_color: string::utf8(b"#000000"),
            button_color: string::utf8(b"#3b82f6"),
            button_text_color: string::utf8(b"#ffffff"),
            font_family: string::utf8(b"Inter"),
            border_radius: 8
        };

        // Create profile
        let profile_id = object::new(ctx);
        let profile_id_copy = object::uid_to_inner(&profile_id);
        
        let mut profile = Profile {
            id: profile_id,
            owner: sender,
            username,
            display_name,
            bio,
            avatar_url: string::utf8(b""),
            nft_avatar_id: string::utf8(b""),
            theme,
            links: vector::empty(),
            created_at: clock::timestamp_ms(clock),
            updated_at: clock::timestamp_ms(clock),
            view_count: 0,
            verified: false,
            walrus_site_id: string::utf8(b"")
        };

        // Add to registry
        if (string::length(&username) > 0) {
            table::add(&mut registry.profiles, username, sender);
        };
        registry.total_profiles = registry.total_profiles + 1;

        // Initialize analytics as dynamic field
        let analytics = Analytics {
            daily_views: table::new(ctx),
            link_clicks: table::new(ctx),
            referrers: table::new(ctx)
        };
        df::add(&mut profile.id, b"analytics", analytics);

        // Initialize social links as dynamic field
        let social = SocialLinks {
            twitter: string::utf8(b""),
            instagram: string::utf8(b""),
            youtube: string::utf8(b""),
            github: string::utf8(b""),
            linkedin: string::utf8(b""),
            tiktok: string::utf8(b""),
            discord: string::utf8(b"")
        };
        df::add(&mut profile.id, b"social", social);

        // Emit event
        event::emit(ProfileCreated {
            profile_id: profile_id_copy,
            owner: sender,
            username: profile.username
        });

        // Transfer profile to owner
        transfer::transfer(profile, sender);
    }

    /// Create profile with NFT avatar
    public fun create_profile_with_nft(
        registry: &mut ProfileRegistry,
        username: string::String,
        display_name: string::String,
        bio: string::String,
        nft_name: string::String,
        nft_description: string::String,
        walrus_url: string::String,
        walrus_blob_id: string::String,
        clock: &clock::Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        
        // Check if user is blocked
        assert!(!table::contains(&registry.blocked_users, sender), ENotAuthorized);
        
        // Username varsa kontrol et, yoksa boş geçilebilir
        if (string::length(&username) > 0) {
            assert!(string::length(&username) <= MAX_USERNAME_LENGTH, EInvalidUsername);
            assert!(!table::contains(&registry.blocked_usernames, username), EUsernameAlreadyTaken);
            assert!(!table::contains(&registry.profiles, username), EUsernameAlreadyTaken);
        };
        
        assert!(string::length(&bio) <= MAX_BIO_LENGTH, EInvalidUsername);

        // Create NFT from Walrus storage URL
        profile_nft::mint_profile_picture(
            nft_name,
            nft_description,
            walrus_url,
            walrus_blob_id,
            ctx
        );
        
        let image_url = walrus_url;

        // Create default theme
        let theme = Theme {
            background_color: string::utf8(b"#ffffff"),
            text_color: string::utf8(b"#000000"),
            button_color: string::utf8(b"#3b82f6"),
            button_text_color: string::utf8(b"#ffffff"),
            font_family: string::utf8(b"Inter"),
            border_radius: 8
        };

        // Create profile
        let profile_id = object::new(ctx);
        let profile_id_copy = object::uid_to_inner(&profile_id);
        
        let mut profile = Profile {
            id: profile_id,
            owner: sender,
            username,
            display_name,
            bio,
            avatar_url: image_url,
            nft_avatar_id: string::utf8(b""),
            theme,
            links: vector::empty(),
            created_at: clock::timestamp_ms(clock),
            updated_at: clock::timestamp_ms(clock),
            view_count: 0,
            verified: false,
            walrus_site_id: string::utf8(b"")
        };

        // Add to registry
        if (string::length(&username) > 0) {
            table::add(&mut registry.profiles, username, sender);
        };
        registry.total_profiles = registry.total_profiles + 1;

        // Initialize analytics as dynamic field
        let analytics = Analytics {
            daily_views: table::new(ctx),
            link_clicks: table::new(ctx),
            referrers: table::new(ctx)
        };
        df::add(&mut profile.id, b"analytics", analytics);

        // Initialize social links as dynamic field
        let social = SocialLinks {
            twitter: string::utf8(b""),
            instagram: string::utf8(b""),
            youtube: string::utf8(b""),
            github: string::utf8(b""),
            linkedin: string::utf8(b""),
            tiktok: string::utf8(b""),
            discord: string::utf8(b"")
        };
        df::add(&mut profile.id, b"social", social);

        // Emit event
        event::emit(ProfileCreated {
            profile_id: profile_id_copy,
            owner: sender,
            username: profile.username
        });

        // Transfer profile to owner
        transfer::transfer(profile, sender);
    }

    /// Entry wrapper for create_profile_with_nft
    public entry fun create_profile_with_nft_tx(
        registry: &mut ProfileRegistry,
        username: string::String,
        display_name: string::String,
        bio: string::String,
        nft_name: string::String,
        nft_description: string::String,
        walrus_url: string::String,
        walrus_blob_id: string::String,
        clock: &clock::Clock,
        ctx: &mut TxContext
    ) {
        create_profile_with_nft(
            registry,
            username,
            display_name,
            bio,
            nft_name,
            nft_description,
            walrus_url,
            walrus_blob_id,
            clock,
            ctx
        );
    }

    /// Create profile with simple avatar URL (no NFT)
    public entry fun create_profile_with_avatar(
        registry: &mut ProfileRegistry,
        username: string::String,
        display_name: string::String,
        bio: string::String,
        avatar_url: string::String,
        clock: &clock::Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        
        // Check if user is blocked
        assert!(!table::contains(&registry.blocked_users, sender), ENotAuthorized);
        
        // Username varsa kontrol et, yoksa boş geçilebilir
        if (string::length(&username) > 0) {
            assert!(string::length(&username) <= MAX_USERNAME_LENGTH, EInvalidUsername);
            assert!(!table::contains(&registry.blocked_usernames, username), EUsernameAlreadyTaken);
            assert!(!table::contains(&registry.profiles, username), EUsernameAlreadyTaken);
        };
        
        assert!(string::length(&bio) <= MAX_BIO_LENGTH, EInvalidUsername);

        // Create default theme
        let theme = Theme {
            background_color: string::utf8(b"#ffffff"),
            text_color: string::utf8(b"#000000"),
            button_color: string::utf8(b"#3b82f6"),
            button_text_color: string::utf8(b"#ffffff"),
            font_family: string::utf8(b"Inter"),
            border_radius: 8
        };

        // Create profile
        let profile_id = object::new(ctx);
        let profile_id_copy = object::uid_to_inner(&profile_id);
        
        let mut profile = Profile {
            id: profile_id,
            owner: sender,
            username,
            display_name,
            bio,
            avatar_url,
            nft_avatar_id: string::utf8(b""),
            theme,
            links: vector::empty(),
            created_at: clock::timestamp_ms(clock),
            updated_at: clock::timestamp_ms(clock),
            view_count: 0,
            verified: false,
            walrus_site_id: string::utf8(b"")
        };

        // Add to registry
        if (string::length(&username) > 0) {
            table::add(&mut registry.profiles, username, sender);
        };
        registry.total_profiles = registry.total_profiles + 1;

        // Initialize analytics as dynamic field
        let analytics = Analytics {
            daily_views: table::new(ctx),
            link_clicks: table::new(ctx),
            referrers: table::new(ctx)
        };
        df::add(&mut profile.id, b"analytics", analytics);

        // Initialize social links as dynamic field
        let social = SocialLinks {
            twitter: string::utf8(b""),
            instagram: string::utf8(b""),
            youtube: string::utf8(b""),
            github: string::utf8(b""),
            linkedin: string::utf8(b""),
            tiktok: string::utf8(b""),
            discord: string::utf8(b"")
        };
        df::add(&mut profile.id, b"social", social);

        // Emit event
        event::emit(ProfileCreated {
            profile_id: profile_id_copy,
            owner: sender,
            username: profile.username
        });

        // Transfer profile to owner
        transfer::transfer(profile, sender);
    }

    /// Add a link to profile
    public fun add_link(
        profile: &mut Profile,
        title: string::String,
        url: string::String,
        icon: string::String,
        clock: &clock::Clock,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == profile.owner, ENotAuthorized);
        assert!(vector::length(&profile.links) < MAX_LINKS, ETooManyLinks);
        assert!(string::length(&title) <= MAX_TITLE_LENGTH, EInvalidUsername);

        let link = Link {
            title,
            url,
            icon,
            clicks: 0,
            enabled: true
        };

        vector::push_back(&mut profile.links, link);
        profile.updated_at = clock::timestamp_ms(clock);
    }

    /// Remove a link from profile
    public fun remove_link(
        profile: &mut Profile,
        index: u64,
        clock: &clock::Clock,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == profile.owner, ENotAuthorized);
        assert!(index < vector::length(&profile.links), EProfileNotFound);
        
        vector::remove(&mut profile.links, index);
        profile.updated_at = clock::timestamp_ms(clock);
    }

    /// Toggle link enabled/disabled
    public fun toggle_link(
        profile: &mut Profile,
        index: u64,
        clock: &clock::Clock,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == profile.owner, ENotAuthorized);
        assert!(index < vector::length(&profile.links), EProfileNotFound);
        
        let link = vector::borrow_mut(&mut profile.links, index);
        link.enabled = !link.enabled;
        profile.updated_at = clock::timestamp_ms(clock);
    }

    /// Update an existing link
    public fun update_link(
        profile: &mut Profile,
        index: u64,
        title: string::String,
        url: string::String,
        icon: string::String,
        clock: &clock::Clock,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == profile.owner, ENotAuthorized);
        assert!(index < vector::length(&profile.links), EProfileNotFound);
        assert!(string::length(&title) <= MAX_TITLE_LENGTH, EInvalidUsername);
        
        let link = vector::borrow_mut(&mut profile.links, index);
        link.title = title;
        link.url = url;
        link.icon = icon;
        profile.updated_at = clock::timestamp_ms(clock);
    }

    /// Reorder link (move from old_index to new_index)
    public fun reorder_link(
        profile: &mut Profile,
        old_index: u64,
        new_index: u64,
        clock: &clock::Clock,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == profile.owner, ENotAuthorized);
        assert!(old_index < vector::length(&profile.links), EProfileNotFound);
        assert!(new_index < vector::length(&profile.links), EProfileNotFound);
        
        if (old_index != new_index) {
            let link = vector::remove(&mut profile.links, old_index);
            vector::insert(&mut profile.links, link, new_index);
            profile.updated_at = clock::timestamp_ms(clock);
        };
    }

    /// Update profile basic info
    public fun update_profile(
        profile: &mut Profile,
        display_name: string::String,
        bio: string::String,
        avatar_url: string::String,
        clock: &clock::Clock,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == profile.owner, ENotAuthorized);
        assert!(string::length(&bio) <= MAX_BIO_LENGTH, EInvalidUsername);

        profile.display_name = display_name;
        profile.bio = bio;
        profile.avatar_url = avatar_url;
        profile.updated_at = clock::timestamp_ms(clock);

        event::emit(ProfileUpdated {
            profile_id: object::uid_to_inner(&profile.id),
            username: profile.username
        });
    }

    /// Update NFT avatar
    public fun update_nft_avatar(
        profile: &mut Profile,
        nft_avatar_id: string::String,
        avatar_url: string::String,
        clock: &clock::Clock,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == profile.owner, ENotAuthorized);
        
        profile.nft_avatar_id = nft_avatar_id;
        profile.avatar_url = avatar_url;
        profile.updated_at = clock::timestamp_ms(clock);
    }

    /// Update profile picture by minting new NFT
    public fun update_profile_picture_nft(
        profile: &mut Profile,
        nft_name: string::String,
        nft_description: string::String,
        walrus_url: string::String,
        walrus_blob_id: string::String,
        clock: &clock::Clock,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == profile.owner, ENotAuthorized);

        // Create new NFT from Walrus storage URL
        profile_nft::mint_profile_picture(
            nft_name,
            nft_description,
            walrus_url,
            walrus_blob_id,
            ctx
        );
        
        // Update profile with new image URL
        profile.avatar_url = walrus_url;
        profile.updated_at = clock::timestamp_ms(clock);
    }

    /// Update profile theme
    public fun update_theme(
        profile: &mut Profile,
        background_color: string::String,
        text_color: string::String,
        button_color: string::String,
        button_text_color: string::String,
        font_family: string::String,
        border_radius: u8,
        clock: &clock::Clock,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == profile.owner, ENotAuthorized);

        profile.theme = Theme {
            background_color,
            text_color,
            button_color,
            button_text_color,
            font_family,
            border_radius
        };
        profile.updated_at = clock::timestamp_ms(clock);
    }

    /// Update social links (dynamic field)
    public fun update_social_links(
        profile: &mut Profile,
        twitter: string::String,
        instagram: string::String,
        youtube: string::String,
        github: string::String,
        linkedin: string::String,
        clock: &clock::Clock,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == profile.owner, ENotAuthorized);

        let social: &mut SocialLinks = df::borrow_mut(&mut profile.id, b"social");
        social.twitter = twitter;
        social.instagram = instagram;
        social.youtube = youtube;
        social.github = github;
        social.linkedin = linkedin;
        
        profile.updated_at = clock::timestamp_ms(clock);
    }

    /// Set Walrus site ID after deployment
    public fun set_walrus_site(
        profile: &mut Profile,
        site_id: string::String,
        clock: &clock::Clock,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == profile.owner, ENotAuthorized);
        profile.walrus_site_id = site_id;
        profile.updated_at = clock::timestamp_ms(clock);
    }

    /// Track link click (callable by anyone viewing the profile)
    public fun track_click(
        profile: &mut Profile,
        link_index: u64,
        clock: &clock::Clock,
        _ctx: &mut TxContext
    ) {
        assert!(link_index < vector::length(&profile.links), EProfileNotFound);
        
        let link = vector::borrow_mut(&mut profile.links, link_index);
        link.clicks = link.clicks + 1;

        // Update analytics
        let analytics: &mut Analytics = df::borrow_mut(&mut profile.id, b"analytics");
        let link_title = link.title;
        
        if (table::contains(&analytics.link_clicks, link_title)) {
            let clicks = table::borrow_mut(&mut analytics.link_clicks, link_title);
            *clicks = *clicks + 1;
        } else {
            table::add(&mut analytics.link_clicks, link_title, 1);
        };

        event::emit(LinkClicked {
            profile_id: object::uid_to_inner(&profile.id),
            link_title,
            timestamp: clock::timestamp_ms(clock)
        });
    }

    /// Increment view count
    public fun track_view(
        profile: &mut Profile,
        clock: &clock::Clock,
        _ctx: &mut TxContext
    ) {
        profile.view_count = profile.view_count + 1;
        
        // Update daily analytics
        let analytics: &mut Analytics = df::borrow_mut(&mut profile.id, b"analytics");
        let today = clock::timestamp_ms(clock) / 86400000; // Day number
        
        if (table::contains(&analytics.daily_views, today)) {
            let views = table::borrow_mut(&mut analytics.daily_views, today);
            *views = *views + 1;
        } else {
            table::add(&mut analytics.daily_views, today, 1);
        }
    }

    /// Verify profile (admin only)
    public fun verify_profile(
        _admin: &AdminCap,
        profile: &mut Profile,
        _ctx: &mut TxContext
    ) {
        profile.verified = true;
    }

    /// Transfer profile ownership
    public fun transfer_profile(
        profile: Profile,
        recipient: address,
        _ctx: &mut TxContext
    ) {
        transfer::transfer(profile, recipient);
    }

    /// Delete profile
    /// Delete profile - internal function
    fun delete_profile_internal(
        registry: &mut ProfileRegistry,
        profile: Profile,
        sender: address
    ) {
        assert!(sender == profile.owner, ENotAuthorized);
        
        // Remove from registry if username exists
        if (string::length(&profile.username) > 0 && table::contains(&registry.profiles, profile.username)) {
            table::remove(&mut registry.profiles, profile.username);
        };
        
        // Decrement total profiles
        registry.total_profiles = registry.total_profiles - 1;
        
        // Delete profile (this will also delete dynamic fields)
        let Profile {
            id,
            owner: _,
            username: _,
            display_name: _,
            bio: _,
            avatar_url: _,
            nft_avatar_id: _,
            theme: _,
            links: _,
            created_at: _,
            updated_at: _,
            view_count: _,
            verified: _,
            walrus_site_id: _
        } = profile;
        
        object::delete(id);
    }

    /// Delete profile - public function (for PTB)
    public fun delete_profile(
        registry: &mut ProfileRegistry,
        profile: Profile,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        delete_profile_internal(registry, profile, sender);
    }

    /// Delete profile entry wrapper (kept for backward compatibility)
    public entry fun delete_profile_tx(
        registry: &mut ProfileRegistry,
        profile: Profile,
        ctx: &mut TxContext
    ) {
        delete_profile(registry, profile, ctx);
    }

    // === View Functions ===

    public fun get_username(profile: &Profile): string::String {
        profile.username
    }

    public fun get_display_name(profile: &Profile): string::String {
        profile.display_name
    }

    public fun get_bio(profile: &Profile): string::String {
        profile.bio
    }

    public fun get_links(profile: &Profile): &vector<Link> {
        &profile.links
    }

    public fun get_view_count(profile: &Profile): u64 {
        profile.view_count
    }

    public fun get_theme(profile: &Profile): Theme {
        profile.theme
    }

    public fun is_verified(profile: &Profile): bool {
        profile.verified
    }

    public fun get_owner(profile: &Profile): address {
        profile.owner
    }

    public fun get_walrus_site_id(profile: &Profile): string::String {
        profile.walrus_site_id
    }

    // === Admin Functions ===
    
    /// Kullanıcı adresini engelle
    public fun block_user(
        _admin: &AdminCap,
        registry: &mut ProfileRegistry,
        user_address: address
    ) {
        if (!table::contains(&registry.blocked_users, user_address)) {
            table::add(&mut registry.blocked_users, user_address, true);
        };
    }

    /// Kullanıcı adresini engelden çıkar
    public fun unblock_user(
        _admin: &AdminCap,
        registry: &mut ProfileRegistry,
        user_address: address
    ) {
        if (table::contains(&registry.blocked_users, user_address)) {
            table::remove(&mut registry.blocked_users, user_address);
        };
    }

    /// Kullanıcı adını engelle (spam/kötü isimler için)
    public fun block_username(
        _admin: &AdminCap,
        registry: &mut ProfileRegistry,
        username: string::String
    ) {
        if (!table::contains(&registry.blocked_usernames, username)) {
            table::add(&mut registry.blocked_usernames, username, true);
        };
    }

    /// Kullanıcı adını engelden çıkar
    public fun unblock_username(
        _admin: &AdminCap,
        registry: &mut ProfileRegistry,
        username: string::String
    ) {
        if (table::contains(&registry.blocked_usernames, username)) {
            table::remove(&mut registry.blocked_usernames, username);
        };
    }

    /// Kullanıcının engellenmiş olup olmadığını kontrol et
    public fun is_user_blocked(
        registry: &ProfileRegistry,
        user_address: address
    ): bool {
        table::contains(&registry.blocked_users, user_address)
    }

    /// Kullanıcı adının engellenmiş olup olmadığını kontrol et
    public fun is_username_blocked(
        registry: &ProfileRegistry,
        username: string::String
    ): bool {
        table::contains(&registry.blocked_usernames, username)
    }

    /// Toplam profil sayısını getir
    public fun get_total_profiles(registry: &ProfileRegistry): u64 {
        registry.total_profiles
    }

    /// Username ile profil adresini bul
    public fun get_profile_address(
        registry: &ProfileRegistry,
        username: string::String
    ): address {
        assert!(table::contains(&registry.profiles, username), EProfileNotFound);
        *table::borrow(&registry.profiles, username)
    }

    /// Kullanıcı adının kayıtlı olup olmadığını kontrol et
    public fun username_exists(
        registry: &ProfileRegistry,
        username: string::String
    ): bool {
        table::contains(&registry.profiles, username)
    }

    // Test helper functions
    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }
}
