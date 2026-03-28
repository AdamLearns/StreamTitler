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

    if (s.youtube.scheduledStartTime) {
      try {
        const d = new Date(s.youtube.scheduledStartTime);
        // datetime-local needs YYYY-MM-DDTHH:MM
        $ytDatetime.value = new Date(
          d.getTime() - d.getTimezoneOffset() * 60000,
        )
          .toISOString()
          .slice(0, 16);
      } catch {
        /* ignore bad dates */
      }
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

      // Persist YouTube-specific settings
      await post("/api/settings", {
        sharedDescription: sharedDesc,
        twitch: { title: baseTitle },
        youtube: {
          youtubeDescription: ytDesc,
          extraTitleTags: extra,
          tags,
          scheduledStartTime,
          privacyStatus,
        },
      });

      const result = await post("/api/youtube/create", {
        title,
        description,
        tags,
        scheduledStartTime,
        privacyStatus,
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
})();
