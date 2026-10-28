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
  document.querySelectorAll('.nav a, .mobile-nav a, .footer a[href$=".html"]').forEach((a) => {
    const target = a.getAttribute("href").split("#")[0];
    if (target === here) a.setAttribute("aria-current", "page");
  });

  /* ---------- News: live from the DLS Media RSS feed ---------- */
  const NEWS_FEED = "https://durablelifeskills.com/dls-media/feed/rss";
  const newsGrid = document.querySelector("[data-news-feed]");
  if (newsGrid) {
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const fmt = (d) => { const t = new Date(d); return isNaN(t) ? "" : t.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }); };
    const fullImg = (u) => (u || "").replace(/-thumb(\.\w+)$/, "$1"); // gallery thumbs have full-size siblings
    const trim = (s, n) => { s = s.replace(/\s+/g, " ").trim(); if (s.length <= n) return s; s = s.slice(0, n); return s.slice(0, s.lastIndexOf(" ")) + "..."; };
    fetch(NEWS_FEED).then((r) => { if (!r.ok) throw 0; return r.text(); }).then((xml) => {
      const doc = new DOMParser().parseFromString(xml, "text/xml");
      const items = [...doc.querySelectorAll("item")].slice(0, 3);
      if (items.length < 3) return;
      const ns = "http://search.yahoo.com/mrss/";
      newsGrid.innerHTML = items.map((it) => {
        const q = (sel) => (it.querySelector(sel) || {}).textContent || "";
        const title = q("title").trim(), link = q("link").trim(), date = q("pubDate");
        const media = it.getElementsByTagNameNS(ns, "content")[0] || it.getElementsByTagNameNS(ns, "thumbnail")[0];
        let img = media ? fullImg(media.getAttribute("url")) : "";
        if (/dummyImage/.test(img)) img = "";
        const desc = trim(q("description"), 150);
        return '<article class="news-card">' +
          (img ? '<figure class="photo"><img src="' + esc(img) + '" alt="" loading="lazy" width="1000" height="563"></figure>' : '<figure class="photo photo--brand" aria-hidden="true"><img src="assets/logo-monkey.png" alt=""></figure>') +
          '<div class="news-card__body"><span class="news-card__meta">DLS Media · <time>' + esc(fmt(date)) + '</time></span>' +
          '<h3><a href="' + esc(link) + '" rel="noopener" target="_blank">' + esc(title) + '</a></h3>' +
          '<p>' + esc(desc) + '</p>' +
          '<a class="link-arrow" href="' + esc(link) + '" rel="noopener" target="_blank">Read the article</a></div></article>';
      }).join("");
    }).catch(() => { /* keep the static fallback cards */ });
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
    const cities = [["Pueblo","Home office",-104.6091,38.2544,"home"],["Pueblo West","Pueblo County",-104.7225,38.3497],["Colorado Springs","El Paso County",-104.8214,38.8339],["Cañon City","Fremont County",-105.2425,38.4411],["Walsenburg","Huerfano County",-104.7802,37.6242]];
    const served = ["08101", "08041", "08043", "08055"]; // Pueblo, El Paso, Fremont, Huerfano
    Promise.all([
      fetch("https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/counties-10m.json").then((r) => r.json()),
    ]).then(([us]) => {
      const counties = topojson.feature(us, us.objects.counties).features.filter((f) => f.id.startsWith("08"));
      const state = topojson.feature(us, us.objects.states).features.find((f) => f.id === "08");
      const W = 600, H = 450;
      // Frame southern Colorado (the service area) rather than the whole state
      const focus = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[-106.4, 37.3], [-103.3, 37.3], [-103.3, 39.2], [-106.4, 39.2], [-106.4, 37.3]].reverse()] } };
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
      const leftLabel = (d) => d[0] === "Cañon City" || d[0] === "Pueblo West";
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

  /* =====================================================================
     LEAD FORM SUBMIT HANDLER  (contact.html  →  <form id="lead-form">)
     ---------------------------------------------------------------------
     This is the ONLY place the form is submitted. To connect Zapier,
     HubSpot, Formspree, etc., set LEAD_ENDPOINT to your webhook URL.
     Payload is posted as JSON: { firstName, lastName, email, phone,
     role, service, message, page, submittedAt }.
     - Zapier "Catch Hook": paste the hook URL; fields arrive as top-level keys.
     - HubSpot Forms API: swap the fetch body for HubSpot's
       { fields:[{name,value}] } shape inside sendLead().
     ===================================================================== */
  const LEAD_ENDPOINT = ""; // e.g. "https://hooks.zapier.com/hooks/catch/XXXX/YYYY/"

  async function sendLead(payload) {
    if (!LEAD_ENDPOINT) {
      // Dev fallback: no endpoint configured yet - log and pretend success.
      console.info("[DLS lead-form] LEAD_ENDPOINT not set. Payload:", payload);
      return { ok: true };
    }
    const res = await fetch(LEAD_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok };
  }

  const form = document.getElementById("lead-form");
  if (form) {
    const status = form.querySelector(".form-status");
    const submitBtn = form.querySelector('button[type="submit"]');

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
        if (el.type !== "checkbox") setError(el, msg);
        if (msg && !firstBad) firstBad = el;
      });
      return firstBad;
    };

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      status.className = "form-status";
      if (form.querySelector('[name="company_website"]').value) return; // honeypot
      const bad = validate();
      if (bad) { bad.focus(); return; }

      const data = Object.fromEntries(new FormData(form).entries());
      delete data.company_website;
      const payload = { ...data, page: location.href, submittedAt: new Date().toISOString() };

      submitBtn.disabled = true;
      submitBtn.textContent = "Sending…";
      try {
        const r = await sendLead(payload);
        if (!r.ok) throw new Error("bad response");
        form.reset();
        status.textContent = "Thank you - we received your request and will follow up within one business day.";
        status.classList.add("is-success");
      } catch (err) {
        status.textContent = "Something went wrong sending your request. Please call (719) 568-5041 or email marketing@durablelifeskills.com.";
        status.classList.add("is-error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Request a Consultation";
        status.focus();
      }
    });
  }
})();
