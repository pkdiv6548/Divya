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

let fav = JSON.parse(localStorage.getItem('ob5fav') || '[]');
let recent = JSON.parse(localStorage.getItem('ob5recent') || '[]');
let history = JSON.parse(localStorage.getItem('ob5history') || '[]');


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
  localStorage.setItem('ob5fav', JSON.stringify(fav));
  localStorage.setItem('ob5recent', JSON.stringify(recent));
  localStorage.setItem('ob5history', JSON.stringify(history));
}


/* =========================================================
   API
========================================================= */

async function api(query) {

  const response = await fetch(
    '/api/search?q=' + encodeURIComponent(query),
    {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    }
  );

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error('Invalid API response');
  }

  if (!response.ok) {
    throw new Error(
      data.error || 'YouTube API request failed'
    );
  }

  return data;
}


/* =========================================================
   SONG CARD
========================================================= */

function songCard(song, index) {

  return `
    <article class="song" data-i="${index}">
      <div class="cover">
        <img
          loading="lazy"
          src="${esc(song.thumbnail)}"
          alt="${esc(song.title)}"
        >

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


  ['bigThumb', 'miniThumb'].forEach(id => {

    const element = $('#' + id);

    if (element) {
      element.src = song.thumbnail;
    }
  });
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
          yt.playVideo();
        }
      }
    );

    navigator.mediaSession.setActionHandler(
      'pause',
      () => {
        if (yt) {
          yt.pauseVideo();
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
        },


        onStateChange: event => {

          if (
            event.data ===
            YT.PlayerState.PLAYING
          ) {

            updatePlayButtons(true);

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

function view(viewName) {

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

    const data =
      await api(query);


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

    const data =
      await api(query);


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
      element.dataset.view
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
   MOBILE MENU
========================================================= */

const menuButton =
  $('#menuBtn');

if (menuButton) {

  menuButton.onclick = () => {

    document.body.classList.toggle(
      'side-open'
    );
  };
}


/* =========================================================
   MOBILE SEARCH
========================================================= */

const mobileSearch =
  $('#mobileSearch');

if (mobileSearch) {

  mobileSearch.onclick = () => {

    view('search');

    $('#searchInput')?.focus();
  };
}


/* =========================================================
   THEME
========================================================= */

const themeButton =
  $('#themeBtn');

if (themeButton) {

  themeButton.onclick = () => {

    toast(
      'Dark premium theme active'
    );
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