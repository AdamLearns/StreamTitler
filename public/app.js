// ---------------------------------------------------------------------------
// StreamTitler — front-end
// ---------------------------------------------------------------------------

(function () {
  "use strict";

  // ---- DOM refs -----------------------------------------------------------
  const $title = document.getElementById("title");
  const $sharedDesc = document.getElementById("shared-description");
  const $descCounter = document.getElementById("desc-counter");
  const $copyDesc = document.getElementById("copy-desc");
  const $twitchCategory = document.getElementById("twitch-category");
  const $twitchCatId = document.getElementById("twitch-category-id");
  const $twitchTags = document.getElementById("twitch-tags");
  const $categoryResults = document.getElementById("category-results");
  const $ytExtraTags = document.getElementById("yt-extra-tags");
  const $ytDescription = document.getElementById("yt-description");
  const $ytTags = document.getElementById("yt-tags");
  const $ytDatetime = document.getElementById("yt-datetime");
  const $ytPrivacy = document.getElementById("yt-privacy");
  const $btnTwitch = document.getElementById("update-twitch");
  const $btnYoutube = document.getElementById("create-youtube");
  const $ytPlaylist = document.getElementById("yt-playlist");
  const $refreshPlaylists = document.getElementById("refresh-playlists");
  const $twitchStatus = document.getElementById("twitch-status");
  const $youtubeStatus = document.getElementById("youtube-status");
  const $twitchAuthBtn = document.getElementById("twitch-auth-btn");
  const $youtubeAuthBtn = document.getElementById("youtube-auth-btn");

  // ---- Toast --------------------------------------------------------------
  let toastTimer;
  function toast(message, type) {
    const el = document.getElementById("toast");
    clearTimeout(toastTimer);
    el.textContent = message;
    el.className = "toast " + type + " visible";
    toastTimer = setTimeout(() => {
      el.classList.remove("visible");
    }, 4000);
  }

  // ---- Load & populate settings -------------------------------------------
  async function loadSettings() {
    const res = await fetch("/api/settings");
    const s = await res.json();

    $title.value = s.twitch.title || "";
    $sharedDesc.value = s.sharedDescription || "";
    updateCharCounter();
    $twitchCategory.value = s.twitch.categoryName || "";
    $twitchCatId.value = s.twitch.categoryId || "";
    $twitchTags.value = (s.twitch.tags || []).join(", ");

    $ytExtraTags.value = s.youtube.extraTitleTags || "";
    $ytDescription.value =
      s.youtube.youtubeDescription || s.youtube.description || "";
    $ytTags.value = (s.youtube.tags || []).join(", ");
    $ytPrivacy.value = s.youtube.privacyStatus || "public";

    // Restore saved playlist selection
    if (s.youtube.playlistId) {
      // Add the saved option so it appears without a refresh
      const opt = document.createElement("option");
      opt.value = s.youtube.playlistId;
      opt.textContent = s.youtube.playlistName || s.youtube.playlistId;
      $ytPlaylist.appendChild(opt);
      $ytPlaylist.value = s.youtube.playlistId;
    }

    // Compute default go-live time based on current time
    {
      const now = new Date();
      const hours = now.getHours();
      let goLive;
      if (hours < 12) {
        // Morning: max(8:30 AM today, now + 5 min)
        const morning = new Date(now);
        morning.setHours(8, 30, 0, 0);
        const fiveMin = new Date(now.getTime() + 5 * 60000);
        goLive = fiveMin > morning ? fiveMin : morning;
      } else if (hours < 17) {
        // Afternoon: max(1:00 PM today, now + 5 min)
        const afternoon = new Date(now);
        afternoon.setHours(13, 0, 0, 0);
        const fiveMin = new Date(now.getTime() + 5 * 60000);
        goLive = fiveMin > afternoon ? fiveMin : afternoon;
      } else {
        // After 5 PM: 8:30 AM next day
        goLive = new Date(now);
        goLive.setDate(goLive.getDate() + 1);
        goLive.setHours(8, 30, 0, 0);
      }
      $ytDatetime.value = new Date(
        goLive.getTime() - goLive.getTimezoneOffset() * 60000,
      )
        .toISOString()
        .slice(0, 16);
    }

    if (s.auth.twitch.connected) {
      $twitchStatus.classList.add("connected");
      $twitchAuthBtn.textContent = "Reconnect";
    }
    if (s.auth.youtube.connected) {
      $youtubeStatus.classList.add("connected");
      $youtubeAuthBtn.textContent = "Reconnect";
    }
  }

  // ---- Shared description char counter & copy ----------------------------
  function updateCharCounter() {
    const len = $sharedDesc.value.length;
    $descCounter.textContent = len + " / 140";
    $descCounter.classList.toggle("over", len > 140);
    $copyDesc.classList.toggle("over", len > 140);
  }

  $sharedDesc.addEventListener("input", updateCharCounter);

  $copyDesc.addEventListener("click", function () {
    navigator.clipboard.writeText($sharedDesc.value).then(function () {
      toast("Description copied!", "success");
    });
  });

  // ---- Category autocomplete ----------------------------------------------
  let searchTimer;
  $twitchCategory.addEventListener("input", function () {
    clearTimeout(searchTimer);
    const q = this.value.trim();
    if (q.length < 2) {
      $categoryResults.classList.remove("visible");
      return;
    }
    searchTimer = setTimeout(async () => {
      try {
        const res = await fetch(
          "/api/twitch/categories?q=" + encodeURIComponent(q),
        );
        const items = await res.json();
        $categoryResults.innerHTML = items
          .map(function (c) {
            return (
              '<div class="autocomplete-item" data-id="' +
              esc(c.id) +
              '" data-name="' +
              esc(c.name) +
              '">' +
              esc(c.name) +
              "</div>"
            );
          })
          .join("");
        $categoryResults.classList.toggle("visible", items.length > 0);
      } catch {
        /* ignore search errors */
      }
    }, 300);
  });

  $categoryResults.addEventListener("click", function (e) {
    const item = e.target.closest(".autocomplete-item");
    if (!item) return;
    $twitchCategory.value = item.dataset.name;
    $twitchCatId.value = item.dataset.id;
    $categoryResults.classList.remove("visible");
  });

  document.addEventListener("click", function (e) {
    if (!e.target.closest(".autocomplete-wrapper")) {
      $categoryResults.classList.remove("visible");
    }
  });

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  // ---- Playlist refresh ---------------------------------------------------
  $refreshPlaylists.addEventListener("click", async function () {
    $refreshPlaylists.disabled = true;
    $refreshPlaylists.textContent = "…";
    try {
      const res = await fetch("/api/youtube/playlists");
      if (!res.ok) throw new Error("Failed to fetch playlists");
      const playlists = await res.json();
      const prev = $ytPlaylist.value;
      $ytPlaylist.innerHTML = '<option value="">None</option>';
      playlists.forEach(function (p) {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.title;
        $ytPlaylist.appendChild(opt);
      });
      // Re-select previous if still in list
      if (prev) $ytPlaylist.value = prev;
      toast("Playlists refreshed (" + playlists.length + ")", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      $refreshPlaylists.disabled = false;
      $refreshPlaylists.textContent = "↻ Refresh";
    }
  });

  // ---- Helpers ------------------------------------------------------------
  function parseTags(str) {
    return str
      .split(",")
      .map(function (t) {
        return t.trim();
      })
      .filter(Boolean);
  }

  async function post(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Request failed");
    return json;
  }

  // ---- Twitch update ------------------------------------------------------
  $btnTwitch.addEventListener("click", async function () {
    $btnTwitch.disabled = true;
    $btnTwitch.textContent = "Updating…";
    try {
      const title = $title.value;
      const categoryId = $twitchCatId.value;
      const categoryName = $twitchCategory.value;
      const tags = parseTags($twitchTags.value);

      // Save settings first
      await post("/api/settings", {
        sharedDescription: $sharedDesc.value,
        twitch: { title, categoryId, categoryName, tags },
      });

      await post("/api/twitch/update", {
        title,
        categoryId,
        categoryName,
        tags,
      });
      toast("Twitch updated!", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      $btnTwitch.disabled = false;
      $btnTwitch.textContent = "Update Twitch";
    }
  });

  // ---- YouTube create -----------------------------------------------------
  $btnYoutube.addEventListener("click", async function () {
    $btnYoutube.disabled = true;
    $btnYoutube.textContent = "Creating…";
    try {
      const baseTitle = $title.value;
      const extra = $ytExtraTags.value.trim();
      const title = extra ? baseTitle + " " + extra : baseTitle;

      const sharedDesc = $sharedDesc.value;
      const ytDesc = $ytDescription.value;
      const description = ytDesc ? sharedDesc + "\n\n" + ytDesc : sharedDesc;
      const tags = parseTags($ytTags.value);
      const scheduledStartTime = new Date($ytDatetime.value).toISOString();
      const privacyStatus = $ytPrivacy.value;
      const playlistId = $ytPlaylist.value;
      const playlistName =
        $ytPlaylist.options[$ytPlaylist.selectedIndex]?.textContent || "";

      // Persist YouTube-specific settings (scheduledStartTime excluded)
      await post("/api/settings", {
        sharedDescription: sharedDesc,
        twitch: { title: baseTitle },
        youtube: {
          youtubeDescription: ytDesc,
          extraTitleTags: extra,
          tags,
          privacyStatus,
          playlistId,
          playlistName,
        },
      });

      const result = await post("/api/youtube/create", {
        title,
        description,
        tags,
        scheduledStartTime,
        privacyStatus,
        playlistId,
      });

      toast("YouTube stream created! (" + result.videoId + ")", "success");

      // Open chat pop-out
      if (result.videoId) {
        await post("/api/youtube/open-chat", { videoId: result.videoId });
      }
    } catch (err) {
      toast(err.message, "error");
    } finally {
      $btnYoutube.disabled = false;
      $btnYoutube.textContent = "Create YouTube Stream";
    }
  });

  // ---- Init ---------------------------------------------------------------
  loadSettings();
  $title.focus();
})();
