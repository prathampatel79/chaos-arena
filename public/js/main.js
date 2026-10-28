// public/js/main.js - Main Application Controller and Game Loop

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Subsystems
  const audio = window.audioManager;
  const network = new NetworkClient();
  const renderer = new ArenaRenderer('game-canvas');
  const joystick = new VirtualJoystick('joystick-zone', 'joystick-base', 'joystick-thumb');

  // DOM Elements
  const screens = {
    menu: document.getElementById('menu-screen'),
    lobby: document.getElementById('lobby-screen'),
    game: document.getElementById('game-screen')
  };

  const modals = {
    results: document.getElementById('results-modal'),
    howToPlay: document.getElementById('how-to-play-modal'),
    settings: document.getElementById('settings-modal')
  };

  // Menu Elements
  const playerNameInput = document.getElementById('player-name-input');
  const roomCodeInput = document.getElementById('room-code-input');
  const btnCreateLobby = document.getElementById('btn-create-lobby');
  const btnJoinLobby = document.getElementById('btn-join-lobby');
  const btnHowToPlay = document.getElementById('btn-how-to-play');
  const btnSettings = document.getElementById('btn-settings');
  const lanInfoBanner = document.getElementById('lan-info-banner');
  const lanText = document.getElementById('lan-text');

  // Lobby Elements
  const lobbyRoomCode = document.getElementById('lobby-room-code');
  const btnCopyCode = document.getElementById('btn-copy-code');
  const btnCopyLink = document.getElementById('btn-copy-link');
  const lobbyPlayerCount = document.getElementById('lobby-player-count');
  const lobbyPlayerList = document.getElementById('lobby-player-list');
  const rosterCount = document.getElementById('roster-count');
  const selectDuration = document.getElementById('select-duration');
  const toggleTestMode = document.getElementById('toggle-test-mode');
  const hostOnlyTag = document.getElementById('host-only-tag');
  const btnStartMatch = document.getElementById('btn-start-match');
  const startReqHint = document.getElementById('start-requirements-hint');
  const btnLeaveLobby = document.getElementById('btn-leave-lobby');

  // HUD Elements
  const hudPlayerName = document.getElementById('hud-player-name');
  const hudPlayerScore = document.getElementById('hud-player-score');
  const hudColorIndicator = document.getElementById('hud-color-indicator');
  const hudTimer = document.getElementById('hud-timer');
  const hudMiniLeaderboard = document.getElementById('hud-mini-leaderboard');
  const btnHudMute = document.getElementById('btn-hud-mute');

  // Chaos Banner & Powerups
  const chaosBanner = document.getElementById('chaos-banner');
  const chaosTitle = document.getElementById('chaos-title');
  const chaosDesc = document.getElementById('chaos-desc');
  const chaosTimerFill = document.getElementById('chaos-timer-fill');
  const pwSpeed = document.getElementById('pw-speed');
  const pwSpeedTime = document.getElementById('pw-speed-time');
  const pwShield = document.getElementById('pw-shield');
  const pwMagnet = document.getElementById('pw-magnet');
  const pwMagnetTime = document.getElementById('pw-magnet-time');
  const pwDouble = document.getElementById('pw-double');
  const pwDoubleTime = document.getElementById('pw-double-time');

  // Countdown & Results
  const countdownOverlay = document.getElementById('countdown-overlay');
  const countdownNumber = document.getElementById('countdown-number');
  const winnerAnnouncement = document.getElementById('winner-announcement');
  const podiumContainer = document.getElementById('podium-container');
  const resultsTableBody = document.getElementById('results-table-body');
  const resultsHostControls = document.getElementById('results-host-controls');
  const resultsGuestHint = document.getElementById('results-guest-hint');
  const btnPlayAgain = document.getElementById('btn-play-again');
  const btnReturnLobby = document.getElementById('btn-return-lobby');

  // Settings Modal Controls
  const sliderMasterVol = document.getElementById('slider-master-vol');
  const sliderSfxVol = document.getElementById('slider-sfx-vol');
  const sliderBgmVol = document.getElementById('slider-bgm-vol');
  const toggleBgm = document.getElementById('toggle-bgm');
  const labelMasterVol = document.getElementById('label-master-vol');
  const labelSfxVol = document.getElementById('label-sfx-vol');
  const labelBgmVol = document.getElementById('label-bgm-vol');
  const btnTestSound = document.getElementById('btn-test-sound');
  const btnCloseSettings = document.getElementById('btn-close-settings');
  const btnCloseHowToPlay = document.getElementById('btn-close-how-to-play');

  // Keyboard state
  const keysDown = {
    w: false, a: false, s: false, d: false,
    ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false
  };

  let activeScreen = 'menu';
  let lastFrameTime = performance.now();
  let serverLanUrl = window.location.origin;

  // --- LOCAL PREFERENCES & URL PARAMETERS ---
  function loadLocalPreferences() {
    const savedName = localStorage.getItem('chaos_arena_player_name');
    if (savedName && playerNameInput) {
      playerNameInput.value = savedName;
    }

    // Check URL search params for direct room link (e.g. ?room=XYZ123)
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');
    if (roomFromUrl && roomCodeInput) {
      roomCodeInput.value = roomFromUrl.toUpperCase();
      showToast(`Room code ${roomFromUrl.toUpperCase()} loaded! Enter name and join.`);
    }

    // Settings UI Sync
    if (sliderMasterVol) sliderMasterVol.value = Math.round(audio.masterVol * 100);
    if (labelMasterVol) labelMasterVol.textContent = `${Math.round(audio.masterVol * 100)}%`;
    if (sliderSfxVol) sliderSfxVol.value = Math.round(audio.sfxVol * 100);
    if (labelSfxVol) labelSfxVol.textContent = `${Math.round(audio.sfxVol * 100)}%`;
    if (sliderBgmVol) sliderBgmVol.value = Math.round(audio.bgmVol * 100);
    if (labelBgmVol) labelBgmVol.textContent = `${Math.round(audio.bgmVol * 100)}%`;
    if (toggleBgm) toggleBgm.checked = audio.bgmEnabled;
  }

  loadLocalPreferences();

  // Fetch LAN info for easy local network play
  fetch('/api/info')
    .then(r => r.json())
    .then(info => {
      if (info && info.lanIps && info.lanIps.length > 0) {
        serverLanUrl = `http://${info.lanIps[0]}:${info.port}`;
        if (lanInfoBanner && lanText) {
          lanInfoBanner.style.display = 'flex';
          lanText.textContent = `LAN Active: Connect friends at ${serverLanUrl}`;
        }
      }
    })
    .catch(() => {});

  // --- SCREEN NAVIGATION ---
  function switchScreen(screenName) {
    activeScreen = screenName;
    Object.keys(screens).forEach(key => {
      screens[key].classList.toggle('active', key === screenName);
    });

    if (screenName === 'game') {
      renderer.resizeCanvas();
      if (audio.bgmEnabled) audio.startBGM();
    } else {
      audio.stopBGM();
    }
  }

  function showModal(modalName) {
    if (modals[modalName]) modals[modalName].style.display = 'flex';
  }

  function hideModal(modalName) {
    if (modals[modalName]) modals[modalName].style.display = 'none';
  }

  // Toast Notifications
  function showToast(msg, isError = false) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'toast-error' : ''}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  // --- INPUT TRACKING (WASD / ARROW KEYS + JOYSTICK) ---
  window.addEventListener('keydown', (e) => {
    // If typing in an input field, do not move character
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

    if (keysDown.hasOwnProperty(e.key)) {
      keysDown[e.key] = true;
      e.preventDefault();
      updateInputVector();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (keysDown.hasOwnProperty(e.key)) {
      keysDown[e.key] = false;
      e.preventDefault();
      updateInputVector();
    }
  });

  // Joystick move callback
  joystick.onMoveCallback = () => {
    updateInputVector();
  };

  function updateInputVector() {
    let kx = 0;
    let ky = 0;

    if (keysDown.w || keysDown.ArrowUp) ky -= 1;
    if (keysDown.s || keysDown.ArrowDown) ky += 1;
    if (keysDown.a || keysDown.ArrowLeft) kx -= 1;
    if (keysDown.d || keysDown.ArrowRight) kx += 1;

    const jVec = joystick.getVector();

    // Combine keyboard and virtual joystick
    let finalDx = kx !== 0 ? kx : jVec.dx;
    let finalDy = ky !== 0 ? ky : jVec.dy;

    // Normalize diagonal magnitude
    const mag = Math.sqrt(finalDx * finalDx + finalDy * finalDy);
    if (mag > 1) {
      finalDx /= mag;
      finalDy /= mag;
    }

    network.setInput(finalDx, finalDy);
  }

  // --- MAIN MENU ACTIONS ---
  btnCreateLobby.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    if (!name) {
      showToast('Please enter a player name first.', true);
      playerNameInput.focus();
      return;
    }
    localStorage.setItem('chaos_arena_player_name', name);
    audio.init();

    btnCreateLobby.disabled = true;
    network.createLobby(name, (res) => {
      btnCreateLobby.disabled = false;
      if (!res.success) {
        showToast(res.error, true);
      }
    });
  });

  btnJoinLobby.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    const code = roomCodeInput.value.trim().toUpperCase();

    if (!name) {
      showToast('Please enter a player name first.', true);
      playerNameInput.focus();
      return;
    }
    if (!code || code.length !== 6) {
      showToast('Please enter a valid 6-character room code.', true);
      roomCodeInput.focus();
      return;
    }

    localStorage.setItem('chaos_arena_player_name', name);
    audio.init();

    btnJoinLobby.disabled = true;
    network.joinLobby(name, code, (res) => {
      btnJoinLobby.disabled = false;
      if (!res.success) {
        showToast(res.error, true);
      }
    });
  });

  btnHowToPlay.addEventListener('click', () => showModal('howToPlay'));
  btnCloseHowToPlay.addEventListener('click', () => hideModal('howToPlay'));

  btnSettings.addEventListener('click', () => showModal('settings'));
  btnCloseSettings.addEventListener('click', () => hideModal('settings'));

  // Quick Mute Button in HUD
  btnHudMute.addEventListener('click', () => {
    const muted = audio.toggleMute();
    btnHudMute.textContent = muted ? '🔇' : '🔊';
    showToast(muted ? 'Sound Muted' : 'Sound Unmuted');
  });

  // Settings Sliders
  sliderMasterVol.addEventListener('input', (e) => {
    const val = e.target.value / 100;
    audio.setMasterVolume(val);
    labelMasterVol.textContent = `${e.target.value}%`;
  });

  sliderSfxVol.addEventListener('input', (e) => {
    const val = e.target.value / 100;
    audio.setSfxVolume(val);
    labelSfxVol.textContent = `${e.target.value}%`;
  });

  sliderBgmVol.addEventListener('input', (e) => {
    const val = e.target.value / 100;
    audio.setBgmVolume(val);
    labelBgmVol.textContent = `${e.target.value}%`;
  });

  toggleBgm.addEventListener('change', (e) => {
    audio.setBgmEnabled(e.target.checked);
  });

  btnTestSound.addEventListener('click', () => {
    audio.playCoinSound();
    setTimeout(() => audio.playPowerUpSound(), 150);
  });

  // --- LOBBY ACTIONS ---
  btnCopyCode.addEventListener('click', () => {
    if (!network.roomCode) return;
    navigator.clipboard.writeText(network.roomCode)
      .then(() => showToast(`Room Code "${network.roomCode}" copied to clipboard!`))
      .catch(() => showToast(`Room Code: ${network.roomCode}`));
  });

  btnCopyLink.addEventListener('click', () => {
    if (!network.roomCode) return;
    const directUrl = `${window.location.origin}/?room=${network.roomCode}`;
    navigator.clipboard.writeText(directUrl)
      .then(() => showToast('Direct Invite Link copied to clipboard!'))
      .catch(() => showToast(directUrl));
  });

  toggleTestMode.addEventListener('change', (e) => {
    if (network.isHost) {
      network.setTestMode(e.target.checked);
    }
  });

  selectDuration.addEventListener('change', (e) => {
    if (network.isHost) {
      network.setMatchDuration(Number(e.target.value));
    }
  });

  btnStartMatch.addEventListener('click', () => {
    if (network.isHost) {
      network.startMatch();
    }
  });

  btnLeaveLobby.addEventListener('click', () => {
    network.leaveRoom();
    switchScreen('menu');
  });

  // --- NETWORK EVENT BINDINGS ---
  network.on('lobby_created', (data) => {
    updateLobbyView(data.lobbyState);
    switchScreen('lobby');
    showToast(`Lobby created! Room Code: ${data.roomCode}`);
  });

  network.on('lobby_joined', (data) => {
    updateLobbyView(data.lobbyState);
    switchScreen('lobby');
    showToast(`Joined lobby: ${data.roomCode}`);
  });

  network.on('lobby_update', (lobbyState) => {
    updateLobbyView(lobbyState);
  });

  function updateLobbyView(state) {
    lobbyRoomCode.textContent = state.code;
    lobbyPlayerCount.textContent = `${state.players.length}/10 Players`;
    rosterCount.textContent = state.players.length;

    // Render player cards
    lobbyPlayerList.innerHTML = '';
    state.players.forEach(p => {
      const card = document.createElement('div');
      card.className = 'roster-card';
      card.innerHTML = `
        <div class="player-avatar-circle" style="background-color: ${p.color.hex}; border-color: ${p.color.border};"></div>
        <div class="roster-card-info">
          <span class="roster-card-name">${escapeHtml(p.name)}</span>
          ${p.isHost ? '<span class="roster-badge-host">👑 HOST</span>' : ''}
        </div>
      `;
      lobbyPlayerList.appendChild(card);
    });

    // Sync settings values
    selectDuration.value = state.matchDuration;
    toggleTestMode.checked = state.testMode;

    // Permissions: Host vs Guest controls
    const isHost = network.isHost;
    selectDuration.disabled = !isHost;
    toggleTestMode.disabled = !isHost;
    hostOnlyTag.textContent = isHost ? 'HOST CONTROLS' : 'HOST ONLY (VIEWING)';

    // Start requirements
    const min = state.minPlayers;
    const count = state.players.length;
    const canStart = isHost && count >= min;

    btnStartMatch.style.display = isHost ? 'inline-flex' : 'none';
    btnStartMatch.disabled = !canStart;

    if (isHost) {
      if (count < min) {
        startReqHint.textContent = `Need ${min - count} more player(s) to start (Min ${min}).`;
      } else {
        startReqHint.textContent = `Ready! ${count} players in lobby.`;
      }
    } else {
      startReqHint.textContent = `Waiting for host to launch the match (${count}/${min} required)...`;
    }
  }

  // --- COUNTDOWN & MATCH FLOW ---
  network.on('countdown_start', (data) => {
    countdownOverlay.style.display = 'flex';
    countdownNumber.textContent = data.countdown;
    audio.playCountdownSound(false);
  });

  network.on('countdown_tick', (data) => {
    countdownNumber.textContent = data.countdown;
    countdownNumber.style.animation = 'none';
    void countdownNumber.offsetWidth; // trigger reflow
    countdownNumber.style.animation = 'popScale 0.8s ease-out';
    audio.playCountdownSound(false);
  });

  network.on('match_started', () => {
    countdownNumber.textContent = 'GO!';
    countdownNumber.style.color = '#39ff14';
    audio.playCountdownSound(true);

    setTimeout(() => {
      countdownOverlay.style.display = 'none';
      countdownNumber.style.color = '#ffe600';
    }, 700);

    hideModal('results');
    switchScreen('game');
  });

  // --- GAME TICK & SNAPSHOT HANDLING ---
  network.on('game_tick', (snapshot) => {
    if (activeScreen !== 'game') return;

    // 1. Update Match Timer
    const m = Math.floor(snapshot.timeLeft / 60);
    const s = snapshot.timeLeft % 60;
    hudTimer.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    hudTimer.classList.toggle('urgent', snapshot.timeLeft <= 10);

    // 2. Update Local Player HUD
    const localP = snapshot.players.find(p => p.id === network.localPlayerId);
    if (localP) {
      hudPlayerName.textContent = localP.name;
      hudPlayerScore.textContent = localP.score;
      if (localP.color) {
        hudColorIndicator.style.backgroundColor = localP.color.hex;
        hudColorIndicator.style.borderColor = localP.color.border;
      }

      // Update Power-Up Indicators
      const pw = localP.powerUps || {};
      pwSpeed.style.display = pw.speed > 0 ? 'flex' : 'none';
      if (pw.speed > 0) pwSpeedTime.textContent = `${pw.speed}s`;

      pwShield.style.display = pw.shield ? 'flex' : 'none';

      pwMagnet.style.display = pw.magnet > 0 ? 'flex' : 'none';
      if (pw.magnet > 0) pwMagnetTime.textContent = `${pw.magnet}s`;

      pwDouble.style.display = pw.double > 0 ? 'flex' : 'none';
      if (pw.double > 0) pwDoubleTime.textContent = `${pw.double}s`;
    }

    // 3. Mini Leaderboard (Top 3)
    const sorted = [...snapshot.players].sort((a, b) => b.score - a.score).slice(0, 3);
    hudMiniLeaderboard.innerHTML = sorted.map((p, idx) => `
      <div class="hud-lb-row">
        <span style="color: ${p.color ? p.color.hex : '#fff'};">#${idx + 1} ${escapeHtml(p.name)}</span>
        <span class="hud-lb-pts">${p.score}</span>
      </div>
    `).join('');

    // 4. Chaos Event Banner
    if (snapshot.chaos && snapshot.chaos.activeEvent) {
      chaosBanner.style.display = 'block';
      const eventName = snapshot.chaos.activeEvent.replace('_', ' ');
      chaosTitle.textContent = eventName;

      const descriptions = {
        SLIPPERY_FLOOR: 'Low friction! High momentum drift across the arena!',
        REVERSE_CONTROLS: 'Controls inverted! Up is Down, Left is Right!',
        COIN_RUSH: 'Flood of 25 golden bonus coins scattered!',
        GIANT_COINS: 'Mega coins worth 50 points have appeared!',
        MOVING_HAZARDS: 'Patrol hazards moving at double speed!',
        SHRINKING_ZONE: 'Danger zone closing in! Stay inside the perimeter!',
        SPEED_FRENZY: 'Nitro hyper-speed given to all arena fighters!'
      };
      chaosDesc.textContent = descriptions[snapshot.chaos.activeEvent] || 'Arena modifier in effect!';

      const totalDur = 10;
      const pct = (snapshot.chaos.remainingSec / totalDur) * 100;
      chaosTimerFill.style.width = `${pct}%`;
    } else {
      chaosBanner.style.display = 'none';
    }

    // 5. Process Tick Events for Audio and Visual Effects
    if (snapshot.events && snapshot.events.length > 0) {
      for (const ev of snapshot.events) {
        handleTickEvent(ev);
      }
    }
  });

  function handleTickEvent(ev) {
    switch (ev.event) {
      case 'COIN_COLLECTED':
        renderer.addParticleBurst(ev.x, ev.y, ev.isGiant ? '#ff007f' : '#ffe600', ev.isGiant ? 24 : 12);
        renderer.addFloatingText(ev.x, ev.y, `+${ev.points}`, ev.isGiant ? '#ff007f' : (ev.isDouble ? '#39ff14' : '#ffe600'), ev.isGiant ? 22 : 16);
        if (ev.playerId === network.localPlayerId) {
          audio.playCoinSound(ev.isGiant, ev.isDouble);
        }
        break;

      case 'POWERUP_COLLECTED':
        renderer.addParticleBurst(ev.x, ev.y, '#00f0ff', 20, 160);
        renderer.addFloatingText(ev.x, ev.y, `${ev.type}!`, '#00f0ff', 20);
        if (ev.playerId === network.localPlayerId) {
          audio.playPowerUpSound();
        }
        break;

      case 'BUMPER_HIT':
        renderer.triggerBumperFlash(ev.bumperId);
        if (ev.playerId === network.localPlayerId) {
          audio.playBumperSound();
        }
        break;

      case 'HAZARD_HIT':
        if (ev.shieldAbsorbed) {
          renderer.addParticleBurst(ev.x, ev.y, '#38b6ff', 16);
          renderer.addFloatingText(ev.x, ev.y, 'SHIELD SAVED!', '#38b6ff', 16);
          if (ev.playerId === network.localPlayerId) audio.playShieldAbsorbSound();
        } else {
          renderer.addParticleBurst(ev.x, ev.y, '#ff0055', 18);
          if (ev.pointsLost > 0) {
            renderer.addFloatingText(ev.x, ev.y, `-${ev.pointsLost}`, '#ff3366', 18);
          }
          if (ev.playerId === network.localPlayerId) audio.playHazardSound();
        }
        break;

      case 'ZONE_DAMAGE':
        if (ev.playerId === network.localPlayerId) {
          if (ev.shieldAbsorbed) {
            audio.playShieldAbsorbSound();
          } else {
            audio.playHazardSound();
          }
        }
        break;

      case 'CHAOS_STARTED':
        audio.playChaosSound();
        showToast(`⚡ CHAOS: ${ev.title}`);
        break;
    }
  }

  // --- MATCH FINISHED & RESULTS PODIUM ---
  network.on('match_finished', (results) => {
    audio.stopBGM();
    audio.playVictoryFanfare();

    const winner = results.winner;
    winnerAnnouncement.textContent = winner ? `${winner.name.toUpperCase()} WINS WITH ${winner.score} POINTS!` : 'MATCH FINISHED!';

    // Render Podium (2nd on left, 1st in center, 3rd on right)
    podiumContainer.innerHTML = '';
    const top3 = results.rankings.slice(0, 3);
    const podiumOrder = [top3[1], top3[0], top3[2]]; // 2nd, 1st, 3rd
    const classes = ['slot-2nd', 'slot-1st', 'slot-3rd'];
    const labels = ['2ND PLACE', '👑 1ST PLACE', '3RD PLACE'];

    podiumOrder.forEach((p, idx) => {
      if (!p) return;
      const slot = document.createElement('div');
      slot.className = `podium-slot ${classes[idx]}`;
      slot.innerHTML = `
        <div class="podium-rank-tag">${labels[idx]}</div>
        <div class="podium-name" style="color: ${p.color.hex};">${escapeHtml(p.name)}</div>
        <div class="podium-score">${p.score} PTS</div>
        <div class="podium-pillar">${idx === 1 ? '1' : (idx === 0 ? '2' : '3')}</div>
      `;
      podiumContainer.appendChild(slot);
    });

    // Populate Detailed Results Table
    resultsTableBody.innerHTML = results.rankings.map(p => `
      <tr>
        <td><strong>#${p.rank}</strong></td>
        <td><span style="color: ${p.color.hex};">●</span> ${escapeHtml(p.name)}</td>
        <td><strong>${p.score}</strong></td>
        <td>${p.coinsCollected}</td>
        <td>${p.powerupsCollected}</td>
        <td>${p.hazardsHit}</td>
      </tr>
    `).join('');

    // Host controls vs guest waiting message
    resultsHostControls.style.display = network.isHost ? 'flex' : 'none';
    resultsGuestHint.style.display = network.isHost ? 'none' : 'block';

    showModal('results');
  });

  // Post-match Host Buttons
  btnPlayAgain.addEventListener('click', () => {
    if (network.isHost) {
      network.playAgain();
    }
  });

  btnReturnLobby.addEventListener('click', () => {
    if (network.isHost) {
      network.returnToLobby();
      hideModal('results');
      switchScreen('lobby');
    }
  });

  network.on('match_cancelled', (data) => {
    showToast(data.reason || 'Match was ended.', true);
    hideModal('results');
    switchScreen('lobby');
  });

  network.on('error', (err) => {
    showToast(err.message, true);
  });

  network.on('security_warning', (warn) => {
    showToast(`Security Alert: ${warn.message}`, true);
  });

  // --- RENDER ANIMATION LOOP ---
  function gameLoop(timestamp) {
    const dt = Math.min((timestamp - lastFrameTime) / 1000, 0.1);
    lastFrameTime = timestamp;

    if (activeScreen === 'game') {
      const state = network.getInterpolatedState();
      renderer.render(state, network.localPlayerId, dt);
    }

    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));
  }
});
