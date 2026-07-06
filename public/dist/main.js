import { fetchRecommendation } from "./api.js";
import { clearShareParamFromUrl, readSharedRecommendationFromUrl } from "./share.js";
import { applySettings, initSettingsPanel } from "./settings.js";
import { createSession, createDemoSession, DEMO_SESSION_NAME, deleteSession, duplicateSession, loadSessions, loadSettings, saveSettings, saveSessions, upsertSession, } from "./storage.js";
import { renderIntentInput } from "./views/intentInput.js";
import { renderLocationGrant } from "./views/locationGrant.js";
import { renderResults } from "./views/results.js";
const LOCATION_PENDING_LABEL = "Location pending";
function requireElement(id, constructor) {
    const element = document.getElementById(id);
    if (!(element instanceof constructor)) {
        throw new Error(`Missing #${id}`);
    }
    return element;
}
function getElements() {
    return {
        sidebar: requireElement("sidebar", HTMLElement),
        sidebarToggle: requireElement("sidebar-toggle", HTMLButtonElement),
        sessionList: requireElement("session-list", HTMLElement),
        newSession: requireElement("new-session", HTMLButtonElement),
        navSessions: requireElement("nav-sessions", HTMLButtonElement),
        navConditions: requireElement("nav-conditions", HTMLButtonElement),
        navPreferences: requireElement("nav-preferences", HTMLButtonElement),
        sessionSearch: requireElement("session-search", HTMLInputElement),
        mainContent: requireElement("main-content", HTMLElement),
        activeTitle: requireElement("active-session-title", HTMLElement),
        settingsPanel: requireElement("settings-panel", HTMLElement),
        settingsOverlay: requireElement("settings-overlay", HTMLElement),
        settingsOpen: requireElement("settings-open", HTMLButtonElement),
    };
}
function formatSessionTime(iso) {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}
function activeSession(state) {
    const session = state.sessions.find((candidate) => candidate.id === state.activeSessionId);
    if (session !== undefined) {
        return session;
    }
    return state.sessions[0] ?? createSession();
}
function sessionHasLocation(session) {
    return session.location.label !== LOCATION_PENDING_LABEL;
}
function isUntouchedDraft(session) {
    return !sessionHasLocation(session) && session.intent.trim() === "" && session.results === null;
}
function isDemoSession(session) {
    return session.name === DEMO_SESSION_NAME && session.location.label === "Muscat, Oman";
}
function ensureDemoSession(sessions) {
    if (sessions.some(isDemoSession)) {
        return sessions;
    }
    return [...sessions, createDemoSession()];
}
function defaultSessionName(location, intent) {
    if (intent.trim()) {
        return intent.trim().slice(0, 42);
    }
    return location.label;
}
function updateSession(state, session) {
    state.sessions = upsertSession(session);
    state.activeSessionId = session.id;
}
function openDemoSession(state) {
    const existingDemo = state.sessions.find(isDemoSession);
    if (existingDemo !== undefined) {
        state.activeSessionId = existingDemo.id;
        saveSessions(state.sessions);
        return;
    }
    const demo = createDemoSession();
    state.sessions = [...state.sessions, demo];
    state.activeSessionId = demo.id;
    saveSessions(state.sessions);
}
function setActiveNav(elements, state, activeNav) {
    state.activeNav = activeNav;
    elements.navSessions.classList.toggle("sidebar__nav-item--active", activeNav === "sessions");
    elements.navConditions.classList.toggle("sidebar__nav-item--active", activeNav === "conditions");
    elements.navPreferences.classList.toggle("sidebar__nav-item--active", activeNav === "preferences");
    for (const [button, isActive] of [
        [elements.navSessions, activeNav === "sessions"],
        [elements.navConditions, activeNav === "conditions"],
        [elements.navPreferences, activeNav === "preferences"],
    ]) {
        if (isActive) {
            button.setAttribute("aria-current", "page");
        }
        else {
            button.removeAttribute("aria-current");
        }
    }
}
function createMenuButton(label, onClick) {
    const item = document.createElement("button");
    item.type = "button";
    item.textContent = label;
    item.addEventListener("click", (event) => {
        event.stopPropagation();
        onClick();
    });
    return item;
}
function renderSidebar(elements, state, renderApp) {
    elements.sessionList.textContent = "";
    const query = state.sessionQuery.trim().toLowerCase();
    const sessions = query
        ? state.sessions.filter((session) => [session.name, session.location.label, session.intent].join(" ").toLowerCase().includes(query))
        : state.sessions;
    for (const session of sessions) {
        const row = document.createElement("div");
        row.className = `session-button${session.id === state.activeSessionId ? " session-button--active" : ""}`;
        const activate = () => {
            state.activeSessionId = session.id;
            setActiveNav(elements, state, "sessions");
            elements.sidebar.classList.remove("sidebar--open");
            renderApp();
        };
        const selector = document.createElement("button");
        selector.className = "session-button__select";
        selector.type = "button";
        selector.addEventListener("click", activate);
        if (session.id === state.activeSessionId) {
            selector.setAttribute("aria-current", "true");
        }
        const text = document.createElement("span");
        text.className = "session-button__text";
        const title = document.createElement("span");
        title.className = "session-button__title";
        title.textContent = session.name;
        const meta = document.createElement("span");
        meta.className = "session-button__meta";
        const activity = session.intent.trim() || "No activity yet";
        meta.textContent = `${session.location.label} / ${activity} / ${formatSessionTime(session.createdAt)}`;
        text.append(title, meta);
        const menu = document.createElement("span");
        menu.className = "session-menu";
        const trigger = document.createElement("button");
        trigger.className = "icon-button";
        trigger.type = "button";
        trigger.textContent = "...";
        trigger.setAttribute("aria-label", `Session actions for ${session.name}`);
        const popover = document.createElement("span");
        popover.className = "menu-popover";
        popover.hidden = true;
        trigger.addEventListener("click", (event) => {
            event.stopPropagation();
            popover.hidden = !popover.hidden;
        });
        popover.append(createMenuButton("Rename", () => {
            const nextName = window.prompt("Rename scout session", session.name);
            if (nextName !== null && nextName.trim()) {
                updateSession(state, { ...session, name: nextName.trim() });
                renderApp();
            }
        }), createMenuButton("Delete", () => {
            state.sessions = deleteSession(session.id);
            if (state.sessions.length === 0) {
                const fresh = createSession();
                state.sessions = [fresh];
                saveSessions(state.sessions);
            }
            state.activeSessionId = state.sessions[0]?.id ?? createSession().id;
            renderApp();
        }), createMenuButton("Duplicate", () => {
            const duplicate = duplicateSession(session);
            state.sessions = [duplicate, ...state.sessions];
            saveSessions(state.sessions);
            state.activeSessionId = duplicate.id;
            renderApp();
        }));
        selector.appendChild(text);
        menu.append(trigger, popover);
        row.append(selector, menu);
        elements.sessionList.appendChild(row);
    }
    if (sessions.length === 0) {
        const empty = document.createElement("p");
        empty.className = "session-empty";
        empty.textContent = "No sessions match this search.";
        elements.sessionList.appendChild(empty);
    }
}
function renderActiveSession(elements, state, renderApp) {
    const session = activeSession(state);
    elements.activeTitle.textContent =
        state.activeNav === "conditions" ? "Conditions" : state.activeNav === "preferences" ? "Preferences" : session.name;
    elements.mainContent.textContent = "";
    const wrapper = document.createElement("div");
    wrapper.className = "session-main";
    elements.mainContent.appendChild(wrapper);
    if (state.activeNav === "conditions") {
        renderConditionsView(wrapper, session);
        return;
    }
    if (state.activeNav === "preferences") {
        renderPreferencesView(wrapper, state.settings);
        return;
    }
    if (!sessionHasLocation(session)) {
        renderLocationGrant(wrapper, {
            onGranted: (location) => {
                const nextLocation = {
                    lat: location.latitude,
                    lng: location.longitude,
                    label: location.label ?? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`,
                };
                updateSession(state, { ...session, location: nextLocation, name: defaultSessionName(nextLocation, session.intent) });
                renderApp();
            },
        });
        return;
    }
    renderIntentInput(wrapper, session, state.settings, {
        onSubmit: async (intent, shotType) => {
            const request = {
                latitude: session.location.lat,
                longitude: session.location.lng,
                intent,
                radius_miles: state.settings.radiusMiles,
            };
            if (shotType !== undefined) {
                request.shot_type = shotType;
            }
            const response = await fetchRecommendation(request);
            const nextSession = {
                ...session,
                intent,
                results: response,
                name: defaultSessionName(session.location, intent),
            };
            updateSession(state, nextSession);
            renderApp();
        },
        onUseDemo: () => {
            openDemoSession(state);
            setActiveNav(elements, state, "sessions");
            renderApp();
        },
    });
    if (session.results !== null) {
        renderResults(wrapper, session.results, state.settings);
    }
}
function renderConditionsView(root, session) {
    const panel = document.createElement("section");
    panel.className = "workspace-panel";
    const title = document.createElement("h1");
    title.textContent = "Condition intelligence";
    const body = document.createElement("p");
    body.textContent =
        session.results === null
            ? "Run a scout to see weather, timing, and light-condition summaries for each recommended place."
            : "Review the current condition signals Scout used to rank this session.";
    panel.append(title, body);
    if (session.results !== null) {
        const grid = document.createElement("div");
        grid.className = "insight-grid";
        for (const item of session.results.recommendations) {
            const card = document.createElement("article");
            card.className = `insight-card insight-card--${item.light_phase}`;
            const cardTitle = document.createElement("h2");
            cardTitle.textContent = item.location_name;
            const score = document.createElement("p");
            score.className = "data";
            score.textContent = `${item.score}/100`;
            const summary = document.createElement("p");
            summary.textContent = item.conditions_summary;
            card.append(cardTitle, score, summary);
            grid.appendChild(card);
        }
        panel.appendChild(grid);
    }
    root.appendChild(panel);
}
function renderPreferencesView(root, settings) {
    const panel = document.createElement("section");
    panel.className = "workspace-panel";
    const title = document.createElement("h1");
    title.textContent = "Preferences";
    const body = document.createElement("p");
    body.textContent = "Use the settings drawer from the bottom-left Scout profile to adjust defaults.";
    const grid = document.createElement("div");
    grid.className = "insight-grid";
    const rows = [
        ["Units", settings.units],
        ["Radius", `${settings.radiusMiles} mi`],
        ["Time", settings.timeFormat],
        ["Theme", settings.theme],
        ["Activities", settings.activityTypes.join(", ") || "none"],
    ];
    for (const [label, value] of rows) {
        const card = document.createElement("article");
        card.className = "insight-card";
        const cardTitle = document.createElement("h2");
        cardTitle.textContent = label;
        const cardValue = document.createElement("p");
        cardValue.className = "data";
        cardValue.textContent = value;
        card.append(cardTitle, cardValue);
        grid.appendChild(card);
    }
    panel.append(title, body, grid);
    root.appendChild(panel);
}
function sharedSessionFromResponse(response) {
    const name = response.intent.trim() ? `Shared: ${response.intent.trim().slice(0, 36)}` : "Shared scout";
    return {
        id: crypto.randomUUID(),
        createdAt: response.generated_at,
        location: { lat: response.latitude, lng: response.longitude, label: "Shared location" },
        intent: response.intent,
        results: response,
        name,
    };
}
function main() {
    const elements = getElements();
    const sharedResponse = readSharedRecommendationFromUrl();
    const sessions = loadSessions();
    const firstSession = sessions[0] ?? createSession();
    const sessionsWithShare = sharedResponse === null
        ? sessions.length === 0
            ? [firstSession]
            : sessions
        : [sharedSessionFromResponse(sharedResponse), ...sessions];
    const initialSessions = ensureDemoSession(sessionsWithShare);
    if (sharedResponse !== null || sessions.length === 0 || initialSessions.length !== sessions.length) {
        saveSessions(initialSessions);
    }
    if (sharedResponse !== null) {
        clearShareParamFromUrl();
    }
    const state = {
        sessions: initialSessions,
        activeSessionId: sharedResponse === null ? firstSession.id : initialSessions[0]?.id ?? firstSession.id,
        settings: loadSettings(),
        activeNav: "sessions",
        sessionQuery: "",
    };
    const renderApp = () => {
        setActiveNav(elements, state, state.activeNav);
        renderSidebar(elements, state, renderApp);
        renderActiveSession(elements, state, renderApp);
    };
    elements.newSession.addEventListener("click", () => {
        const existingDraft = state.sessions.find(isUntouchedDraft);
        if (existingDraft !== undefined) {
            state.activeSessionId = existingDraft.id;
            setActiveNav(elements, state, "sessions");
            elements.sidebar.classList.remove("sidebar--open");
            renderApp();
            return;
        }
        const session = createSession();
        state.sessions = [session, ...state.sessions];
        state.activeSessionId = session.id;
        setActiveNav(elements, state, "sessions");
        saveSessions(state.sessions);
        renderApp();
    });
    elements.navSessions.addEventListener("click", () => {
        setActiveNav(elements, state, "sessions");
        renderApp();
    });
    elements.navConditions.addEventListener("click", () => {
        setActiveNav(elements, state, "conditions");
        renderApp();
    });
    elements.navPreferences.addEventListener("click", () => {
        setActiveNav(elements, state, "preferences");
        elements.settingsOpen.click();
        renderApp();
    });
    elements.sidebarToggle.addEventListener("click", () => {
        elements.sidebar.classList.toggle("sidebar--open");
    });
    elements.sessionSearch.addEventListener("input", () => {
        state.sessionQuery = elements.sessionSearch.value;
        renderSidebar(elements, state, renderApp);
    });
    initSettingsPanel({
        panel: elements.settingsPanel,
        overlay: elements.settingsOverlay,
        openButton: elements.settingsOpen,
        settings: state.settings,
        onChange: (settings) => {
            state.settings = settings;
            saveSettings(settings);
            applySettings(settings);
            renderApp();
        },
    });
    renderApp();
}
main();
