const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const GENRES = [
  'Trending music',
  'Bollywood hits',
  'Punjabi songs',
  'Romantic Hindi songs',
  'Lo-fi chill music',
  'Workout music',
  '90s Hindi songs'
];

const PLAYLISTS = [
  ['Today’s Top Hits', 'today top music hits'],
  ['Bollywood Hits', 'latest bollywood songs'],
  ['Punjabi Party', 'popular punjabi songs'],
  ['Romantic Vibes', 'romantic hindi songs'],
  ['Lo-Fi & Chill', 'lofi chill music']
];

let ytReady = false;
let yt = null;
let current = null;
let queue = [];
let idx = -1;
let last = [];
let timer = null;
let repeat = false;
let deferredInstall = null;

// Player state & helpers (added)
let playerState = 'idle'; // idle, loading, metadata-loading, ready, playing, paused, ended, error
let rafId = null;
let isSeeking = false;
let lastQueryId = 0; // used to ignore stale search responses

const PLACEHOLDER_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns='http://www.w3.org/2000/svg' width='800' height='800' viewBox='0 0 24 24' fill='none'>
  <rect width='100%' height='100%' fill='%23171820' rx='8'/>
  <g fill='%23777a86' opacity='0.9'>
    <rect x='4' y='7' width='2' height='10' rx='1'/>
    <rect x='8' y='5' width='2' height='12' rx='1'/>
    <rect x='12' y='9' width='2' height='8' rx='1'/>
    <rect x='16' y='6' width='2' height='11' rx='1'/>
    <rect x='20' y='8' width='2' height='9' rx='1'/>
  </g>
</svg>
`)}`;

function readStorageArray(key) {
  try {
    const value = localStorage.getItem(key);

    if (!value) {
      return [];
    }

    const parsed = JSON.parse(value);

    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Storage parse error for', key, error);
    return [];
  }
}

function writeStorageArray(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn('Storage write error for', key, error);
  }
}

let fav = readStorageArray('ob5fav');
let recent = readStorageArray('ob5recent');
let history = readStorageArray('ob5history');


/* =========================================================
   YOUTUBE API READY
========================================================= */

window.onYouTubeIframeAPIReady = () => {
  ytReady = true;

  if (current) {
    createYouTubePlayer(current.id);
  }
};


/* =========================================================
   HELPERS
========================================================= */

const esc = value =>
  String(value ?? '').replace(
    /[&<>"']/g,
    m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m])
  );


function toast(message) {
  const element = $('#toast');

  if (!element) return;

  element.textContent = message;
  element.classList.add('show');

  setTimeout(() => {
    element.classList.remove('show');
  }, 2200);
}


function save() {
  writeStorageArray('ob5fav', fav);
  writeStorageArray('ob5recent', recent);
  writeStorageArray('ob5history', history);
}


/* =========================================================
   API
========================================================= */

function fallbackSongs(query) {
  const base = [
    {
      id: 'fallback-1',
      title: 'Sunset Drive',
      channel: 'Neon Avenue',
      thumbnail: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=800&q=80'
    },
    {
      id: 'fallback-2',
      title: 'Midnight Stories',
      channel: 'Velvet Echo',
      thumbnail: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=80'
    },
    {
      id: 'fallback-3',
      title: 'Golden Hour',
      channel: 'Horizon Beats',
      thumbnail: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=800&q=80'
    },
    {
      id: 'fallback-4',
      title: 'City Lights',
      channel: 'Night Shift',
      thumbnail: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=800&q=80'
    },
    {
      id: 'fallback-5',
      title: 'Summer Vibes',
      channel: 'Ocean Flow',
      thumbnail: 'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=800&q=80'
    }
  ];

  const safeQuery = String(query || 'music').trim();

  if (!safeQuery || safeQuery === 'popular music') {
    return base;
  }

  return base.map((song, index) => ({
    ...song,
    id: `${song.id}-${index}`,
    title: `${safeQuery} ${index + 1}`,
    channel: song.channel
  }));
}

async function api(query) {

  const isGitHubPages =
    location.hostname.endsWith('github.io');

  const requestUrl =
    location.protocol === 'file:' || isGitHubPages
      ? `https://divya-ebon-seven.vercel.app/api/search?q=${encodeURIComponent(query)}`
      : `/api/search?q=${encodeURIComponent(query)}`;

  try {
    const response = await fetch(requestUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    let data;

    try {
      data = await response.json();
    } catch {
      if (location.protocol === 'file:') {
        return { items: fallbackSongs(query), cached: true };
      }
      throw new Error('Invalid API response');
    }

    if (!response.ok) {
      if (location.protocol === 'file:') {
        return { items: fallbackSongs(query), cached: true };
      }
      throw new Error(
        data.error || 'YouTube API request failed'
      );
    }

    return data;
  } catch (error) {
    if (location.protocol === 'file:' || !navigator.onLine) {
      return { items: fallbackSongs(query), cached: true };
    }

    throw error;
  }
}


/* =========================================================
   SONG CARD
========================================================= */

function songCard(song, index) {

  return `
    <article class="song" data-i="${index}" data-id="${esc(song.id)}">
      <div class="cover">
        <img
          loading="lazy"
          src="${esc(song.thumbnail || PLACEHOLDER_SVG)}"
          alt="${esc(song.title)}"
          onerror="this.onerror=null;this.src='${PLACEHOLDER_SVG}'"
        >

        <div class="equalizer" aria-hidden="true">
          <span></span><span></span><span></span><span></span>
        </div>

        <button
          class="play"
          type="button"
          aria-label="Play"
        >▶</button>

        <button
          class="add"
          type="button"
          aria-label="Add to queue"
        >＋</button>
      </div>

      <b>${esc(song.title)}</b>
      <span>${esc(song.channel)}</span>
    </article>
  `;
}


/* =========================================================
   RENDER SONGS
========================================================= */

function renderSongs(element, items) {

  if (!element) return;

  const songs = Array.isArray(items) ? items : [];

  element.innerHTML = songs.length
    ? songs.map(songCard).join('')
    : '<p class="empty">Nothing here yet.</p>';

  [...element.querySelectorAll('.song')].forEach(
    (songElement, index) => {

      songElement.onclick = event => {

        const song = songs[index];

        if (!song) return;

        if (event.target.closest('.add')) {

          queue.push(song);

          renderQueue();

          toast('Added to queue');

          return;
        }

        if (!queue.length) {
          queue = [...songs];
        }

        idx = queue.findIndex(
          item => item.id === song.id
        );

        play(song);
      };
    }
  );
}


/* =========================================================
   QUEUE
========================================================= */

function renderQueue() {

  const countElement = $('#queueCount');
  const listElement = $('#queueList');

  if (countElement) {
    countElement.textContent = queue.length;
  }

  if (!listElement) return;

  if (!queue.length) {

    listElement.innerHTML =
      '<p class="empty">Your queue is empty.</p>';

    return;
  }

  listElement.innerHTML = queue
    .slice(0, 10)
    .map((song, index) => `
      <div class="queue-item">
        <img
          src="${esc(song.thumbnail)}"
          alt=""
        >

        <div>
          <b>
            ${index === idx ? '▶ ' : ''}
            ${esc(song.title)}
          </b>

          <span>
            ${esc(song.channel)}
          </span>
        </div>
      </div>
    `)
    .join('');
}


/* =========================================================
   PLAYLISTS / GENRES
========================================================= */

function renderPlaylists() {

  const playlistGrid = $('#playlistGrid');

  if (playlistGrid) {

    playlistGrid.innerHTML = PLAYLISTS
      .map(
        (playlist, index) => `
          <button
            class="playlist"
            data-i="${index}"
            type="button"
          >
            ${esc(playlist[0])}

            <small>
              Tap to play
            </small>
          </button>
        `
      )
      .join('');

    $$('.playlist').forEach(element => {

      element.onclick = () => {

        const playlist = PLAYLISTS[
          Number(element.dataset.i)
        ];

        if (!playlist) return;

        loadQuery(
          playlist[1],
          playlist[0],
          true
        );
      };
    });
  }


  const sideGenres = $('#sideGenres');

  if (sideGenres) {

    sideGenres.innerHTML = GENRES
      .map(
        genre => `
          <button
            class="genre"
            data-q="${esc(genre)}"
            type="button"
          >
            ♪ ${esc(genre)}
          </button>
        `
      )
      .join('');

    $$('.genre').forEach(element => {

      element.onclick = () => {

        loadQuery(
          element.dataset.q,
          element.dataset.q,
          true
        );
      };
    });
  }
}


/* =========================================================
   ARTISTS
========================================================= */

function renderArtists(items) {

  const artistGrid = $('#artistGrid');

  if (!artistGrid) return;

  const artists = [];

  (items || []).forEach(song => {

    if (
      song.channel &&
      !artists.some(
        artist => artist.channel === song.channel
      )
    ) {
      artists.push(song);
    }
  });

  artistGrid.innerHTML = artists
    .slice(0, 8)
    .map(
      song => `
        <div class="artist">

          <img
            loading="lazy"
            src="${esc(song.thumbnail)}"
            alt="${esc(song.channel)}"
          >

          <b>
            ${esc(song.channel)}
          </b>

        </div>
      `
    )
    .join('');
}


/* =========================================================
   PLAYER UI
========================================================= */

function formatTime(s) {
  if (!isFinite(s) || s === 0) return '0:00';
  s = Math.floor(s);
  const m = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, '0');
  return `${m}:${sec}`;
}

function setPlayerState(state) {
  playerState = state;

  markPlayingForSong(state === 'playing' ? current?.id : null);

  // Toggle classes or UI indicators if necessary
  const mini = document.querySelector('footer .mini');
  if (mini) {
    mini.classList.toggle('playing', state === 'playing');
  }

  // For right panel
  const panel = document.querySelector('#rightPanel');
  if (panel) {
    panel.classList.toggle('playing', state === 'playing');
  }

  const status = $('#playbackStatus');
  if (status) {
    status.textContent = state === 'playing' ? 'Playing'
      : state === 'loading' || state === 'metadata-loading' ? 'Loading'
        : state === 'ended' ? 'Ended'
          : state === 'paused' ? 'Paused'
            : state === 'error' ? 'Playback error' : 'Ready';
  }

  if (state !== 'playing') {
    stopProgressLoop();
  } else {
    startProgressLoop();
  }
}

function startProgressLoop() {
  if (rafId) return;

  const timeNow = $('#timeNow');
  const timeEnd = $('#timeEnd');
  const seekRange = $('#seekRange');

  function loop() {
    try {
      if (yt && typeof yt.getCurrentTime === 'function') {
        const currentTime = yt.getCurrentTime();
        const duration = yt.getDuration();

        if (!isSeeking) {
          if (seekRange && isFinite(duration) && duration > 0) {
            const pct = Math.max(0, Math.min(1, currentTime / duration));
            seekRange.value = Math.round(pct * 1000);
          }
        }

        if (timeNow) timeNow.textContent = formatTime(currentTime);
        if (timeEnd) timeEnd.textContent = isFinite(duration) && duration > 0 ? formatTime(duration) : '0:00';
      }
    } catch (e) {
      // silent
    }

    rafId = requestAnimationFrame(loop);
  }

  rafId = requestAnimationFrame(loop);
}

function stopProgressLoop() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function setImageSafe(imgElement, url, expectedId) {
  if (!imgElement) return;

  // Guard against stale updates: if expectedId provided, only apply when current matches
  if (expectedId && (!current || current.id !== expectedId)) return;

  if (!url) {
    imgElement.src = PLACEHOLDER_SVG;
    return;
  }

  let applied = false;

  const onLoad = () => {
    imgElement.classList.add('loaded');
    cleanup();
  };

  const onError = () => {
    imgElement.src = PLACEHOLDER_SVG;
    cleanup();
  };

  function cleanup() {
    applied = true;
    imgElement.removeEventListener('load', onLoad);
    imgElement.removeEventListener('error', onError);
  }

  // Apply src then attach handlers
  imgElement.src = url;
  imgElement.classList.remove('loaded');
  imgElement.addEventListener('load', onLoad);
  imgElement.addEventListener('error', onError);

  // If image never fires, fallback after timeout
  setTimeout(() => {
    if (!applied && imgElement.src !== PLACEHOLDER_SVG) {
      imgElement.src = PLACEHOLDER_SVG;
      cleanup();
    }
  }, 6500);
}

function markPlayingForSong(songId) {
  // Remove playing from any song
  $$('.song.playing').forEach(el => el.classList.remove('playing'));

  if (!songId) return;

  const el = document.querySelector(`.song[data-id="${songId}"]`);
  if (el) el.classList.add('playing');
}

function updatePlayerUI(song) {

  if (!song) return;

  ['nowTitle', 'miniTitle'].forEach(id => {

    const element = $('#' + id);

    if (element) {
      element.textContent = song.title;
    }
  });


  ['nowArtist', 'miniArtist'].forEach(id => {

    const element = $('#' + id);

    if (element) {
      element.textContent = song.channel;
    }
  });


  // Use safe image setter with guard against stale updates
  const bigThumb = $('#bigThumb');
  const miniThumb = $('#miniThumb');

  setImageSafe(bigThumb, song.thumbnail, song.id);
  setImageSafe(miniThumb, song.thumbnail, song.id);
}


/* =========================================================
   PLAY BUTTON UI
========================================================= */

function updatePlayButtons(isPlaying) {

  ['playBtn', 'bottomPlay'].forEach(id => {

    const element = $('#' + id);

    if (element) {
      element.textContent =
        isPlaying ? 'Ⅱ' : '▶';
      element.setAttribute('aria-pressed', String(isPlaying));
    }
  });
}


/* =========================================================
   MEDIA SESSION
========================================================= */

function setupMediaSession(song) {

  if (!('mediaSession' in navigator)) {
    return;
  }

  try {

    navigator.mediaSession.metadata =
      new MediaMetadata({
        title: song.title,
        artist: song.channel,
        album: 'OpenBeat',
        artwork: [
          {
            src: song.thumbnail,
            sizes: '512x512',
            type: 'image/jpeg'
          }
        ]
      });


    navigator.mediaSession.setActionHandler(
      'nexttrack',
      next
    );

    navigator.mediaSession.setActionHandler(
      'previoustrack',
      prev
    );

    navigator.mediaSession.setActionHandler(
      'play',
      () => {
        if (yt) {
          try { yt.playVideo(); } catch {}
        }
      }
    );

    navigator.mediaSession.setActionHandler(
      'pause',
      () => {
        if (yt) {
          try { yt.pauseVideo(); } catch {}
        }
      }
    );

  } catch (error) {

    console.warn(
      'Media Session error:',
      error
    );
  }
}


/* =========================================================
   YOUTUBE PLAYER
========================================================= */

function createYouTubePlayer(videoId) {

  if (!videoId) return;


  if (
    !window.YT ||
    !window.YT.Player
  ) {

    setTimeout(() => {
      createYouTubePlayer(videoId);
    }, 500);

    return;
  }


  if (yt) {

    try {

      yt.loadVideoById(videoId);
      yt.playVideo();

      return;

    } catch (error) {

      console.warn(
        'Existing YouTube player error:',
        error
      );

      yt = null;
    }
  }


  const playerElement =
    $('#youtubePlayer');

  if (!playerElement) {
    return;
  }


  playerElement.innerHTML = '';


  yt = new YT.Player(
    'youtubePlayer',
    {

      videoId,

      playerVars: {
        autoplay: 1,
        controls: 1,
        rel: 0,
        playsinline: 1,
        modestbranding: 1
      },


      events: {

        onReady: event => {

          const volume =
            Number(
              $('#volume')?.value || 80
            );

          event.target.setVolume(volume);
          event.target.playVideo();

          updatePlayButtons(true);
          setPlayerState('ready');
        },


        onStateChange: event => {

          if (
            event.data ===
            YT.PlayerState.PLAYING
          ) {

            updatePlayButtons(true);
            setPlayerState('playing');

            // mark playing on card
            if (current) markPlayingForSong(current.id);

            if (
              'mediaSession' in navigator
            ) {

              try {
                navigator.mediaSession
                  .playbackState =
                  'playing';
              } catch {}
            }
          }


          if (
            event.data ===
            YT.PlayerState.PAUSED
          ) {

            updatePlayButtons(false);
            setPlayerState('paused');

            if (
              'mediaSession' in navigator
            ) {

              try {
                navigator.mediaSession
                  .playbackState =
                  'paused';
              } catch {}
            }
          }


          if (
            event.data ===
            YT.PlayerState.ENDED
          ) {

            updatePlayButtons(false);
            setPlayerState('ended');

            if (repeat) {

              play(current);

            } else {

              next();
            }
          }
        },


        onError: event => {

          console.warn(
            'YouTube Player Error:',
            event.data
          );

          toast(
            'This video cannot be played. Trying next.'
          );

          setTimeout(() => {
            next();
          }, 1000);
        }
      }
    }
  );
}


/* =========================================================
   PLAY
========================================================= */

function play(song) {

  if (!song || !song.id) {
    return;
  }

  current = song;


  if (idx < 0) {

    const existingIndex =
      queue.findIndex(
        item => item.id === song.id
      );

    if (existingIndex >= 0) {

      idx = existingIndex;

    } else {

      queue.push(song);
      idx = queue.length - 1;
    }
  }


  updatePlayerUI(song);


  recent = [
    song,
    ...recent.filter(
      item => item.id !== song.id
    )
  ].slice(0, 40);


  save();
  setLike();
  setupMediaSession(song);
  renderQueue();


  if (ytReady) {

    createYouTubePlayer(song.id);

  } else {

    setTimeout(() => {
      createYouTubePlayer(song.id);
    }, 500);
  }
}


/* =========================================================
   NEXT / PREVIOUS
========================================================= */

function next() {

  if (!queue.length) {

    toast('Queue is empty');

    return;
  }

  idx =
    (idx + 1) %
    queue.length;

  play(queue[idx]);
}


function prev() {

  if (!queue.length) {

    toast('Queue is empty');

    return;
  }

  idx =
    (idx - 1 + queue.length) %
    queue.length;

  play(queue[idx]);
}


/* =========================================================
   PLAY / PAUSE
========================================================= */

function toggle() {

  if (!yt) {

    if (current) {

      createYouTubePlayer(
        current.id
      );

    } else if (last[0]) {

      play(last[0]);

    } else {

      loadQuery(
        'popular music',
        'Trending now',
        true
      );
    }

    return;
  }


  try {

    const state =
      yt.getPlayerState();


    if (
      state ===
      YT.PlayerState.PLAYING
    ) {

      yt.pauseVideo();

    } else {

      yt.playVideo();
    }

  } catch (error) {

    console.warn(
      'Player toggle error:',
      error
    );
  }
}


/* =========================================================
   LIKE
========================================================= */

function setLike() {

  const liked =
    current &&
    fav.some(
      song => song.id === current.id
    );


  const likeButton =
    $('#likeBtn');

  const miniLike =
    $('#miniLike');


  if (likeButton) {
    likeButton.textContent =
      liked ? '♥' : '♡';
  }


  if (miniLike) {
    miniLike.textContent =
      liked ? '♥' : '♡';
  }
}


function like() {

  if (!current) {

    toast('Choose a song first');

    return;
  }


  const index =
    fav.findIndex(
      song => song.id === current.id
    );


  if (index >= 0) {

    fav.splice(index, 1);

    toast(
      'Removed from liked songs'
    );

  } else {

    fav.unshift(current);

    toast(
      'Added to liked songs'
    );
  }


  save();
  setLike();


  const libraryView =
    $('#libraryView');

  if (
    libraryView &&
    !libraryView.classList.contains('hidden')
  ) {

    renderSongs(
      $('#libraryGrid'),
      fav
    );
  }
}


/* =========================================================
   VIEWS
========================================================= */

function view(viewName, closeSidebar = false) {

  if (closeSidebar) {
    closeMobileSidebar();
  }

  [
    'home',
    'search',
    'library',
    'recent'
  ].forEach(name => {

    const element =
      $('#' + name + 'View');

    if (element) {

      element.classList.toggle(
        'hidden',
        name !== viewName
      );
    }
  });


  $$('.nav').forEach(element => {

    element.classList.toggle(
      'active',
      element.dataset.view === viewName
    );
  });


  if (viewName === 'library') {

    renderSongs(
      $('#libraryGrid'),
      fav
    );
  }


  if (viewName === 'recent') {

    renderSongs(
      $('#recentGrid'),
      recent
    );
  }


  if (viewName === 'search') {

    renderHistory();
  }
}


/* =========================================================
   SEARCH HISTORY
========================================================= */

function renderHistory() {

  const element =
    $('#suggestions');

  if (!element) return;

  element.className = 'history';


  if (!history.length) {

    element.innerHTML = '';

    return;
  }


  element.innerHTML =
    history.map(
      item => `
        <button
          data-h="${esc(item)}"
          type="button"
        >
          ⌕ ${esc(item)}
        </button>
      `
    ).join('');


  element
    .querySelectorAll('button')
    .forEach(button => {

      button.onclick = () => {

        doSearch(
          button.dataset.h
        );
      };
    });
}


/* =========================================================
   LOAD QUERY
========================================================= */

async function loadQuery(
  query,
  title,
  home = false
) {

  if (home) {

    const titleElement =
      $('#trendingTitle');

    if (titleElement) {
      titleElement.textContent =
        title;
    }

    view('home');
  }


  try {

    const myQueryId = ++lastQueryId;
    const data =
      await api(query);

    // Ignore stale responses
    if (myQueryId !== lastQueryId) return;


    last =
      Array.isArray(data.items)
        ? data.items
        : [];


    const target =
      home
        ? $('#trendingGrid')
        : $('#searchGrid');


    renderSongs(
      target,
      last
    );


    queue =
      [...last];

    idx = -1;

    renderQueue();


    if (home) {

      renderArtists(
        last
      );
    }

  } catch (error) {

    console.error(
      'OpenBeat API Error:',
      error
    );


    const target =
      home
        ? $('#trendingGrid')
        : $('#searchGrid');


    if (target) {

      target.innerHTML = `
        <p class="empty">
          ${esc(error.message)}
        </p>
      `;
    }


    toast(
      error.message
    );
  }
}


/* =========================================================
   SEARCH
========================================================= */

async function doSearch(query) {

  query =
    query.trim();


  if (query.length < 3) {

    toast(
      'Type at least 3 characters'
    );

    return;
  }


  history = [
    query,
    ...history.filter(
      item =>
        item.toLowerCase() !==
        query.toLowerCase()
    )
  ].slice(0, 12);


  save();

  view('search');


  const titleElement =
    $('#searchTitle');

  const statusElement =
    $('#searchStatus');


  if (titleElement) {

    titleElement.textContent =
      `Results for “${query}”`;
  }


  if (statusElement) {

    statusElement.textContent =
      'Searching…';
  }


  try {

    const myQueryId = ++lastQueryId;
    const data =
      await api(query);

    if (myQueryId !== lastQueryId) return;


    last =
      Array.isArray(data.items)
        ? data.items
        : [];


    renderSongs(
      $('#searchGrid'),
      last
    );


    if (statusElement) {

      statusElement.textContent =
        `${last.length} results` +
        (
          data.cached
            ? ' • cached'
            : ''
        );
    }


    renderHistory();

  } catch (error) {

    console.error(
      'Search Error:',
      error
    );


    const grid =
      $('#searchGrid');


    if (grid) {

      grid.innerHTML = `
        <p class="empty">
          ${esc(error.message)}
        </p>
      `;
    }


    if (statusElement) {

      statusElement.textContent =
        'Unavailable';
    }


    toast(
      error.message
    );
  }
}


/* =========================================================
   SEARCH FORM
========================================================= */

const searchForm =
  $('#searchForm');

if (searchForm) {

  searchForm.onsubmit = event => {

    event.preventDefault();

    doSearch(
      $('#searchInput')?.value || ''
    );
  };
}


const searchInput =
  $('#searchInput');

if (searchInput) {

  searchInput.oninput = () => {

    clearTimeout(timer);

    const query =
      searchInput.value.trim();


    if (query.length >= 3) {

      timer =
        setTimeout(() => {

          doSearch(query);

        }, 650);
    }
  };
}


/* =========================================================
   NAVIGATION
========================================================= */

$$('.nav').forEach(element => {

  element.onclick = () => {

    view(
      element.dataset.view,
      true
    );
  };
});


/* =========================================================
   CLEAR SEARCH HISTORY
========================================================= */

const clearHistory =
  $('#clearHistory');

if (clearHistory) {

  clearHistory.onclick = () => {

    history = [];

    save();

    renderHistory();

    toast(
      'Search history cleared'
    );
  };
}


/* =========================================================
   NEW PLAYLIST
========================================================= */

const newPlaylist =
  $('#newPlaylist');

if (newPlaylist) {

  newPlaylist.onclick = () => {

    toast(
      'Custom playlist feature is local-storage ready.'
    );
  };
}


/* =========================================================
   HERO PLAY
========================================================= */

const heroPlay =
  $('#heroPlay');

if (heroPlay) {

  heroPlay.onclick = () => {

    if (last[0]) {

      play(last[0]);

    } else {

      loadQuery(
        'popular music',
        'Trending now',
        true
      );
    }
  };
}


/* =========================================================
   REFRESH
========================================================= */

$$('.see').forEach(element => {

  element.onclick = () => {

    loadQuery(
      element.dataset.query,
      'Trending now',
      true
    );
  };
});


/* =========================================================
   PLAYER BUTTONS
========================================================= */

['playBtn', 'bottomPlay']
  .forEach(id => {

    const element = $('#' + id);

    if (element) {
      element.onclick = toggle;
    }
  });


['prevBtn', 'bottomPrev']
  .forEach(id => {

    const element = $('#' + id);

    if (element) {
      element.onclick = prev;
    }
  });


['nextBtn', 'bottomNext']
  .forEach(id => {

    const element = $('#' + id);

    if (element) {
      element.onclick = next;
    }
  });


/* =========================================================
   SHUFFLE
========================================================= */

['shuffleBtn', 'bottomShuffle']
  .forEach(id => {

    const element = $('#' + id);

    if (!element) return;

    element.onclick = () => {

      if (queue.length < 2) {

        toast(
          'Add more songs to shuffle'
        );

        return;
      }


      const currentId =
        current?.id;


      for (
        let i = queue.length - 1;
        i > 0;
        i--
      ) {

        const random =
          Math.floor(
            Math.random() *
            (i + 1)
          );

        [
          queue[i],
          queue[random]
        ] = [
          queue[random],
          queue[i]
        ];
      }


      idx =
        queue.findIndex(
          song =>
            song.id === currentId
        );


      renderQueue();

      toast(
        'Queue shuffled'
      );
    };
  });


/* =========================================================
   REPEAT
========================================================= */

['repeatBtn', 'bottomRepeat']
  .forEach(id => {

    const element = $('#' + id);

    if (!element) return;

    element.onclick = () => {

      repeat = !repeat;

      toast(
        repeat
          ? 'Repeat one enabled'
          : 'Repeat disabled'
      );
    };
  });


/* =========================================================
   LIKE BUTTONS
========================================================= */

const likeButton =
  $('#likeBtn');

if (likeButton) {
  likeButton.onclick = like;
}


const miniLike =
  $('#miniLike');

if (miniLike) {
  miniLike.onclick = like;
}


/* =========================================================
   CLEAR QUEUE
========================================================= */

const clearQueue =
  $('#clearQueue');

if (clearQueue) {

  clearQueue.onclick = () => {

    queue = [];

    idx = -1;

    renderQueue();

    toast(
      'Queue cleared'
    );
  };
}


/* =========================================================
   RIGHT PANEL
========================================================= */

const panelButton =
  $('#panelBtn');

if (panelButton) {

  panelButton.onclick = () => {

    document.body.classList.toggle(
      'right-open'
    );
  };
}


const closePanel =
  $('#closePanel');

if (closePanel) {

  closePanel.onclick = () => {

    document.body.classList.remove(
      'right-open'
    );
  };
}


/* =========================================================
   VIDEO MODAL
========================================================= */

const videoButton =
  $('#videoBtn');

if (videoButton) {

  videoButton.onclick = () => {

    if (!current) {

      toast(
        'Choose a song first'
      );

      return;
    }


    const modal =
      $('#videoModal');

    if (modal) {

      modal.classList.remove(
        'hidden'
      );
    }
  };
}


const closeVideo =
  $('#closeVideo');

if (closeVideo) {

  closeVideo.onclick = () => {

    const modal =
      $('#videoModal');

    if (modal) {

      modal.classList.add(
        'hidden'
      );
    }
  };
}


/* =========================================================
   VOLUME
========================================================= */

const volume =
  $('#volume');

if (volume) {

  volume.oninput = event => {

    if (yt) {

      try {

        yt.setVolume(
          Number(event.target.value)
        );

      } catch {}
    }
  };
}


/* =========================================================
   MUTE
========================================================= */

const muteButton =
  $('#muteBtn');

if (muteButton) {

  muteButton.onclick = () => {

    if (!yt) return;

    try {

      if (yt.isMuted()) {

        yt.unMute();

        muteButton.textContent =
          '🔊';

      } else {

        yt.mute();

        muteButton.textContent =
          '🔇';
      }

    } catch (error) {

      console.warn(
        'Mute error:',
        error
      );
    }
  };
}


/* =========================================================
   SEEK / PROGRESS HANDLING (wire up handlers)
========================================================= */

const seekRange = $('#seekRange');
if (seekRange) {
  // range is 0..1000 as per markup
  seekRange.addEventListener('pointerdown', () => { isSeeking = true; });
  seekRange.addEventListener('pointerup', async () => { isSeeking = false; if (yt) {
    try {
      const duration = yt.getDuration();
      const pct = Number(seekRange.value) / 1000;
      const seconds = Math.max(0, Math.min(duration || 0, pct * (duration || 0)));
      yt.seekTo(seconds, true);
    } catch {}
  }});

  seekRange.addEventListener('change', async () => {
    if (yt) {
      try {
        const duration = yt.getDuration();
        const pct = Number(seekRange.value) / 1000;
        const seconds = Math.max(0, Math.min(duration || 0, pct * (duration || 0)));
        yt.seekTo(seconds, true);
      } catch {}
    }
  });
}


/* =========================================================
   VIDEO MODAL (end)
========================================================= */


/* =========================================================
   MOBILE MENU
========================================================= */

const menuButton =
  $('#menuBtn');

const sidebarBackdrop =
  $('#sidebarBackdrop');

const sidebarClose =
  $('#sidebarClose');

function closeMobileSidebar() {

  document.body.classList.remove('side-open');

  if (menuButton) {
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Open navigation');
  }
}

if (menuButton) {

  menuButton.onclick = () => {

    const isOpen = document.body.classList.toggle('side-open');
    menuButton.setAttribute('aria-expanded', String(isOpen));
    menuButton.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
  };
}

if (sidebarBackdrop) {
  sidebarBackdrop.onclick = closeMobileSidebar;
}

if (sidebarClose) {
  sidebarClose.onclick = closeMobileSidebar;
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    closeMobileSidebar();
  }
});

window.addEventListener('resize', () => {
  if (window.innerWidth > 800) {
    closeMobileSidebar();
  }
});


/* =========================================================
   MOBILE SEARCH
========================================================= */

const mobileSearch =
  $('#mobileSearch');

if (mobileSearch) {

  mobileSearch.onclick = () => {

    view('search', true);

    $('#searchInput')?.focus();
  };
}


/* =========================================================
   THEME
========================================================= */

const themeButton =
  $('#themeBtn');

function applyTheme(isLight) {
  document.body.classList.toggle('light-theme', isLight);

  if (themeButton) {
    themeButton.innerHTML = isLight
      ? '<svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"></path></svg>'
      : '<svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 15.2A8.5 8.5 0 0 1 8.8 3.6 8.5 8.5 0 1 0 20.4 15.2Z"></path></svg>';
    themeButton.setAttribute('aria-pressed', String(isLight));
    themeButton.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
  }
}

const savedTheme = localStorage.getItem('ob5theme');
applyTheme(savedTheme === 'light');

if (themeButton) {

  themeButton.onclick = () => {
    const isLight = !document.body.classList.contains('light-theme');
    applyTheme(isLight);
    localStorage.setItem('ob5theme', isLight ? 'light' : 'dark');
    toast(isLight ? 'Light theme active' : 'Dark theme active');
  };
}


/* =========================================================
   PWA INSTALL
========================================================= */

window.addEventListener(
  'beforeinstallprompt',
  event => {

    event.preventDefault();

    deferredInstall = event;

    const installButton =
      $('#installBtn');

    if (installButton) {

      installButton.style.display =
        'block';
    }
  }
);


const installButton =
  $('#installBtn');

if (installButton) {

  installButton.onclick = async () => {

    if (deferredInstall) {

      deferredInstall.prompt();

      try {
        await deferredInstall.userChoice;
      } catch {}

      deferredInstall = null;

    } else {

      toast(
        'Use browser menu → Install app'
      );
    }
  };
}


/* =========================================================
   SERVICE WORKER
========================================================= */

if (
  'serviceWorker' in navigator
) {

  window.addEventListener(
    'load',
    () => {

      navigator.serviceWorker
        .register('./sw.js')
        .catch(error => {

          console.warn(
            'Service Worker:',
            error
          );
        });
    }
  );
}


/* =========================================================
   INITIALISE APP
========================================================= */

renderPlaylists();

renderQueue();

loadQuery(
  'popular music',
  'Trending now',
  true
);
