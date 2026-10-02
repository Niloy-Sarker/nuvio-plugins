// ─── DhakaFlix Nuvio Scraper Plugin ──────────────────────────────────────────
// Scrapes the DhakaFlix local FTP server (h5ai) for movies, TV series, and anime.
// Returns direct .mkv HTTP stream URLs.
// Promise-only (no async/await) for React Native sandbox compatibility.
// ─────────────────────────────────────────────────────────────────────────────

var cheerio = require('cheerio-without-node-native');

// ─── Constants ───────────────────────────────────────────────────────────────
var PROVIDER  = 'dhakaflix';
var TMDB_KEY  = '439c478a771f35c05022f9feabcca01c';
var TMDB_BASE = 'https://api.themoviedb.org/3';

// Movie category directories — all searched in parallel
var MOVIE_CATS = [
  'http://172.16.50.14/DHAKA-FLIX-14/English%20Movies%20%281080p%29/',
  'http://172.16.50.7/DHAKA-FLIX-7/English%20Movies/',
  'http://172.16.50.14/DHAKA-FLIX-14/Hindi%20Movies/',
  'http://172.16.50.14/DHAKA-FLIX-14/SOUTH%20INDIAN%20MOVIES/South%20Movies/',
  'http://172.16.50.14/DHAKA-FLIX-14/SOUTH%20INDIAN%20MOVIES/Hindi%20Dubbed/',
  'http://172.16.50.7/DHAKA-FLIX-7/Kolkata%20Bangla%20Movies/',
  'http://172.16.50.14/DHAKA-FLIX-14/Animation%20Movies/',
  'http://172.16.50.14/DHAKA-FLIX-14/Animation%20Movies%20%281080p%29/',
  'http://172.16.50.7/DHAKA-FLIX-7/Foreign%20Language%20Movies/',
  'http://172.16.50.14/DHAKA-FLIX-14/IMDb%20Top-250%20Movies/',
  'http://172.16.50.7/DHAKA-FLIX-7/3D%20Movies/',
];

// English/International TV — 4 alphabetical sub-sections
var TV_BASE = 'http://172.16.50.12/DHAKA-FLIX-12/TV-WEB-Series/';
var TV_SECTIONS = [
  TV_BASE + 'TV%20Series%20%E2%98%85%20%200%20%20%E2%80%94%20%209/',
  TV_BASE + 'TV%20Series%20%E2%99%A5%20%20A%20%20%E2%80%94%20%20L/',
  TV_BASE + 'TV%20Series%20%E2%99%A6%20%20M%20%20%E2%80%94%20%20R/',
  TV_BASE + 'TV%20Series%20%E2%99%A6%20%20S%20%20%E2%80%94%20%20Z/',
];

// Korean TV — flat listing (all titles directly in root)
var KOREAN_TV_BASE = 'http://172.16.50.14/DHAKA-FLIX-14/KOREAN%20TV%20%26%20WEB%20Series/';

// Anime — 5 alphabetical sub-sections
var ANIME_BASE = 'http://172.16.50.10/DHAKA-FLIX-10/Anime%20%26%20Cartoon%20TV%20Series/';
var ANIME_SECTIONS = [
  ANIME_BASE + 'Anime-TV%20Series%20%E2%98%85%20%200%20%20%E2%80%94%20%209/',
  ANIME_BASE + 'Anime-TV%20Series%20%E2%99%A5%20%20A%20%20%E2%80%94%20%20F/',
  ANIME_BASE + 'Anime-TV%20Series%20%E2%99%A5%20%20G%20%20%E2%80%94%20%20M/',
  ANIME_BASE + 'Anime-TV%20Series%20%E2%99%A6%20%20N%20%20%E2%80%94%20%20S/',
  ANIME_BASE + 'Anime-TV%20Series%20%E2%99%A6%20%20T%20%20%E2%80%94%20%20Z/',
];

var REQ_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
};

// ─── Utilities ───────────────────────────────────────────────────────────────

// Parse quality string from filename: "1080p", "720p", "480p", etc.
function parseQuality(name) {
  var m = (name || '').match(/(\d{3,4})[pP]/);
  return m ? m[1] + 'p' : 'Unknown';
}

// Zero-pad a number: 1 → "01", 10 → "10"
function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

// Normalize a title for fuzzy comparison: lowercase, strip punctuation, collapse spaces
function norm(str) {
  return (str || '').toLowerCase()
    .replace(/['']/g, '')       // smart quotes → nothing
    .replace(/[:\-–—]/g, ' ')   // colons & dashes → space
    .replace(/[^a-z0-9 ]/g, ' ') // everything else → space
    .replace(/\s+/g, ' ')
    .trim();
}

// Word-overlap similarity score between two strings (0..1)
// Uses Sørensen–Dice-like formula on word sets
function similarity(a, b) {
  var na = norm(a);
  var nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  var wa = na.split(' ');
  var wb = nb.split(' ');
  var common = 0;
  wa.forEach(function(w) {
    if (w.length > 1 && wb.indexOf(w) !== -1) common++;
  });
  return (2 * common) / (wa.length + wb.length);
}

// Parse h5ai directory listing HTML → [{text, href}]
function parseLinks(html, baseUrl) {
  var $ = cheerio.load(html);
  var links = [];
  $('a[href]').each(function(i, el) {
    var href = $(el).attr('href') || '';
    var text = $(el).text().trim();
    // Skip navigation, parent dir, query-string links
    if (!text || !href || href.indexOf('?') !== -1) return;
    if (text === 'Parent Directory') return;
    if (text === 'modern browsers') return;
    if (text.indexOf('powered by') === 0) return;
    // Make absolute URL
    if (href.indexOf('http') !== 0) {
      // Resolve relative href against base
      var base = baseUrl.replace(/\/[^\/]*$/, '/');
      if (href.charAt(0) === '/') {
        // Absolute path — extract origin
        var origin = baseUrl.match(/^https?:\/\/[^\/]+/);
        href = (origin ? origin[0] : '') + href;
      } else {
        href = base + href;
      }
    }
    try {
      text = decodeURIComponent(text);
    } catch(e) {}
    links.push({ text: text, href: href });
  });
  return links;
}

// Fetch a directory listing and parse its links
function fetchDir(url) {
  console.log('[DhakaFlix] Fetching dir:', url.substring(0, 80) + '...');
  return fetch(url, { headers: REQ_HEADERS })
    .then(function(r) { return r.text(); })
    .then(function(html) { return parseLinks(html, url); })
    .catch(function(err) {
      console.log('[DhakaFlix] Failed to fetch dir:', err.message || err);
      return [];
    });
}

// Find the best-matching link by title similarity (threshold = 0.4)
function bestMatch(links, title) {
  var best = null;
  var bestScore = 0.4;
  for (var i = 0; i < links.length; i++) {
    var link = links[i];
    var score = similarity(link.text, title);
    if (score > bestScore) {
      bestScore = score;
      best = link;
    }
  }
  if (best) {
    console.log('[DhakaFlix] Best match for "' + title + '": "' + best.text + '" (score: ' + bestScore.toFixed(2) + ')');
  }
  return best;
}

// Pick correct English TV alpha section for a given title
function tvSection(title) {
  var c = norm(title).charAt(0);
  if (/[0-9]/.test(c))       return TV_SECTIONS[0];
  if (c >= 'a' && c <= 'l') return TV_SECTIONS[1];
  if (c >= 'm' && c <= 'r') return TV_SECTIONS[2];
  return TV_SECTIONS[3];
}

// Pick correct Anime alpha section for a given title
function animeSection(title) {
  var c = norm(title).charAt(0);
  if (/[0-9]/.test(c))       return ANIME_SECTIONS[0];
  if (c >= 'a' && c <= 'f') return ANIME_SECTIONS[1];
  if (c >= 'g' && c <= 'm') return ANIME_SECTIONS[2];
  if (c >= 'n' && c <= 's') return ANIME_SECTIONS[3];
  return ANIME_SECTIONS[4];
}

// Get .mkv files from a folder
function getMkvFiles(folderUrl) {
  return fetchDir(folderUrl).then(function(links) {
    return links.filter(function(l) {
      return l.text.toLowerCase().endsWith('.mkv');
    });
  });
}

// Build a stream object from a file link
function makeStream(fileLink, titleStr) {
  var fileName = fileLink.text;
  var isDual   = /dual\s*audio/i.test(fileName);
  var isMulti  = /multi\s*audio/i.test(fileName);
  var audioTag = isDual ? ' [Dual Audio]' : (isMulti ? ' [Multi Audio]' : '');
  var quality  = parseQuality(fileName);
  return {
    name:     'DhakaFlix - ' + quality,
    title:    titleStr + audioTag,
    url:      fileLink.href,
    quality:  quality,
    size:     'Unknown',
    headers:  REQ_HEADERS,
    provider: PROVIDER
  };
}

// ─── Movie Search ────────────────────────────────────────────────────────────
// For each movie category dir:
//   1. Fetch the category root listing
//   2. Try to find a year-based sub-folder (contains the year in link text)
//   3. If year-folder found, list its contents; otherwise, try flat match
//   4. Fuzzy-match the movie title folder
//   5. List .mkv files inside the matched folder

function searchMovieCat(catUrl, title, year) {
  return fetchDir(catUrl).then(function(links) {
    // Try to find a year folder
    var yearFolder = null;
    for (var i = 0; i < links.length; i++) {
      if (links[i].text.indexOf('(' + year + ')') !== -1) {
        yearFolder = links[i];
        break;
      }
    }
    // If no year folder with parens, try plain year string
    if (!yearFolder) {
      for (var j = 0; j < links.length; j++) {
        if (links[j].text.indexOf(year) !== -1) {
          yearFolder = links[j];
          break;
        }
      }
    }

    function findInLinks(subLinks) {
      var best = bestMatch(subLinks, title);
      if (!best) return Promise.resolve([]);
      return getMkvFiles(best.href);
    }

    if (yearFolder) {
      console.log('[DhakaFlix] Found year folder:', yearFolder.text);
      return fetchDir(yearFolder.href).then(findInLinks);
    } else {
      // No year folder — try flat match directly in root
      return findInLinks(links);
    }
  }).catch(function(err) {
    console.log('[DhakaFlix] Error searching category:', err.message || err);
    return [];
  });
}

function findMovieStreams(title, year, titleStr) {
  var tasks = MOVIE_CATS.map(function(cat) {
    return searchMovieCat(cat, title, year);
  });
  return Promise.all(tasks).then(function(results) {
    // Flatten all results
    var all = [];
    results.forEach(function(r) { all = all.concat(r); });
    // Deduplicate by URL
    var seen = {};
    var unique = all.filter(function(f) {
      if (seen[f.href]) return false;
      seen[f.href] = true;
      return true;
    });
    return unique.map(function(f) { return makeStream(f, titleStr); });
  });
}

// ─── TV / Anime Episode Search ───────────────────────────────────────────────
// 1. Fetch the section listing
// 2. Fuzzy-match the series folder
// 3. Find "Season N" subfolder
// 4. Find file containing "S0XE0Y" pattern

function findEpisodeInSection(sectionUrl, title, seasonNum, episodeNum, titleStr) {
  var seasonDir = 'Season ' + seasonNum;
  var epCode    = 'S' + pad(seasonNum) + 'E' + pad(episodeNum);

  return fetchDir(sectionUrl).then(function(links) {
    var best = bestMatch(links, title);
    if (!best) {
      console.log('[DhakaFlix] No series match found in section');
      return [];
    }
    console.log('[DhakaFlix] Matched series folder:', best.text);
    return fetchDir(best.href).then(function(contents) {
      // Find the Season subfolder
      var seasonLink = null;
      for (var i = 0; i < contents.length; i++) {
        if (contents[i].text === seasonDir ||
            contents[i].text.toLowerCase() === 'season ' + seasonNum) {
          seasonLink = contents[i];
          break;
        }
      }
      // Looser match: text starts with "Season" and contains the number
      if (!seasonLink) {
        for (var j = 0; j < contents.length; j++) {
          var txt = contents[j].text.toLowerCase();
          if (txt.indexOf('season') !== -1 && txt.indexOf('' + seasonNum) !== -1) {
            seasonLink = contents[j];
            break;
          }
        }
      }
      if (!seasonLink) {
        console.log('[DhakaFlix] Season ' + seasonNum + ' folder not found');
        // Some shows have episodes directly in root (no Season subfolder)
        // Try matching episode pattern directly in this listing
        var directEps = contents.filter(function(l) {
          return l.text.toLowerCase().indexOf(epCode.toLowerCase()) !== -1
              && l.text.toLowerCase().endsWith('.mkv');
        });
        return directEps.map(function(f) { return makeStream(f, titleStr); });
      }
      console.log('[DhakaFlix] Found season folder:', seasonLink.text);
      return fetchDir(seasonLink.href).then(function(epLinks) {
        var matches = epLinks.filter(function(l) {
          return l.text.toLowerCase().indexOf(epCode.toLowerCase()) !== -1
              && l.text.toLowerCase().endsWith('.mkv');
        });
        console.log('[DhakaFlix] Found ' + matches.length + ' episode files for ' + epCode);
        return matches.map(function(f) { return makeStream(f, titleStr); });
      });
    });
  }).catch(function(err) {
    console.log('[DhakaFlix] Error searching section:', err.message || err);
    return [];
  });
}

function findTvStreams(title, seasonNum, episodeNum, titleStr) {
  var engSection = tvSection(title);
  console.log('[DhakaFlix] TV search — English section + Korean flat listing');
  var tasks = [
    findEpisodeInSection(engSection, title, seasonNum, episodeNum, titleStr),
    findEpisodeInSection(KOREAN_TV_BASE, title, seasonNum, episodeNum, titleStr),
  ];
  return Promise.all(tasks).then(function(results) {
    var all = [];
    results.forEach(function(r) { all = all.concat(r); });
    return all;
  });
}

function findAnimeStreams(title, seasonNum, episodeNum, titleStr) {
  var section = animeSection(title);
  console.log('[DhakaFlix] Anime search — section:', section.substring(section.lastIndexOf('/') - 30));
  return findEpisodeInSection(section, title, seasonNum, episodeNum, titleStr);
}

// ─── Main Export ─────────────────────────────────────────────────────────────

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return new Promise(function(resolve) {
    // Build TMDB API URL — anime uses /tv endpoint
    var tmdbType = (mediaType === 'anime') ? 'tv' : mediaType;
    var tmdbUrl  = TMDB_BASE + '/' + tmdbType + '/' + tmdbId + '?api_key=' + TMDB_KEY;

    console.log('[DhakaFlix] ──────────────────────────────────────');
    console.log('[DhakaFlix] Fetching TMDB metadata:', tmdbUrl);

    fetch(tmdbUrl)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var title    = data.title || data.name || '';
        var year     = ((data.release_date || data.first_air_date || '')).split('-')[0];
        var titleStr = title + (year ? ' (' + year + ')' : '');

        console.log('[DhakaFlix] Title:', titleStr, '| Type:', mediaType);

        var searchPromise;
        if (mediaType === 'movie') {
          searchPromise = findMovieStreams(title, year, titleStr);
        } else if (mediaType === 'tv') {
          searchPromise = findTvStreams(title, seasonNum, episodeNum, titleStr);
        } else if (mediaType === 'anime') {
          searchPromise = findAnimeStreams(title, seasonNum, episodeNum, titleStr);
        } else {
          console.log('[DhakaFlix] Unknown media type:', mediaType);
          searchPromise = Promise.resolve([]);
        }

        return searchPromise.then(function(streams) {
          // Sort: highest quality first
          streams.sort(function(a, b) {
            return (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0);
          });
          console.log('[DhakaFlix] Total streams found:', streams.length);
          console.log('[DhakaFlix] ──────────────────────────────────────');
          resolve(streams);
        });
      })
      .catch(function(err) {
        console.error('[DhakaFlix] Fatal error:', err.message || err);
        resolve([]);
      });
  });
}

// Export for React Native compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
}
