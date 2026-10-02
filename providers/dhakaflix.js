// ─── DhakaFlix Nuvio Scraper Plugin ──────────────────────────────────────────
// Scrapes DhakaFlix FTP servers using native h5ai search API for ultra-fast,
// recursive file lookup across movies, TV series, and anime.
// Returns direct HTTP stream URLs with accurate file sizes and qualities.
// Promise-only (no async/await) for React Native sandbox compatibility.
// ─────────────────────────────────────────────────────────────────────────────

var cheerio = require('cheerio-without-node-native');

// ─── Configuration ───────────────────────────────────────────────────────────
var PROVIDER  = 'dhakaflix';
var TMDB_KEY  = '439c478a771f35c05022f9feabcca01c';
var TMDB_BASE = 'https://api.themoviedb.org/3';

var SERVERS = {
  movie: [
    { base: 'http://172.16.50.14', root: '/DHAKA-FLIX-14/' },
    { base: 'http://172.16.50.7',  root: '/DHAKA-FLIX-7/' }
  ],
  tv: [
    { base: 'http://172.16.50.12', root: '/DHAKA-FLIX-12/' },
    { base: 'http://172.16.50.14', root: '/DHAKA-FLIX-14/' }
  ],
  anime: [
    { base: 'http://172.16.50.10', root: '/DHAKA-FLIX-10/' },
    { base: 'http://172.16.50.14', root: '/DHAKA-FLIX-14/' }
  ]
};

var REQ_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
};

// ─── Helper Functions ────────────────────────────────────────────────────────

function parseQuality(name) {
  var m = (name || '').match(/(\d{3,4})[pP]/);
  return m ? m[1] + 'p' : 'Unknown';
}

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function formatSize(bytes) {
  if (!bytes || typeof bytes !== 'number' || bytes <= 0) return 'Unknown';
  var gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return gb.toFixed(2) + ' GB';
  var mb = bytes / (1024 * 1024);
  return mb.toFixed(1) + ' MB';
}

function norm(str) {
  return (str || '').toLowerCase()
    .replace(/['']/g, '')
    .replace(/[:\-–—]/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanForCompare(str) {
  return norm(str)
    .replace(/\b(1080p|720p|480p|2160p|4k|bluray|webrip|web|dl|dual|audio|multi|hindi|english|dubbed|esub|remastered)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

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

function isVideoFile(href, size) {
  var clean = href.split('?')[0].toLowerCase();
  return (/\.(mkv|mp4|avi)$/i.test(clean)) && (size !== null && size > 0);
}

// ─── Native h5ai Search API ──────────────────────────────────────────────────

function h5aiSearch(serverBase, href, pattern) {
  var url = serverBase.replace(/\/$/, '') + '/' + href.replace(/^\//, '');
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      'User-Agent': REQ_HEADERS['User-Agent']
    },
    body: JSON.stringify({
      action: 'get',
      search: {
        href: decodeURIComponent(href),
        pattern: pattern,
        ignorecase: true
      }
    })
  })
  .then(function(r) {
    if (!r.ok) return [];
    return r.json();
  })
  .then(function(data) {
    return (data && data.search) || [];
  })
  .catch(function(err) {
    return [];
  });
}

function makeStream(serverBase, item, titleStr) {
  var fileName = decodeURIComponent(item.href.split('/').pop());
  var isDual   = /dual\s*audio/i.test(item.href);
  var isMulti  = /multi\s*audio/i.test(item.href);
  var audioTag = isDual ? ' [Dual Audio]' : (isMulti ? ' [Multi Audio]' : '');
  var quality  = parseQuality(fileName) || parseQuality(item.href);
  var fullUrl  = serverBase.replace(/\/$/, '') + '/' + item.href.replace(/^\//, '');

  return {
    name:     'DhakaFlix - ' + quality,
    title:    titleStr + audioTag,
    url:      fullUrl,
    quality:  quality,
    size:     formatSize(item.size),
    headers:  REQ_HEADERS,
    provider: PROVIDER
  };
}

function getSearchQueries(title, origTitle) {
  var queries = [];
  function add(t) {
    var s = (t || '').trim();
    if (s && queries.indexOf(s) === -1) queries.push(s);
  }

  add(title);
  if (origTitle && origTitle !== title) add(origTitle);

  // Clean title without colons / dashes
  var clean = (title || '').replace(/[:\-–—]/g, ' ').replace(/\s+/g, ' ').trim();
  add(clean);

  // Short title before colon/dash
  var shortTitle = (title || '').split(/[:\-–—]/)[0].trim();
  if (shortTitle && shortTitle.length >= 3) add(shortTitle);

  // Ampersand vs and
  if (title && title.indexOf('&') !== -1) {
    add(title.replace(/&/g, 'and').replace(/\s+/g, ' ').trim());
  }

  return queries;
}

// ─── Movie Search Logic ──────────────────────────────────────────────────────

function searchMoviesOnServer(server, queries, title, year, titleStr) {
  var serverBase = server.base;
  var rootHref = server.root;
  var targetClean = cleanForCompare(title);

  var tasks = queries.map(function(q) {
    return h5aiSearch(serverBase, rootHref, q);
  });

  return Promise.all(tasks).then(function(resultsList) {
    var allItems = [];
    var seenHref = {};
    resultsList.forEach(function(list) {
      list.forEach(function(item) {
        if (!seenHref[item.href]) {
          seenHref[item.href] = true;
          allItems.push(item);
        }
      });
    });

    var directVideos = [];
    var matchingDirs = [];

    allItems.forEach(function(item) {
      var decoded = decodeURIComponent(item.href);
      var lastPart = decoded.replace(/\/$/, '').split('/').pop();
      var cleanLast = cleanForCompare(lastPart);
      var sim = similarity(cleanLast, targetClean);

      var hasYear = year && (
        decoded.indexOf('(' + year + ')') !== -1 ||
        decoded.indexOf('/' + year + '/') !== -1 ||
        decoded.indexOf('.' + year + '.') !== -1 ||
        decoded.indexOf(' ' + year + ' ') !== -1
      );

      var words = cleanLast.split(' ');
      var isExactWord = words.indexOf(targetClean) !== -1;

      var score = sim + (hasYear ? 0.5 : 0) + (isExactWord ? 0.3 : 0);

      if (isVideoFile(item.href, item.size)) {
        if (sim >= 0.35 || isExactWord) {
          directVideos.push({ item: item, score: score, hasYear: hasYear });
        }
      } else {
        if (sim >= 0.35 || isExactWord) {
          matchingDirs.push({ item: item, score: score, hasYear: hasYear });
        }
      }
    });

    // If items with exact year exist, filter to only items with that year
    if (year) {
      var dvYear = directVideos.filter(function(v) { return v.hasYear; });
      if (dvYear.length > 0) directVideos = dvYear;

      var mdYear = matchingDirs.filter(function(d) { return d.hasYear; });
      if (mdYear.length > 0) matchingDirs = mdYear;
    }

    // If direct videos found, filter low scores and return
    if (directVideos.length > 0) {
      directVideos.sort(function(a, b) { return b.score - a.score; });
      var topScore = directVideos[0].score;
      var bestVideos = directVideos.filter(function(v) { return v.score >= topScore - 0.4; });
      return bestVideos.map(function(dv) {
        return makeStream(serverBase, dv.item, titleStr);
      });
    }

    // Otherwise inspect top matching directories
    if (matchingDirs.length === 0) return [];

    matchingDirs.sort(function(a, b) { return b.score - a.score; });
    var topDirs = matchingDirs.slice(0, 3);

    var dirTasks = topDirs.map(function(d) {
      return h5aiSearch(serverBase, d.item.href, 'mkv');
    });

    return Promise.all(dirTasks).then(function(dirResultsList) {
      var foundStreams = [];
      dirResultsList.forEach(function(files) {
        files.forEach(function(f) {
          if (isVideoFile(f.href, f.size)) {
            foundStreams.push(makeStream(serverBase, f, titleStr));
          }
        });
      });
      return foundStreams;
    });
  });
}

function findMovieStreams(title, origTitle, year, titleStr) {
  var queries = getSearchQueries(title, origTitle);
  var servers = SERVERS.movie;

  var tasks = servers.map(function(server) {
    return searchMoviesOnServer(server, queries, title, year, titleStr);
  });

  return Promise.all(tasks).then(function(results) {
    var streams = [];
    results.forEach(function(sList) { streams = streams.concat(sList); });

    // Cross-server year filtering: if any streams match target release year, keep matching year
    if (year) {
      var matchingYear = streams.filter(function(s) {
        var dec = decodeURIComponent(s.url);
        return dec.indexOf('(' + year + ')') !== -1 ||
               dec.indexOf('/' + year + '/') !== -1 ||
               dec.indexOf('.' + year + '.') !== -1 ||
               dec.indexOf(' ' + year + ' ') !== -1;
      });
      if (matchingYear.length > 0) {
        streams = matchingYear;
      }
    }

    // Deduplicate by URL
    var seen = {};
    return streams.filter(function(s) {
      if (seen[s.url]) return false;
      seen[s.url] = true;
      return true;
    });
  });
}

// ─── TV / Anime Search Logic ─────────────────────────────────────────────────

function matchEpisode(href, seasonNum, episodeNum) {
  var sStr = '' + seasonNum;
  var eStr = '' + episodeNum;
  var decoded = decodeURIComponent(href);
  var lower = decoded.toLowerCase();

  // Pattern 1: S01E01 or S1E01 or S01.E01
  var p1 = new RegExp('s0*' + sStr + '[._\\s-]*e0*' + eStr + '(?![0-9])', 'i');
  if (p1.test(lower)) return true;

  // Pattern 2: 1x01 or 01x01
  var p2 = new RegExp('\\b0*' + sStr + 'x0*' + eStr + '\\b', 'i');
  if (p2.test(lower)) return true;

  // Pattern 3: In Season N folder with episode number
  var inSeason = new RegExp('season[._\\s-]*0*' + sStr + '(?![0-9])', 'i').test(lower);
  if (inSeason) {
    var p3 = new RegExp('(?:e|ep|episode)[._\\s-]*0*' + eStr + '(?![0-9])', 'i');
    if (p3.test(lower)) return true;
    var p4 = new RegExp('[-._\\s]0*' + eStr + '(?![0-9])[-._\\s\\[]', 'i');
    if (p4.test(lower)) return true;
  }
  return false;
}

function searchTvOnServer(server, queries, title, seasonNum, episodeNum, titleStr) {
  var serverBase = server.base;
  var rootHref = server.root;
  var epCode = 'S' + pad(seasonNum) + 'E' + pad(episodeNum);
  var targetClean = cleanForCompare(title);

  var tasks = queries.map(function(q) {
    return h5aiSearch(serverBase, rootHref, q);
  });

  return Promise.all(tasks).then(function(resultsList) {
    var allItems = [];
    var seenHref = {};
    resultsList.forEach(function(list) {
      list.forEach(function(item) {
        if (!seenHref[item.href]) {
          seenHref[item.href] = true;
          allItems.push(item);
        }
      });
    });

    // Find matching show directories
    var dirs = allItems.filter(function(item) {
      return !isVideoFile(item.href, item.size) || item.href.endsWith('/');
    });

    var scoredDirs = [];
    dirs.forEach(function(d) {
      var dirName = decodeURIComponent(d.href.replace(/\/$/, '').split('/').pop());
      var cleanDir = cleanForCompare(dirName);
      var sim = similarity(cleanDir, targetClean);

      if (sim >= 0.35 || cleanDir.indexOf(targetClean) !== -1 || targetClean.indexOf(cleanDir) !== -1) {
        var isSpinoff = /junior|spin-off|special|ova|oad/i.test(dirName);
        var score = sim - (isSpinoff ? 0.4 : 0);
        scoredDirs.push({ dir: d, score: score });
      }
    });

    if (scoredDirs.length > 0) {
      scoredDirs.sort(function(a, b) { return b.score - a.score; });
      var bestDir = scoredDirs[0].dir;

      // Inside best show directory, search for epCode or mkv
      return h5aiSearch(serverBase, bestDir.href, epCode).then(function(epResults) {
        var validFiles = epResults.filter(function(f) {
          return isVideoFile(f.href, f.size) && matchEpisode(f.href, seasonNum, episodeNum);
        });

        // If not found directly, search all mkvs inside show folder and regex match
        if (validFiles.length === 0) {
          return h5aiSearch(serverBase, bestDir.href, 'mkv').then(function(allMkvs) {
            return allMkvs.filter(function(f) {
              return isVideoFile(f.href, f.size) && matchEpisode(f.href, seasonNum, episodeNum);
            });
          });
        }
        return validFiles;
      }).then(function(matchedFiles) {
        // Prioritize regular season episodes over OVAs/specials
        matchedFiles.sort(function(a, b) {
          var aOva = /ova|oad|special/i.test(a.href);
          var bOva = /ova|oad|special/i.test(b.href);
          if (aOva !== bOva) return aOva ? 1 : -1;
          return 0;
        });
        return matchedFiles.map(function(f) { return makeStream(serverBase, f, titleStr); });
      });
    }

    // Direct video fallback from root search
    var directEpMatches = allItems.filter(function(item) {
      return isVideoFile(item.href, item.size) && matchEpisode(item.href, seasonNum, episodeNum);
    });
    return directEpMatches.map(function(item) {
      return makeStream(serverBase, item, titleStr);
    });
  });
}

function findTvStreams(title, origTitle, seasonNum, episodeNum, titleStr) {
  var queries = getSearchQueries(title, origTitle);
  var servers = SERVERS.tv;

  var tasks = servers.map(function(server) {
    return searchTvOnServer(server, queries, title, seasonNum, episodeNum, titleStr);
  });

  return Promise.all(tasks).then(function(results) {
    var streams = [];
    results.forEach(function(sList) { streams = streams.concat(sList); });
    var seen = {};
    return streams.filter(function(s) {
      if (seen[s.url]) return false;
      seen[s.url] = true;
      return true;
    });
  });
}

function findAnimeStreams(title, origTitle, seasonNum, episodeNum, titleStr) {
  var queries = getSearchQueries(title, origTitle);
  var servers = SERVERS.anime;

  var tasks = servers.map(function(server) {
    return searchTvOnServer(server, queries, title, seasonNum, episodeNum, titleStr);
  });

  return Promise.all(tasks).then(function(results) {
    var streams = [];
    results.forEach(function(sList) { streams = streams.concat(sList); });
    var seen = {};
    return streams.filter(function(s) {
      if (seen[s.url]) return false;
      seen[s.url] = true;
      return true;
    });
  });
}

// ─── Main Export ─────────────────────────────────────────────────────────────

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return new Promise(function(resolve) {
    var tmdbType = (mediaType === 'anime') ? 'tv' : mediaType;
    var tmdbUrl  = TMDB_BASE + '/' + tmdbType + '/' + tmdbId + '?api_key=' + TMDB_KEY;

    console.log('[DhakaFlix] ──────────────────────────────────────');
    console.log('[DhakaFlix] Fetching TMDB metadata:', tmdbUrl);

    fetch(tmdbUrl)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var title     = data.title || data.name || '';
        var origTitle = data.original_title || data.original_name || '';
        var year      = ((data.release_date || data.first_air_date || '')).split('-')[0];
        var titleStr  = title + (year ? ' (' + year + ')' : '');

        console.log('[DhakaFlix] Title:', titleStr, '| Type:', mediaType);

        var searchPromise;
        if (mediaType === 'movie') {
          searchPromise = findMovieStreams(title, origTitle, year, titleStr);
        } else if (mediaType === 'tv') {
          searchPromise = findTvStreams(title, origTitle, seasonNum, episodeNum, titleStr);
        } else if (mediaType === 'anime') {
          searchPromise = findAnimeStreams(title, origTitle, seasonNum, episodeNum, titleStr);
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
