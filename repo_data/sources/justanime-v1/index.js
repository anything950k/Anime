(() => {
  'use strict';

  const MODULE_NAME = 'JustAnime';
  const BASE_URL = 'https://core.justanime.to/api';
  const SITE_URL = 'https://justanime.to';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

  function log(message) {
    try {
      if (typeof debugPrint === 'function') debugPrint('[' + MODULE_NAME + '] ' + String(message || ''));
      else if (typeof console !== 'undefined' && console.log) console.log('[' + MODULE_NAME + '] ' + String(message || ''));
    } catch (_) {}
  }

  function decodeHtml(text) {
    return String(text || '')
      .replace(/&#0?39;|&#x27;|&apos;/g, "'")
      .replace(/&#8217;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  }

  // ---------- HTTP bridge ----------

  async function requestJson(url, extraHeaders) {
    const headers = Object.assign({
      'User-Agent': USER_AGENT,
      'Accept': 'application/json, text/plain, */*',
      'Referer': SITE_URL + '/',
      'Origin': SITE_URL,
    }, extraHeaders || {});

    let res = null;
    if (typeof fetchv2 === 'function') {
      res = await fetchv2(url, headers, 'GET', null);
    } else if (typeof fetch === 'function') {
      res = await fetch(url, { headers });
    }

    const status = Number((res && res.status) || 0);
    if (status < 200 || status >= 400) {
      throw new Error(MODULE_NAME + ': request failed (HTTP ' + status + ') for ' + url);
    }

    if (res && typeof res.json === 'function') {
      try {
        const j = await res.json();
        if (j !== null && j !== undefined) return j;
      } catch (_) {}
    }
    if (res && res.json && typeof res.json === 'object') return res.json;

    let text = '';
    if (res && typeof res.text === 'function') { try { text = await res.text(); } catch (_) {} }
    else if (res && typeof res.body === 'string') text = res.body;

    if (text) {
      try { return JSON.parse(text); } catch (_) {}
    }
    throw new Error(MODULE_NAME + ': response from ' + url + ' was not valid JSON');
  }

  // ---------- helpers ----------

  function parseAnimeId(rawInput) {
    let raw = String(rawInput || '').trim();
    if (!raw) return 0;
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      const m = raw.match(/\/(?:anime|watch)\/([0-9]+)/i) || raw.match(/id=([0-9]+)/i);
      if (m) return parseInt(m[1], 10);
    }
    const num = parseInt(raw, 10);
    if (!isNaN(num) && num > 0) return num;
    const parts = raw.split(/[:\/-]/);
    for (const p of parts) {
      const n = parseInt(p, 10);
      if (!isNaN(n) && n > 0) return n;
    }
    return 0;
  }

  function formatTitle(item, fallback) {
    if (!item) return fallback || 'Anime';
    if (typeof item === 'string') return item;
    if (item.title) {
      if (typeof item.title === 'string') return item.title;
      return item.title.english || item.title.romaji || item.title.userPreferred || fallback || 'Anime';
    }
    return item.english || item.romaji || item.userPreferred || fallback || 'Anime';
  }

  function formatCover(item) {
    if (!item) return '';
    if (typeof item.cover === 'string') return item.cover;
    if (typeof item.coverImage === 'string') return item.coverImage;
    if (item.coverImage && typeof item.coverImage === 'object') {
      return item.coverImage.extraLarge || item.coverImage.large || item.coverImage.medium || '';
    }
    if (item.image && typeof item.image === 'string') return item.image;
    return '';
  }

  // ---------- search ----------

  async function searchResults(query) {
    const q = String(query || '').trim();
    let items = [];

    if (q) {
      try {
        const data = await requestJson(BASE_URL + '/search/suggestions?query=' + encodeURIComponent(q));
        if (data && Array.isArray(data.data)) items = data.data;
        else if (Array.isArray(data)) items = data;
      } catch (_) {
        try {
          const sData = await requestJson(BASE_URL + '/search?query=' + encodeURIComponent(q));
          if (sData && Array.isArray(sData.results)) items = sData.results;
          else if (sData && Array.isArray(sData.data)) items = sData.data;
        } catch (_) {}
      }
    } else {
      try {
        const homeData = await requestJson(BASE_URL + '/home');
        if (homeData && Array.isArray(homeData.trending)) items = homeData.trending;
        else if (homeData && Array.isArray(homeData.popular)) items = homeData.popular;
      } catch (_) {}
    }

    return items.map((item) => {
      const id = String(item.id || item._id || item.anilistId || '');
      const title = formatTitle(item, 'Anime #' + id);
      const cover = formatCover(item);
      return {
        id: id,
        href: SITE_URL + '/anime/' + id,
        title: title,
        image: cover,
        poster: cover,
        format: item.type || item.format || 'TV',
        year: item.year || item.seasonYear || 0,
        totalEpisodes: item.episodes || item.totalEpisodes || 0,
      };
    }).filter((r) => Boolean(r.id));
  }

  // ---------- details ----------

  async function extractDetails(urlOrId) {
    let id = parseAnimeId(urlOrId);
    if (!id) {
      const searchRes = await searchResults(urlOrId);
      if (searchRes.length > 0) {
        id = parseInt(searchRes[0].id, 10);
      }
    }
    if (!id) throw new Error(MODULE_NAME + ': unable to parse anime ID from ' + urlOrId);

    const res = await requestJson(BASE_URL + '/anime/' + id);
    const anime = (res && res.data) || res || {};

    const title = formatTitle(anime, 'Anime #' + id);
    const cover = formatCover(anime);
    const banner = anime.bannerImage || anime.backdropUrl || cover;
    const desc = anime.description ? decodeHtml(anime.description.replace(/<[^>]*>/g, '')) : 'Watch on JustAnime';

    return {
      id: String(id),
      href: SITE_URL + '/anime/' + id,
      title: title,
      description: desc,
      image: cover,
      poster: cover,
      banner: banner,
      genres: Array.isArray(anime.genres) ? anime.genres : [],
      status: anime.status || 'UNKNOWN',
      year: anime.seasonYear || anime.year || 0,
      totalEpisodes: anime.episodes || anime.totalEpisodes || 0,
    };
  }

  // ---------- episodes ----------

  async function extractEpisodes(urlOrId) {
    let id = parseAnimeId(urlOrId);
    if (!id) {
      const details = await extractDetails(urlOrId);
      id = parseInt(details.id, 10);
    }
    if (!id) throw new Error(MODULE_NAME + ': unable to parse anime ID for episodes from ' + urlOrId);

    // Fetch page 1
    const p1 = await requestJson(BASE_URL + '/anime/' + id + '/episodes?page=1');
    let allEpisodes = (p1 && Array.isArray(p1.episodes)) ? p1.episodes.slice() : [];
    const totalPages = Number((p1 && p1.totalPages) || 1);

    // Fetch remaining pages up to max 15 pages
    if (totalPages > 1) {
      const fetchPages = [];
      for (let p = 2; p <= Math.min(totalPages, 15); p++) {
        fetchPages.push(
          requestJson(BASE_URL + '/anime/' + id + '/episodes?page=' + p)
            .then((data) => (data && Array.isArray(data.episodes) ? data.episodes : []))
            .catch(() => [])
        );
      }
      const pageResults = await Promise.all(fetchPages);
      for (const pageEps of pageResults) {
        allEpisodes = allEpisodes.concat(pageEps);
      }
    }

    if (allEpisodes.length === 0) {
      allEpisodes.push({
        number: 1,
        title: 'Episode 1',
        image: '',
      });
    }

    allEpisodes.sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));

    return allEpisodes.map((ep) => {
      const epNum = Number(ep.number) || 1;
      const epTitle = ep.title ? decodeHtml(ep.title) : 'Episode ' + epNum;
      return {
        id: id + ':ep:' + epNum,
        href: SITE_URL + '/watch/' + id + '/episode/' + epNum,
        number: epNum,
        title: 'S1E' + epNum + ': ' + epTitle,
        description: ep.description ? decodeHtml(ep.description) : '',
        image: ep.image || '',
        hasSub: true,
        hasDub: true,
      };
    });
  }

  // ---------- extractStreamUrl ----------

  async function extractStreamUrl(episodeHref, lang) {
    const raw = String(episodeHref || '').trim();
    let animeId = 0;
    let epNum = 1;

    if (raw.includes(':ep:')) {
      const parts = raw.split(':ep:');
      animeId = parseInt(parts[0], 10);
      epNum = parseInt(parts[1], 10) || 1;
    } else {
      const m = raw.match(/\/watch\/([0-9]+)[^\/]*\/episode\/([0-9]+)/i) || raw.match(/([0-9]+)[^\/]*\/episode\/([0-9]+)/i);
      if (m) {
        animeId = parseInt(m[1], 10);
        epNum = parseInt(m[2], 10) || 1;
      } else {
        animeId = parseAnimeId(raw);
      }
    }

    if (!animeId) throw new Error(MODULE_NAME + ': unable to parse animeId from ' + episodeHref);

    const targetLang = (String(lang || 'sub').toLowerCase() === 'dub') ? 'dub' : 'sub';
    log('Extracting HLS stream for animeId=' + animeId + ', ep=' + epNum + ', lang=' + targetLang);

    function isHlsStreamSource(source) {
      if (!source || !source.url) return false;
      const url = String(source.url).trim();
      const kind = String(source.streamType || source.type || source.format || '').toLowerCase();
      if (kind === 'mp4' || /\.mp4(?:[?#]|$)/i.test(url)) return false;
      if (source.isM3U8 === false) return false;
      return true;
    }

    function mapSubtitles(list) {
      return (Array.isArray(list) ? list : [])
        .filter((sub) => sub && (sub.file || sub.url))
        .map((sub) => ({
          url: sub.file || sub.url,
          lang: sub.label || sub.lang || 'English',
          label: sub.label || sub.lang || 'English',
          default: Boolean(sub.default),
        }));
    }

    function headersForStream(url, providerId, rawHeaders) {
      const rh = rawHeaders && typeof rawHeaders === 'object' ? rawHeaders : null;
      const rawRef = rh && (rh.Referer || rh.referer);
      if (rawRef) {
        return Object.assign({
          'User-Agent': USER_AGENT,
          'Referer': rawRef,
        }, rh);
      }
      if (providerId === 'momo') {
        return {
          'User-Agent': USER_AGENT,
          'Referer': 'https://megaplay.buzz/',
        };
      }
      const target = String(url || '').toLowerCase();
      if (target.includes('core.justanime.to')) {
        return {
          'User-Agent': USER_AGENT,
          'Referer': SITE_URL + '/',
          'Origin': SITE_URL,
        };
      }
      return {
        'User-Agent': USER_AGENT,
        'Referer': SITE_URL + '/',
      };
    }

    const providers = [
      { id: 'momo', label: 'Momo' },
      { id: 'onyx', label: 'Onyx' },
      { id: 'calm', label: 'Calm' },
      { id: 'revo', label: 'Revo' },
    ];

    const settled = await Promise.all(
      providers.map(async (prov) => {
        try {
          const data = await requestJson(BASE_URL + '/watch/' + animeId + '/episode/' + epNum + '/' + prov.id);
          if (!data || typeof data !== 'object') return null;
          const langData = data[targetLang];
          if (!langData || typeof langData !== 'object') return null;
          const sources = (Array.isArray(langData.sources) ? langData.sources : []).filter(isHlsStreamSource);
          if (!sources.length) return null;
          return {
            prov,
            sources,
            subtitles: mapSubtitles(langData.subtitles),
            intro: langData.intro || null,
            outro: langData.outro || null,
            rawHeaders: langData.headers || null,
          };
        } catch (_) {
          return null;
        }
      })
    );

    const serverRoutes = [];
    const seenUrls = new Set();
    let bestSubtitles = [];
    let bestIntro = null;
    let bestOutro = null;

    for (const entry of settled) {
      if (!entry) continue;
      if (!bestSubtitles.length && entry.subtitles.length) bestSubtitles = entry.subtitles;
      if (!bestIntro && entry.intro) bestIntro = entry.intro;
      if (!bestOutro && entry.outro) bestOutro = entry.outro;

      for (const src of entry.sources) {
        const streamUrl = String(src.url || '').trim();
        if (!streamUrl || seenUrls.has(streamUrl)) continue;
        seenUrls.add(streamUrl);
        const hdrs = headersForStream(streamUrl, entry.prov.id, entry.rawHeaders);
        serverRoutes.push({
          name: entry.prov.label + ' (HLS)',
          label: entry.prov.label + ' (HLS)',
          url: streamUrl,
          quality: src.quality || 'auto',
          streamType: 'hls',
          headers: hdrs,
          subtitles: entry.subtitles.length ? entry.subtitles : bestSubtitles,
          intro: entry.intro || bestIntro,
          outro: entry.outro || bestOutro,
        });
      }
    }

    if (serverRoutes.length > 0) {
      const primary = serverRoutes[0];
      log('Resolved ' + serverRoutes.length + ' HLS route(s); primary=' + primary.name);
      return {
        url: primary.url,
        streamType: 'hls',
        quality: primary.quality || 'auto',
        headers: primary.headers,
        subtitles: primary.subtitles.length ? primary.subtitles : bestSubtitles,
        intro: primary.intro || bestIntro,
        outro: primary.outro || bestOutro,
        servers: serverRoutes,
        streams: serverRoutes.map((r) => ({
          label: r.name,
          url: r.url,
          quality: r.quality,
          streamType: 'hls',
          headers: r.headers,
        })),
      };
    }

    throw new Error(MODULE_NAME + ': no playable ' + targetLang + ' HLS streams found for animeId=' + animeId + ', ep=' + epNum);
  }

  // ---------- extractHome (discovery_v1) ----------

  async function extractHome() {
    try {
      const data = await requestJson(BASE_URL + '/home');
      const sections = [];

      function mapSection(title, list) {
        if (!Array.isArray(list) || list.length === 0) return null;
        return {
          title: title,
          items: list.slice(0, 24).map((item) => {
            const id = String(item.id || item._id || item.anilistId || '');
            const name = formatTitle(item, 'Anime #' + id);
            let cover = formatCover(item);
            if (!cover && item && typeof item.bannerImage === 'string') cover = item.bannerImage.replace('/t/p/w1280/', '/t/p/w500/');
            return {
              id: id,
              href: SITE_URL + '/anime/' + id,
              title: name,
              image: cover,
              poster: cover,
              format: item.type || item.format || 'TV',
            };
          }).filter((r) => Boolean(r.id)),
        };
      }

      if (data && data.trending) {
        const s = mapSection('Trending Anime', data.trending);
        if (s) sections.push(s);
      }
      if (data && data.popular) {
        const s = mapSection('Popular Anime', data.popular);
        if (s) sections.push(s);
      }
      if (data && data.recent) {
        const s = mapSection('Recent Episodes', data.recent);
        if (s) sections.push(s);
      }

      if (sections.length > 0) return { sections };
    } catch (_) {}

    const defaultSearch = await searchResults('');
    return {
      sections: [
        {
          title: 'Popular Anime',
          items: defaultSearch.slice(0, 24),
        }
      ]
    };
  }

  // ---------- discovery v1 ----------

  function discoveryEntry(item) {
    const id = String((item && (item.id || item._id || item.anilistId)) || '');
    if (!id) return null;
    const title = formatTitle(item, 'Anime #' + id);
    let cover = formatCover(item);
    const banner = item && typeof item.bannerImage === 'string' ? item.bannerImage : '';
    // /home items carry only bannerImage (TMDB w1280; no poster field) — derive a
    // poster-sized sibling so cards never render with empty images.
    if (!cover && banner) cover = banner.replace('/t/p/w1280/', '/t/p/w500/');
    return {
      id: id,
      href: SITE_URL + '/anime/' + id,
      title: title,
      image: cover,
      poster: cover,
      backdropUrl: banner || undefined,
      format: (item && (item.type || item.format)) || 'TV',
      year: (item && (item.year || item.seasonYear)) || 0,
      totalEpisodes: (item && (item.episodes || item.totalEpisodes)) || 0,
    };
  }

  function discoveryList(list, cap) {
    return (Array.isArray(list) ? list : []).map(discoveryEntry).filter(Boolean).slice(0, cap);
  }

  async function discoveryHome() {
    let home = null;
    try { home = await requestJson(BASE_URL + '/home'); } catch (_) {}
    if (home && typeof home === 'object') {
      const sections = [];
      const featured = discoveryList(home.trending, 8);
      if (featured.length) sections.push({ id: 'featured', title: 'Trending Anime', style: 'hero', items: featured });
      const popular = discoveryList(home.popular, 30);
      if (popular.length) sections.push({ id: 'popular', title: 'Popular Anime', style: 'poster', items: popular, viewAll: { mode: 'feed', feedId: 'popular' } });
      const airing = discoveryList(home.airing, 30);
      if (airing.length) sections.push({ id: 'airing', title: 'Airing Now', style: 'poster', items: airing, viewAll: { mode: 'feed', feedId: 'airing' } });
      const latest = discoveryList(home.latestEpisode, 30);
      if (latest.length) sections.push({ id: 'latest', title: 'Latest Episodes', style: 'poster', items: latest, viewAll: { mode: 'feed', feedId: 'latest' } });
      if (sections.length) return { sections: sections };
    }
    const fallback = await searchResults('');
    const items = fallback.slice(0, 30);
    return { sections: items.length ? [{ id: 'popular', title: 'Popular Anime', style: 'poster', items: items }] : [] };
  }

  // The source exposes no paginated list endpoints (verified 2026-09-22: /anime/*?page= -> {"data":null},
  // /home?page=2 -> empty lists). Feeds therefore expose what the API actually has: one page, hasMore false.
  async function discoveryFeed(feedId, page) {
    const n = Math.max(1, Math.floor(Number(page) || 1));
    if (n > 1) return { items: [], page: n, hasMore: false };
    const want = String(feedId || '').toLowerCase();
    try {
      const home = await requestJson(BASE_URL + '/home');
      const source =
        want === 'airing' ? home && home.airing :
        want === 'latest' ? home && home.latestEpisode :
        (want === 'trending' || want === 'featured') ? home && home.trending :
        home && home.popular;
      return { items: discoveryList(source, 30), page: 1, hasMore: false };
    } catch (_) {
      return { items: [], page: n, hasMore: false };
    }
  }

  // ---------- Exports on globalThis ----------

  globalThis.searchResults = searchResults;
  globalThis.extractDetails = extractDetails;
  globalThis.extractEpisodes = extractEpisodes;
  globalThis.extractStreamUrl = extractStreamUrl;
  globalThis.extractHome = extractHome;
  globalThis.discoveryHome = discoveryHome;
  globalThis.discoveryFeed = discoveryFeed;

})();
