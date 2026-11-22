document.addEventListener('click', function (e) {
  const btn = e.target.closest('button, a');
  if (!btn) return;
  if (btn.textContent && btn.textContent.trim().includes('Оформить заказ')) {
    const rawUser = localStorage.getItem('apoest_user');
    let user = null;
    try { user = JSON.parse(rawUser); } catch (err) {}
    if (!user || (!user.email && !user.phone && !user.name)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      localStorage.setItem('apoest_redirect_after_auth', 'catalog.html');

      // Сохраняем уведомление, чтобы оно отобразилось на странице входа/регистрации.
      const notice = 'Войдите в аккаунт для оформления заказа';
      localStorage.setItem('apoest_auth_notice', notice);
      let toast = document.getElementById('appToast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'appToast';
        toast.className = 'toast';
        toast.setAttribute('role', 'status');
        (document.body || document.documentElement).appendChild(toast);
      }
      toast.textContent = notice;
      toast.classList.add('is-show');

      window.location.href = 'auth.html';
    }
  }
}, true);

// ============================================================================
// А поесть? — единая база localStorage и сквозной функционал сайта
// ============================================================================

(function () {
  "use strict";

  // --------------------------------------------------------------------------
  // Константы и утилиты
  // --------------------------------------------------------------------------
  const KEYS = {
    dishes: "apoest_dishes",
    orders: "apoest_orders",
    users: "apoest_registered_users",
    user: "apoest_user",
    addresses: "apoest_addresses",
    activeAddress: "apoest_active_address",
    cart: "apoest_cart",
    cartOwner: "apoest_cart_owner",
    activeOrder: "apoest_active_order",
    tickets: "apoest_tickets",
    redirectAfterAuth: "apoest_redirect_after_auth",
    authNotice: "apoest_auth_notice",
    initialized: "apoest_initialized"
  };

  const CATEGORIES = ["Боулы", "Супы", "Паста", "Салаты", "Завтраки", "Пицца"];
  const MEAL_LABELS = { breakfast: "Завтрак", lunch: "Обед", dinner: "Ужин" };
  const STATUSES = [
    { key: "accepted", label: "Принят" },
    { key: "cooking", label: "Готовится" },
    { key: "on-way", label: "В пути" },
    { key: "delivered", label: "Доставлен" },
    { key: "cancelled", label: "Отменён" }
  ];
  const ACTIVE_STATUSES = ["accepted", "cooking", "on-way"];
  const DELIVERY_FREE_FROM = 900;
  const DELIVERY_FEE = 290;
  const ANNA_PHONE = "9161234567";
  const ANNA_EMAIL = "anna@apoest.ru";
  const ANNA_USER = {
    name: "Анна",
    phone: "+7 (916) 123-45-67",
    email: ANNA_EMAIL,
    password: "anna123",
    role: "user",
    isNew: false,
    owner: "anna"
  };
  const ADMIN_USER = {
    name: "Администратор",
    phone: "+7 (900) 000-00-01",
    email: "admin@apoest.ru",
    password: "admin123",
    role: "admin",
    isNew: false,
    owner: "admin"
  };
  const DEMO_USERS = [ANNA_USER, ADMIN_USER];
  const MONTHS = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря"
  ];

  const el = (id) => document.getElementById(id);
  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function readJSON(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value === null || value === undefined ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      // localStorage может быть недоступен
    }
  }

  function readRaw(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function writeRaw(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch (error) {
      // localStorage может быть недоступен
    }
  }

  function removeKey(key) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      // localStorage может быть недоступен
    }
  }

  function normalizePhone(value) {
    const digits = String(value || "").replace(/\D/g, "");
    return digits.length === 11 && (digits[0] === "7" || digits[0] === "8")
      ? digits.slice(1)
      : digits;
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }

  const pad2 = (value) => String(value).padStart(2, "0");
  const timeOf = (date) => `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

  function money(value) {
    const number = String(Math.round(Number(value) || 0)).replace(
      /\B(?=(\d{3})+(?!\d))/g,
      "\u00A0"
    );
    return `${number}\u00A0₽`;
  }

  function plural(count, one, few, many) {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
  }

  function displayImage(src) {
    return String(src || "").replace(/\.png(?=$|\?)/i, ".jpg");
  }

  function formatDateLabel(date) {
    const value = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(value.getTime())) return "";
    return `${value.getDate()} ${MONTHS[value.getMonth()]}, ${timeOf(value)}`;
  }

  function formatDateLong(date) {
    const value = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(value.getTime())) return "";
    return `${value.getDate()} ${MONTHS[value.getMonth()]} ${value.getFullYear()}`;
  }

  function ownerOf(user) {
    if (!user) return "guest";
    if (user.owner) return String(user.owner);
    const digits = normalizePhone(user.phone);
    return digits === ANNA_PHONE ? "anna" : (digits || "guest");
  }

  // Администратор определяется только по явной роли.
  function isAdminUser(user) {
    if (!user || typeof user !== "object") return false;
    const role = String(user.role || "").toLowerCase();
    return user.isAdmin === true || role === "admin" || role === "administrator";
  }

  function statusLabel(key) {
    return (STATUSES.find((item) => item.key === key) || STATUSES[0]).label;
  }

  function maskPhone(value) {
    const digits = String(value || "").replace(/\D/g, "");
    const tail = digits.slice(-4) || "0000";
    return `•• ${tail.slice(0, 2)}-${tail.slice(2)}`;
  }

  function normalizeWeight(value) {
    const text = String(value || "").trim();
    if (!text) return "0 г";
    return /[a-zа-яё]/i.test(text) ? text : `${text} г`;
  }

  // --------------------------------------------------------------------------
  // Стартовые данные
  // --------------------------------------------------------------------------
  const DEFAULT_DISHES = [
    {
      id: "bowl-chicken",
      name: "Боул с курицей",
      category: "Боулы",
      meals: ["lunch", "dinner"],
      diet: { noMeat: false, noGluten: false, noLactose: false },
      price: 420,
      weight: "350 г",
      composition: "Киноа, авокадо, овощи и соус тахини",
      img: "assets/images/dish-1.png",
      badge: "Хит",
      isAvailable: true,
      popularity: 1
    },
    {
      id: "pumpkin-soup",
      name: "Тыквенный суп",
      category: "Супы",
      meals: ["lunch", "dinner"],
      diet: { noMeat: true, noGluten: true, noLactose: true },
      price: 290,
      weight: "300 г",
      composition: "Со сливками, семечками и хрустящим тостом",
      img: "assets/images/dish-6.png",
      badge: "Согревает",
      isAvailable: true,
      popularity: 2
    },
    {
      id: "tomato-pasta",
      name: "Паста с томатами",
      category: "Паста",
      meals: ["lunch", "dinner"],
      diet: { noMeat: true, noGluten: true, noLactose: true },
      price: 390,
      weight: "320 г",
      composition: "Пенне, спелые томаты, базилик и пармезан",
      img: "assets/images/dish-5.png",
      badge: "",
      isAvailable: true,
      popularity: 3
    },
    {
      id: "avocado-salad",
      name: "Салат с авокадо",
      category: "Салаты",
      meals: ["lunch", "dinner"],
      diet: { noMeat: true, noGluten: false, noLactose: false },
      price: 360,
      weight: "240 г",
      composition: "Свежая зелень, огурец и лимонная заправка",
      img: "assets/images/dish-4.png",
      badge: "Лёгкий выбор",
      isAvailable: true,
      popularity: 4
    },
    {
      id: "syrniki-berries",
      name: "Сырники с ягодами",
      category: "Завтраки",
      meals: ["breakfast"],
      diet: { noMeat: true, noGluten: false, noLactose: false },
      price: 320,
      weight: "220 г",
      composition: "Нежный творог, сметана и ягодный соус",
      img: "assets/images/dish-3.png",
      badge: "",
      isAvailable: true,
      popularity: 5
    },
    {
      id: "pizza-margherita",
      name: "Пицца Маргарита",
      category: "Пицца",
      meals: ["lunch", "dinner"],
      diet: { noMeat: true, noGluten: false, noLactose: false },
      price: 540,
      weight: "450 г",
      composition: "Моцарелла, томаты и свежий базилик",
      img: "assets/images/dish-2.png",
      badge: "",
      isAvailable: true,
      popularity: 6
    }
  ];

  function cartItemFromDish(dish, qty = 1) {
    return {
      id: dish.id,
      name: dish.name,
      price: dish.price,
      qty,
      grams: dish.weight,
      img: dish.img
    };
  }

  function buildSeedOrders() {
    const now = new Date();
    const minutesAgo = (minutes) => new Date(now.getTime() - minutes * 60 * 1000);
    const daysAgo = (days, hours, minutes) => {
      const date = new Date(now);
      date.setDate(date.getDate() - days);
      date.setHours(hours, minutes, 0, 0);
      return date;
    };
    const dish = (id) => DEFAULT_DISHES.find((item) => item.id === id);
    const item = (id, qty) => cartItemFromDish(dish(id), qty);
    const totals = (items) => items.reduce(
      (sum, entry) => sum + entry.price * entry.qty,
      0
    );
    const make = (number, created, status, clientName, clientPhone, owner, items, address, extra = {}) => {
      const itemsTotal = totals(items);
      const deliveryCost = itemsTotal >= DELIVERY_FREE_FROM ? 0 : DELIVERY_FEE;
      return {
        id: `order-${number}`,
        number,
        owner,
        clientName,
        clientPhone,
        items,
        itemsTotal,
        deliveryCost,
        total: itemsTotal + deliveryCost,
        status,
        createdAt: created.toISOString(),
        dateLabel: formatDateLabel(created),
        etaFrom: timeOf(new Date(created.getTime() + 30 * 60 * 1000)),
        etaTo: timeOf(new Date(created.getTime() + 45 * 60 * 1000)),
        address,
        payment: "Картой •• 4242",
        ...extra
      };
    };

    const order1049 = minutesAgo(12);
    const order1048 = minutesAgo(16);
    const order1047 = minutesAgo(35);
    const order1046 = minutesAgo(60);
    const order1045 = minutesAgo(85);
    const order1041 = daysAgo(3, 12, 10);
    const order1033 = daysAgo(7, 18, 45);

    return [
      make(1049, order1049, "accepted", "Михаил К.", "+7 (925) 000-62-18", "mikhail",
        [item("bowl-chicken", 3)], "Москва, ул. Мира, 24, кв. 8"),
      make(1048, order1048, "cooking", "Анна С.", "+7 (916) 123-45-67", "anna",
        [item("bowl-chicken", 2), item("pumpkin-soup", 1)],
        "Москва, ул. Лесная, 12, кв. 45"),
      make(1047, order1047, "on-way", "Иван П.", "+7 (903) 000-90-12", "ivan",
        [item("avocado-salad", 3)], "Москва, ул. Правды, 8, офис 3"),
      make(1046, order1046, "delivered", "Мария Л.", "+7 (926) 000-31-09", "maria",
        [item("pizza-margherita", 2)], "Москва, Ленинградский пр-т, 15, кв. 22"),
      make(1045, order1045, "cancelled", "Олег В.", "+7 (985) 000-84-22", "oleg",
        [item("tomato-pasta", 3)], "Москва, ул. Тверская, 7, кв. 3"),
      make(1041, order1041, "delivered", "Анна С.", "+7 (916) 123-45-67", "anna",
        [item("bowl-chicken", 1), item("avocado-salad", 1), item("syrniki-berries", 1)],
        "Москва, ул. Лесная, 12, кв. 45"),
      make(1033, order1033, "delivered", "Анна С.", "+7 (916) 123-45-67", "anna",
        [item("pizza-margherita", 2)], "Москва, ул. Лесная, 12, кв. 45")
    ];
  }

  function buildSeedTickets() {
    const now = new Date();
    const minutesAgo = (minutes) => new Date(now.getTime() - minutes * 60 * 1000);
    return [
      {
        id: "ticket-1049",
        userName: "Михаил К.",
        userPhone: "+7 (925) 000-62-18",
        orderNumber: 1049,
        message: "Можно добавить больше соуса тахини?",
        createdAt: minutesAgo(9).toISOString(),
        status: "Новое",
        adminReply: ""
      },
      {
        id: "ticket-1046",
        userName: "Мария Л.",
        userPhone: "+7 (926) 000-31-09",
        orderNumber: 1046,
        message: "Пицца очень вкусная, но приехала чуть тёплой. Можно в следующий раз упаковать её в термосумку?",
        createdAt: minutesAgo(55).toISOString(),
        status: "Отвечено",
        adminReply: "Здравствуйте, Мария! Спасибо за отзыв. Передали пожелание кухне и курьерам — в следующий раз обязательно учтём."
      }
    ];
  }

  function defaultAddresses(owner) {
    return [
      {
        id: "addr-home",
        label: "Дом",
        city: "Москва",
        street: "ул. Лесная",
        house: "12",
        flat: "45",
        owner,
        isDefault: true
      },
      {
        id: "addr-work",
        label: "Работа",
        city: "Москва",
        street: "ул. Правды",
        house: "8",
        flat: "офис 3",
        owner,
        isDefault: false
      }
    ];
  }

  // --------------------------------------------------------------------------
  // Инициализация и нормализация хранилища
  // --------------------------------------------------------------------------
  function normalizeDish(dish, index) {
    const source = dish && typeof dish === "object" ? dish : {};
    const meals = Array.isArray(source.meals) && source.meals.length
      ? source.meals.filter((meal) => MEAL_LABELS[meal])
      : ["lunch", "dinner"];
    const diet = source.diet && typeof source.diet === "object" ? source.diet : {};
    return {
      id: String(source.id || `dish-${index + 1}`),
      name: String(source.name || "Блюдо"),
      category: CATEGORIES.includes(source.category) ? source.category : CATEGORIES[0],
      meals: meals.length ? meals : ["lunch", "dinner"],
      diet: {
        noMeat: diet.noMeat === true,
        noGluten: diet.noGluten === true,
        noLactose: diet.noLactose === true
      },
      price: Math.max(0, Math.round(Number(source.price) || 0)),
      weight: normalizeWeight(source.weight || source.grams),
      composition: String(source.composition || source.desc || ""),
      img: String(source.img || "assets/images/dish-1.png"),
      badge: String(source.badge || ""),
      isAvailable: source.isAvailable !== false,
      popularity: Number(source.popularity) || index + 1
    };
  }

  function normalizeOrder(order, index) {
    const source = order && typeof order === "object" ? order : {};
    const items = (Array.isArray(source.items) ? source.items : []).map((item) => ({
      id: String(item && item.id ? item.id : `item-${index}`),
      name: String(item && item.name ? item.name : "Блюдо"),
      price: Math.max(0, Number(item && item.price) || 0),
      qty: Math.max(1, Math.floor(Number(item && item.qty) || 1)),
      grams: String(item && item.grams ? item.grams : ""),
      img: String(item && item.img ? item.img : "assets/images/dish-1.png")
    }));
    const itemsTotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const status = STATUSES.some((entry) => entry.key === source.status)
      ? source.status
      : "accepted";
    const created = source.createdAt ? new Date(source.createdAt) : new Date();
    const validDate = Number.isNaN(created.getTime()) ? new Date() : created;
    const deliveryCost = Number.isFinite(Number(source.deliveryCost))
      ? Math.max(0, Number(source.deliveryCost))
      : (itemsTotal >= DELIVERY_FREE_FROM ? 0 : DELIVERY_FEE);
    return {
      id: String(source.id || `order-${source.number || index + 1}`),
      number: Number(source.number) || 1045 + index,
      owner: String(source.owner || "anna"),
      clientName: String(source.clientName || "Гость"),
      clientPhone: String(source.clientPhone || ""),
      items,
      itemsTotal,
      deliveryCost,
      total: Number.isFinite(Number(source.total))
        ? Math.max(0, Number(source.total))
        : itemsTotal + deliveryCost,
      status,
      createdAt: validDate.toISOString(),
      dateLabel: String(source.dateLabel || formatDateLabel(validDate)),
      etaFrom: String(source.etaFrom || timeOf(new Date(validDate.getTime() + 30 * 60 * 1000))),
      etaTo: String(source.etaTo || timeOf(new Date(validDate.getTime() + 45 * 60 * 1000))),
      address: String(source.address || "Адрес не указан"),
      payment: String(source.payment || "Картой •• 4242")
    };
  }

  function normalizeTicket(ticket, index) {
    const source = ticket && typeof ticket === "object" ? ticket : {};
    const created = source.createdAt ? new Date(source.createdAt) : new Date();
    const validDate = Number.isNaN(created.getTime()) ? new Date() : created;
    const rawNumber = source.orderNumber;
    const orderNumber = rawNumber === null || rawNumber === undefined
      ? ""
      : String(rawNumber).replace(/^№\s*/, "").trim();
    return {
      id: String(source.id || `ticket-${Date.now()}-${index}`),
      userName: String(source.userName || "Гость"),
      userPhone: String(source.userPhone || ""),
      orderNumber,
      message: String(source.message || ""),
      createdAt: validDate.toISOString(),
      status: source.status === "Отвечено" ? "Отвечено" : "Новое",
      adminReply: String(source.adminReply || "")
    };
  }

  function readTicketsRaw() {
    const value = readJSON(KEYS.tickets, null);
    if (!Array.isArray(value) || !value.length) return buildSeedTickets().map(normalizeTicket);
    return value.map(normalizeTicket);
  }

  function readDishesRaw() {
    const value = readJSON(KEYS.dishes, null);
    if (!Array.isArray(value) || !value.length) return DEFAULT_DISHES.map(normalizeDish);
    return value.map(normalizeDish);
  }

  function readOrdersRaw() {
    const value = readJSON(KEYS.orders, null);
    if (!Array.isArray(value)) return buildSeedOrders().map(normalizeOrder);
    return value.map(normalizeOrder);
  }

  function ensureSeedData() {
    const initialized = readRaw(KEYS.initialized) === "1";
    let existingUser = readJSON(KEYS.user, null);
    const seedOwner = existingUser && typeof existingUser === "object"
      ? ownerOf(existingUser)
      : "anna";

    const dishes = readJSON(KEYS.dishes, null);
    if (!Array.isArray(dishes) || !dishes.length) {
      writeJSON(KEYS.dishes, DEFAULT_DISHES.map(normalizeDish));
    }

    const orders = readJSON(KEYS.orders, null);
    if (!Array.isArray(orders) || !orders.length) {
      writeJSON(KEYS.orders, buildSeedOrders().map(normalizeOrder));
    }

    const tickets = readJSON(KEYS.tickets, null);
    if (!Array.isArray(tickets) || !tickets.length) {
      writeJSON(KEYS.tickets, buildSeedTickets().map(normalizeTicket));
    }

    // Два демо-пользователя всегда есть в базе: покупатель Анна и администратор.
    let users = readJSON(KEYS.users, []);
    if (!Array.isArray(users)) users = [];
    users = users.filter((user) => user && typeof user === "object");
    DEMO_USERS.forEach((demo) => {
      const index = users.findIndex((user) =>
        (demo.phone && normalizePhone(user.phone) === normalizePhone(demo.phone))
        || (demo.email && normalizeEmail(user.email) === normalizeEmail(demo.email))
      );
      if (index === -1) users.push({ ...demo });
      else users[index] = { ...users[index], ...demo };
    });
    writeJSON(KEYS.users, users);

    // Синхронизируем роль активной сессии с базой (например, Анна — покупатель).
    if (existingUser && typeof existingUser === "object") {
      const demo = DEMO_USERS.find((user) =>
        (existingUser.phone && normalizePhone(user.phone) === normalizePhone(existingUser.phone))
        || (existingUser.email && normalizeEmail(user.email) === normalizeEmail(existingUser.email))
      );
      if (demo) {
        const normalized = {
          ...existingUser,
          email: existingUser.email || demo.email,
          role: demo.role,
          owner: demo.owner
        };
        writeJSON(KEYS.user, normalized);
        existingUser = normalized;
      }
    }

    if (!initialized) {
      // Автоматически в аккаунт не входим: гость должен явно авторизоваться,
      // прежде чем оформлять заказ или открывать закрытые страницы.
      if (!Array.isArray(readJSON(KEYS.addresses, null))) {
        const addresses = defaultAddresses(seedOwner);
        writeJSON(KEYS.addresses, addresses);
        writeRaw(KEYS.activeAddress, addresses[0].id);
      }
      if (!Array.isArray(readJSON(KEYS.cart, null))) {
        writeJSON(KEYS.cart, [
          cartItemFromDish(DEFAULT_DISHES[0], 2),
          cartItemFromDish(DEFAULT_DISHES[1], 1)
        ]);
        writeRaw(KEYS.cartOwner, seedOwner);
      }
      if (!readJSON(KEYS.activeOrder, null)) {
        const currentOrders = readOrdersRaw();
        const seeded = currentOrders.find((order) => order.number === 1048 && order.owner === seedOwner);
        if (seeded) writeJSON(KEYS.activeOrder, seeded);
      }
      writeRaw(KEYS.initialized, "1");
    } else if (!readJSON(KEYS.activeOrder, null)) {
      const currentOrders = readOrdersRaw();
      const active = currentOrders
        .filter((order) => ACTIVE_STATUSES.includes(order.status) && order.owner === seedOwner)
        .sort((a, b) => b.number - a.number)[0];
      if (active) writeJSON(KEYS.activeOrder, active);
    }
  }

  ensureSeedData();

  const DB = {
    KEYS,
    CATEGORIES,
    STATUSES,
    readJSON,
    writeJSON,
    readRaw,
    writeRaw,
    removeKey,
    normalizePhone,
    normalizeEmail,
    ownerOf,
    escapeHtml,
    money,
    plural,
    displayImage,
    formatDateLabel,
    formatDateLong,
    timeOf,
    statusLabel,
    maskPhone,
    normalizeWeight,
    getDishes: readDishesRaw,
    saveDishes: (dishes) => writeJSON(KEYS.dishes, dishes.map(normalizeDish)),
    getOrders: readOrdersRaw,
    saveOrders: (orders) => writeJSON(KEYS.orders, orders.map(normalizeOrder)),
    getTickets: readTicketsRaw,
    saveTickets: (tickets) => writeJSON(KEYS.tickets, tickets.map(normalizeTicket)),
    getUsers: () => {
      const value = readJSON(KEYS.users, []);
      return Array.isArray(value) ? value : [];
    },
    getDemoUsers: () => DEMO_USERS.map((user) => ({ ...user })),
    saveUsers: (users) => writeJSON(KEYS.users, users),
    getUser: () => readJSON(KEYS.user, null),
    setUser: (user) => writeJSON(KEYS.user, user),
    clearUser: () => removeKey(KEYS.user),
    isAdminUser,
    getAddresses: () => {
      const value = readJSON(KEYS.addresses, []);
      return Array.isArray(value) ? value : [];
    },
    saveAddresses: (addresses) => writeJSON(KEYS.addresses, addresses),
    ensureSeed: ensureSeedData
  };

  window.ApoestDB = DB;

  // Страница авторизации: оба сценария — «Вход в аккаунт» и «Регистрация» —
  // работают в общей базе. Обработчик стоит здесь, чтобы полная версия не
  // зависела от порядка подключения js/auth.js.
  if (document.body.classList.contains("auth-page")) {
    window.ApoestDB?.ensureSeed?.();

    const authCard = qs("[data-auth-card]");
    const authForm = authCard?.querySelector(".auth-form");
    if (authForm) {
      const loginField = authCard.querySelector("[data-auth-login]");
      const passwordField = authCard.querySelector("[data-auth-password]");
      const nameField = authCard.querySelector("[data-auth-name]");
      const confirmField = authCard.querySelector("[data-auth-confirm]");
      const errorBox = authCard.querySelector("[data-auth-error]");
      const successBox = authCard.querySelector("[data-auth-success]");
      const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

      const authError = (message, field) => {
        if (successBox) successBox.hidden = true;
        if (!errorBox) return;
        errorBox.textContent = message;
        errorBox.hidden = false;
        field?.focus();
      };
      const authSuccess = (message) => {
        if (errorBox) errorBox.hidden = true;
        if (!successBox) return;
        successBox.textContent = message;
        successBox.hidden = false;
      };
      const adoptCart = (user) => {
        const cart = readJSON(KEYS.cart, null);
        const cartOwner = readRaw(KEYS.cartOwner);
        if (Array.isArray(cart) && cart.length && (!cartOwner || cartOwner === "guest")) {
          writeRaw(KEYS.cartOwner, ownerOf(user));
        }
      };
      const authDestination = (user) => {
        const target = String(readRaw(KEYS.redirectAfterAuth) || "").trim();
        removeKey(KEYS.redirectAfterAuth);
        const allowed = ["catalog.html", "index.html", "profile.html", "order-success.html", "admin.html"];
        if (allowed.includes(target) && (target !== "admin.html" || isAdminUser(user))) return target;
        return isAdminUser(user) ? "admin.html" : "profile.html";
      };
      const findAuthUser = (value, list) => {
        const login = String(value || "").trim().toLowerCase();
        const digits = normalizePhone(login);
        if (!login) return null;
        return list.find((user) => {
          const email = normalizeEmail(user.email);
          const phone = normalizePhone(user.phone);
          return (email && email === login) || (digits && phone === digits);
        }) || null;
      };

      authForm.addEventListener("submit", (event) => {
        event.preventDefault();
        // js/auth.js подключён после main.js: не даём ему обработать тот же submit.
        event.stopImmediatePropagation();

        const login = String(loginField?.value || "").trim().toLowerCase();
        const password = String(passwordField?.value || "").trim();
        const users = DB.getUsers();

        if (!login) {
          authError("Введите телефон или email", loginField);
          return;
        }
        if (!password) {
          authError("Введите пароль", passwordField);
          return;
        }

        if (authCard.dataset.authMode === "register") {
          const name = String(nameField?.value || "").trim();
          const letters = (name.match(/[A-Za-zА-Яа-яЁё]/g) || []).length;
          if (name.length < 2 || letters < 2) {
            authError("Имя должно содержать минимум 2 буквы", nameField);
            return;
          }
          const looksLikeEmail = login.includes("@") || /[A-Za-zА-Яа-яЁё]/.test(login);
          const isEmail = looksLikeEmail && EMAIL.test(login);
          const digits = normalizePhone(login);
          if (looksLikeEmail && !isEmail) {
            authError("Введите корректный email", loginField);
            return;
          }
          if (!isEmail && digits.length !== 10) {
            authError("Введите корректный номер телефона", loginField);
            return;
          }
          if (password.length < 6) {
            authError("Пароль должен содержать минимум 6 символов", passwordField);
            return;
          }
          if (String(confirmField?.value || "") !== password) {
            authError("Пароли не совпадают", confirmField);
            return;
          }

          const phone = isEmail
            ? ""
            : `+7 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 10)}`;
          const email = isEmail ? login : "";
          const same = users.some((user) =>
            (email && normalizeEmail(user.email) === email)
            || (phone && normalizePhone(user.phone) === normalizePhone(phone))
          );
          if (same) {
            authError("Пользователь с таким телефоном или email уже зарегистрирован", loginField);
            return;
          }

          const owner = isEmail ? `email-${email.replace(/[^a-z0-9]+/g, "-")}` : digits;
          const newUser = { name, phone, email, password, role: "user", isNew: true, owner };
          DB.saveUsers(users.concat(newUser));
          localStorage.setItem(KEYS.user, JSON.stringify(newUser));
          adoptCart(newUser);
          removeKey(KEYS.activeOrder);

          authSuccess("Регистрация прошла успешно!");
          const destination = authDestination(newUser);
          setTimeout(() => { window.location.href = destination; }, 700);
          return;
        }

        const found = findAuthUser(login, users);
        if (!found || String(found.password || "").trim() !== password) {
          authError("Неверный логин или пароль", loginField);
          return;
        }

        localStorage.setItem(KEYS.user, JSON.stringify(found));
        adoptCart(found);
        authSuccess("Вы успешно вошли!");
        window.location.href = authDestination(found);
      });
    }
    return;
  }

  // --------------------------------------------------------------------------
  // Защита закрытых страниц
  // --------------------------------------------------------------------------
  const sessionUser = DB.getUser();
  const isAdminPage = document.body.classList.contains("admin-page");
  const isProtectedPage = isAdminPage
    || document.body.classList.contains("profile-page")
    || document.body.classList.contains("success-page");

  if (isProtectedPage && (!sessionUser || (isAdminPage && !isAdminUser(sessionUser)))) {
    window.location.href = "auth.html";
    return;
  }

  // --------------------------------------------------------------------------
  // Текущий пользователь
  // --------------------------------------------------------------------------
  let currentUser = sessionUser;
  let userName = currentUser ? String(currentUser.name || "Пользователь") : "Гость";
  let userPhone = currentUser ? String(currentUser.phone || "") : "";
  let currentOwner = currentUser ? DB.ownerOf(currentUser) : "guest";

  function updateUserUI() {
    qsa(".profile-btn__name").forEach((node) => {
      node.textContent = currentUser ? userName : "Войти";
    });
    qsa(".profile-btn").forEach((link) => {
      link.setAttribute("href", currentUser ? "profile.html" : "auth.html");
    });

    const avatar = qs(".profile-avatar");
    const cardName = qs(".profile-card__name");
    const cardPhone = qs(".profile-card__phone");
    if (avatar) avatar.textContent = (currentUser ? userName : "Г").charAt(0).toUpperCase();
    if (cardName) cardName.textContent = currentUser ? userName : "Гость";
    if (cardPhone) cardPhone.textContent = currentUser ? userPhone : "Войдите в аккаунт";

    const adminName = qs(".admin-header__name");
    if (adminName) adminName.textContent = `${currentUser ? userName : "Администратор"} · администратор`;
  }

  updateUserUI();

  // --------------------------------------------------------------------------
  // Адреса
  // --------------------------------------------------------------------------
  function allAddresses() {
    return DB.getAddresses().filter((address) => address && typeof address === "object");
  }

  function userAddresses(owner = currentOwner) {
    return allAddresses().filter((address) => !address.owner || address.owner === owner);
  }

  function activeAddress(owner = currentOwner) {
    const list = userAddresses(owner);
    const activeId = DB.readRaw(KEYS.activeAddress);
    return list.find((address) => address.id === activeId)
      || list.find((address) => address.isDefault)
      || list[0]
      || null;
  }

  function setActiveAddress(id) {
    DB.writeRaw(KEYS.activeAddress, id);
  }

  function addressShort(address) {
    if (!address) return "Выберите адрес";
    return `${address.city || "Москва"}, ${address.street}, ${address.house}`;
  }

  function addressFull(address) {
    if (!address) return "Адрес не указан";
    const flat = String(address.flat || "").trim();
    const flatText = !flat
      ? ""
      : (/^офис/i.test(flat) ? `, ${flat}` : `, кв. ${flat}`);
    return `${address.city || "Москва"}, ${address.street}, ${address.house}${flatText}`;
  }

  function addressTitle(address) {
    if (!address) return "Укажите адрес доставки";
    return `${address.street}, ${address.house}`;
  }

  // --------------------------------------------------------------------------
  // Корзина
  // --------------------------------------------------------------------------
  const PRESET_CART = [
    cartItemFromDish(DEFAULT_DISHES[0], 2),
    cartItemFromDish(DEFAULT_DISHES[1], 1)
  ];

  function sanitizeCart(value) {
    if (!Array.isArray(value)) return [];
    return value.reduce((items, item) => {
      if (!item || typeof item !== "object" || !item.id) return items;
      const qty = Math.floor(Number(item.qty));
      if (!Number.isFinite(qty) || qty <= 0) return items;
      items.push({
        id: String(item.id),
        name: String(item.name || ""),
        price: Math.max(0, Number(item.price) || 0),
        qty,
        grams: String(item.grams || ""),
        img: String(item.img || "assets/images/dish-1.png")
      });
      return items;
    }, []);
  }

  function loadCart() {
    const stored = readJSON(KEYS.cart, null);
    const storedOwner = readRaw(KEYS.cartOwner);
    if (Array.isArray(stored) && (!storedOwner || storedOwner === currentOwner)) {
      return sanitizeCart(stored);
    }
    if (!readRaw(KEYS.cart) && currentOwner === "anna") {
      return PRESET_CART.map((item) => ({ ...item }));
    }
    return [];
  }

  let cartItems = loadCart();

  function persistCart() {
    writeJSON(KEYS.cart, cartItems);
    writeRaw(KEYS.cartOwner, currentOwner);
  }

  if (!readRaw(KEYS.cart) || readRaw(KEYS.cartOwner) === currentOwner) {
    persistCart();
  }

  function cartTotals() {
    const count = cartItems.reduce((sum, item) => sum + item.qty, 0);
    const itemsTotal = cartItems.reduce((sum, item) => sum + item.price * item.qty, 0);
    const deliveryFee = itemsTotal >= DELIVERY_FREE_FROM || itemsTotal === 0 ? 0 : DELIVERY_FEE;
    return { count, itemsTotal, deliveryFee, total: itemsTotal + deliveryFee };
  }

  function cartItemMarkup(item) {
    const qty = Number(item.qty) || 1;
    const price = Number(item.price) || 0;
    return `
      <div class="cart-item" data-id="${escapeHtml(item.id)}" data-price="${price}" data-name="${escapeHtml(item.name)}">
        <img src="${escapeHtml(item.img)}" alt="${escapeHtml(item.name)}" class="cart-item__img" width="48" height="48">
        <div class="cart-item__body">
          <div class="cart-item__row">
            <div>
              <h3 class="cart-item__name">${escapeHtml(item.name)}</h3>
              <p class="cart-item__meta">${escapeHtml(item.grams)} · ${money(price)}</p>
            </div>
            <button class="cart-item__remove" type="button" data-remove aria-label="Удалить «${escapeHtml(item.name)}»">×</button>
          </div>
          <div class="cart-item__bottom">
            <div class="qty">
              <button class="qty__btn" type="button" data-dec aria-label="Уменьшить количество">−</button>
              <span class="qty__value">${qty}</span>
              <button class="qty__btn" type="button" data-inc aria-label="Увеличить количество">+</button>
            </div>
            <span class="cart-item__sum">${money(price * qty)}</span>
          </div>
        </div>
      </div>`;
  }

  function updateCartHeader() {
    const totals = cartTotals();
    qsa(".cart-btn__label").forEach((node) => {
      node.textContent = `${money(totals.total)} · ${totals.count}`;
    });

    const mobileCount = el("mobileCartCount");
    const mobileSum = el("mobileCartSum");
    if (mobileCount) mobileCount.textContent = String(totals.count);
    if (mobileSum) mobileSum.textContent = money(totals.total);

    const tabCount = el("tabCartCount");
    if (tabCount) {
      tabCount.textContent = String(totals.count);
      tabCount.hidden = totals.count === 0;
    }

    const tabCart = el("tabCart");
    if (tabCart) tabCart.setAttribute("aria-label", `Корзина, товаров: ${totals.count}`);
  }

  function renderCart() {
    updateCartHeader();
    const totals = cartTotals();

    const itemsNode = el("cartWidgetItems");
    if (itemsNode) {
      itemsNode.innerHTML = cartItems.length
        ? cartItems.map(cartItemMarkup).join("")
        : `
          <div class="cart-widget__empty">
            <span class="cart-widget__empty-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 8h14l-1 10.2a2 2 0 0 1-2 1.8H8a2 2 0 0 1-2-1.8L5 8Z" stroke="#D96B27" stroke-width="1.75" stroke-linejoin="round"/>
                <path d="M9 8V6.5a3 3 0 0 1 6 0V8" stroke="#D96B27" stroke-width="1.75" stroke-linecap="round"/>
              </svg>
            </span>
            <p class="cart-widget__empty-title">В корзине пока пусто</p>
            <p class="cart-widget__empty-text">Добавьте блюда из меню — приготовим и привезём за 30–45 минут.</p>
          </div>`;
    }

    const widgetCount = el("cartWidgetCount");
    if (widgetCount) {
      widgetCount.textContent = `${totals.count} ${plural(totals.count, "блюдо", "блюда", "блюд")}`;
    }

    const linesCount = el("cartLinesCount");
    if (linesCount) linesCount.textContent = `${totals.count} шт.`;

    const subtotal = el("cartSubtotal");
    if (subtotal) subtotal.textContent = money(totals.itemsTotal);

    const delivery = el("cartDelivery");
    if (delivery) {
      delivery.textContent = totals.deliveryFee ? money(totals.deliveryFee) : "Бесплатно";
    }

    const totalNode = el("cartTotal");
    if (totalNode) totalNode.textContent = money(totals.total);

    const note = qs(".cart-widget__note");
    if (note) {
      note.textContent = totals.count && totals.itemsTotal < DELIVERY_FREE_FROM
        ? `До бесплатной доставки ${money(DELIVERY_FREE_FROM - totals.itemsTotal)} · 30–45 минут`
        : "Бесплатная доставка от 900 ₽ · 30–45 минут";
    }

    const checkout = el("checkoutBtn");
    if (checkout) {
      // Кнопка оформления не должна превращаться в ссылку на order-success.html.
      if (checkout.hasAttribute("href")) checkout.removeAttribute("href");
      if (checkout.tagName === "BUTTON") checkout.setAttribute("type", "button");

      const empty = totals.count === 0;
      checkout.classList.toggle("cart-widget__checkout--disabled", empty);
      checkout.disabled = empty;
      if (empty) {
        checkout.setAttribute("aria-disabled", "true");
        checkout.setAttribute("tabindex", "-1");
      } else {
        checkout.removeAttribute("aria-disabled");
        checkout.removeAttribute("tabindex");
      }
    }
  }

  function addToCart(item, silent = false) {
    if (!item || !item.id) return;
    const existing = cartItems.find((entry) => entry.id === item.id);
    if (existing) {
      existing.qty += Number(item.qty) || 1;
    } else {
      cartItems.push({
        id: item.id,
        name: item.name || "Блюдо",
        price: Math.max(0, Number(item.price) || 0),
        qty: Math.max(1, Number(item.qty) || 1),
        grams: item.grams || "",
        img: item.img || "assets/images/dish-1.png"
      });
    }
    persistCart();
    renderCart();
    if (!silent) showToast(`«${item.name}» в корзине`);
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-cart]");
    if (!button) return;
    addToCart({
      id: button.dataset.id,
      name: button.dataset.name,
      price: Number(button.dataset.price) || 0,
      qty: 1,
      grams: button.dataset.grams,
      img: button.dataset.img
    });
  });

  const cartWidgetItems = el("cartWidgetItems");
  cartWidgetItems?.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    const row = button?.closest(".cart-item");
    if (!button || !row) return;
    const index = cartItems.findIndex((item) => item.id === row.dataset.id);
    if (index === -1) return;

    if (button.hasAttribute("data-inc")) {
      cartItems[index].qty += 1;
    } else if (button.hasAttribute("data-dec")) {
      cartItems[index].qty -= 1;
      if (cartItems[index].qty <= 0) cartItems.splice(index, 1);
    } else if (button.hasAttribute("data-remove")) {
      cartItems.splice(index, 1);
    } else {
      return;
    }
    persistCart();
    renderCart();
  });

  // --------------------------------------------------------------------------
  // Уведомления
  // --------------------------------------------------------------------------
  let toastTimer = null;
  function showToast(message) {
    let toast = el("appToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "appToast";
      toast.className = "toast";
      toast.setAttribute("role", "status");
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-show"), 2400);
  }

  // --------------------------------------------------------------------------
  // Модальные окна: адрес, настройки, поддержка
  // --------------------------------------------------------------------------
  function modalTemplate(id, title, subtitle, body) {
    const wrapper = document.createElement("div");
    wrapper.className = "support-modal app-modal";
    wrapper.id = id;
    wrapper.setAttribute("aria-hidden", "true");
    wrapper.innerHTML = `
      <div class="support-modal__overlay" data-modal-close></div>
      <div class="support-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="${id}Title">
        <div class="support-modal__head">
          <div>
            <h2 class="support-modal__title" id="${id}Title">${escapeHtml(title)}</h2>
            <p class="support-modal__subtitle">${escapeHtml(subtitle)}</p>
          </div>
          <button class="support-modal__close" type="button" aria-label="Закрыть" data-modal-close>
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" stroke="#1E1E1E" stroke-width="1.75" stroke-linecap="round"/></svg>
          </button>
        </div>
        <div class="support-modal__messages app-modal__body">${body}</div>
      </div>`;
    wrapper.addEventListener("click", (event) => {
      if (event.target.closest("[data-modal-close]")) closeModal(wrapper);
    });
    document.body.appendChild(wrapper);
    return wrapper;
  }

  function openModal(modal) {
    if (!modal) return;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    if (!qs(".support-modal.is-open")) document.body.style.overflow = "";
  }

  function ensureAddressModal() {
    let modal = el("addressModal");
    if (modal) return modal;
    modal = modalTemplate(
      "addressModal",
      "Адрес доставки",
      "Выберите сохранённый адрес или добавьте новый",
      `
        <div class="address-choice-list" id="addressSavedList"></div>
        <form class="app-form" id="addressForm">
          <h3 class="app-form__title">Новый адрес</h3>
          <label class="app-field">
            <span>Улица</span>
            <input name="street" type="text" placeholder="ул. Лесная" autocomplete="street-address" required>
          </label>
          <div class="app-form__row">
            <label class="app-field">
              <span>Дом</span>
              <input name="house" type="text" placeholder="12" required>
            </label>
            <label class="app-field">
              <span>Квартира</span>
              <input name="flat" type="text" placeholder="45">
            </label>
          </div>
          <button class="app-submit" type="submit">Сохранить адрес</button>
        </form>`
    );

    modal.addEventListener("click", (event) => {
      const select = event.target.closest("[data-address-select]");
      if (!select) return;
      setActiveAddress(select.dataset.addressSelect);
      updateAddressUI({ syncOrder: true });
      renderAddressModalList();
      closeModal(modal);
      showToast("Адрес доставки обновлён");
    });

    const form = qs("#addressForm", modal);
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const street = String(data.get("street") || "").trim();
      const house = String(data.get("house") || "").trim();
      const flat = String(data.get("flat") || "").trim();
      if (!street || !house) {
        showToast("Укажите улицу и дом");
        return;
      }
      const addresses = DB.getAddresses();
      const address = {
        id: `addr-${Date.now()}`,
        label: "Адрес",
        city: "Москва",
        street,
        house,
        flat,
        owner: currentOwner,
        isDefault: userAddresses().length === 0
      };
      addresses.push(address);
      DB.saveAddresses(addresses);
      setActiveAddress(address.id);
      form.reset();
      updateAddressUI({ syncOrder: true });
      renderAddressModalList();
      closeModal(modal);
      showToast("Новый адрес сохранён");
    });

    return modal;
  }

  function renderAddressModalList() {
    const list = el("addressSavedList");
    if (!list) return;
    const active = activeAddress();
    const items = userAddresses();
    list.innerHTML = items.length
      ? items.map((address) => `
          <button class="address-choice${active && active.id === address.id ? " address-choice--active" : ""}" type="button" data-address-select="${escapeHtml(address.id)}">
            <span class="address-choice__icon" aria-hidden="true">${address.isDefault ? "★" : "•"}</span>
            <span class="address-choice__body">
              <span class="address-choice__label">${escapeHtml(address.label || "Адрес")}</span>
              <span class="address-choice__text">${escapeHtml(addressFull(address))}</span>
            </span>
            <span class="address-choice__check" aria-hidden="true">${active && active.id === address.id ? "✓" : ""}</span>
          </button>`).join("")
      : '<p class="address-choice__empty">Сохранённых адресов пока нет — добавьте первый ниже.</p>';
  }

  function openAddressModal() {
    const modal = ensureAddressModal();
    renderAddressModalList();
    openModal(modal);
    setTimeout(() => qs('input[name="street"]', modal)?.focus(), 50);
  }

  function ensureSettingsModal() {
    let modal = el("settingsModal");
    if (modal) return modal;
    modal = modalTemplate(
      "settingsModal",
      "Настройки профиля",
      "Измените имя и номер телефона",
      `
        <form class="app-form" id="profileSettingsForm">
          <label class="app-field">
            <span>Как вас зовут</span>
            <input name="name" type="text" autocomplete="name" placeholder="Анна" required>
          </label>
          <label class="app-field">
            <span>Номер телефона</span>
            <input name="phone" type="tel" autocomplete="tel" placeholder="+7 (999) 123-45-67" required>
          </label>
          <button class="app-submit" type="submit">Сохранить изменения</button>
        </form>`
    );

    const form = qs("#profileSettingsForm", modal);
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const name = String(data.get("name") || "").trim() || "Пользователь";
      const digits = normalizePhone(data.get("phone"));
      if (digits.length !== 10) {
        showToast("Введите корректный номер телефона");
        return;
      }
      const formatted = `+7 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 10)}`;
      currentUser = {
        ...(currentUser || {}),
        name,
        phone: formatted,
        owner: currentOwner,
        isNew: currentUser?.isNew === true
      };
      DB.setUser(currentUser);
      userName = name;
      userPhone = formatted;

      const users = DB.getUsers();
      const index = users.findIndex((user) => user.owner === currentOwner
        || normalizePhone(user.phone) === normalizePhone(currentUser.phone));
      if (index !== -1) users[index] = { ...users[index], name, phone: formatted, owner: currentOwner };
      else users.push({ name, phone: formatted, owner: currentOwner, isNew: false });
      DB.saveUsers(users);

      updateUserUI();
      closeModal(modal);
      showToast("Настройки профиля сохранены");
    });

    return modal;
  }

  function openSettingsModal() {
    const modal = ensureSettingsModal();
    const form = qs("#profileSettingsForm", modal);
    if (form) {
      form.elements.name.value = currentUser ? userName : "";
      form.elements.phone.value = currentUser ? userPhone : "";
    }
    openModal(modal);
    setTimeout(() => qs('input[name="name"]', modal)?.focus(), 50);
  }

  function ensureSupportModal() {
    let modal = el("supportModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "support-modal";
    modal.id = "supportModal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="support-modal__overlay" data-modal-close></div>
      <div class="support-modal__dialog support-modal__dialog--tickets" role="dialog" aria-modal="true" aria-labelledby="supportTitle">
        <div class="support-modal__head">
          <div>
            <h2 class="support-modal__title" id="supportTitle">Поддержка</h2>
            <p class="support-modal__subtitle">Обычно отвечаем за 2–3 минуты</p>
          </div>
          <button class="support-modal__close" type="button" aria-label="Закрыть окно поддержки" data-modal-close>
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" stroke="#1E1E1E" stroke-width="1.75" stroke-linecap="round"/></svg>
          </button>
        </div>
        <div class="support-tickets">
          <form class="support-ticket-form" id="supportTicketForm">
            <h3 class="support-ticket-form__title">Новое обращение</h3>
            <label class="app-field">
              <span>Заказ</span>
              <select id="supportOrderSelect" aria-label="Выберите заказ"></select>
            </label>
            <label class="app-field">
              <span>Ваш вопрос</span>
              <textarea id="supportMessage" rows="3" placeholder="Например: можно добавить больше соуса тахини?" required></textarea>
            </label>
            <button class="app-submit" type="submit">Отправить</button>
          </form>
          <section class="support-history" aria-labelledby="supportHistoryTitle">
            <div class="support-history__head">
              <h3 class="support-history__title" id="supportHistoryTitle">Мои обращения</h3>
              <span class="support-history__count" id="supportTicketsCount"></span>
            </div>
            <div class="support-ticket-list" id="supportTicketList" aria-live="polite"></div>
          </section>
        </div>
      </div>`;
    modal.addEventListener("click", (event) => {
      if (event.target.closest("[data-modal-close]")) closeModal(modal);
    });

    qs("#supportTicketForm", modal)?.addEventListener("submit", (event) => {
      event.preventDefault();
      const messageInput = el("supportMessage");
      const message = String(messageInput?.value || "").trim();
      if (!message) {
        showToast("Напишите свой вопрос");
        messageInput?.focus();
        return;
      }
      const orderNumber = String(el("supportOrderSelect")?.value || "");
      const now = new Date();
      const tickets = DB.getTickets();
      tickets.push(normalizeTicket({
        id: `ticket-${Date.now()}`,
        userName: currentUser ? userName : "Гость",
        userPhone,
        orderNumber,
        message,
        createdAt: now.toISOString(),
        status: "Новое",
        adminReply: ""
      }));
      DB.saveTickets(tickets);
      const form = el("supportTicketForm");
      if (form) form.reset();
      renderSupportTickets();
      showToast(orderNumber
        ? `Обращение по заказу № ${orderNumber} отправлено`
        : "Обращение отправлено в поддержку");
    });

    document.body.appendChild(modal);
    return modal;
  }

  function currentUserTickets() {
    const phone = normalizePhone(userPhone);
    const name = String(userName || "").trim().toLowerCase();
    return DB.getTickets()
      .filter((ticket) => {
        if (phone) return normalizePhone(ticket.userPhone) === phone;
        return Boolean(name) && String(ticket.userName || "").trim().toLowerCase() === name;
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function supportTicketMarkup(ticket) {
    const answered = ticket.status === "Отвечено";
    const orderLabel = ticket.orderNumber ? `Заказ № ${ticket.orderNumber}` : "Общий вопрос";
    const message = escapeHtml(ticket.message).replace(/\n/g, "<br>");
    const reply = answered && ticket.adminReply
      ? `
        <div class="support-ticket__reply">
          <div class="support-ticket__reply-label">Ответ поддержки</div>
          <p class="support-ticket__reply-text">${escapeHtml(ticket.adminReply).replace(/\n/g, "<br>")}</p>
        </div>`
      : '<p class="support-ticket__waiting">Ответ появится здесь, как только администратор ответит.</p>';
    return `
      <article class="support-ticket">
        <div class="support-ticket__top">
          <div>
            <div class="support-ticket__order">${escapeHtml(orderLabel)}</div>
            <div class="support-ticket__date">${escapeHtml(formatDateLabel(ticket.createdAt))}</div>
          </div>
          <span class="support-ticket__badge support-ticket__badge--${answered ? "done" : "new"}">${answered ? "Отвечено" : "Ожидает ответа"}</span>
        </div>
        <p class="support-ticket__message">${message}</p>
        ${reply}
      </article>`;
  }

  function renderSupportTickets() {
    const list = el("supportTicketList");
    if (!list) return;
    const tickets = currentUserTickets();
    list.innerHTML = tickets.length
      ? tickets.map(supportTicketMarkup).join("")
      : '<p class="support-ticket__empty">У вас пока нет обращений. Задайте вопрос — ответ появится здесь.</p>';
    const count = el("supportTicketsCount");
    if (count) {
      count.textContent = tickets.length
        ? `${tickets.length} ${plural(tickets.length, "обращение", "обращения", "обращений")}`
        : "";
    }
  }

  function renderSupportOrderOptions(selectedNumber = "") {
    const select = el("supportOrderSelect");
    if (!select) return;
    const orders = ownOrders();
    const options = ['<option value="">Общий вопрос — без заказа</option>'];
    orders.forEach((order) => {
      options.push(`<option value="${order.number}">Заказ № ${order.number} · ${escapeHtml(order.dateLabel)}</option>`);
    });
    select.innerHTML = options.join("");
    const value = String(selectedNumber || "");
    if (value && orders.some((order) => String(order.number) === value)) {
      select.value = value;
    }
  }

  function openSupport(options = {}) {
    const modal = ensureSupportModal();
    renderSupportOrderOptions(options.orderNumber);
    renderSupportTickets();
    const messageInput = el("supportMessage");
    if (messageInput) messageInput.value = "";
    openModal(modal);
    setTimeout(() => messageInput?.focus(), 50);
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-support-close]")) {
      closeModal(el("supportModal"));
      return;
    }
    if (event.target.closest("[data-support-open]")) {
      event.preventDefault();
      const trigger = event.target.closest("[data-support-open]");
      openSupport({
        orderNumber: trigger.dataset.supportOrder || trigger.dataset.orderNumber || ""
      });
      return;
    }
    if (event.target.closest("[data-address-open], .addr-btn, .header__addr-bar")) {
      event.preventDefault();
      openAddressModal();
      return;
    }
    if (event.target.closest("[data-profile-settings]")) {
      event.preventDefault();
      openSettingsModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    qsa(".support-modal.is-open").forEach((modal) => closeModal(modal));
  });

  // --------------------------------------------------------------------------
  // Обновление адреса на страницах
  // --------------------------------------------------------------------------
  function updateAddressUI(options = {}) {
    const address = activeAddress();
    const shortLabel = address ? addressShort(address) : "Выберите адрес";

    qsa(".addr-btn__city, .addr__city").forEach((node) => {
      node.textContent = shortLabel;
    });

    const cartTitle = qs(".cart-address__title");
    if (cartTitle) cartTitle.textContent = addressTitle(address);

    const receiptAddress = qs(".receipt__address-text");
    if (receiptAddress) receiptAddress.textContent = address ? addressFull(address) : "Адрес не указан";

    const activeOrder = readActiveOrder();
    if (options.syncOrder && activeOrder) {
      activeOrder.address = address ? addressFull(address) : activeOrder.address;
      writeJSON(KEYS.activeOrder, activeOrder);
      const orders = DB.getOrders();
      const index = orders.findIndex((order) => order.id === activeOrder.id || order.number === activeOrder.number);
      if (index !== -1) {
        orders[index].address = activeOrder.address;
        DB.saveOrders(orders);
      }
      renderSuccessOrder(activeOrder);
    }

    renderProfileAddresses();
  }

  function renderProfileAddresses() {
    const list = el("profileAddressList");
    if (!list) return;
    const items = userAddresses();
    list.innerHTML = items.length
      ? items.map((address) => `
          <div class="address-item">
            <span class="address-item__icon" aria-hidden="true">
              <svg viewBox="0 0 16 16" fill="none"><path d="M8 14s5-4.4 5-8A5 5 0 0 0 3 6c0 3.6 5 8 5 8Z" stroke="#D96B27" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="6" r="1.8" stroke="#D96B27" stroke-width="1.75"/></svg>
            </span>
            <div class="address-item__body">
              <div class="address-item__label">${escapeHtml(address.label || "Адрес")}${address.isDefault ? " · основной" : ""}</div>
              <div class="address-item__text">${escapeHtml(addressFull(address))}</div>
            </div>
            <button class="address-item__remove" type="button" data-address-remove="${escapeHtml(address.id)}" aria-label="Удалить адрес">×</button>
          </div>`).join("")
      : '<p class="address-list__empty">Сохранённых адресов пока нет. Добавьте первый адрес.</p>';
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-address-remove]");
    if (button) {
      const addresses = DB.getAddresses();
      const remaining = addresses.filter((address) => address.id !== button.dataset.addressRemove);
      DB.saveAddresses(remaining);
      if (DB.readRaw(KEYS.activeAddress) === button.dataset.addressRemove) {
        const next = remaining.find((address) => address.owner === currentOwner || !address.owner);
        if (next) setActiveAddress(next.id);
        else removeKey(KEYS.activeAddress);
      }
      updateAddressUI({ syncOrder: true });
      showToast("Адрес удалён");
      return;
    }
    if (event.target.closest("[data-address-add]")) {
      event.preventDefault();
      openAddressModal();
    }
  });

  // --------------------------------------------------------------------------
  // Заказы: чтение, оформление, статусы
  // --------------------------------------------------------------------------
  function readActiveOrder() {
    const value = readJSON(KEYS.activeOrder, null);
    if (!value || typeof value !== "object") return null;
    const order = normalizeOrder(value, 0);
    if (order.owner && order.owner !== currentOwner) return null;
    return order;
  }

  function nextOrderNumber() {
    const numbers = DB.getOrders().map((order) => Number(order.number) || 0);
    return Math.max(1049, ...numbers, 0) + 1;
  }

  function ownOrders() {
    return DB.getOrders()
      .filter((order) => order.owner === currentOwner)
      .sort((a, b) => b.number - a.number);
  }

  function orderQty(order) {
    return order.items.reduce((sum, item) => sum + item.qty, 0);
  }

  function orderComposition(order) {
    return order.items.map((item) => `${item.name} × ${item.qty}`).join(", ");
  }

  function etaText(order) {
    switch (order.status) {
      case "cooking":
        return {
          title: `Будем в ${order.etaFrom}–${order.etaTo}`,
          text: "Уже готовим ваш обед. Скоро передадим курьеру."
        };
      case "on-way":
        return {
          title: `Курьер в пути · ${order.etaFrom}–${order.etaTo}`,
          text: "Совсем скоро будем у вашей двери."
        };
      case "delivered":
        return {
          title: "Заказ доставлен",
          text: "Спасибо, что выбрали нас. Приятного аппетита!"
        };
      case "cancelled":
        return {
          title: "Заказ отменён",
          text: "Если это ошибка — напишите нам в поддержку."
        };
      default:
        return {
          title: `Будем в ${order.etaFrom}–${order.etaTo}`,
          text: "Заказ принят. Передадим его на кухню в ближайшее время."
        };
    }
  }

  function badgeClass(status) {
    if (status === "delivered") return "order-badge--done";
    if (status === "cancelled") return "order-badge--cancelled";
    return "order-badge--progress";
  }

  function trackIndex(status) {
    if (status === "accepted") return 0;
    if (status === "cooking") return 1;
    if (status === "on-way") return 2;
    if (status === "delivered") return 4;
    return -1;
  }

  function orderTrackMarkup(order, extraClass = "") {
    const steps = ["Принят", "Готовится", "В пути", "Доставлен"];
    const index = trackIndex(order.status);
    return `
      <ol class="order-track ${extraClass}" aria-label="Статус заказа">
        ${steps.map((label, step) => {
          let stepClass = "";
          let icon = "";
          if (index === 4) {
            stepClass = "order-track__step--done";
            icon = '<svg class="order-track__icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m6 10.2 2.7 2.7 5.3-5.4" stroke="#fff" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>';
          } else if (index >= 0 && step < index) {
            stepClass = "order-track__step--done";
            icon = '<svg class="order-track__icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m6 10.2 2.7 2.7 5.3-5.4" stroke="#fff" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>';
          } else if (index >= 0 && step === index) {
            stepClass = "order-track__step--current";
            icon = '<svg class="order-track__icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="3" fill="#fff"/></svg>';
          }
          return `<li class="order-track__step ${stepClass}"><span class="order-track__dot">${icon}</span><span class="order-track__label">${label}</span></li>`;
        }).join("")}
      </ol>`;
  }

  function orderItemsMarkup(order, itemClass, imageClass, bodyClass, nameClass, metaClass, sumClass) {
    return order.items.map((item) => `
      <li class="${itemClass}">
        <img src="${escapeHtml(displayImage(item.img))}" alt="${escapeHtml(item.name)}" class="${imageClass}" width="44" height="44">
        <div class="${bodyClass}">
          <div class="${nameClass}">${escapeHtml(item.name)}</div>
          <div class="${metaClass}">${item.qty} × ${money(item.price)}</div>
        </div>
        <span class="${sumClass}">${money(item.price * item.qty)}</span>
      </li>`).join("");
  }

  function placeOrder() {
    if (!localStorage.getItem("apoest_user")) {
      const notice = "Войдите в аккаунт для оформления заказа";
      writeRaw(KEYS.redirectAfterAuth, "catalog.html");
      writeRaw(KEYS.authNotice, notice);
      showToast(notice);
      window.location.href = "auth.html";
      return;
    }
    // Жёсткая защита: заказ оформляется только при активной сессии apoest_user.
    const sessionUser = DB.getUser();
    if (!currentUser || !sessionUser || typeof sessionUser !== "object") {
      const notice = "Войдите в аккаунт для оформления заказа";
      writeRaw(KEYS.redirectAfterAuth, "catalog.html");
      writeRaw(KEYS.authNotice, notice);
      showToast(notice);
      window.location.href = "auth.html";
      return;
    }

    const totals = cartTotals();
    if (!cartItems.length) {
      showToast("Корзина пуста");
      return;
    }
    const now = new Date();
    const address = activeAddress();
    if (!address) {
      showToast("Укажите адрес доставки");
      openAddressModal();
      return;
    }
    const order = normalizeOrder({
      id: `order-${Date.now()}`,
      number: nextOrderNumber(),
      owner: currentOwner,
      clientName: userName,
      clientPhone: userPhone,
      items: cartItems.map((item) => ({ ...item })),
      itemsTotal: totals.itemsTotal,
      deliveryCost: totals.deliveryFee,
      total: totals.total,
      status: "accepted",
      createdAt: now.toISOString(),
      dateLabel: formatDateLabel(now),
      etaFrom: timeOf(new Date(now.getTime() + 30 * 60 * 1000)),
      etaTo: timeOf(new Date(now.getTime() + 45 * 60 * 1000)),
      address: address ? addressFull(address) : "Адрес не указан"
    });

    const orders = DB.getOrders();
    orders.push(order);
    DB.saveOrders(orders);
    writeJSON(KEYS.activeOrder, order);

    cartItems = [];
    persistCart();
    renderCart();
    removeKey(KEYS.redirectAfterAuth);
    showToast(`Заказ № ${order.number} оформлен`);
    setTimeout(() => {
      window.location.href = "order-success.html";
    }, 350);
  }

  el("checkoutBtn")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    if (!localStorage.getItem("apoest_user")) {
      const notice = "Войдите в аккаунт для оформления заказа";
      writeRaw(KEYS.redirectAfterAuth, "catalog.html");
      writeRaw(KEYS.authNotice, notice);
      showToast(notice);
      window.location.href = "auth.html";
      return;
    }

    const currentUser = (() => {
      try {
        return JSON.parse(localStorage.getItem("apoest_user"));
      } catch (error) {
        return null;
      }
    })();

    if (!currentUser) {
      showToast("Войдите в аккаунт для оформления заказа");
      localStorage.setItem("apoest_redirect_after_auth", "catalog.html");
      localStorage.setItem("apoest_auth_notice", "Войдите в аккаунт для оформления заказа");
      window.location.href = "auth.html";
      return;
    }

    placeOrder();
  });

  function renderSuccessOrder(order) {
    const receipt = qs(".success-receipt");
    if (!receipt || !order) return;

    const title = receipt.querySelector("#receiptTitle");
    if (title) title.textContent = `Заказ № ${order.number}`;

    const date = receipt.querySelector("[data-order-date]");
    if (date) date.textContent = order.dateLabel;

    const list = receipt.querySelector(".receipt__items");
    if (list) {
      list.innerHTML = orderItemsMarkup(
        order, "receipt__item", "receipt__img", "receipt__body",
        "receipt__name", "receipt__meta", "receipt__sum"
      );
    }

    const address = receipt.querySelector(".receipt__address-text");
    if (address) address.textContent = order.address;

    const delivery = receipt.querySelector("#receiptDelivery");
    if (delivery) delivery.textContent = order.deliveryCost ? money(order.deliveryCost) : "Бесплатно";

    const total = receipt.querySelector(".receipt__total");
    if (total) total.textContent = money(order.total);

    const subtitle = qs(".success__subtitle");
    if (subtitle) {
      subtitle.textContent = order.status === "delivered"
        ? `Заказ № ${order.number} доставлен. Спасибо, что выбрали нас.`
        : `Заказ № ${order.number} принят, готовится. Спасибо, что выбрали нас.`;
    }

    const etaTitle = qs(".success__eta");
    if (etaTitle) {
      const eta = etaText(order);
      etaTitle.textContent = order.status === "delivered" ? eta.title : `Доставим в ${order.etaFrom}–${order.etaTo}`;
    }

    const track = qs(".success__track");
    if (track) {
      const temp = document.createElement("div");
      temp.innerHTML = orderTrackMarkup(order, "success__track");
      track.replaceWith(temp.firstElementChild);
    }
  }

  // --------------------------------------------------------------------------
  // Личный кабинет
  // --------------------------------------------------------------------------
  function renderProfileOrders() {
    const activeSection = qs("[data-active-order]");
    const pastSection = qs("[data-past-orders]");
    const emptyState = qs("[data-profile-empty]");
    const activeMount = el("profileActiveOrder");
    const pastMount = el("profilePastOrders");
    if (!activeSection || !pastSection || !emptyState) return;

    const orders = ownOrders();
    const active = orders.find((order) => ACTIVE_STATUSES.includes(order.status)) || null;
    const past = orders.filter((order) => !ACTIVE_STATUSES.includes(order.status));

    emptyState.hidden = orders.length > 0;
    activeSection.hidden = !active;
    pastSection.hidden = past.length === 0;

    if (active && activeMount) {
      const eta = etaText(active);
      activeMount.innerHTML = `
        <article class="order-card">
          <div class="order-card__top">
            <div>
              <h3 class="order-card__title">Заказ № ${active.number}</h3>
              <p class="order-card__date">${escapeHtml(active.dateLabel)}</p>
            </div>
            <span class="order-badge ${badgeClass(active.status)}">${statusLabel(active.status)}</span>
          </div>
          <div class="order-eta">
            <div class="order-eta__title">${escapeHtml(eta.title)}</div>
            <p class="order-eta__text">${escapeHtml(eta.text)}</p>
          </div>
          ${orderTrackMarkup(active)}
          <ul class="order-items">
            ${orderItemsMarkup(active, "order-item", "order-item__img", "order-item__body", "order-item__name", "order-item__meta", "order-item__sum")}
          </ul>
          <div class="order-info">
            <div class="order-info__row">
              <svg class="order-info__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 14s5-4.4 5-8A5 5 0 0 0 3 6c0 3.6 5 8 5 8Z" stroke="#4C8B59" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="6" r="1.8" stroke="#4C8B59" stroke-width="1.75"/></svg>
              <span>${escapeHtml(active.address)}</span>
            </div>
            <div class="order-info__row order-info__row--payment">
              <svg class="order-info__icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="2.5" y="5" width="15" height="10" rx="2" stroke="#9E9E9E" stroke-width="1.75"/><path d="M2.5 8.5h15M5.5 12.5h3" stroke="#9E9E9E" stroke-width="1.75" stroke-linecap="round"/></svg>
              <span>${escapeHtml(active.payment || "Оплачено картой")}</span>
              <span class="order-info__total">${money(active.total)}</span>
            </div>
            <p class="order-info__note">${active.deliveryCost ? `Доставка ${money(active.deliveryCost)}` : "Доставка бесплатно"}</p>
          </div>
          <button class="order-support-btn" type="button" data-support-open data-support-order="${active.number}">
            <svg class="order-support-btn__icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 4h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H9l-4 3v-3H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" stroke="#4A4A4A" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Написать в поддержку
          </button>
        </article>`;
    }

    if (pastMount) {
      pastMount.innerHTML = past.map((order) => {
        const first = order.items[0];
        const description = orderComposition(order);
        return `
          <article class="past-order">
            <div class="past-order__top">
              <div>
                <h3 class="past-order__title">Заказ № ${order.number}</h3>
                <p class="past-order__date">${escapeHtml(order.dateLabel)}</p>
              </div>
              <span class="order-badge ${badgeClass(order.status)}">${statusLabel(order.status)}</span>
            </div>
            <div class="past-order__body">
              ${first ? `<img src="${escapeHtml(displayImage(first.img))}" alt="${escapeHtml(first.name)}" class="past-order__img" width="48" height="48">` : ""}
              <p class="past-order__desc">${escapeHtml(description)}</p>
              <span class="past-order__price">${money(order.total)}</span>
            </div>
            <button class="repeat-btn" type="button" data-repeat-order="${escapeHtml(order.id)}">
              <svg class="repeat-btn__icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 8a6.5 6.5 0 1 1 .4 4.6" stroke="#4A4A4A" stroke-width="1.75" stroke-linecap="round"/><path d="M4 4v4h4" stroke="#4A4A4A" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>
              Повторить заказ
            </button>
          </article>`;
      }).join("");
    }
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-repeat-order]");
    if (!button) return;
    const order = DB.getOrders().find((item) => item.id === button.dataset.repeatOrder);
    if (!order) return;
    order.items.forEach((item) => addToCart({ ...item, qty: item.qty }, true));
    showToast(`Заказ № ${order.number} добавлен в корзину`);
  });

  function logout(event) {
    event.preventDefault();
    DB.clearUser();
    removeKey(KEYS.redirectAfterAuth);
    window.location.href = "auth.html";
  }

  qsa("[data-profile-logout]").forEach((link) => {
    link.addEventListener("click", logout);
  });

  qsa(".admin-header__logout").forEach((link) => {
    link.addEventListener("click", logout);
  });

  // Вкладки профиля
  const profileTabs = qsa("[data-profile-tab]");
  const profilePanels = qsa(".profile-panel");
  profileTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      profileTabs.forEach((item) => {
        const active = item === tab;
        item.classList.toggle("profile-tab--active", active);
        item.setAttribute("aria-selected", String(active));
      });
      const panelId = tab.getAttribute("aria-controls");
      profilePanels.forEach((panel) => {
        panel.hidden = panel.id !== panelId;
      });
    });
  });

  // --------------------------------------------------------------------------
  // Витрина: карточки, поиск, фильтры и сортировка
  // --------------------------------------------------------------------------
  function filterDishes(dishes, options = {}) {
    const {
      category = "all",
      query = "",
      meals = null,
      prefs = [],
      priceFrom = null,
      priceTo = null,
      sort = "popular"
    } = options;
    const search = String(query || "").trim().toLowerCase();

    const result = dishes.filter((dish) => {
      if (!dish.isAvailable) return false;
      if (category && category !== "all" && dish.category !== category) return false;
      if (search) {
        const haystack = `${dish.name} ${dish.composition}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      if (Array.isArray(meals)) {
        if (!meals.length) return false;
        if (!dish.meals.some((meal) => meals.includes(meal))) return false;
      }
      if (prefs.includes("veg") && !dish.diet.noMeat) return false;
      if (prefs.includes("gluten") && !dish.diet.noGluten) return false;
      if (prefs.includes("lactose") && !dish.diet.noLactose) return false;
      if (priceFrom !== null && dish.price < priceFrom) return false;
      if (priceTo !== null && dish.price > priceTo) return false;
      return true;
    });

    if (sort === "price-asc") result.sort((a, b) => a.price - b.price);
    else if (sort === "price-desc") result.sort((a, b) => b.price - a.price);
    else result.sort((a, b) => a.popularity - b.popularity);

    return result;
  }

  function dishCardMarkup(dish) {
    return `
      <article class="card" data-category="${escapeHtml(dish.category)}" data-price="${dish.price}" data-id="${escapeHtml(dish.id)}" data-name="${escapeHtml(dish.name)}" data-grams="${escapeHtml(dish.weight)}" data-img="${escapeHtml(dish.img)}" data-meals="${escapeHtml(dish.meals.join(","))}" data-veg="${!dish.diet.noMeat}" data-gluten="${!dish.diet.noGluten}" data-lactose="${!dish.diet.noLactose}" data-popularity="${dish.popularity}">
        ${dish.badge ? `<div class="card__badge">${escapeHtml(dish.badge)}</div>` : ""}
        <div class="card__media">
          <img src="${escapeHtml(dish.img)}" alt="${escapeHtml(dish.name)}" class="card__img">
        </div>
        <div class="card__body">
          <h3 class="card__title">${escapeHtml(dish.name)}</h3>
          <p class="card__desc">${escapeHtml(dish.composition)}</p>
          <div class="card__footer">
            <div class="card__price-row">
              <span class="card__grams">${escapeHtml(dish.weight)}</span>
              <span class="card__price">${money(dish.price)}</span>
            </div>
            <button class="card__btn btn-outline" type="button" data-cart data-id="${escapeHtml(dish.id)}" data-name="${escapeHtml(dish.name)}" data-price="${dish.price}" data-grams="${escapeHtml(dish.weight)}" data-img="${escapeHtml(dish.img)}">+ В корзину</button>
          </div>
        </div>
      </article>`;
  }

  function setActiveTab(tabs, activeTab) {
    tabs.forEach((tab) => {
      const active = tab === activeTab;
      tab.classList.toggle("filters__tab--active", active);
      tab.setAttribute("aria-selected", String(active));
    });
  }

  const homeGrid = el("homeCatalogGrid");
  let homeCategory = "all";

  const homeTabs = qsa(".filters .filters__tab");
  homeTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      homeCategory = tab.dataset.filter || "all";
      setActiveTab(homeTabs, tab);
      applyHomeFilters();
    });
  });

  function applyHomeFilters() {
    if (!homeGrid) return;
    const query = el("searchInput")?.value || "";
    const dishes = filterDishes(DB.getDishes(), {
      category: homeCategory,
      query,
      sort: "popular"
    });
    homeGrid.innerHTML = dishes.map(dishCardMarkup).join("");
    const empty = el("catalogEmpty");
    if (empty) {
      empty.hidden = dishes.length > 0;
      empty.textContent = "По вашему запросу ничего не нашлось. Попробуйте другое блюдо.";
    }
  }

  if (homeGrid) {
    el("searchInput")?.addEventListener("input", applyHomeFilters);
    qs(".hero__search .hero__btn")?.addEventListener("click", () => {
      const query = String(el("searchInput")?.value || "").trim();
      window.location.href = query
        ? `catalog.html?search=${encodeURIComponent(query)}`
        : "catalog.html";
    });
    el("searchInput")?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const query = String(el("searchInput")?.value || "").trim();
      window.location.href = query
        ? `catalog.html?search=${encodeURIComponent(query)}`
        : "catalog.html";
    });
    applyHomeFilters();
  }

  const catalogGrid = el("catalogGrid");
  const catalogTabs = qsa(".catalog-tabs .filters__tab");
  let catalogCategory = "all";

  function catalogOptions() {
    const meals = qsa("[data-meal]")
      .filter((input) => input.checked)
      .map((input) => input.dataset.meal);
    const prefs = qsa("[data-pref]")
      .filter((input) => input.checked)
      .map((input) => input.dataset.pref);
    const fromValue = Number(el("priceFrom")?.value);
    const toValue = Number(el("priceTo")?.value);
    return {
      category: catalogCategory,
      query: el("searchInput")?.value || "",
      meals,
      prefs,
      priceFrom: Number.isFinite(fromValue) && fromValue > 0 ? fromValue : null,
      priceTo: Number.isFinite(toValue) && toValue > 0 ? toValue : null,
      sort: el("catalogSort")?.value || "popular"
    };
  }

  function applyCatalogFilters() {
    if (!catalogGrid) return;
    const options = catalogOptions();
    const dishes = filterDishes(DB.getDishes(), options);
    catalogGrid.innerHTML = dishes.map(dishCardMarkup).join("");

    const count = el("catalogCount");
    if (count) {
      count.textContent = `${options.query.trim() ? "Найдено" : "По вашим фильтрам"} · ${dishes.length} ${plural(dishes.length, "блюдо", "блюда", "блюд")}`;
    }
    const empty = el("catalogResultsEmpty");
    if (empty) empty.hidden = dishes.length > 0;
  }

  if (catalogGrid) {
    const params = new URLSearchParams(window.location.search);
    const query = params.get("search") || params.get("q") || "";
    const searchInput = el("searchInput");
    if (searchInput && query) searchInput.value = query;

    const priceTo = el("priceTo");
    if (priceTo) {
      const maxPrice = DB.getDishes().reduce((max, dish) => Math.max(max, dish.price), 0);
      priceTo.value = String(Math.max(1000, maxPrice));
    }

    catalogTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        catalogCategory = tab.dataset.filter || "all";
        setActiveTab(catalogTabs, tab);
        applyCatalogFilters();
      });
    });

    searchInput?.addEventListener("input", applyCatalogFilters);
    searchInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        applyCatalogFilters();
      }
    });
    qs(".catalog-search .hero__btn")?.addEventListener("click", applyCatalogFilters);
    qsa("[data-meal], [data-pref]").forEach((input) => {
      input.addEventListener("change", applyCatalogFilters);
    });
    el("priceFrom")?.addEventListener("input", applyCatalogFilters);
    el("priceTo")?.addEventListener("input", applyCatalogFilters);
    el("catalogSort")?.addEventListener("change", applyCatalogFilters);

    el("filtersReset")?.addEventListener("click", () => {
      catalogCategory = "all";
      setActiveTab(catalogTabs, catalogTabs[0]);
      const input = el("searchInput");
      if (input) input.value = "";
      qsa("[data-meal]").forEach((checkbox) => { checkbox.checked = true; });
      qsa("[data-pref]").forEach((checkbox) => { checkbox.checked = false; });
      if (el("priceFrom")) el("priceFrom").value = "0";
      if (el("priceTo")) {
        const maxPrice = DB.getDishes().reduce((max, dish) => Math.max(max, dish.price), 0);
        el("priceTo").value = String(Math.max(1000, maxPrice));
      }
      if (el("catalogSort")) el("catalogSort").value = "popular";
      applyCatalogFilters();
      showToast("Фильтры сброшены");
    });

    qsa("[data-catalog-reset]").forEach((button) => {
      button.addEventListener("click", () => el("filtersReset")?.click());
    });

    applyCatalogFilters();
  }

  // --------------------------------------------------------------------------
  // Мобильное бургер-меню
  // --------------------------------------------------------------------------
  const burger = el("headerBurger");
  if (burger) {
    const menu = document.createElement("div");
    menu.className = "mobile-menu-overlay";
    menu.innerHTML = `
      <div class="mobile-menu" role="dialog" aria-modal="true" aria-label="Меню сайта">
        <button class="mobile-menu__close" id="mobileMenuClose" type="button" aria-label="Закрыть меню">
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" stroke="#1E1E1E" stroke-width="1.75" stroke-linecap="round"/></svg>
        </button>
        <nav class="mobile-menu__nav">
          <a href="index.html" class="mobile-menu__link${document.body.classList.contains("catalog-page") || document.body.classList.contains("profile-page") || document.body.classList.contains("success-page") ? "" : " mobile-menu__link--active"}">Главная</a>
          <a href="catalog.html" class="mobile-menu__link${document.body.classList.contains("catalog-page") ? " mobile-menu__link--active" : ""}">Каталог</a>
        </nav>
        <div class="mobile-menu__profile">
          <a href="profile.html" class="mobile-menu__btn${document.body.classList.contains("profile-page") ? " mobile-menu__btn--active" : ""}">
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="6.5" r="3" stroke="#1E1E1E" stroke-width="1.75"/><path d="M4.5 16c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" stroke="#1E1E1E" stroke-width="1.75" stroke-linecap="round"/></svg>
            <span>${escapeHtml(currentUser ? userName : "Войти")}</span>
          </a>
        </div>
        <a href="${document.body.classList.contains("catalog-page") ? "#cartWidget" : "catalog.html#cartWidget"}" class="mobile-menu__cart">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4.5 7h11l.9 8.5a1.5 1.5 0 0 1-1.5 1.7H5.1a1.5 1.5 0 0 1-1.5-1.7L4.5 7Z" stroke="#fff" stroke-width="1.75" stroke-linejoin="round"/><path d="M7.5 7V5.4a2.5 2.5 0 0 1 5 0V7" stroke="#fff" stroke-width="1.75" stroke-linecap="round"/></svg>
          <span>Корзина · <span id="mobileCartCount">${cartTotals().count}</span></span>
          <span class="mobile-menu__cart-sum" id="mobileCartSum">${money(cartTotals().total)}</span>
        </a>
      </div>`;
    document.body.appendChild(menu);

    let menuOpen = false;
    const menuClose = el("mobileMenuClose");
    function setMenu(open) {
      menuOpen = open;
      burger.setAttribute("aria-expanded", String(open));
      menu.classList.toggle("open", open);
      document.body.style.overflow = open ? "hidden" : "";
      (open ? menuClose : burger)?.focus();
    }
    burger.addEventListener("click", () => setMenu(!menuOpen));
    menu.addEventListener("click", (event) => {
      if (event.target === menu || event.target.closest(".mobile-menu__close, .mobile-menu__link, .mobile-menu__cart")) {
        setMenu(false);
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && menuOpen) setMenu(false);
    });
  }

  // --------------------------------------------------------------------------
  // Первичная отрисовка страницы
  // --------------------------------------------------------------------------
  renderCart();
  updateAddressUI();

  if (document.body.classList.contains("profile-page")) {
    renderProfileOrders();
    renderProfileAddresses();
  }

  if (document.body.classList.contains("success-page")) {
    const order = readActiveOrder()
      || ownOrders().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]
      || null;
    if (order) renderSuccessOrder(order);
  }

  // Синхронизация между вкладками
  window.addEventListener("storage", (event) => {
    if (!event.key || !event.key.startsWith("apoest_")) return;
    if (event.key === KEYS.cart || event.key === KEYS.cartOwner) {
      cartItems = loadCart();
      renderCart();
    } else if (event.key === KEYS.orders || event.key === KEYS.activeOrder) {
      if (document.body.classList.contains("profile-page")) renderProfileOrders();
      if (document.body.classList.contains("success-page")) {
        const order = readActiveOrder();
        if (order) renderSuccessOrder(order);
      }
      if (document.body.classList.contains("admin-page")) {
        renderAdminOrders();
        updateAdminCounts();
      }
    } else if (event.key === KEYS.dishes) {
      applyHomeFilters();
      applyCatalogFilters();
      if (document.body.classList.contains("admin-page")) {
        renderAdminDishList();
        updateAdminCounts();
      }
    } else if (event.key === KEYS.tickets) {
      renderSupportTickets();
      if (document.body.classList.contains("admin-page")) {
        renderAdminTickets();
        updateAdminCounts();
        updateAdminSettings();
      }
    } else if (event.key === KEYS.addresses || event.key === KEYS.activeAddress) {
      updateAddressUI();
    } else if (event.key === KEYS.user) {
      window.location.reload();
    }
  });

  // --------------------------------------------------------------------------
  // Панель администратора
  // --------------------------------------------------------------------------
  const isAdmin = document.body.classList.contains("admin-page");
  let adminSelectedDishId = null;
  let adminIsNewDish = false;
  let adminSelectedTicketId = null;

  function adminRevenue() {
    return DB.getOrders().reduce((sum, order) => sum + (Number(order.total) || 0), 0);
  }

  function updateAdminCounts() {
    const orders = DB.getOrders();
    const dishes = DB.getDishes();
    const tickets = DB.getTickets();

    const ordersTab = el("adminOrdersTabCount");
    const dishesTab = el("adminDishesTabCount");
    const ticketsTab = el("adminTicketsTabCount");
    if (ordersTab) ordersTab.textContent = String(orders.length);
    if (dishesTab) dishesTab.textContent = String(dishes.length);
    if (ticketsTab) {
      const fresh = tickets.filter((ticket) => ticket.status === "Новое").length;
      ticketsTab.textContent = String(fresh);
    }

    const summary = {
      adminStatsOrders: String(orders.length),
      adminStatsRevenue: money(adminRevenue()),
      adminStatsDishes: String(dishes.length),
      adminStatsTickets: String(tickets.length)
    };
    Object.entries(summary).forEach(([id, value]) => {
      const node = el(id);
      if (node) node.textContent = value;
    });

    const today = el("adminToday");
    if (today) today.textContent = `${formatDateLong(new Date())} · Кухня на Лесной`;
  }

  function adminOrderRow(order) {
    const status = STATUSES.find((item) => item.key === order.status) || STATUSES[0];
    return `
      <tr>
        <td>
          <div class="admin-order-num">№ ${order.number}</div>
          <div class="admin-order-time">${escapeHtml(order.dateLabel)}</div>
        </td>
        <td>
          <div class="admin-client-name">${escapeHtml(order.clientName)}</div>
          <div class="admin-client-phone">${escapeHtml(maskPhone(order.clientPhone))}</div>
        </td>
        <td>
          <div class="admin-composition">
            ${order.items.map((item) => `<div class="admin-composition__line">${escapeHtml(item.name)} × ${item.qty}</div>`).join("")}
            <div class="admin-composition__count">${orderQty(order)} ${plural(orderQty(order), "блюдо", "блюда", "блюд")}</div>
          </div>
        </td>
        <td><div class="admin-sum">${money(order.total)}</div></td>
        <td>
          <select class="admin-status-select admin-status-select--${escapeHtml(order.status)}" data-order-status="${escapeHtml(order.id)}" aria-label="Статус заказа № ${order.number}">
            ${STATUSES.map((entry) => `<option value="${entry.key}"${entry.key === status.key ? " selected" : ""}>${entry.label}</option>`).join("")}
          </select>
        </td>
        <td class="admin-row-actions">
          <button class="admin-row-more" type="button" data-order-address="${escapeHtml(order.address)}" data-order-number="${order.number}" aria-label="Адрес заказа № ${order.number}">•••</button>
        </td>
      </tr>`;
  }

  function renderAdminOrders() {
    const body = el("adminOrdersBody");
    if (!body) return;
    const query = String(el("adminSearch")?.value || "").trim().toLowerCase();
    const status = el("adminStatusFilter")?.value || "all";
    const all = DB.getOrders().sort((a, b) => b.number - a.number);
    const filtered = all.filter((order) => {
      if (status !== "all" && order.status !== status) return false;
      if (query) {
        const haystack = `${order.number} ${order.clientName} ${order.clientPhone}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    body.innerHTML = filtered.length
      ? filtered.map(adminOrderRow).join("")
      : `
        <tr>
          <td colspan="6" class="admin-table__empty">
            <div class="empty-state empty-state--table">
              <span class="empty-state__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="10.5" cy="10.5" r="6.5" stroke="#D96B27" stroke-width="1.75"/>
                  <path d="m15.5 15.5 4.5 4.5" stroke="#D96B27" stroke-width="1.75" stroke-linecap="round"/>
                </svg>
              </span>
              <p class="empty-state__title">Ничего не найдено</p>
              <p class="empty-state__text">Попробуйте изменить номер заказа, имя клиента или статус.</p>
              <button class="empty-state__btn" type="button" data-admin-orders-reset>Сбросить фильтры</button>
            </div>
          </td>
        </tr>`;

    const info = el("adminOrdersInfo");
    if (info) info.textContent = `Показано ${filtered.length} из ${all.length} заказов`;
  }

  function adminTicketBadge(ticket) {
    const answered = ticket.status === "Отвечено";
    return `<span class="admin-ticket-badge admin-ticket-badge--${answered ? "done" : "new"}">${answered ? "Отвечено" : "Новое"}</span>`;
  }

  function sortedAdminTickets() {
    return DB.getTickets()
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function renderAdminTicketCard(tickets) {
    const mount = el("adminTicketCard");
    if (!mount) return;
    const ticket = tickets.find((item) => item.id === adminSelectedTicketId) || tickets[0] || null;
    if (!ticket) {
      mount.innerHTML = `
        <div class="admin-edit-card__label">Обращения</div>
        <h3 class="admin-edit-card__title">Нет обращений</h3>
        <p class="admin-ticket-empty">Как только покупатель напишет в поддержку, обращение появится здесь.</p>`;
      return;
    }

    const orderLabel = ticket.orderNumber ? `Заказ № ${escapeHtml(ticket.orderNumber)}` : "Без заказа";
    const question = escapeHtml(ticket.message).replace(/\n/g, "<br>");
    const reply = String(ticket.adminReply || "").trim();
    const answerBlock = ticket.status === "Отвечено" && reply
      ? `
        <div class="admin-ticket-answer">
          <div class="admin-ticket-answer__label">Ваш ответ</div>
          <p class="admin-ticket-answer__text">${escapeHtml(reply).replace(/\n/g, "<br>")}</p>
        </div>`
      : "";

    mount.innerHTML = `
      <div class="admin-edit-card__label">
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 3.5h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H8l-3.5 2.5v-2.5H3a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Обращение
      </div>
      <div class="admin-ticket-card__head">
        <h3 class="admin-edit-card__title">${escapeHtml(ticket.userName)}</h3>
        ${adminTicketBadge(ticket)}
      </div>
      <div class="admin-ticket-card__meta">
        <span>${orderLabel}</span>
        <span>${escapeHtml(formatDateLabel(ticket.createdAt))}</span>
        <span>${escapeHtml(maskPhone(ticket.userPhone))}</span>
      </div>
      <div class="admin-ticket-question">
        <div class="admin-ticket-question__label">Вопрос клиента</div>
        <p class="admin-ticket-question__text">${question}</p>
      </div>
      ${answerBlock}
      <div class="admin-form">
        <label class="admin-field">
          <span>Ответ администратора</span>
          <textarea id="adminTicketReply" rows="4" placeholder="Напишите ответ клиенту…">${escapeHtml(reply)}</textarea>
        </label>
        <button class="admin-save" id="adminTicketSend" type="button">Отправить ответ</button>
      </div>`;
  }

  function renderAdminTickets() {
    const body = el("adminTicketsBody");
    if (!body) return;
    const tickets = sortedAdminTickets();
    if (!adminSelectedTicketId || !tickets.some((ticket) => ticket.id === adminSelectedTicketId)) {
      adminSelectedTicketId = tickets[0]?.id || null;
    }

    body.innerHTML = tickets.length
      ? tickets.map((ticket, index) => `
          <tr class="admin-ticket-row${ticket.id === adminSelectedTicketId ? " admin-ticket-row--active" : ""}" data-ticket-id="${escapeHtml(ticket.id)}" tabindex="0">
            <td><div class="admin-order-num">№ ${index + 1}</div></td>
            <td>
              <div class="admin-client-name">${escapeHtml(ticket.userName)}</div>
              <div class="admin-client-phone">${escapeHtml(maskPhone(ticket.userPhone))}</div>
            </td>
            <td><div class="admin-ticket-order">${ticket.orderNumber ? `№ ${escapeHtml(ticket.orderNumber)}` : "—"}</div></td>
            <td><div class="admin-ticket-preview">${escapeHtml(ticket.message)}</div></td>
            <td><div class="admin-ticket-time">${escapeHtml(formatDateLabel(ticket.createdAt))}</div></td>
            <td>${adminTicketBadge(ticket)}</td>
          </tr>`).join("")
      : '<tr><td colspan="6" class="admin-table__empty">Обращений пока нет</td></tr>';

    const info = el("adminTicketsInfo");
    if (info) {
      const fresh = tickets.filter((ticket) => ticket.status === "Новое").length;
      info.textContent = `${tickets.length} ${plural(tickets.length, "обращение", "обращения", "обращений")} · ${fresh} ${plural(fresh, "новое", "новых", "новых")}`;
    }

    renderAdminTicketCard(tickets);
  }

  function sendAdminTicketReply() {
    if (!adminSelectedTicketId) return;
    const textarea = el("adminTicketReply");
    const reply = String(textarea?.value || "").trim();
    if (!reply) {
      showToast("Напишите ответ клиенту");
      textarea?.focus();
      return;
    }
    const tickets = DB.getTickets();
    const ticket = tickets.find((item) => item.id === adminSelectedTicketId);
    if (!ticket) return;
    ticket.adminReply = reply;
    ticket.status = "Отвечено";
    DB.saveTickets(tickets);
    renderAdminTickets();
    updateAdminCounts();
    updateAdminSettings();
    showToast(`Ответ отправлен клиенту ${ticket.userName}`);
  }

  function renderAdminDishList() {
    const list = el("adminDishList");
    if (!list) return;
    const dishes = DB.getDishes().sort((a, b) => a.popularity - b.popularity);
    if (!adminIsNewDish && !dishes.some((dish) => dish.id === adminSelectedDishId)) {
      adminSelectedDishId = dishes[0]?.id || null;
    }
    list.innerHTML = dishes.length
      ? dishes.map((dish) => `
          <button class="admin-dish-item${!adminIsNewDish && dish.id === adminSelectedDishId ? " admin-dish-item--active" : ""}" type="button" data-dish-id="${escapeHtml(dish.id)}">
            <img class="admin-dish-item__img" src="${escapeHtml(displayImage(dish.img))}" alt="${escapeHtml(dish.name)}" width="48" height="48">
            <span class="admin-dish-item__body">
              <span class="admin-dish-item__name">${escapeHtml(dish.name)}</span>
              <span class="admin-dish-item__meta">${escapeHtml(dish.category)} · ${money(dish.price)} · ${escapeHtml(dish.weight)}</span>
            </span>
            <span class="admin-dish-item__state ${dish.isAvailable ? "is-on" : "is-off"}">${dish.isAvailable ? "В продаже" : "Скрыто"}</span>
          </button>`).join("")
      : '<p class="admin-dish-list__empty">В меню пока нет блюд.</p>';
  }

  function setAdminSwitch(on) {
    const node = el("adminDishAvailable");
    if (!node) return;
    node.setAttribute("aria-checked", String(on));
    node.classList.toggle("admin-switch--off", !on);
  }

  function adminSwitchOn() {
    return el("adminDishAvailable")?.getAttribute("aria-checked") === "true";
  }

  function fillAdminDishForm(dish) {
    const name = el("adminDishName");
    const category = el("adminDishCategory");
    const price = el("adminDishPrice");
    const weight = el("adminDishWeight");
    const composition = el("adminDishComposition");
    const image = el("adminDishImg");
    const title = el("adminDishTitle");
    const save = el("adminDishSave");
    const preview = el("adminDishImage");

    if (name) name.value = dish ? dish.name : "";
    if (category) category.value = dish ? dish.category : CATEGORIES[0];
    if (price) price.value = dish ? String(dish.price) : "";
    if (weight) weight.value = dish ? dish.weight : "";
    if (composition) composition.value = dish ? dish.composition : "";
    if (image) image.value = dish ? dish.img : "assets/images/dish-1.png";
    if (preview) {
      preview.src = displayImage(dish ? dish.img : "assets/images/dish-1.png");
      preview.alt = dish ? dish.name : "Новое блюдо";
    }
    if (title) title.textContent = dish ? dish.name : "Новое блюдо";
    if (save) save.textContent = adminIsNewDish ? "Добавить блюдо" : "Сохранить изменения";
    setAdminSwitch(dish ? dish.isAvailable !== false : true);
  }

  function selectAdminDish(id) {
    const dish = DB.getDishes().find((item) => item.id === id);
    if (!dish) return;
    adminSelectedDishId = dish.id;
    adminIsNewDish = false;
    renderAdminDishList();
    fillAdminDishForm(dish);
  }

  function startNewDish() {
    adminIsNewDish = true;
    adminSelectedDishId = null;
    renderAdminDishList();
    fillAdminDishForm(null);
    el("adminDishName")?.focus();
  }

  function saveAdminDish() {
    const name = String(el("adminDishName")?.value || "").trim();
    const category = el("adminDishCategory")?.value || CATEGORIES[0];
    const price = Math.max(0, Math.round(Number(el("adminDishPrice")?.value) || 0));
    const weight = normalizeWeight(el("adminDishWeight")?.value);
    const composition = String(el("adminDishComposition")?.value || "").trim();
    const img = String(el("adminDishImg")?.value || "").trim() || "assets/images/dish-1.png";
    const isAvailable = adminSwitchOn();

    if (!name) {
      showToast("Введите название блюда");
      el("adminDishName")?.focus();
      return;
    }
    if (!price) {
      showToast("Укажите цену блюда");
      el("adminDishPrice")?.focus();
      return;
    }

    const dishes = DB.getDishes();
    if (adminIsNewDish) {
      const id = `dish-${Date.now()}`;
      const popularity = dishes.reduce((max, dish) => Math.max(max, dish.popularity), 0) + 1;
      dishes.push({
        id,
        name,
        category,
        meals: category === "Завтраки" ? ["breakfast"] : ["lunch", "dinner"],
        diet: { noMeat: false, noGluten: false, noLactose: false },
        price,
        weight,
        composition,
        img,
        badge: "Новинка",
        isAvailable,
        popularity
      });
      DB.saveDishes(dishes);
      adminSelectedDishId = id;
      adminIsNewDish = false;
      showToast("Блюдо добавлено в меню");
    } else {
      const dish = dishes.find((item) => item.id === adminSelectedDishId);
      if (!dish) return;
      dish.name = name;
      dish.category = category;
      dish.price = price;
      dish.weight = weight;
      dish.composition = composition;
      dish.img = img;
      dish.isAvailable = isAvailable;
      DB.saveDishes(dishes);
      showToast(isAvailable ? "Изменения сохранены" : "Блюдо скрыто из витрины");
    }

    renderAdminDishList();
    fillAdminDishForm(DB.getDishes().find((dish) => dish.id === adminSelectedDishId));
    updateAdminCounts();
    updateAdminSettings();
  }

  function updateAdminSettings() {
    const info = el("adminSettingsStats");
    const freeDelivery = el("adminFreeDelivery");
    if (freeDelivery) freeDelivery.textContent = money(DELIVERY_FREE_FROM);
    if (!info) return;
    info.innerHTML = `
      <span><strong>${DB.getOrders().length}</strong> заказов</span>
      <span><strong>${money(adminRevenue())}</strong> выручка</span>
      <span><strong>${DB.getDishes().length}</strong> блюд</span>
      <span><strong>${DB.getTickets().length}</strong> обращений</span>
      <span><strong>${DB.getAddresses().length}</strong> адресов</span>`;
  }

  function switchAdminTab(name) {
    qsa("[data-admin-tab]").forEach((tab) => {
      const active = tab.dataset.adminTab === name;
      tab.classList.toggle("admin-tab--active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    qsa("[data-admin-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.adminPanel !== name;
    });
    if (name === "dishes") {
      renderAdminDishList();
      const dish = DB.getDishes().find((item) => item.id === adminSelectedDishId);
      if (dish && !adminIsNewDish) fillAdminDishForm(dish);
    }
    if (name === "tickets") renderAdminTickets();
    if (name === "settings") updateAdminSettings();
  }

  function initAdmin() {
    updateAdminCounts();
    renderAdminOrders();
    renderAdminTickets();
    renderAdminDishList();
    const firstDish = DB.getDishes().sort((a, b) => a.popularity - b.popularity)[0];
    if (firstDish) selectAdminDish(firstDish.id);
    else startNewDish();
    updateAdminSettings();

    qsa("[data-admin-tab]").forEach((tab) => {
      tab.addEventListener("click", () => switchAdminTab(tab.dataset.adminTab));
    });

    el("adminSearch")?.addEventListener("input", renderAdminOrders);
    el("adminStatusFilter")?.addEventListener("change", renderAdminOrders);

    el("adminOrdersBody")?.addEventListener("change", (event) => {
      const select = event.target.closest("[data-order-status]");
      if (!select) return;
      const orders = DB.getOrders();
      const order = orders.find((item) => item.id === select.dataset.orderStatus);
      if (!order) return;
      order.status = STATUSES.some((entry) => entry.key === select.value) ? select.value : "accepted";
      DB.saveOrders(orders);

      const active = readJSON(KEYS.activeOrder, null);
      if (active && (active.id === order.id || active.number === order.number)) {
        const updated = { ...active, status: order.status };
        writeJSON(KEYS.activeOrder, updated);
      }

      renderAdminOrders();
      updateAdminCounts();
      showToast(`Заказ № ${order.number}: ${statusLabel(order.status)}`);
    });

    el("adminOrdersBody")?.addEventListener("click", (event) => {
      if (event.target.closest("[data-admin-orders-reset]")) {
        const search = el("adminSearch");
        const filter = el("adminStatusFilter");
        if (search) search.value = "";
        if (filter) filter.value = "all";
        renderAdminOrders();
        showToast("Фильтры заказов сброшены");
        return;
      }
      const button = event.target.closest("[data-order-address]");
      if (!button) return;
      showToast(`Заказ № ${button.dataset.orderNumber}: ${button.dataset.orderAddress}`);
    });

    el("adminTicketsBody")?.addEventListener("click", (event) => {
      const row = event.target.closest("[data-ticket-id]");
      if (!row) return;
      adminSelectedTicketId = row.dataset.ticketId;
      renderAdminTickets();
    });

    el("adminTicketsBody")?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const row = event.target.closest("[data-ticket-id]");
      if (!row) return;
      event.preventDefault();
      adminSelectedTicketId = row.dataset.ticketId;
      renderAdminTickets();
    });

    el("adminTicketCard")?.addEventListener("click", (event) => {
      if (event.target.closest("[data-ticket-send], #adminTicketSend")) sendAdminTicketReply();
    });

    el("adminDishList")?.addEventListener("click", (event) => {
      const item = event.target.closest("[data-dish-id]");
      if (item) selectAdminDish(item.dataset.dishId);
    });

    el("adminAddDish")?.addEventListener("click", startNewDish);
    el("adminDishSave")?.addEventListener("click", saveAdminDish);
    el("adminDishCancel")?.addEventListener("click", () => {
      if (adminIsNewDish) {
        const first = DB.getDishes().sort((a, b) => a.popularity - b.popularity)[0];
        if (first) selectAdminDish(first.id);
        else startNewDish();
      } else {
        const dish = DB.getDishes().find((item) => item.id === adminSelectedDishId);
        if (dish) fillAdminDishForm(dish);
      }
    });

    const switchNode = el("adminDishAvailable");
    const toggleSwitch = () => setAdminSwitch(!adminSwitchOn());
    switchNode?.addEventListener("click", toggleSwitch);
    switchNode?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleSwitch();
      }
    });

    el("adminDishImg")?.addEventListener("input", () => {
      const preview = el("adminDishImage");
      const value = String(el("adminDishImg")?.value || "").trim();
      if (preview && value) preview.src = displayImage(value);
    });

    el("adminResetData")?.addEventListener("click", () => {
      if (!window.confirm("Сбросить все данные сайта и вернуть демо-набор?")) return;
      try {
        Object.keys(localStorage)
          .filter((key) => key.indexOf("apoest_") === 0)
          .forEach((key) => removeKey(key));
      } catch (error) {
        Object.values(KEYS).forEach((key) => removeKey(key));
      }
      window.location.reload();
    });
  }

  if (isAdmin) initAdmin();

})();
