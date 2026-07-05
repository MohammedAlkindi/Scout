const ACTIVITY_TYPES = ["landscape", "street", "wildlife", "hiking", "cycling", "other"];
function applyTheme(theme) {
    if (theme === "system") {
        document.documentElement.removeAttribute("data-theme");
        return;
    }
    document.documentElement.dataset.theme = theme;
}
function setOpen(panel, overlay, isOpen) {
    panel.classList.toggle("settings-panel--open", isOpen);
    overlay.classList.toggle("settings-overlay--open", isOpen);
    panel.setAttribute("aria-hidden", String(!isOpen));
}
function button(label, className) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = className;
    element.textContent = label;
    return element;
}
function renderSegmented(values, active, className, onSelect) {
    const row = document.createElement("div");
    row.className = className;
    for (const value of values) {
        const segment = button(value, "segment");
        segment.setAttribute("aria-pressed", String(value === active));
        segment.addEventListener("click", () => onSelect(value));
        row.appendChild(segment);
    }
    return row;
}
function section(title) {
    const wrapper = document.createElement("section");
    wrapper.className = "settings-section";
    const heading = document.createElement("h2");
    heading.className = "label";
    heading.textContent = title;
    wrapper.appendChild(heading);
    return wrapper;
}
export function applySettings(settings) {
    applyTheme(settings.theme);
}
export function initSettingsPanel(options) {
    let current = options.settings;
    function update(next) {
        current = next;
        applySettings(current);
        options.onChange(current);
        render(current);
    }
    function render(settings) {
        options.panel.textContent = "";
        const header = document.createElement("div");
        header.className = "settings-panel__header";
        const title = document.createElement("h1");
        title.textContent = "Settings";
        const close = button("x", "icon-button");
        close.setAttribute("aria-label", "Close settings");
        close.addEventListener("click", () => setOpen(options.panel, options.overlay, false));
        header.append(title, close);
        const units = section("Units");
        units.appendChild(renderSegmented(["metric", "imperial"], settings.units, "segmented", (unitsValue) => {
            update({ ...current, units: unitsValue });
        }));
        const radius = section("Default search radius");
        const radiusRow = document.createElement("div");
        radiusRow.className = "range-row";
        const range = document.createElement("input");
        range.type = "range";
        range.min = "1";
        range.max = "50";
        range.value = String(settings.radiusMiles);
        const radiusValue = document.createElement("span");
        radiusValue.className = "data";
        radiusValue.textContent = `${settings.radiusMiles} mi`;
        range.addEventListener("input", () => {
            const radiusMiles = Number(range.value);
            update({ ...current, radiusMiles });
        });
        radiusRow.append(range, radiusValue);
        radius.appendChild(radiusRow);
        const activities = section("Preferred activity types");
        const chips = document.createElement("div");
        chips.className = "chip-grid";
        for (const activity of ACTIVITY_TYPES) {
            const chip = button(activity, "chip");
            chip.setAttribute("aria-pressed", String(settings.activityTypes.includes(activity)));
            chip.addEventListener("click", () => {
                const hasActivity = current.activityTypes.includes(activity);
                const activityTypes = hasActivity
                    ? current.activityTypes.filter((candidate) => candidate !== activity)
                    : [...current.activityTypes, activity];
                update({ ...current, activityTypes });
            });
            chips.appendChild(chip);
        }
        activities.appendChild(chips);
        const time = section("Time format");
        time.appendChild(renderSegmented(["12h", "24h"], settings.timeFormat, "segmented", (timeFormat) => {
            update({ ...current, timeFormat });
        }));
        const theme = section("Theme");
        theme.appendChild(renderSegmented(["system", "dark", "light"], settings.theme, "segmented segmented--three", (themeValue) => {
            update({ ...current, theme: themeValue });
        }));
        options.panel.append(header, units, radius, activities, time, theme);
    }
    options.openButton.addEventListener("click", () => setOpen(options.panel, options.overlay, true));
    options.overlay.addEventListener("click", () => setOpen(options.panel, options.overlay, false));
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            setOpen(options.panel, options.overlay, false);
        }
    });
    applySettings(current);
    render(current);
    return { render };
}
