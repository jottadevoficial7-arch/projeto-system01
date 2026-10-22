import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

async function state(page: Page) {
  const response = await page.request.get("/api/system");
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function openSystem(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: /Visão geral/ }),
  ).toBeVisible();
}

async function register(page: Page) {
  const email = `e2e-${randomUUID()}@example.test`;
  const password = "Jornada-segura-2026";
  await page
    .locator(".demo-banner")
    .getByRole("button", { name: "Criar meu sistema" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Como podemos chamar você?").fill("Pessoa de teste");
  await dialog.getByLabel("E-mail", { exact: true }).fill(email);
  await dialog.getByLabel("Senha", { exact: true }).fill(password);
  await dialog.getByRole("button", { name: "Iniciar minha jornada" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".demo-banner")).toHaveCount(0);
  const snapshot = await state(page);
  expect(snapshot.user.isDemo).toBe(false);
  expect(snapshot.user.name).toBe("Pessoa de teste");
  expect(snapshot.progress.totalXp).toBe(0);
  expect(snapshot.history).toHaveLength(0);
  return { email, password, id: snapshot.user.id };
}

async function navigate(page: Page, label: string) {
  const mobile = (page.viewportSize()?.width ?? 1440) < 761;
  const navigation = page.getByRole("navigation", {
    name: mobile ? "Navegação rápida" : "Navegação principal",
    exact: true,
  });
  await navigation
    .getByRole("button", { name: new RegExp(`^${label}`) })
    .click();
}

async function settings(page: Page) {
  if ((page.viewportSize()?.width ?? 1440) < 761)
    await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Preferências", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: /Preferências/ }),
  ).toBeVisible();
}

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
}

test("demonstração identificada, navegação e calendário responsivos", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openSystem(page);
  await expect(page.locator(".demo-banner")).toContainText("Modo demonstração");
  expect((await state(page)).user.isDemo).toBe(true);
  await noOverflow(page);
  await navigate(page, "Missões");
  await expect(
    page.getByRole("heading", { level: 1, name: /^Missões/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Nova missão", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await navigate(page, "Calendário");
  const initialMonth = (await page
    .locator(".calendar-panel h2")
    .textContent())!;
  await page.getByRole("button", { name: "Próximo mês", exact: true }).click();
  await expect(page.locator(".calendar-panel h2")).not.toHaveText(initialMonth);
  await page.getByRole("button", { name: "Hoje", exact: true }).click();
  await expect(page.locator(".calendar-panel h2")).toHaveText(initialMonth);
  await noOverflow(page);
  await navigate(page, "Conquistas");
  await expect(page.locator(".achievement-card")).toHaveCount(6);
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test("conta pessoal, CRUD, XP persistente, exportação e novo login", async ({
  page,
}) => {
  await openSystem(page);
  const account = await register(page);
  await navigate(page, "Missões");
  await page
    .getByRole("button", { name: "Nova missão", exact: true })
    .first()
    .click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("O que você quer realizar?")
    .fill("Leitura da jornada de teste");
  await dialog
    .getByLabel(/Uma orientação para você/)
    .fill("Ler vinte minutos com atenção.");
  await dialog
    .getByRole("combobox", { name: "Área de evolução", exact: true })
    .selectOption("knowledge");
  await dialog
    .getByRole("combobox", { name: "Frequência", exact: true })
    .selectOption("daily");
  await dialog.getByLabel("Duração (minutos)").fill("20");
  await dialog.getByLabel("Horário planejado").fill("12:30");
  await dialog.getByRole("radio", { name: /Moderada/ }).check();
  await dialog.getByRole("button", { name: "Ativar missão" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "Leitura da jornada de teste",
      exact: true,
    }),
  ).toBeVisible();

  await page
    .getByRole("button", {
      name: "Editar Leitura da jornada de teste",
      exact: true,
    })
    .click();
  dialog = page.getByRole("dialog");
  const title = "Leitura da jornada revisada";
  await dialog.getByLabel("O que você quer realizar?").fill(title);
  await dialog.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: `Concluir ${title}`, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: `${title} concluída`, exact: true }),
  ).toBeDisabled();
  let snapshot = await state(page);
  expect(snapshot.progress.totalXp).toBe(20);
  expect(snapshot.progress.todayXp).toBe(20);
  expect(
    snapshot.history.filter(
      (event: { title: string }) => event.title === title,
    ),
  ).toHaveLength(1);

  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: /Visão geral/ }),
  ).toBeVisible();
  snapshot = await state(page);
  expect(snapshot.user.id).toBe(account.id);
  expect(snapshot.progress.totalXp).toBe(20);
  await navigate(page, "Missões");
  await expect(
    page.getByRole("button", { name: `${title} concluída`, exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: `Editar ${title}`, exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Arquivar missão", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Arquivar missão", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toHaveCount(0);
  expect((await state(page)).progress.totalXp).toBe(20);

  await settings(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Exportar meus dados (JSON)" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  const exported = await page.request.get("/api/export");
  const exportedBody = await exported.json();
  expect(exportedBody.user.id).toBe(account.id);
  expect(exportedBody.progress.totalXp).toBe(20);
  expect(JSON.stringify(exportedBody)).not.toContain("password_hash");

  await page
    .getByRole("button", { name: "Sair da conta", exact: true })
    .click();
  await expect(page.locator(".demo-banner")).toBeVisible();
  await page
    .locator(".demo-banner")
    .getByRole("button", { name: "Criar meu sistema" })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Entrar na minha conta" }).click();
  await dialog.getByLabel("E-mail", { exact: true }).fill(account.email);
  await dialog.getByLabel("Senha", { exact: true }).fill(account.password);
  await dialog
    .getByRole("button", { name: "Entrar no sistema", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  snapshot = await state(page);
  expect(snapshot.user.id).toBe(account.id);
  expect(snapshot.progress.totalXp).toBe(20);
  expect(
    snapshot.missions.some(
      (mission: { title: string }) => mission.title === title,
    ),
  ).toBe(false);
});

test("descanso protege atividades, perfil persiste e animações podem ser reduzidas", async ({
  page,
}) => {
  await openSystem(page);
  await register(page);
  await navigate(page, "Missões");
  await page
    .getByRole("button", { name: "Planejar descanso hoje", exact: true })
    .click();
  await expect(page.locator(".rest-notice")).toContainText(
    "Sua sequência está protegida",
  );
  await expect(
    page.getByRole("button", { name: /^Concluir / }).first(),
  ).toBeDisabled();
  expect((await state(page)).restToday).toBe(true);
  await page
    .getByRole("button", { name: "Retomar atividades", exact: true })
    .click();
  await expect(page.locator(".rest-notice")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /^Concluir / }).first(),
  ).toBeEnabled();
  await settings(page);
  await page
    .getByLabel("Nome ou apelido", { exact: true })
    .fill("Jornada tranquila");
  await page
    .getByLabel("Seu objetivo principal", { exact: true })
    .fill("Criar constância na leitura");
  await page.getByLabel("Tempo disponível por dia (minutos)").fill("25");
  await page.getByRole("button", { name: "Equilíbrio", exact: true }).click();
  await page
    .getByRole("button", { name: "Salvar meu perfil", exact: true })
    .click();
  await expect
    .poll(async () => (await state(page)).user.name)
    .toBe("Jornada tranquila");
  const profile = (await state(page)).user;
  expect(profile.goal).toBe("Criar constância na leitura");
  expect(profile.dailyMinutes).toBe(25);
  expect(profile.avatar).toBe("moon");
  await page.getByRole("checkbox", { name: /Reduzir animações/ }).check();
  await expect(page.locator("html")).toHaveAttribute(
    "data-reduced-motion",
    "true",
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: /Visão geral/ }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute(
    "data-reduced-motion",
    "true",
  );
  expect((await state(page)).user.name).toBe("Jornada tranquila");
});

test("demonstrações de navegadores diferentes têm dados isolados", async ({
  page,
  browser,
  baseURL,
}) => {
  await openSystem(page);
  const first = await state(page);
  const secondContext = await browser.newContext({ baseURL });
  try {
    const response = await secondContext.request.get("/api/system");
    expect(response.ok()).toBeTruthy();
    const second = await response.json();
    expect(first.user.isDemo).toBe(true);
    expect(second.user.isDemo).toBe(true);
    expect(second.user.id).not.toBe(first.user.id);
    expect(second.missions[0].id).not.toBe(first.missions[0].id);
  } finally {
    await secondContext.close();
  }
});
