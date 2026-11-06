/* Durable Life Skills - site behavior (no dependencies) */
(function () {
  "use strict";

  /* ---------- Header: mobile nav toggle + scroll shadow ---------- */
  const header = document.querySelector(".header");
  const toggle = document.querySelector(".nav-toggle");
  const drawer = document.getElementById("mobile-nav");

  if (toggle && drawer) {
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      drawer.classList.toggle("is-open", !open);
      if (!open) drawer.querySelector("a")?.focus();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && drawer.classList.contains("is-open")) {
        drawer.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.focus();
      }
    });
  }

  if (header) {
    const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---------- Mark current page in nav ---------- */
  const here = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll('.nav a, .mobile-nav a, .footer a[href$=".html"], .footer a[href="/"]').forEach((a) => {
    const target = a.getAttribute("href").split("#")[0];
    const page = target === "/" || target === "" ? "index.html" : target; // home links point at "/"
    if (page === here) a.setAttribute("aria-current", "page");
  });

  /* ---------- Shared: escape text for innerHTML ---------- */
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------- Portal settings (js/config.js) ---------- */
  const DLS_CONFIG = window.DLS_CONFIG || {};
  const API_BASE = String(DLS_CONFIG.apiBase || "").replace(/\/+$/, "");

  /* ---------------------------------------------------------------------
     NEWS BLOCKS  (RSS feeds the Super Admin manages in the portal)
     ---------------------------------------------------------------------
     The portal reads the feeds on its server and answers, for this page,
     the news blocks placed on it: GET /api/public/website/feeds?page=…
     A block goes into this page's <div data-feed-block="slug"> when there
     is one (its <section data-feed-section="slug"> gets the block's heading
     in [data-feed-title] and introduction in [data-feed-intro]); otherwise
     it is added as its own section before the closing call to action.
     A slot whose block is switched off or not placed on this page is
     hidden, unless its section carries data-feed-empty, which is shown
     instead. If the portal cannot be reached, the static markup stays.
     --------------------------------------------------------------------- */
  const FEEDS_ENDPOINT = API_BASE + "/api/public/website/feeds";
  const fmtDate = (d) => { const t = new Date(d); return isNaN(t) ? "" : t.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }); };
  const safeHref = (u) => (/^https?:\/\//i.test(u || "") ? u : "");

  function feedItemHtml(it, block) {
    const link = safeHref(it.link);
    if (!link || !it.title) return "";
    const href = esc(link);
    const meta = esc(it.source) + (it.date ? ' · <time datetime="' + esc(it.date) + '">' + esc(fmtDate(it.date)) + "</time>" : "");
    const summary = it.summary ? "<p>" + esc(it.summary) + "</p>" : "";
    if (block.layout === "list") {
      return '<article class="feed-list__item"><span class="news-card__meta">' + meta + "</span>" +
        '<h3><a href="' + href + '" rel="noopener" target="_blank">' + esc(it.title) + "</a></h3>" + summary + "</article>";
    }
    const image = safeHref(it.image);
    const figure = image
      ? '<figure class="photo"><img src="' + esc(image) + '" alt="" loading="lazy" width="1000" height="563" referrerpolicy="no-referrer"></figure>'
      : block.showImages ? '<figure class="photo photo--brand" aria-hidden="true"><img src="assets/logo-monkey.webp" alt=""></figure>' : "";
    return '<article class="news-card">' + figure + '<div class="news-card__body"><span class="news-card__meta">' + meta + "</span>" +
      '<h3><a href="' + href + '" rel="noopener" target="_blank">' + esc(it.title) + "</a></h3>" + summary +
      '<a class="link-arrow" href="' + href + '" rel="noopener" target="_blank">Read the article<span class="visually-hidden">: ' + esc(it.title) + "</span></a></div></article>";
  }

  function fillSlot(slot, block) {
    slot.classList.toggle("grid", block.layout !== "list");
    slot.classList.toggle("grid--3", block.layout !== "list");
    slot.classList.toggle("feed-list", block.layout === "list");
    slot.innerHTML = block.items.map((it) => feedItemHtml(it, block)).join("");
  }

  function emptySlot(slot) {
    const section = slot.closest("[data-feed-section]") || slot;
    const note = section.getAttribute("data-feed-empty");
    if (note) {
      slot.classList.remove("grid", "grid--3", "feed-list");
      slot.innerHTML = '<p class="feed-note">' + esc(note) + "</p>";
    } else {
      section.hidden = true;
    }
  }

  function autoSection(block) {
    const id = "feed-" + block.slug.replace(/[^a-z0-9-]/g, "") + "-title";
    const section = document.createElement("section");
    section.className = "section feed-section";
    section.setAttribute("aria-labelledby", id);
    section.setAttribute("data-feed-section", block.slug);
    section.innerHTML = '<div class="container"><div class="section-head"><h2 id="' + id + '" data-feed-title></h2><p data-feed-intro></p></div>' +
      '<div data-feed-block="' + esc(block.slug) + '"></div></div>';
    const main = document.getElementById("main") || document.body;
    const cta = main.querySelector(":scope > .cta");
    main.insertBefore(section, cta || null);
    return section.querySelector("[data-feed-block]");
  }

  function renderFeedBlocks(blocks) {
    const slots = new Map();
    document.querySelectorAll("[data-feed-block]").forEach((el) => slots.set(el.getAttribute("data-feed-block"), el));
    blocks.forEach((block) => {
      let slot = slots.get(block.slug);
      slots.delete(block.slug);
      if (!slot) {
        if (!block.items.length) return;
        slot = autoSection(block);
      }
      const section = slot.closest("[data-feed-section]");
      if (section) {
        const title = section.querySelector("[data-feed-title]");
        const intro = section.querySelector("[data-feed-intro]");
        if (title) title.textContent = block.title;
        if (intro) { intro.textContent = block.intro || ""; intro.hidden = !block.intro; }
      }
      if (block.items.length) fillSlot(slot, block); else emptySlot(slot);
    });
    // Slots this page has but no block was placed in.
    slots.forEach((slot) => emptySlot(slot));
  }

  // Every page asks: the Super Admin can place a block on any of them.
  {
    const pagePath = location.pathname || "/";
    fetch(FEEDS_ENDPOINT + "?page=" + encodeURIComponent(pagePath), { headers: { Accept: "application/json" }, credentials: "omit" })
      .then((r) => { if (!r.ok) throw 0; return r.json(); })
      .then((data) => { if (data && Array.isArray(data.blocks)) renderFeedBlocks(data.blocks); else throw 0; })
      .catch(() => {
        // Keep any static fallback; replace a "Loading…" note with an honest one.
        document.querySelectorAll("[data-feed-block] .feed-note").forEach((note) => {
          note.innerHTML = 'The latest articles could not be loaded just now. You can read them at <a href="https://durablelifeskills.com/dls-media/" rel="noopener" target="_blank">DLS Media</a>.';
        });
      });
  }

  /* ---------- Section eyebrows: draw in on first view ---------- */
  const eyebrows = document.querySelectorAll(".eyebrow:not(.quick__card .eyebrow)");
  if (eyebrows.length && "IntersectionObserver" in window) {
    eyebrows.forEach((el) => el.classList.add("is-animate"));
    const eio = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("is-seen"); eio.unobserve(en.target); } });
    }, { threshold: 0.6, rootMargin: "0px 0px -5% 0px" });
    eyebrows.forEach((el) => eio.observe(el));
  }

  /* ---------- Approach steps: light up 1→4 on first view ---------- */
  const steps = document.querySelector(".steps");
  if (steps && "IntersectionObserver" in window) {
    steps.classList.add("is-animate");
    // Replays every time the steps come back into view
    const sio = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) steps.classList.add("is-seen");
        else if (e.boundingClientRect.top > 0 || e.boundingClientRect.bottom < 0) steps.classList.remove("is-seen");
      });
    }, { threshold: 0.35 });
    sio.observe(steps);
  }

  /* ---------- Where We Serve: Colorado map with pins (d3 + us-atlas) ---------- */
  const mapEl = document.getElementById("area-map");
  if (mapEl && window.d3 && window.topojson) {
    const cities = [["Pueblo","Home office",-104.6091,38.2544,"home"],["Pueblo West","Pueblo County",-104.7225,38.3497],["Colorado Springs","El Paso County",-104.8214,38.8339],["Greeley","Weld County",-104.7091,40.4233],["Loveland","Larimer County",-105.0750,40.3978],["Fort Collins","Larimer County",-105.0844,40.5853]];
    const served = ["08101", "08041", "08123", "08069"]; // Pueblo, El Paso, Weld, Larimer
    Promise.all([
      fetch("https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/counties-10m.json").then((r) => r.json()),
    ]).then(([us]) => {
      const counties = topojson.feature(us, us.objects.counties).features.filter((f) => f.id.startsWith("08"));
      const state = topojson.feature(us, us.objects.states).features.find((f) => f.id === "08");
      const W = 600, H = 450;
      // Frame the Front Range service area (Pueblo north to Fort Collins) rather than the whole state
      const focus = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[-107.3, 38.0], [-101.9, 38.0], [-101.9, 41.05], [-107.3, 41.05], [-107.3, 38.0]].reverse()] } };
      const proj = d3.geoMercator().fitExtent([[20, 20], [W - 20, H - 20]], focus);
      const path = d3.geoPath(proj);
      const svg = d3.select(mapEl).append("svg").attr("viewBox", "0 0 " + W + " " + H).attr("preserveAspectRatio", "xMidYMid meet");
      svg.append("defs").append("clipPath").attr("id", "area-clip").append("rect").attr("width", W).attr("height", H).attr("rx", 16);
      const layer = svg.append("g").attr("clip-path", "url(#area-clip)");
      layer.append("g").selectAll("path").data(counties).join("path")
        .attr("class", (d) => "county" + (served.includes(d.id) ? " is-served" : "")).attr("d", path);
      layer.append("path").attr("class", "state").attr("d", path(state)).attr("pathLength", 1);
      const pinPos = svg.append("g").selectAll("g").data(cities).join("g")
        .attr("transform", (d) => { const p = proj([d[2], d[3]]); return "translate(" + p[0] + "," + p[1] + ")"; });
      const pins = pinPos.append("g")
        .attr("class", (d) => "pin" + (d[4] === "home" ? " is-home" : ""))
        .attr("data-city", (d) => d[0])
        .style("--d", (d, i) => (1.4 + i * 0.25) + "s");
      pins.append("circle").attr("class", "ring").attr("r", 8);
      pins.append("circle").attr("class", "dot").attr("r", (d) => d[4] === "home" ? 7 : 5.5);
      const leftLabel = (d) => d[0] === "Loveland" || d[0] === "Pueblo West";
      pins.append("text").attr("x", (d) => leftLabel(d) ? -12 : 13).attr("y", (d) => d[0] === "Pueblo" ? 6 : 5)
        .attr("text-anchor", (d) => leftLabel(d) ? "end" : "start").text((d) => d[0]);
      // Hover sync between pins and list
      const areaEl = mapEl.closest(".area");
      const hot = (name, on) => areaEl.querySelectorAll('[data-city="' + name + '"]').forEach((el) => el.classList.toggle("is-hot", on));
      areaEl.querySelectorAll("[data-city]").forEach((el) => {
        el.addEventListener("mouseenter", () => hot(el.dataset.city, true));
        el.addEventListener("mouseleave", () => hot(el.dataset.city, false));
      });
      // Play (and replay) when the card enters view
      if ("IntersectionObserver" in window) {
        const mio = new IntersectionObserver((entries) => entries.forEach((e) => {
          if (e.isIntersecting) areaEl.classList.add("is-seen");
          else if (e.boundingClientRect.top > 0 || e.boundingClientRect.bottom < 0) areaEl.classList.remove("is-seen");
        }), { threshold: 0.35 });
        mio.observe(areaEl);
      } else areaEl.classList.add("is-seen");
    }).catch(() => { mapEl.style.display = "none"; });
  }

  /* ---------- Home: play the services journey animation on first view ---------- */
  const servicesSec = document.querySelector(".services");
  if (servicesSec) {
    if ("IntersectionObserver" in window) {
      const once = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) { servicesSec.classList.add("is-inview"); once.disconnect(); }
      }, { threshold: 0.2 });
      once.observe(servicesSec);
    } else servicesSec.classList.add("is-inview");
    // Hover/focus on a journey animal highlights its card, and vice versa
    const pairs = servicesSec.querySelectorAll("[data-svc]");
    const setHot = (key, on) => pairs.forEach((el) => { if (el.dataset.svc === key) el.classList.toggle("is-hot", on); });
    pairs.forEach((el) => {
      el.addEventListener("mouseenter", () => setHot(el.dataset.svc, true));
      el.addEventListener("mouseleave", () => setHot(el.dataset.svc, false));
      el.addEventListener("focusin", () => setHot(el.dataset.svc, true));
      el.addEventListener("focusout", () => setHot(el.dataset.svc, false));
    });
    servicesSec.querySelectorAll(".journey__node").forEach((n) => n.addEventListener("click", (ev) => {
      const card = document.getElementById(n.getAttribute("href").slice(1));
      if (!card) return;
      ev.preventDefault();
      const top = card.getBoundingClientRect().top + window.scrollY - 120;
      window.scrollTo({ top, behavior: "smooth" });
      setHot(n.dataset.svc, true); setTimeout(() => setHot(n.dataset.svc, false), 1600);
    }));
  }

  /* ---------- Services page: highlight side nav on scroll ---------- */
  const sideLinks = document.querySelectorAll(".service-nav a");
  if (sideLinks.length && "IntersectionObserver" in window) {
    const map = new Map();
    sideLinks.forEach((a) => {
      const sec = document.querySelector(a.getAttribute("href"));
      if (sec) map.set(sec, a);
    });
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            sideLinks.forEach((l) => l.classList.remove("is-active"));
            map.get(en.target)?.classList.add("is-active");
          }
        });
      },
      { rootMargin: "-30% 0px -60% 0px" }
    );
    map.forEach((_, sec) => io.observe(sec));
  }

  /* ---------- Footer year ---------- */
  document.querySelectorAll("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));

  /* ---------------------------------------------------------------------
     LEAD FORM  (contact.html  ->  <form id="lead-form">)
     ---------------------------------------------------------------------
     The form posts to the DLS Portal API, which stores the inquiry, shows
     it in the portal's Leads inbox and emails the administrators. Success
     requires the API's receipt, not merely an HTTP response, and no
     personal details are logged.
     The portal serves this site, so the API is on the same host and
     js/config.js leaves apiBase empty. If the site is ever served from
     another host, set apiBase there and list this site's origin in the
     API's PUBLIC_FORM_ORIGINS setting.
     The questions are managed in the portal: on load the form asks the API
     which to show and rebuilds its fields; the static markup stays as the
     fallback whenever that request fails.
     Payload: one key per question plus page and submissionId. The API
     answers 202 when the inquiry was accepted, 400 with a message when a
     field is missing or malformed, and 429 when this address has tried too
     many times in a few minutes.
     submissionId is this form's key: made up once for the answers as typed
     and sent again with every retry of them, so that a lost receipt and a
     second click store one inquiry, not two. Change an answer and a new key
     goes with it, because changed answers are a new inquiry and the API
     must not fold them into the old one. (The API checks the answers as
     well as the key, so a key sent again with changed answers is still
     stored as a new inquiry.)
     --------------------------------------------------------------------- */
  const LEAD_ENDPOINT = API_BASE + "/api/public/leads";
  const FORM_SCHEMA_ENDPOINT = API_BASE + "/api/public/forms/contact";
  const CONTACT_FALLBACK = "You can also call (970) 893-2145 or email info@durablelifeskills.com.";

  async function sendLead(payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(LEAD_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      let body = null;
      try { body = await res.json(); } catch (e) { body = null; }
      const ok = res.status === 202 && !!body && body.ok === true;
      const message = !ok && body && body.error && body.error.message ? String(body.error.message) : "";
      return { ok: ok, status: res.status, message: message };
    } finally {
      clearTimeout(timer);
    }
  }

  const HALF_WIDTH = { short_text: true, email: true, phone: true };
  const AUTOCOMPLETE = { firstName: "given-name", lastName: "family-name", email: "email", phone: "tel" };

  function questionHtml(q) {
    const id = "q_" + String(q.key).replace(/[^A-Za-z0-9_-]/g, "");
    const name = esc(q.key);
    const req = q.required ? " required" : "";
    const max = q.maxLength ? ' maxlength="' + Number(q.maxLength) + '"' : "";
    const optional = q.required ? "" : ' <span class="hint">(optional)</span>';
    const help = q.helpText ? '<span class="hint">' + esc(q.helpText) + "</span>" : "";
    const err = '<span class="error" aria-live="polite"></span>';
    const opts = Array.isArray(q.options) ? q.options : [];
    if (q.type === "yes_no") {
      return '<div class="field field--full"><label class="consent"><input type="checkbox" name="' + name + '" value="yes"' + req + "> " + esc(q.label) + "</label>" + help + err + "</div>";
    }
    if (q.type === "select") {
      if (!q.required && opts.length <= 4) {
        return '<fieldset class="fieldset field--full"><legend>' + esc(q.label) + "</legend>" + help + '<div class="radio-row">' +
          opts.map((o) => '<label><input type="radio" name="' + name + '" value="' + esc(o) + '"> ' + esc(o) + "</label>").join("") +
          "</div>" + err + "</fieldset>";
      }
      return '<div class="field field--full"><label for="' + id + '">' + esc(q.label) + optional + "</label>" + help +
        '<select id="' + id + '" name="' + name + '"' + req + '><option value="">' + (q.required ? "Choose one" : "Not sure yet") + "</option>" +
        opts.map((o) => '<option value="' + esc(o) + '">' + esc(o) + "</option>").join("") + "</select>" + err + "</div>";
    }
    if (q.type === "long_text") {
      return '<div class="field field--full"><label for="' + id + '">' + esc(q.label) + optional + "</label>" + help +
        '<textarea id="' + id + '" name="' + name + '" rows="5"' + max + req + "></textarea>" + err + "</div>";
    }
    const type = q.type === "email" ? "email" : q.type === "phone" ? "tel" : "text";
    const inputmode = q.type === "email" ? ' inputmode="email"' : q.type === "phone" ? ' inputmode="tel"' : "";
    const autocomplete = AUTOCOMPLETE[q.key] ? ' autocomplete="' + AUTOCOMPLETE[q.key] + '"' : "";
    return '<div class="field' + (HALF_WIDTH[q.type] ? "" : " field--full") + '"><label for="' + id + '">' + esc(q.label) + optional + "</label>" + help +
      '<input id="' + id + '" name="' + name + '" type="' + type + '"' + inputmode + autocomplete + max + req + ">" + err + "</div>";
  }

  async function renderQuestions(form) {
    let questions = null;
    try {
      const res = await fetch(FORM_SCHEMA_ENDPOINT, { headers: { Accept: "application/json" }, credentials: "omit" });
      if (!res.ok) return;
      const data = await res.json();
      questions = data && Array.isArray(data.questions) ? data.questions : null;
    } catch (e) {
      return; // keep the static form
    }
    if (!questions || questions.length === 0) return;
    const submit = form.querySelector('button[type="submit"]');
    const tail = submit ? submit.closest(".field--full") || submit.parentElement : null;
    const honeypot = form.querySelector(".honeypot");
    Array.from(form.children).forEach((child) => {
      if (child !== honeypot && child !== tail) child.remove();
    });
    form.insertAdjacentHTML("afterbegin", questions.map(questionHtml).join(""));
    form.classList.add("is-live");
  }

  const form = document.getElementById("lead-form");
  if (form) {
    renderQuestions(form);
    const status = form.querySelector(".form-status");
    const submitBtn = form.querySelector('button[type="submit"]');
    let pending = false;
    let submissionId = null;
    let submittedData = null;

    const newKey = () => {
      if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
      let key = "";
      const bytes = window.crypto && window.crypto.getRandomValues ? window.crypto.getRandomValues(new Uint8Array(16)) : null;
      for (let i = 0; i < 16; i += 1) {
        const n = bytes ? bytes[i] : Math.floor(Math.random() * 256);
        key += (n < 16 ? "0" : "") + n.toString(16);
      }
      return key;
    };

    const setError = (input, msg) => {
      const field = input.closest(".field");
      if (!field) return;
      const err = field.querySelector(".error");
      field.classList.toggle("has-error", !!msg);
      input.setAttribute("aria-invalid", msg ? "true" : "false");
      if (err) err.textContent = msg || "";
    };

    const validate = () => {
      let firstBad = null;
      form.querySelectorAll("input[required], select[required], textarea[required]").forEach((el) => {
        let msg = "";
        if (el.type === "checkbox" && !el.checked) msg = "Please check this box to continue.";
        else if (!el.value.trim()) msg = "This field is required.";
        else if (el.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value)) msg = "Enter a valid email address.";
        setError(el, msg);
        if (msg && !firstBad) firstBad = el;
      });
      return firstBad;
    };

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (pending) return;
      status.className = "form-status";
      const bad = validate();
      if (bad) { bad.focus(); return; }

      // The honeypot travels with the rest; the API discards a filled one quietly.
      const data = Object.fromEntries(new FormData(form).entries());
      const serialized = JSON.stringify(data);
      if (!submissionId || serialized !== submittedData) {
        submissionId = newKey();
        submittedData = serialized;
      }
      const payload = { ...data, page: location.pathname, submissionId: submissionId };

      pending = true;
      const controls = [...form.querySelectorAll("input, select, textarea, button")];
      controls.forEach((control) => { control.disabled = true; });
      submitBtn.textContent = "Sending…";
      try {
        const r = await sendLead(payload);
        if (!r.ok) {
          const userMessage = r.status === 429
            ? "Too many attempts from this connection. Please wait a few minutes and try again."
            : r.status === 400
              ? (r.message || "Please check your entries and try again.")
              : "";
          throw Object.assign(new Error("bad response"), { userMessage: userMessage });
        }
        form.reset();
        submissionId = null;
        submittedData = null;
        status.textContent = "Thank you - your consultation request has been received. We'll follow up within one business day.";
        status.classList.add("is-success");
      } catch (err) {
        const reason = (err && err.userMessage) || "We could not confirm receipt of your request. You can try again.";
        status.textContent = reason + " Your entries have been kept. " + CONTACT_FALLBACK;
        status.classList.add("is-error");
      } finally {
        pending = false;
        controls.forEach((control) => { control.disabled = false; });
        submitBtn.textContent = "Request a Consultation";
        status.focus();
      }
    });
  }
})();
