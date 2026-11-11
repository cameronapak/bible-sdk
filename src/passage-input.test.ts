// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { definePassageInput } from "./passage-input";

// Form submission is checked in a real browser; jsdom has no form-associated internals.
HTMLElement.prototype.attachInternals = () => ({ labels: [], setFormValue() {}, setValidity() {} }) as unknown as ElementInternals;
definePassageInput();
afterEach(() => document.body.replaceChildren());

it.each(["bible-sdk-passage-input", "si-passage-input", "bible-sk-passage-input"] as const)("%s commits a typed passage with the existing change event", (tag) => {
  const field = document.createElement(tag);
  document.body.append(field);
  const input = field.shadowRoot!.querySelector("input")!;
  const changes: unknown[] = [];
  field.addEventListener("change", (event) => changes.push((event as CustomEvent).detail));
  input.value = "Romans 8:28";
  input.dispatchEvent(new Event("input"));
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  expect(field.value).toBe("ROM.8.28");
  expect(changes).toEqual([{ passageId: "ROM.8.28", label: "Romans 8:28" }]);
});
