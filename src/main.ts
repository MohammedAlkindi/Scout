import { fetchRecommendation } from "./api.js";
import { applySettings, initSettingsPanel } from "./settings.js";
import {
  createSession,
  deleteSession,
  duplicateSession,
  loadSessions,
  loadSettings,
  saveSettings,
  saveSessions,
  upsertSession,
} from "./storage.js";
import type { RecommendationRequest, RecommendationResponse, Session, Settings, SessionLocation } from "./types.js";
import { renderIntentInput } from "./views/intentInput.js";
import { renderLocationGrant } from "./views/locationGrant.js";
import { renderResults } from "./views/results.js";

const LOCATION_PENDING_LABEL = "Location pending";

interface AppElements {
  sidebar: HTMLElement;
  sidebarToggle: HTMLButtonElement;
  sessionList: HTMLElement;
  newSession: HTMLButtonElement;
  mainContent: HTMLElement;
  activeTitle: HTMLElement;
  settingsPanel: HTMLElement;
  settingsOverlay: HTMLElement;
  settingsOpen: HTMLButtonElement;
}

interface AppState {
  sessions: Session[];
  activeSessionId: string;
  settings: Settings;
}

function requireElement<T extends HTMLElement>(id: string, constructor: { new (): T }): T {
  const element = document.getElementById(id);
  if (!(element instanceof constructor)) {
    throw new Error(`Missing #${id}`);
  }
  return element;
}

function getElements(): AppElements {
  return {
    sidebar: requireElement("sidebar", HTMLElement),
    sidebarToggle: requireElement("sidebar-toggle", HTMLButtonElement),
    sessionList: requireElement("session-list", HTMLElement),
    newSession: requireElement("new-session", HTMLButtonElement),
    mainContent: requireElement("main-content", HTMLElement),
    activeTitle: requireElement("active-session-title", HTMLElement),
    settingsPanel: requireElement("settings-panel", HTMLElement),
    settingsOverlay: requireElement("settings-overlay", HTMLElement),
    settingsOpen: requireElement("settings-open", HTMLButtonElement),
  };
}

function formatSessionTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(
    new Date(iso),
  );
}

function activeSession(state: AppState): Session {
  const session = state.sessions.find((candidate) => candidate.id === state.activeSessionId);
  if (session !== undefined) {
    return session;
  }
  return state.sessions[0] ?? createSession();
}

function sessionHasLocation(session: Session): boolean {
  return session.location.label !== LOCATION_PENDING_LABEL;
}

function defaultSessionName(location: SessionLocation, intent: string): string {
  if (intent.trim()) {
    return intent.trim().slice(0, 42);
  }
  return location.label;
}

function updateSession(state: AppState, session: Session): void {
  state.sessions = upsertSession(session);
  state.activeSessionId = session.id;
}

function createMenuButton(label: string, onClick: () => void): HTMLButtonElement {
  const item = document.createElement("button");
  item.type = "button";
  item.textContent = label;
  item.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
  return item;
}

function renderSidebar(elements: AppElements, state: AppState, renderApp: () => void): void {
  elements.sessionList.textContent = "";

  for (const session of state.sessions) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = `session-button${session.id === state.activeSessionId ? " session-button--active" : ""}`;
    row.addEventListener("click", () => {
      state.activeSessionId = session.id;
      elements.sidebar.classList.remove("sidebar--open");
      renderApp();
    });

    const text = document.createElement("span");
    text.className = "session-button__text";
    const title = document.createElement("span");
    title.className = "session-button__title";
    title.textContent = session.name;
    const meta = document.createElement("span");
    meta.className = "session-button__meta";
    const intent = session.intent.trim() || "No intent yet";
    meta.textContent = `${session.location.label} / ${intent} / ${formatSessionTime(session.createdAt)}`;
    text.append(title, meta);

    const menu = document.createElement("span");
    menu.className = "session-menu";
    const trigger = document.createElement("span");
    trigger.className = "icon-button";
    trigger.textContent = "...";
    trigger.setAttribute("role", "button");
    trigger.setAttribute("tabindex", "0");
    const popover = document.createElement("span");
    popover.className = "menu-popover";
    popover.hidden = true;

    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      popover.hidden = !popover.hidden;
    });

    popover.append(
      createMenuButton("Rename", () => {
        const nextName = window.prompt("Rename scout session", session.name);
        if (nextName !== null && nextName.trim()) {
          updateSession(state, { ...session, name: nextName.trim() });
          renderApp();
        }
      }),
      createMenuButton("Delete", () => {
        state.sessions = deleteSession(session.id);
        if (state.sessions.length === 0) {
          const fresh = createSession();
          state.sessions = [fresh];
          saveSessions(state.sessions);
        }
        state.activeSessionId = state.sessions[0]?.id ?? createSession().id;
        renderApp();
      }),
      createMenuButton("Duplicate", () => {
        const duplicate = duplicateSession(session);
        state.sessions = [duplicate, ...state.sessions];
        saveSessions(state.sessions);
        state.activeSessionId = duplicate.id;
        renderApp();
      }),
    );

    menu.append(trigger, popover);
    row.append(text, menu);
    elements.sessionList.appendChild(row);
  }
}

function renderActiveSession(elements: AppElements, state: AppState, renderApp: () => void): void {
  const session = activeSession(state);
  elements.activeTitle.textContent = session.name;
  elements.mainContent.textContent = "";

  const wrapper = document.createElement("div");
  wrapper.className = "session-main";
  elements.mainContent.appendChild(wrapper);

  if (!sessionHasLocation(session)) {
    renderLocationGrant(wrapper, {
      onGranted: (location) => {
        const nextLocation = {
          lat: location.latitude,
          lng: location.longitude,
          label: `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`,
        };
        updateSession(state, { ...session, location: nextLocation, name: defaultSessionName(nextLocation, session.intent) });
        renderApp();
      },
    });
    return;
  }

  renderIntentInput(wrapper, session, state.settings, {
    onSubmit: async (intent, shotType) => {
      const request: RecommendationRequest = {
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
  });

  if (session.results === null) {
    const empty = document.createElement("section");
    empty.className = "empty-state";
    const title = document.createElement("h1");
    title.textContent = "Describe what you want to shoot or do.";
    const body = document.createElement("p");
    body.textContent = "Scout will find the right place and time.";
    empty.append(title, body);
    wrapper.appendChild(empty);
  } else {
    renderResults(wrapper, session.results, state.settings);
  }
}

function main(): void {
  const elements = getElements();
  const sessions = loadSessions();
  const firstSession = sessions[0] ?? createSession();
  if (sessions.length === 0) {
    saveSessions([firstSession]);
  }

  const state: AppState = {
    sessions: sessions.length === 0 ? [firstSession] : sessions,
    activeSessionId: firstSession.id,
    settings: loadSettings(),
  };

  const renderApp = (): void => {
    renderSidebar(elements, state, renderApp);
    renderActiveSession(elements, state, renderApp);
  };

  elements.newSession.addEventListener("click", () => {
    const session = createSession();
    state.sessions = [session, ...state.sessions];
    state.activeSessionId = session.id;
    saveSessions(state.sessions);
    renderApp();
  });

  elements.sidebarToggle.addEventListener("click", () => {
    elements.sidebar.classList.toggle("sidebar--open");
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
