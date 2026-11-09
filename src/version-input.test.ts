// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import type { BibleProvider, BibleVersion } from "./providers";
import { defineVersionInput } from "./version-input";

// jsdom does not implement form-associated internals. Real-browser checks cover forms.
HTMLElement.prototype.attachInternals = () => ({ labels: [], setFormValue() {}, setValidity() {} }) as unknown as ElementInternals;
defineVersionInput();
afterEach(() => { document.body.replaceChildren(); defineVersionInput({ provider: "helloao", bibleVersionId: undefined }); });

const versions: BibleVersion[] = [
  { id: "ENGWEBP", title: "World English Bible", abbreviation: "WEB", language: "en", languageName: "English" },
  { id: "BSB", title: "Berean Standard Bible", abbreviation: "BSB", language: "en", languageName: "English" },
  { id: "spa_rv", title: "Reina Valera", abbreviation: "RV", language: "es", languageName: "Spanish" },
];
const provider = (listVersions: () => Promise<BibleVersion[]>): BibleProvider => ({
  id: "custom", defaultVersionId: "BSB", listVersions, async getPassage() { throw new Error("Unused"); },
});
function nextEvent(element: HTMLElement, name = "scripture-versions-load"): Promise<CustomEvent> {
  return new Promise((resolve) => element.addEventListener(name, (event) => resolve(event as CustomEvent), { once: true }));
}

it("resets to the configured page version while keeping same-ID providers isolated", async () => {
  defineVersionInput({ provider: provider(async () => versions), bibleVersionId: "ENGWEBP" });
  const picker = document.createElement("si-version-input");
  let loaded = nextEvent(picker);
  document.body.append(picker);
  await loaded;
  expect(picker.value).toBe("ENGWEBP");
  picker.value = "BSB";
  picker.formResetCallback();
  expect(picker.value).toBe("ENGWEBP");

  const isolated = document.createElement("si-version-input");
  isolated.bibleProvider = provider(async () => versions.filter((version) => version.id === "BSB"));
  loaded = nextEvent(isolated);
  document.body.append(isolated);
  await loaded;
  expect(isolated.value).toBe("BSB");
  expect(isolated.shadowRoot!.querySelector("input")!.getAttribute("aria-invalid")).toBe("false");
  isolated.setAttribute("value", "BSB");
  isolated.value = "";
  isolated.formResetCallback();
  expect(isolated.value).toBe("BSB");

  picker.setAttribute("value", "spa_rv");
  picker.value = "BSB";
  picker.formResetCallback();
  expect(picker.value).toBe("spa_rv");
});

it("filters names and languages, committing only a picked translation with provider-scoped metadata", async () => {
  const picker = document.createElement("si-version-input");
  picker.bibleProvider = provider(async () => versions);
  const loaded = nextEvent(picker);
  document.body.append(picker);
  await loaded;
  const input = picker.shadowRoot!.querySelector("input")!;
  const language = picker.shadowRoot!.querySelector("select")!;
  expect(picker.value).toBe("BSB");
  expect(language.value).toBe("en");
  input.focus();
  expect(picker.shadowRoot!.querySelectorAll("[role=option]")).toHaveLength(2);
  input.value = "web";
  input.dispatchEvent(new Event("input"));
  expect(picker.value).toBe("BSB");
  expect(picker.shadowRoot!.querySelector("[role=option]")?.textContent).toBe("World English Bible (WEB)");
  let changed = nextEvent(picker, "change");
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  expect((await changed).detail).toMatchObject({ provider: "custom", bibleVersionId: "ENGWEBP", bibleVersion: { title: "World English Bible" } });
  expect(picker.value).toBe("ENGWEBP");
  language.value = "es";
  language.dispatchEvent(new Event("change"));
  expect(picker.value).toBe("ENGWEBP");
  expect(picker.shadowRoot!.querySelectorAll("[role=option]")).toHaveLength(1);
  changed = nextEvent(picker, "change");
  picker.shadowRoot!.querySelector<HTMLElement>("[role=option]")!.click();
  expect((await changed).detail.bibleVersionId).toBe("spa_rv");
  input.value = "not a translation";
  input.dispatchEvent(new Event("input"));
  expect(picker.shadowRoot!.querySelector("[role=status]")!.textContent).toContain("No matching translations");
  input.dispatchEvent(new Event("blur"));
  expect(input.value).toBe("Reina Valera (RV)");
  expect(picker.value).toBe("spa_rv");
});

it("ignores stale catalogs and never guesses an equivalent ID after switching providers", async () => {
  let finish!: (versions: BibleVersion[]) => void;
  const picker = document.createElement("si-version-input");
  picker.value = "BSB";
  picker.bibleProvider = provider(() => new Promise((resolve) => { finish = resolve; }));
  document.body.append(picker);
  await Promise.resolve();
  const loaded = nextEvent(picker);
  picker.bibleProvider = provider(async () => [{ id: "3034", abbreviation: "BSB", title: "Berean Standard Bible" }]);
  await loaded;
  finish(versions);
  await new Promise((resolve) => setTimeout(resolve));
  expect(picker.value).toBe("");
  expect(picker.shadowRoot!.querySelector("input")!.getAttribute("aria-invalid")).toBe("true");
  picker.value = "3034";
  expect(picker.value).toBe("3034");
  expect(picker.shadowRoot!.querySelector("input")!.getAttribute("aria-invalid")).toBe("false");
});

it("retries a failed catalog and applies value updates made while loading", async () => {
  let attempts = 0;
  const picker = document.createElement("si-version-input");
  picker.bibleProvider = provider(async () => { if (++attempts === 1) throw new Error("Offline"); return versions; });
  const failed = nextEvent(picker, "scripture-error");
  document.body.append(picker);
  await failed;
  const retry = picker.shadowRoot!.querySelector("button")!;
  expect(retry.hidden).toBe(false);
  picker.toggleAttribute("disabled", true);
  picker.toggleAttribute("disabled", false);
  expect(picker.shadowRoot!.querySelector("input")!.disabled).toBe(true);
  const loaded = nextEvent(picker);
  retry.click();
  await Promise.resolve();
  picker.value = "spa_rv";
  await loaded;
  expect(picker.value).toBe("spa_rv");
  expect(retry.hidden).toBe(true);
  expect(picker.shadowRoot!.querySelector("input")!.disabled).toBe(false);
});
