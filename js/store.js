(function () {
  "use strict";

  var API_URL = "/api/db";
  // При открытии файла напрямую (/api/db недоступен) не делаем бесполезные
  // запросы — они только засорят консоль ошибками CORS/404.
  var IS_FILE = !!(window.location && window.location.protocol === "file:");
  var saveTimer = null;
  var saving = false;
  var pendingSave = false;
  var db = {};

  function loadSync() {
    if (IS_FILE) {
      db = {};
      return db;
    }
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", API_URL, false); // sync: ensures DB is ready before app scripts run
      xhr.setRequestHeader("Accept", "application/json");
      xhr.send(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        var parsed = JSON.parse(xhr.responseText);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          db = parsed;
          return db;
        }
      }
    } catch (e) {
      // fall through to fallback
    }
    // Fallback: keep empty object; app seed logic can populate it.
    db = db && typeof db === "object" ? db : {};
    return db;
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 150);
  }

  function flushSave() {
    saveTimer = null;
    if (IS_FILE) return;
    if (saving) {
      pendingSave = true;
      return;
    }
    saving = true;
    var payload;
    try {
      payload = JSON.stringify(db);
    } catch (e) {
      saving = false;
      return;
    }

    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: payload,
      cache: "no-store",
      keepalive: true
    }).catch(function () {
      // ignore network errors; next write will retry
    }).finally(function () {
      saving = false;
      if (pendingSave) {
        pendingSave = false;
        scheduleSave();
      }
    });
  }

  function saveNow() {
    if (IS_FILE) return false;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    // Use sync XHR for guaranteed persistence on critical moments (unload/reset)
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", API_URL, false);
      xhr.setRequestHeader("Content-Type", "application/json; charset=utf-8");
      xhr.send(JSON.stringify(db));
      return xhr.status >= 200 && xhr.status < 300;
    } catch (e) {
      return false;
    }
  }

  function get(key, fallback) {
    if (!db || !Object.prototype.hasOwnProperty.call(db, key)) {
      // Без Python-сервера db.json пуст. Сессия, сохранённая при входе,
      // лежит в sessionStorage — её должны видеть и встроенные проверки
      // в <head> защищённых страниц до загрузки main.js.
      if (key === "apoest_user") {
        try {
          var mirrored = window.sessionStorage && window.sessionStorage.getItem(key);
          if (mirrored) {
            var session = JSON.parse(mirrored);
            if (session && typeof session === "object") return session;
          }
        } catch (e) {
          //sessionStorage недоступен
        }
      }
      return fallback;
    }
    var value = db[key];
    return value === undefined || value === null ? fallback : value;
  }

  function getRaw(key) {
    if (!db || !Object.prototype.hasOwnProperty.call(db, key)) return null;
    var value = db[key];
    return value === undefined || value === null ? null : value;
  }

  function set(key, value) {
    db[key] = value;
    scheduleSave();
  }

  function remove(key) {
    if (db && Object.prototype.hasOwnProperty.call(db, key)) {
      delete db[key];
      scheduleSave();
    }
  }

  function replaceAll(newDb) {
    if (newDb && typeof newDb === "object" && !Array.isArray(newDb)) {
      db = newDb;
      scheduleSave();
    }
  }

  function snapshot() {
    return JSON.parse(JSON.stringify(db));
  }

  loadSync();

  window.ApoestStore = {
    get: get,
    getRaw: getRaw,
    set: set,
    remove: remove,
    replaceAll: replaceAll,
    snapshot: snapshot,
    saveNow: saveNow,
    reloadSync: loadSync,
    _db: db
  };

  // Keep _db reference live
  Object.defineProperty(window.ApoestStore, "_db", { get: function () { return db; } });

  // Best-effort flush on page leave
  window.addEventListener("beforeunload", function () {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
      saveNow();
    }
  });

  // Cross-tab/cross-page sync: poll server and emit change events.
  var lastSnapshot = JSON.stringify(db);
  function computeChangedKeys(nextDb) {
    var keys = {};
    var all = {};
    Object.keys(db || {}).forEach(function (k) { all[k] = true; });
    Object.keys(nextDb || {}).forEach(function (k) { all[k] = true; });
    Object.keys(all).forEach(function (k) {
      var a = db ? db[k] : undefined;
      var b = nextDb ? nextDb[k] : undefined;
      if (JSON.stringify(a) !== JSON.stringify(b)) keys[k] = true;
    });
    return Object.keys(keys);
  }

  function poll() {
    if (IS_FILE) return;
    if (saving || saveTimer) return; // don't stomp local in-flight writes
    try {
      fetch(API_URL, { cache: "no-store", headers: { "Accept": "application/json" } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (next) {
          if (!next || typeof next !== "object" || Array.isArray(next)) return;
          var nextSnap = JSON.stringify(next);
          if (nextSnap === lastSnapshot) return;
          var changed = computeChangedKeys(next);
          db = next;
          lastSnapshot = nextSnap;
          if (changed.length) {
            try {
              window.dispatchEvent(new CustomEvent("apoest:db-change", { detail: { keys: changed } }));
            } catch (e) {}
          }
        })
        .catch(function () {});
    } catch (e) {}
  }

  setInterval(poll, 3000);
  // Update snapshot after local saves
  var _origSet = set;
  var _origRemove = remove;
  var _origReplaceAll = replaceAll;
  // wrap to keep lastSnapshot in sync on local writes
  function touchSnapshot() {
    try { lastSnapshot = JSON.stringify(db); } catch (e) {}
  }
  // Monkey-patch through the public API by redefining internal behavior:
  var _scheduleSave = scheduleSave;
  scheduleSave = function () {
    touchSnapshot();
    _scheduleSave();
  };
})();
