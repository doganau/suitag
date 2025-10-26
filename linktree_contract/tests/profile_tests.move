#[test_only]
module linktree::profile_tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::clock::{Self, Clock};
    use std::string;
    use linktree::profile::{Self, Profile, ProfileRegistry, AdminCap};

    // Test addresses
    const ADMIN: address = @0xAD;
    const USER1: address = @0x1;
    const USER2: address = @0x2;

    // Helper function to create a test scenario
    fun create_test_scenario(): Scenario {
        let mut scenario = ts::begin(ADMIN);
        {
            let ctx = ts::ctx(&mut scenario);
            profile::init_for_testing(ctx);
        };
        scenario
    }

    #[test]
    fun test_create_profile() {
        let mut scenario = create_test_scenario();
        
        // Create a shared clock object
        ts::next_tx(&mut scenario, ADMIN);
        {
            let ctx = ts::ctx(&mut scenario);
            clock::share_for_testing(clock::create_for_testing(ctx));
        };

        // USER1 creates a profile
        ts::next_tx(&mut scenario, USER1);
        {
            let mut registry = ts::take_shared<ProfileRegistry>(&scenario);
            let clock = ts::take_shared<Clock>(&scenario);
            let ctx = ts::ctx(&mut scenario);

            profile::create_profile(
                &mut registry,
                string::utf8(b"testuser"),
                string::utf8(b"Test User"),
                string::utf8(b"This is my bio"),
                &clock,
                ctx
            );

            ts::return_shared(registry);
            ts::return_shared(clock);
        };

        // Verify profile was created
        ts::next_tx(&mut scenario, USER1);
        {
            let profile = ts::take_from_sender<Profile>(&scenario);
            
            assert!(profile::get_username(&profile) == string::utf8(b"testuser"), 0);
            assert!(profile::get_display_name(&profile) == string::utf8(b"Test User"), 1);
            assert!(profile::get_owner(&profile) == USER1, 2);
            assert!(profile::get_view_count(&profile) == 0, 3);
            
            ts::return_to_sender(&scenario, profile);
        };

        ts::end(scenario);
    }

    #[test]
    fun test_add_link() {
        let mut scenario = create_test_scenario();
        
        // Create clock
        ts::next_tx(&mut scenario, ADMIN);
        {
            let ctx = ts::ctx(&mut scenario);
            clock::share_for_testing(clock::create_for_testing(ctx));
        };

        // Create profile
        ts::next_tx(&mut scenario, USER1);
        {
            let mut registry = ts::take_shared<ProfileRegistry>(&scenario);
            let clock = ts::take_shared<Clock>(&scenario);
            let ctx = ts::ctx(&mut scenario);

            profile::create_profile(
                &mut registry,
                string::utf8(b"testuser"),
                string::utf8(b"Test User"),
                string::utf8(b"Bio"),
                &clock,
                ctx
            );

            ts::return_shared(registry);
            ts::return_shared(clock);
        };

        // Add a link
        ts::next_tx(&mut scenario, USER1);
        {
            let mut profile = ts::take_from_sender<Profile>(&scenario);
            let clock = ts::take_shared<Clock>(&scenario);
            let ctx = ts::ctx(&mut scenario);

            profile::add_link(
                &mut profile,
                string::utf8(b"Twitter"),
                string::utf8(b"https://twitter.com/testuser"),
                string::utf8(b"🐦"),
                &clock,
                ctx
            );

            let links = profile::get_links(&profile);
            assert!(std::vector::length(links) == 1, 0);

            ts::return_to_sender(&scenario, profile);
            ts::return_shared(clock);
        };

        ts::end(scenario);
    }

    #[test]
    fun test_update_theme() {
        let mut scenario = create_test_scenario();
        
        // Create clock
        ts::next_tx(&mut scenario, ADMIN);
        {
            let ctx = ts::ctx(&mut scenario);
            clock::share_for_testing(clock::create_for_testing(ctx));
        };

        // Create profile
        ts::next_tx(&mut scenario, USER1);
        {
            let mut registry = ts::take_shared<ProfileRegistry>(&scenario);
            let clock = ts::take_shared<Clock>(&scenario);
            let ctx = ts::ctx(&mut scenario);

            profile::create_profile(
                &mut registry,
                string::utf8(b"testuser"),
                string::utf8(b"Test User"),
                string::utf8(b"Bio"),
                &clock,
                ctx
            );

            ts::return_shared(registry);
            ts::return_shared(clock);
        };

        // Update theme
        ts::next_tx(&mut scenario, USER1);
        {
            let mut profile = ts::take_from_sender<Profile>(&scenario);
            let clock = ts::take_shared<Clock>(&scenario);
            let ctx = ts::ctx(&mut scenario);

            profile::update_theme(
                &mut profile,
                string::utf8(b"#000000"),
                string::utf8(b"#ffffff"),
                string::utf8(b"#ff0000"),
                string::utf8(b"#ffffff"),
                string::utf8(b"Arial"),
                12,
                &clock,
                ctx
            );

            ts::return_to_sender(&scenario, profile);
            ts::return_shared(clock);
        };

        ts::end(scenario);
    }

    #[test]
    fun test_track_view() {
        let mut scenario = create_test_scenario();
        
        // Create clock
        ts::next_tx(&mut scenario, ADMIN);
        {
            let ctx = ts::ctx(&mut scenario);
            clock::share_for_testing(clock::create_for_testing(ctx));
        };

        // Create profile
        ts::next_tx(&mut scenario, USER1);
        {
            let mut registry = ts::take_shared<ProfileRegistry>(&scenario);
            let clock = ts::take_shared<Clock>(&scenario);
            let ctx = ts::ctx(&mut scenario);

            profile::create_profile(
                &mut registry,
                string::utf8(b"testuser"),
                string::utf8(b"Test User"),
                string::utf8(b"Bio"),
                &clock,
                ctx
            );

            ts::return_shared(registry);
            ts::return_shared(clock);
        };

        // Track a view
        ts::next_tx(&mut scenario, USER2);
        {
            let mut profile = ts::take_from_address<Profile>(&scenario, USER1);
            let clock = ts::take_shared<Clock>(&scenario);
            let ctx = ts::ctx(&mut scenario);

            let initial_views = profile::get_view_count(&profile);
            
            profile::track_view(
                &mut profile,
                &clock,
                ctx
            );

            assert!(profile::get_view_count(&profile) == initial_views + 1, 0);

            ts::return_to_address(USER1, profile);
            ts::return_shared(clock);
        };

        ts::end(scenario);
    }

    #[test]
    fun test_verify_profile() {
        let mut scenario = create_test_scenario();
        
        // Create clock
        ts::next_tx(&mut scenario, ADMIN);
        {
            let ctx = ts::ctx(&mut scenario);
            clock::share_for_testing(clock::create_for_testing(ctx));
        };

        // Create profile
        ts::next_tx(&mut scenario, USER1);
        {
            let mut registry = ts::take_shared<ProfileRegistry>(&scenario);
            let clock = ts::take_shared<Clock>(&scenario);
            let ctx = ts::ctx(&mut scenario);

            profile::create_profile(
                &mut registry,
                string::utf8(b"testuser"),
                string::utf8(b"Test User"),
                string::utf8(b"Bio"),
                &clock,
                ctx
            );

            ts::return_shared(registry);
            ts::return_shared(clock);
        };

        // Admin verifies profile
        ts::next_tx(&mut scenario, ADMIN);
        {
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            let mut profile = ts::take_from_address<Profile>(&scenario, USER1);
            let ctx = ts::ctx(&mut scenario);

            assert!(!profile::is_verified(&profile), 0);
            
            profile::verify_profile(
                &admin_cap,
                &mut profile,
                ctx
            );

            assert!(profile::is_verified(&profile), 1);

            ts::return_to_sender(&scenario, admin_cap);
            ts::return_to_address(USER1, profile);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = linktree::profile::EUsernameAlreadyTaken)]
    fun test_duplicate_username() {
        let mut scenario = create_test_scenario();
        
        // Create clock
        ts::next_tx(&mut scenario, ADMIN);
        {
            let ctx = ts::ctx(&mut scenario);
            clock::share_for_testing(clock::create_for_testing(ctx));
        };

        // USER1 creates profile
        ts::next_tx(&mut scenario, USER1);
        {
            let mut registry = ts::take_shared<ProfileRegistry>(&scenario);
            let clock = ts::take_shared<Clock>(&scenario);
            let ctx = ts::ctx(&mut scenario);

            profile::create_profile(
                &mut registry,
                string::utf8(b"testuser"),
                string::utf8(b"Test User"),
                string::utf8(b"Bio"),
                &clock,
                ctx
            );

            ts::return_shared(registry);
            ts::return_shared(clock);
        };

        // USER2 tries to create profile with same username (should fail)
        ts::next_tx(&mut scenario, USER2);
        {
            let mut registry = ts::take_shared<ProfileRegistry>(&scenario);
            let clock = ts::take_shared<Clock>(&scenario);
            let ctx = ts::ctx(&mut scenario);

            profile::create_profile(
                &mut registry,
                string::utf8(b"testuser"), // Same username
                string::utf8(b"Another User"),
                string::utf8(b"Different bio"),
                &clock,
                ctx
            );

            ts::return_shared(registry);
            ts::return_shared(clock);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = linktree::profile::ENotAuthorized)]
    fun test_unauthorized_update() {
        let mut scenario = create_test_scenario();
        
        // Create clock
        ts::next_tx(&mut scenario, ADMIN);
        {
            let ctx = ts::ctx(&mut scenario);
            clock::share_for_testing(clock::create_for_testing(ctx));
        };

        // USER1 creates profile
        ts::next_tx(&mut scenario, USER1);
        {
            let mut registry = ts::take_shared<ProfileRegistry>(&scenario);
            let clock = ts::take_shared<Clock>(&scenario);
            let ctx = ts::ctx(&mut scenario);

            profile::create_profile(
                &mut registry,
                string::utf8(b"testuser"),
                string::utf8(b"Test User"),
                string::utf8(b"Bio"),
                &clock,
                ctx
            );

            ts::return_shared(registry);
            ts::return_shared(clock);
        };

        // USER2 tries to add link to USER1's profile (should fail)
        ts::next_tx(&mut scenario, USER2);
        {
            let mut profile = ts::take_from_address<Profile>(&scenario, USER1);
            let clock = ts::take_shared<Clock>(&scenario);
            let ctx = ts::ctx(&mut scenario);

            profile::add_link(
                &mut profile,
                string::utf8(b"Malicious Link"),
                string::utf8(b"https://evil.com"),
                string::utf8(b"💀"),
                &clock,
                ctx
            );

            ts::return_to_address(USER1, profile);
            ts::return_shared(clock);
        };

        ts::end(scenario);
    }
}
