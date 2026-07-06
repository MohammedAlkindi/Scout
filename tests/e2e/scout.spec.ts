import { expect, test } from "@playwright/test";

const recommendationFixture = {
  latitude: 23.5791,
  longitude: 58.4026,
  intent: "romantic coastal portraits",
  shot_type: "portrait",
  generated_at: "2026-07-05T12:00:00Z",
  recommendations: [
    {
      rank: 1,
      location_name: "Azaiba Beach Park",
      latitude: 23.6019,
      longitude: 58.3912,
      distance_miles: 3.7,
      terrain_type: "urban park",
      best_window: {
        start_utc: "2026-07-05T14:25:00Z",
        end_utc: "2026-07-05T14:58:00Z",
      },
      light_phase: "golden_hour",
      score: 96,
      score_breakdown: {
        light: 100,
        weather: 92,
        crowd: 100,
        access: 88,
      },
      confidence: "medium",
      reason_tags: ["Golden-hour timing", "Low wind", "Close to origin", "No permit flag"],
      caveats: ["Crowd and access signals are inferred from public map tags; verify locally."],
      conditions_summary: "Soft coastal light, 6 mph wind, and clear visibility.",
      advice: "Azaiba Beach Park: falls within golden hour; soft weather suits portrait work.",
      permit_required: false,
      permit_notes: null,
      image_url: null,
      image_attribution: null,
    },
    {
      rank: 2,
      location_name: "Qurum Natural Park",
      latitude: 23.6146,
      longitude: 58.4892,
      distance_miles: 5.9,
      terrain_type: "urban park",
      best_window: {
        start_utc: "2026-07-05T14:25:00Z",
        end_utc: "2026-07-05T14:58:00Z",
      },
      light_phase: "golden_hour",
      score: 89,
      score_breakdown: {
        light: 100,
        weather: 86,
        crowd: 60,
        access: 88,
      },
      confidence: "medium",
      reason_tags: ["Golden-hour timing", "Clear visibility", "Low access friction"],
      caveats: ["Crowd and access signals are inferred from public map tags; verify locally."],
      conditions_summary: "Warm light, accessible terrain, and moderate crowd risk.",
      advice: "Qurum Natural Park: a strong backup if the coast is busy.",
      permit_required: false,
      permit_notes: null,
      image_url: null,
      image_attribution: null,
    },
  ],
};

test("does not create duplicate untouched sessions from repeated New Scout clicks", async ({ page }) => {
  await page.goto("/");

  const sessionRows = page.locator(".session-button");
  const newScoutButton = page.locator("#new-session");
  await expect(sessionRows).toHaveCount(2);

  await newScoutButton.click();
  await newScoutButton.click();
  await newScoutButton.click();

  await expect(sessionRows).toHaveCount(2);
  await expect(page.getByText("Location pending / No activity yet")).toBeVisible();
});

test("sets a manual location and renders map-first recommendations", async ({ page }) => {
  await page.route("**/api/recommendation", async (route) => {
    expect(route.request().method()).toBe("POST");
    const requestBody = route.request().postDataJSON() as { intent?: unknown; shot_type?: unknown };
    expect(requestBody.intent).toBe("quiet portrait location with soft light shade and easy access");
    expect(requestBody.shot_type).toBe("portrait");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(recommendationFixture),
    });
  });

  await page.goto("/");
  await page.getByPlaceholder("37.7749").fill("23.5791");
  await page.getByPlaceholder("-122.4194").fill("58.4026");
  await page.getByRole("button", { name: "Use coordinates" }).click();

  await expect(page.getByRole("heading", { name: "Choose the kind of scout you need." })).toBeVisible();
  await page.getByPlaceholder("Search activities").fill("portrait");
  await page.locator(".composer").getByRole("button", { name: /Quiet portrait/ }).click();
  await page.locator(".composer").getByRole("button", { name: "Scout", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Recommended scouting route" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Azaiba Beach Park, rank 1" })).toBeVisible();
  await expect(page.locator("#recommendation-1").getByRole("heading", { name: "Azaiba Beach Park" })).toBeVisible();
  await expect(page.locator("#recommendation-1").getByText("Golden-hour timing")).toBeVisible();
  await expect(page.locator("#recommendation-1").getByText("Live weather")).toBeVisible();
  await expect(page.locator("#recommendation-1").getByText("Image fallback")).toBeVisible();
  await expect(page.locator("#recommendation-1").getByRole("button", { name: "Copy report" })).toBeVisible();
  await expect(page.locator("#recommendation-1").getByText("What to verify")).toBeVisible();
});

test("shows recovery actions when live scout fails", async ({ page }) => {
  await page.route("**/api/recommendation", async (route) => {
    await route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Location search is temporarily unavailable. Try a more specific activity or smaller search radius.",
        code: "upstream_unavailable",
        retryable: true,
        recovery_hint: "Retry once, or use the bundled Muscat demo scout for a guaranteed product walkthrough.",
      }),
    });
  });

  await page.goto("/");
  await page.getByPlaceholder("37.7749").fill("23.5791");
  await page.getByPlaceholder("-122.4194").fill("58.4026");
  await page.getByRole("button", { name: "Use coordinates" }).click();

  await page.getByPlaceholder("Search activities").fill("portrait");
  await page.locator(".composer").getByRole("button", { name: /Quiet portrait/ }).click();
  await page.locator(".composer").getByRole("button", { name: "Scout", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Scout could not complete the live search." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry live scout" })).toBeVisible();
  await page.getByRole("button", { name: "Open Muscat demo" }).click();

  await expect(page.getByRole("heading", { name: "Recommended scouting route" })).toBeVisible();
  await expect(page.locator("#recommendation-1").getByRole("heading", { name: "Azaiba Beach Park" })).toBeVisible();
  await expect(page.locator(".source-notice").getByText("Demo fallback", { exact: true })).toBeVisible();
});

test("persists settings changes and applies them to recommendation units and time format", async ({ page }) => {
  await page.route("**/api/recommendation", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(recommendationFixture),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Open settings" }).click();
  const settingsPanel = page.locator("#settings-panel");
  await expect(settingsPanel.getByRole("heading", { name: "Settings" })).toBeVisible();

  await settingsPanel.getByRole("button", { name: "metric" }).click();
  await settingsPanel.getByRole("button", { name: "24h" }).click();
  await settingsPanel.getByRole("button", { name: "dark" }).click();
  await settingsPanel.getByRole("button", { name: "Close settings" }).click();

  await page.getByRole("button", { name: "Preferences" }).click();
  await expect(page.locator(".insight-card").filter({ hasText: "Units" }).getByText("metric")).toBeVisible();
  await expect(page.locator(".insight-card").filter({ hasText: "Time" }).getByText("24h")).toBeVisible();
  await expect(page.locator(".insight-card").filter({ hasText: "Theme" }).getByText("dark")).toBeVisible();

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByPlaceholder("37.7749").fill("23.5791");
  await page.getByPlaceholder("-122.4194").fill("58.4026");
  await page.getByRole("button", { name: "Use coordinates" }).click();

  await page.getByPlaceholder("Search activities").fill("portrait");
  await page.locator(".composer").getByRole("button", { name: /Quiet portrait/ }).click();
  await page.locator(".composer").getByRole("button", { name: "Scout", exact: true }).click();

  await expect(page.locator(".route-list").getByText("6.0 km")).toBeVisible();
  await expect(page.locator("#recommendation-1")).toContainText(/\d{2}:\d{2} - \d{2}:\d{2}/);
  await expect(page.locator("#recommendation-1")).not.toContainText(/AM|PM/);
});

test("renders a useful empty state when the API returns no recommendations", async ({ page }) => {
  await page.route("**/api/recommendation", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...recommendationFixture,
        recommendations: [],
      }),
    });
  });

  await page.goto("/");
  await page.getByPlaceholder("37.7749").fill("23.5791");
  await page.getByPlaceholder("-122.4194").fill("58.4026");
  await page.getByRole("button", { name: "Use coordinates" }).click();

  await page.getByPlaceholder("Search activities").fill("portrait");
  await page.locator(".composer").getByRole("button", { name: /Quiet portrait/ }).click();
  await page.locator(".composer").getByRole("button", { name: "Scout", exact: true }).click();

  await expect(page.getByRole("heading", { name: "No recommendations found" })).toBeVisible();
  await expect(page.getByText("Try a wider radius or a different activity.")).toBeVisible();
});

test("keeps the main scouting flow usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/recommendation", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(recommendationFixture),
    });
  });

  await page.goto("/");
  await page.getByPlaceholder("37.7749").fill("23.5791");
  await page.getByPlaceholder("-122.4194").fill("58.4026");
  await page.getByRole("button", { name: "Use coordinates" }).click();

  await page.getByPlaceholder("Search activities").fill("portrait");
  await page.locator(".composer").getByRole("button", { name: /Quiet portrait/ }).click();
  await page.locator(".composer").getByRole("button", { name: "Scout", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Recommended scouting route" })).toBeVisible();
  await expect(page.locator("#recommendation-1").getByRole("button", { name: "Copy report" })).toBeVisible();
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasHorizontalOverflow).toBe(false);
});
