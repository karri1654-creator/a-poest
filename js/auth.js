// ============================================================================
// А поесть? — регистрация и авторизация по данным из db.json
// ============================================================================

(function () {
  "use strict";

  const USER_KEY = "apoest_user";
  const REGISTERED_KEY = "apoest_registered_users";
  const CART_KEY = "apoest_cart";
  const CART_OWNER_KEY = "apoest_cart_owner";
  const ORDER_KEY = "apoest_active_order";
  const REDIRECT_KEY = "apoest_redirect_after_auth";
  const NOTICE_KEY = "apoest_auth_notice";
  const ANNA_PHONE = "9161234567";
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  const DEMO_USERS = (() => {
    const shared = window.ApoestDB?.getDemoUsers?.();
    if (Array.isArray(shared) && shared.length) return shared;
    return [
      {
        name: "Анна",
        phone: "+7 (916) 123-45-67",
        email: "anna@apoest.ru",
        password: "anna123",
        role: "user",
        isNew: false,
        owner: "anna"
      },
      {
        name: "Администратор",
        phone: "+7 (900) 000-00-01",
        email: "admin@apoest.ru",
        password: "admin123",
        role: "admin",
        isNew: false,
        owner: "admin"
      }
    ];
  })();

  // Гарантируем наличие демо-пользователей в общей базе при открытии auth.html.
  window.ApoestDB?.ensureSeed?.();

  const card = document.querySelector("[data-auth-card]");
  if (!card) return;

  const title = card.querySelector("[data-auth-title]");
  const subtitle = card.querySelector("[data-auth-subtitle]");
  const nameField = card.querySelector("[data-auth-name-field]");
  const nameInput = card.querySelector("[data-auth-name]");
  const loginInput = card.querySelector("[data-auth-login]") || card.querySelector("[data-auth-phone]");
  const passwordInput = card.querySelector("[data-auth-password]");
  const confirmField = card.querySelector("[data-auth-confirm-field]");
  const confirmInput = card.querySelector("[data-auth-confirm]");
  const submitButton = card.querySelector("[data-auth-submit]");
  const switchText = card.querySelector("[data-auth-switch-text]");
  const toggle = card.querySelector("[data-auth-toggle]");
  const tabs = Array.from(card.querySelectorAll("[data-auth-tab]"));
  const errorBox = card.querySelector("[data-auth-error]");
  const successBox = card.querySelector("[data-auth-success]");
  const note = card.querySelector("[data-auth-note]");
  const form = card.querySelector(".auth-form");

  const content = {
    login: {
      title: "Вход в аккаунт",
      subtitle: "Введите данные, указанные при регистрации.",
      switchText: "Впервые у нас?",
      toggleLabel: "Зарегистрироваться",
      submitLabel: "Войти",
      note: "Нажимая «Войти», вы соглашаетесь с <a href=\"#\">условиями сервиса</a> и <a href=\"#\">политикой конфиденциальности</a>.",
      docTitle: "Вход — А поесть?"
    },
    register: {
      title: "Регистрация",
      subtitle: "Создайте аккаунт, чтобы оформлять заказы.",
      switchText: "Уже есть аккаунт?",
      toggleLabel: "Войти",
      submitLabel: "Зарегистрироваться",
      note: "Нажимая «Зарегистрироваться», вы соглашаетесь с <a href=\"#\">условиями сервиса</a> и <a href=\"#\">политикой конфиденциальности</a>.",
      docTitle: "Регистрация — А поесть?"
    }
  };

  let mode = "login";
  let submitting = false;

  // --------------------------------------------------------------------------
  // Утилиты и работа с db.json
  // --------------------------------------------------------------------------
  function normalizePhone(value) {
    const digits = String(value || "").replace(/\D/g, "");
    return digits.length === 11 && (digits[0] === "7" || digits[0] === "8")
      ? digits.slice(1)
      : digits;
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function formatPhone(digits) {
    const value = normalizePhone(digits);
    if (value.length !== 10) return String(digits || "").trim();
    return `+7 (${value.slice(0, 3)}) ${value.slice(3, 6)}-${value.slice(6, 8)}-${value.slice(8, 10)}`;
  }

  var store = window.ApoestStore;

  function readJSON(key, fallback) {
    try {
      if (store) return store.get(key, fallback);
      return fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      if (store) store.set(key, value);
    } catch (error) {
      // storage may be unavailable
    }
  }

  function removeKey(key) {
    try {
      if (store) store.remove(key);
    } catch (error) {
      // storage may be unavailable
    }
  }

  function readRaw(key) {
    try {
      if (store) return store.getRaw(key);
      return null;
    } catch (error) {
      return null;
    }
  }

  function writeRaw(key, value) {
    try {
      if (store) store.set(key, value);
    } catch (error) {
      // storage may be unavailable
    }
  }

  function ownerOf(user) {
    if (!user) return "guest";
    if (user.owner) return String(user.owner);
    const digits = normalizePhone(user.phone);
    if (digits === ANNA_PHONE) return "anna";
    if (digits) return digits;
    const email = normalizeEmail(user.email);
    return email ? `email-${email.replace(/[^a-z0-9]+/g, "-")}` : "guest";
  }

  function isAdminUser(user) {
    if (!user || typeof user !== "object") return false;
    const role = String(user.role || "").toLowerCase();
    return user.isAdmin === true || role === "admin" || role === "administrator";
  }

  function parseLogin(value) {
    const raw = String(value || "").trim();
    if (!raw) return { ok: false, message: "Введите телефон или email" };

    if (raw.includes("@") || /[A-Za-zА-Яа-яЁё]/.test(raw)) {
      const email = normalizeEmail(raw);
      if (!EMAIL_RE.test(email)) return { ok: false, message: "Введите корректный email" };
      return { ok: true, type: "email", value: email };
    }

    const digits = normalizePhone(raw);
    if (digits.length !== 10) {
      return { ok: false, message: "Введите корректный номер телефона" };
    }
    return { ok: true, type: "phone", value: digits };
  }

  function findRegisteredByPhone(phoneValue, users) {
    const digits = normalizePhone(phoneValue);
    if (!digits) return null;
    return users.find((user) => normalizePhone(user.phone) === digits) || null;
  }

  function findRegisteredByEmail(emailValue, users) {
    const email = normalizeEmail(emailValue);
    if (!email) return null;
    return users.find((user) => normalizeEmail(user.email) === email) || null;
  }

  function findRegistered(value, users) {
    const parsed = parseLogin(value);
    if (parsed.ok) {
      return parsed.type === "email"
        ? findRegisteredByEmail(parsed.value, users)
        : findRegisteredByPhone(parsed.value, users);
    }
    return findRegisteredByEmail(value, users) || findRegisteredByPhone(value, users);
  }

  function findSameLogin(phone, email, users) {
    return users.find((user) =>
      (phone && normalizePhone(user.phone) === normalizePhone(phone))
      || (email && normalizeEmail(user.email) === normalizeEmail(email))
    ) || null;
  }

  function sessionFrom(user) {
    return {
      name: String(user.name || "Пользователь"),
      phone: String(user.phone || ""),
      email: String(user.email || ""),
      owner: ownerOf(user),
      role: user.role === "admin" || user.role === "administrator" ? "admin" : "user",
      isNew: user.isNew === true
    };
  }

  function saveSession(user) {
    const session = sessionFrom(user);
    writeJSON(USER_KEY, session);
    return session;
  }

  // Демо-пользователи всегда есть в базе, а их роль и пароль синхронизированы.
  function ensureRegistered() {
    const users = readJSON(REGISTERED_KEY, []);
    const list = Array.isArray(users)
      ? users.filter((user) => user && typeof user === "object")
      : [];

    DEMO_USERS.forEach((demo) => {
      const index = list.findIndex((user) =>
        (demo.phone && normalizePhone(user.phone) === normalizePhone(demo.phone))
        || (demo.email && normalizeEmail(user.email) === normalizeEmail(demo.email))
      );
      if (index === -1) list.push({ ...demo });
      else list[index] = { ...list[index], ...demo };
    });

    writeJSON(REGISTERED_KEY, list);
    return list;
  }

  function normalizeActiveSession(users) {
    const session = readJSON(USER_KEY, null);
    if (!session || typeof session !== "object") return null;

    const record = findRegisteredByEmail(session.email, users)
      || findRegisteredByPhone(session.phone, users);

    const normalized = {
      ...session,
      name: String(session.name || record?.name || "Пользователь"),
      phone: String(session.phone || record?.phone || ""),
      email: String(session.email || record?.email || ""),
      owner: normalizedOwner(session, record),
      role: record
        ? (record.role === "admin" || record.role === "administrator" ? "admin" : "user")
        : (isAdminUser(session) ? "admin" : "user"),
      isNew: session.isNew === true
    };
    delete normalized.password;
    writeJSON(USER_KEY, normalized);
    return normalized;
  }

  function normalizedOwner(session, record) {
    if (record) return ownerOf(record);
    return ownerOf(session);
  }

  function adoptGuestCart(user) {
    const cart = readJSON(CART_KEY, null);
    const cartOwner = readRaw(CART_OWNER_KEY);
    if (Array.isArray(cart) && cart.length && (!cartOwner || cartOwner === "guest")) {
      writeRaw(CART_OWNER_KEY, ownerOf(user));
    }
  }

  function resolveDestination(user) {
    const target = String(readRaw(REDIRECT_KEY) || "").trim();
    removeKey(REDIRECT_KEY);

    const allowed = ["catalog.html", "index.html", "profile.html", "order-success.html", "admin.html"];
    let destination = allowed.includes(target) ? target : "";
    if (destination === "admin.html" && !isAdminUser(user)) destination = "";
    if (!destination) destination = isAdminUser(user) ? "admin.html" : "profile.html";
    return destination;
  }

  function redirectToCabinet(user) {
    window.location.href = isAdminUser(user) ? "admin.html" : "profile.html";
  }

  // --------------------------------------------------------------------------
  // Сообщения под формой
  // --------------------------------------------------------------------------
  function clearMessages() {
    if (errorBox) {
      errorBox.hidden = true;
      errorBox.textContent = "";
    }
    if (successBox) {
      successBox.hidden = true;
      successBox.textContent = "";
    }
    loginInput?.removeAttribute("aria-invalid");
    nameInput?.removeAttribute("aria-invalid");
    passwordInput?.removeAttribute("aria-invalid");
    confirmInput?.removeAttribute("aria-invalid");
  }

  function showError(message, field) {
    if (successBox) successBox.hidden = true;
    if (!errorBox) return;
    errorBox.textContent = message;
    errorBox.hidden = false;
    field?.setAttribute("aria-invalid", "true");
    field?.focus();
  }

  function showSuccess(message) {
    if (errorBox) errorBox.hidden = true;
    if (!successBox) return;
    successBox.textContent = message;
    successBox.hidden = false;
  }

  // --------------------------------------------------------------------------
  // Режимы формы
  // --------------------------------------------------------------------------
  function setMode(next) {
    mode = next;
    const data = content[mode];

    card.dataset.authMode = mode;
    title.textContent = data.title;
    subtitle.textContent = data.subtitle;
    switchText.textContent = data.switchText;
    toggle.textContent = data.toggleLabel;
    if (submitButton) submitButton.textContent = data.submitLabel;
    if (note) note.innerHTML = data.note;
    if (nameField) nameField.hidden = mode !== "register";
    if (confirmField) confirmField.hidden = mode !== "register";
    tabs.forEach((tab) => {
      const active = tab.dataset.authTab === mode;
      tab.classList.toggle("auth-tab--active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    if (passwordInput) {
      passwordInput.value = "";
      passwordInput.setAttribute("autocomplete", mode === "register" ? "new-password" : "current-password");
      passwordInput.setAttribute("minlength", mode === "register" ? "6" : "");
    }
    if (confirmInput) confirmInput.value = "";
    document.title = data.docTitle;
    clearMessages();

    if (mode === "register") nameInput?.focus();
    else loginInput?.focus();
  }

  // --------------------------------------------------------------------------
  // Старт: уже авторизованного пользователя сразу отправляем в кабинет
  // --------------------------------------------------------------------------
  const users = ensureRegistered();
  const activeSession = normalizeActiveSession(users);

  if (activeSession) {
    card.hidden = true;
    redirectToCabinet(activeSession);
    return;
  }

  setMode("login");

  // Сообщение, с которым пользователя отправили на вход с другой страницы.
  try {
    const pendingNotice = readRaw(NOTICE_KEY);
    if (pendingNotice) {
      showError(pendingNotice);
      removeKey(NOTICE_KEY);
    }
  } catch (error) {
    // db.json может быть недоступен
  }

  toggle?.addEventListener("click", () => {
    submitting = false;
    if (submitButton) submitButton.disabled = false;
    setMode(mode === "login" ? "register" : "login");
  });

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const next = tab.dataset.authTab === "register" ? "register" : "login";
      if (next === mode) return;
      submitting = false;
      if (submitButton) submitButton.disabled = false;
      setMode(next);
    });
  });

  loginInput?.addEventListener("input", clearMessages);
  passwordInput?.addEventListener("input", clearMessages);
  confirmInput?.addEventListener("input", clearMessages);
  nameInput?.addEventListener("input", clearMessages);

  // --------------------------------------------------------------------------
  // Отправка формы
  // --------------------------------------------------------------------------
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (submitting) return;

    const loginValue = String(loginInput?.value || "").trim();
    const password = String(passwordInput?.value || "");

    if (!loginValue) {
      showError("Введите телефон или email", loginInput);
      return;
    }
    if (!password) {
      showError("Введите пароль", passwordInput);
      return;
    }

    if (mode === "register") {
      const name = String(nameInput?.value || "").trim();
      const letterCount = (name.match(/[A-Za-zА-Яа-яЁё]/g) || []).length;

      if (name.length < 2 || letterCount < 2) {
        showError("Имя должно содержать минимум 2 буквы", nameInput);
        return;
      }

      const parsed = parseLogin(loginValue);
      if (!parsed.ok) {
        showError(parsed.message, loginInput);
        return;
      }

      if (password.length < 6) {
        showError("Пароль должен содержать минимум 6 символов", passwordInput);
        return;
      }

      const confirmation = String(confirmInput?.value || "");
      if (confirmation !== password) {
        showError("Пароли не совпадают", confirmInput);
        return;
      }

      const phone = parsed.type === "phone" ? formatPhone(parsed.value) : "";
      const email = parsed.type === "email" ? parsed.value : "";

      if (findSameLogin(phone, email, users)) {
        showError("Пользователь с таким телефоном или email уже зарегистрирован", loginInput);
        return;
      }

      const owner = parsed.type === "phone"
        ? (parsed.value === ANNA_PHONE ? "anna" : parsed.value)
        : `email-${email.replace(/[^a-z0-9]+/g, "-")}`;

      const newUser = {
        name,
        phone,
        email,
        password,
        role: "user",
        isNew: true,
        owner
      };

      users.push(newUser);
      writeJSON(REGISTERED_KEY, users);

      const session = saveSession(newUser);
      adoptGuestCart(session);
      removeKey(ORDER_KEY);

      submitting = true;
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Регистрация…";
      }

      const destination = resolveDestination(session);
      showSuccess("Регистрация прошла успешно!");

      setTimeout(() => {
        window.location.href = destination;
      }, 1200);
      return;
    }

    // Логин сравниваем и с email, и с нормализованным телефоном; пароль — без пробелов по краям.
    const loginKey = String(loginValue || "").trim().toLowerCase();
    const loginDigits = normalizePhone(loginKey);
    const found = users.find((user) => {
      const email = normalizeEmail(user.email);
      const phone = normalizePhone(user.phone);
      return (email && email === loginKey) || (loginDigits && phone === loginDigits);
    }) || null;

    if (!found || String(found.password || "").trim() !== password.trim()) {
      showError("Неверный логин или пароль", loginInput);
      return;
    }

    writeJSON(USER_KEY, found);
    adoptGuestCart(found);
    window.location.href = resolveDestination(found);
  });
})();
