// ─── DhakaFlix Scraper Test Suite ────────────────────────────────────────────
// Run with: node test_dhakaflix.js
// Must be on the DhakaFlix LAN (172.16.50.x) for tests to pass.
// ─────────────────────────────────────────────────────────────────────────────

var dhakaflix = require('./providers/dhakaflix');
var getStreams = dhakaflix.getStreams;

function runTest(label, tmdbId, mediaType, season, episode) {
  console.log('\n' + '='.repeat(60));
  console.log('TEST: ' + label);
  console.log('='.repeat(60));
  return getStreams(tmdbId, mediaType, season, episode)
    .then(function(streams) {
      if (streams.length === 0) {
        console.log('⚠ No streams found (may not be on LAN or content missing)');
      } else {
        console.log('✓ Found ' + streams.length + ' stream(s):');
        streams.forEach(function(s, i) {
          console.log('  ' + (i + 1) + '. [' + s.quality + '] ' + s.title);
          console.log('     Name: ' + s.name);
          console.log('     URL:  ' + s.url.substring(0, 100) + (s.url.length > 100 ? '...' : ''));
        });
      }
      return streams;
    })
    .catch(function(err) {
      console.error('✗ Test failed:', err.message || err);
      return [];
    });
}

// Sequential test execution to avoid flooding the server
function runAllTests() {
  console.log('DhakaFlix Scraper Test Suite');
  console.log('Time: ' + new Date().toISOString());
  console.log('');

  // Test 1: English Movie — Deadpool & Wolverine (2024)
  runTest('English Movie — Deadpool & Wolverine', '533535', 'movie')
    .then(function() {
      // Test 2: Hindi Movie — Animal (2023) — TMDB 781732
      return runTest('Hindi Movie — Animal', '781732', 'movie');
    })
    .then(function() {
      // Test 3: TV Series — Better Call Saul S01E01 — TMDB 60059
      return runTest('TV Series — Better Call Saul S01E01', '60059', 'tv', 1, 1);
    })
    .then(function() {
      // Test 4: Korean TV — Crash Landing on You S01E01 — TMDB 94796
      return runTest('Korean TV — Crash Landing on You S01E01', '94796', 'tv', 1, 1);
    })
    .then(function() {
      // Test 5: Anime — Attack on Titan S01E01 — TMDB 1429
      return runTest('Anime — Attack on Titan S01E01', '1429', 'anime', 1, 1);
    })
    .then(function() {
      // Test 6: Non-existent movie — should return empty gracefully
      return runTest('Non-existent — TMDB 999999999', '999999999', 'movie');
    })
    .then(function() {
      console.log('\n' + '='.repeat(60));
      console.log('ALL TESTS COMPLETED');
      console.log('='.repeat(60));
    })
    .catch(function(err) {
      console.error('Test suite error:', err);
    });
}

runAllTests();
