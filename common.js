(() => {
  "use strict";

  const contentPanel = document.querySelector(".content-panel");
  const auxPanelInner = document.querySelector(".aux-panel-inner");
  const tabs = [...document.querySelectorAll(".tab[data-tab]")];
  const panels = [...document.querySelectorAll(".tab-content[data-tab-panel]")];

  if (!contentPanel || !auxPanelInner || tabs.length === 0 || panels.length === 0) {
    return;
  }

  const tabByName = new Map(tabs.map((tab) => [tab.dataset.tab, tab]));
  const panelByTab = new Map(panels.map((panel) => [panel.dataset.tabPanel, panel]));
  const timelineLayout = {
    dateSpineX: 64,
    entrySpineX: 80,
    itemTextX: 100,
    rowHeight: 12,
  };

  const parseHash = (hash = window.location.hash) => {
    const raw = decodeURIComponent(hash.replace(/^#/, ""));
    if (!raw) return { tab: tabs[0].dataset.tab, entry: null };
    const slash = raw.indexOf("/");
    if (slash === -1) return { tab: raw, entry: null };
    return { tab: raw.slice(0, slash), entry: raw.slice(slash + 1) || null };
  };

  const buildHash = (tab, entry = null) => {
    return `#${encodeURIComponent(tab)}${entry ? `/${encodeURIComponent(entry)}` : ""}`;
  };

  const getEntry = (panel, entryId) => {
    if (!entryId) return null;
    return panel.querySelector(`.entry[data-entry-id="${CSS.escape(entryId)}"]`);
  };

  const setActiveTab = (tabName) => {
    const safeTab = tabByName.has(tabName) ? tabName : tabs[0].dataset.tab;

    for (const tab of tabs) {
      const active = tab.dataset.tab === safeTab;
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.tabIndex = active ? 0 : -1;
    }

    for (const panel of panels) {
      panel.hidden = panel.dataset.tabPanel !== safeTab;
    }

    renderAuxiliary(safeTab);
    return safeTab;
  };

  const navigate = ({ tab, entry = null }) => {
    const safeTab = setActiveTab(tab);
    const safeEntry = getEntry(panelByTab.get(safeTab), entry);
    const safeEntryName = safeEntry ? safeEntry.dataset.entryId : null;
    const hash = buildHash(safeTab, safeEntryName);

    if (window.location.hash !== hash) {
      window.history.replaceState(null, "", hash);
    }

    if (safeEntry) {
      safeEntry.scrollIntoView({ block: "start", inline: "nearest", behavior: "auto" });
    } else {
      contentPanel.scrollTop = 0;
    }
  };

  const anchorEvent = (event, tabName, entryId) => {
    if (event.button && event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;

    event.preventDefault();
    navigate({ tab: tabName, entry: entryId });
  };

  const renderAuxiliary = (tabName) => {
    auxPanelInner.innerHTML = "";

    if (tabName === "work" || tabName === "event") {
      renderTimeline(tabName);
    } else {
      renderIndex(tabName);
    }
  };

  const addDays = (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };

  const renderTimeline = (tabName) => {
    const panel = panelByTab.get(tabName);
    const entries = [...panel.querySelectorAll(".entry[data-date][data-entry-id]")]
      .map((entry) => ({
        id: entry.dataset.entryId,
        dateValue: entry.dataset.date,
        date: new Date(entry.dataset.date),
        summary: entry.dataset.summary ?? entry.dataset.entryId,
      }))
      .filter((item) => !Number.isNaN(item.date.getTime()))
      .sort((a, b) => a.date - b.date);

    if (entries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "aux-empty";
      empty.textContent = "このタブには時系列表示する項目がありません。";
      auxPanelInner.appendChild(empty);
      return;
    }

    const dates = ["work", "event"].flatMap((timelineTab) => {
      const timelinePanel = panelByTab.get(timelineTab);
      return [...timelinePanel.querySelectorAll(".entry[data-date]")]
        .map((entry) => new Date(entry.dataset.date).getTime())
        .filter((date) => !Number.isNaN(date));
    });

    const minDate = addDays(new Date(Math.min(...dates)), -50);
    const maxDate = addDays(new Date(Math.max(...dates)), 50);

    const rowHeight = timelineLayout.rowHeight;
    const gap = 2;
    const {dateSpineX, entrySpineX, itemTextX} = timelineLayout;
    const branchPointX = itemTextX - 12;

    const baseHeight = Math.max(320, auxPanelInner.clientHeight) - rowHeight * 2;
    const range = Math.max(1, maxDate.getTime() - minDate.getTime());

    console.log(`Base height: ${baseHeight}`);

    const calcY = (date) =>
      Math.floor(
        (((date.getTime() - minDate.getTime()) / range) * baseHeight + rowHeight)
        * 100
      ) / 100;

    const hrefFor = (entryId) => buildHash(tabName, entryId);

    const wrapper = document.createElement("div");
    wrapper.className = "timeline";
    wrapper.style.setProperty("--date-spine-x", `${dateSpineX}px`);
    wrapper.style.setProperty("--entry-spine-x", `${entrySpineX}px`);
    wrapper.style.setProperty("--item-text-x", `${itemTextX}px`);
    wrapper.style.setProperty("--row-height", `${rowHeight}px`);

    const scale = document.createElement("div");
    scale.className = "timeline-scale";

    for (const tickDate of createMonthTicks(minDate, maxDate, baseHeight, rowHeight)) {
      const y = calcY(tickDate);

      const tick = document.createElement("span");
      tick.className = "timeline-tick";
      tick.style.top = `${y}px`;
      scale.appendChild(tick);

      const label = document.createElement("span");
      label.className = "timeline-label";
      label.style.top = `${y}px`;
      label.textContent =
        `${tickDate.getFullYear()}-${String(tickDate.getMonth() + 1).padStart(2, "0")}`;
      scale.appendChild(label);
    }

    wrapper.appendChild(scale);

    const canvas = document.createElement("div");
    canvas.className = "timeline-canvas";

    const svgNs = "http://www.w3.org/2000/svg";

    const createPath = (className, pathData) => {
      const path = document.createElementNS(svgNs, "path");
      path.setAttribute("class", className);
      path.setAttribute("d", pathData);
      return path;
    };

    const createHitArea = (pathData) =>
      createPath("timeline-route-hit", pathData);

    const firstItemByDay = new Map();

    const laidOutEntries = [];

    let previousBottom = -Infinity;
    let maxBottom = 0;

    for (const item of entries) {
      const idealY = calcY(item.date);
      const actualY = Math.max(idealY, previousBottom + gap + rowHeight / 2);

      const laidOutItem = {...item, idealY, actualY};

      laidOutEntries.push(laidOutItem);

      const day = item.dateValue.slice(0, 10);
      if (!firstItemByDay.has(day)) {
        firstItemByDay.set(day, laidOutItem);
      }

      previousBottom = actualY + rowHeight / 2;
      maxBottom = Math.max(maxBottom, previousBottom);
    }

    canvas.style.height = `${maxBottom}px`;

    for (const item of laidOutEntries) {
      const day = item.dateValue.slice(0, 10);
      const isFirstOfDay = firstItemByDay.get(day) === item;

      const itemLink = document.createElement("a");
      itemLink.className = "timeline-item-link";
      itemLink.href = hrefFor(item.id);
      itemLink.title = `${item.dateValue} — ${item.summary}`;
      itemLink.setAttribute(
        "aria-label",
        `${item.dateValue} ${item.summary}`,
      );

      itemLink.addEventListener("click", (event) => {
        anchorEvent(event, tabName, item.id);
      });

      const itemRoutes = document.createElementNS(svgNs, "svg");
      itemRoutes.setAttribute("class", "timeline-item-route-layer");
      itemRoutes.setAttribute("width", "100%");
      itemRoutes.setAttribute("height", "100%");
      itemRoutes.setAttribute("aria-hidden", "true");

      const dateRoutes = [];
      if (isFirstOfDay) {
        dateRoutes.push(`M ${dateSpineX} ${item.idealY}`);
      } else {
        dateRoutes.push(`M ${entrySpineX} ${item.idealY}`);
      }
      if (isFirstOfDay && item.idealY !== item.actualY) {
        dateRoutes.push(`H ${entrySpineX}`);
      }
      if (item.idealY !== item.actualY) {
        dateRoutes.push(`L ${branchPointX} ${item.actualY}`);
      }
      dateRoutes.push(`H ${itemTextX}`);
      const dateRoute = dateRoutes.join(" ");
      itemRoutes.append(
        createPath("timeline-item-route", dateRoute),
        createHitArea(dateRoute),
      );

      const label = document.createElement("span");
      label.className = "timeline-item-label";
      label.style.top = `${item.actualY}px`;
      label.textContent = item.summary;

      itemLink.append(itemRoutes, label);
      canvas.appendChild(itemLink);
    }

    wrapper.appendChild(canvas);
    auxPanelInner.appendChild(wrapper);
  };

  const createMonthTicks = (minDate, maxDate, baseHeight, rowHeight) => {
    const ticks = [];
    const cursor = new Date(minDate);
    cursor.setDate(1);
    if (cursor < minDate) cursor.setMonth(cursor.getMonth() + 1);

    const range = Math.max(1, maxDate.getTime() - minDate.getTime());
    let monthHeight = baseHeight * ((1000 * 60 * 60 * 24 * 28) / range);
    let monthOffset = 1;
    while (monthOffset < 12 && monthHeight < rowHeight * 2) {
      const multiplier = monthOffset === 1 ? 3 : 2;
      monthOffset *= multiplier;
      monthHeight *= multiplier;
    }
    while (cursor.getMonth() % monthOffset !== 0) {
      cursor.setMonth(cursor.getMonth() + 1);
    }

    while (cursor <= maxDate) {
      ticks.push(new Date(cursor));
      cursor.setMonth(cursor.getMonth() + monthOffset);
    }

    if (ticks.length === 0) ticks.push(new Date(minDate));
    return ticks;
  };

  const renderIndex = (tabName) => {
    const panel = panelByTab.get(tabName);
    const entries = [...panel.querySelectorAll(".entry[data-entry-id]")];

    const wrap = document.createElement("div");
    wrap.className = "aux-index";

    const title = document.createElement("h2");
    title.className = "aux-index-title";
    title.textContent = tabName === "artist" ? "ARTISTS" : tabName === "link" ? "LINKS" : "INDEX";
    wrap.appendChild(title);

    const list = document.createElement("ul");
    list.className = "aux-index-list";

    for (const entry of entries) {
      const link = document.createElement("a");
      link.href = buildHash(tabName, entry.dataset.entryId);
      link.textContent = entry.dataset.summary ?? entry.querySelector(".entry-summary")?.textContent.trim() ?? entry.dataset.entryId;
      link.addEventListener("click", (event) => {
        anchorEvent(event, tabName, entry.dataset.entryId);
      });

      const li = document.createElement("li");
      li.appendChild(link);
      list.appendChild(li);
    }

    wrap.appendChild(list);
    auxPanelInner.appendChild(wrap);
  };

  for (const link of document.querySelectorAll("a[href^='#']")) {
    if (link.target && link.target !== "_self") continue;
    const { tab, entry } = parseHash(link.getAttribute("href"));

    link.addEventListener("click", (event) => {
      anchorEvent(event, tab, entry);
    });
  }

  const moveTab = (event, index) => {
    const nextIndex = (index + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    event.preventDefault();
    navigate({tab: nextTab.dataset.tab});
    nextTab.focus();
  };

  for (const [index, tab] of tabs.entries()) {
    tab.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight") {
        moveTab(event, index + 1);
      } else if (event.key === "ArrowLeft") {
        moveTab(event, index - 1);
      } else if (event.key === " ") {
        event.preventDefault();
        navigate({tab: tab.dataset.tab});
      }
    });
  }

  window.addEventListener("popstate", () => {
    navigate(parseHash());
  });

  window.addEventListener("hashchange", () => {
    navigate(parseHash());
  });

  window.addEventListener("resize", () => {
    const active = tabs.find((tab) => tab.getAttribute("aria-selected") === "true")?.dataset.tab;
    if (active) renderAuxiliary(active);
  });

  navigate(parseHash());
})();
