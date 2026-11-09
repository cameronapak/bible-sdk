import { FreeUseBibleApi, type ChapterVerse } from "free-use-bible-api";
import { parsePassage } from "grab-bcv";

export type BibleVersion = {
  id: string;
  abbreviation: string;
  title: string;
  /** BCP 47 language tag. Optional for custom providers with no language metadata. */
  language?: string;
  languageName?: string;
};

/** Provider-owned HTML must be safe to insert into a shadow root. */
export type PassageDisplay = {
  html: string;
  version: BibleVersion;
  attribution: string;
  /** Optional safe HTML for linked attribution; plain attribution remains available. */
  attributionHtml?: string;
  direction?: "ltr" | "rtl";
  containerAttributes?: Readonly<Record<string, string>>;
  stylesheets?: readonly { kind: "bible" | "font"; href: string }[];
  /** Preserved for existing YouVersion scripture-load consumers. */
  yvpBibleVersion?: unknown;
};

/** Both built-in providers and custom providers use this contract. */
export interface BibleProvider {
  readonly id: string;
  readonly defaultVersionId: string;
  getPassage(versionId: string, passageId: string): Promise<PassageDisplay>;
  /** Optional for passage-only custom providers. Required by the version picker. */
  listVersions?(): Promise<BibleVersion[]>;
}

export type ProviderOptions = {
  /** Default: helloao. YouVersion must be selected explicitly. */
  provider?: "helloao" | "youversion" | BibleProvider;
  /** The selected provider's version ID, such as BSB for HelloAO. */
  bibleVersionId?: string;
  yvpPublicAppKey?: string;
  yvpBibleVersionId?: number;
  yvpApiHost?: string;
};

// Shared page defaults for standalone passages and version inputs.
export const providerDefaults: ProviderOptions = {};

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

function attributionLink(text: string, url: string): string {
  const label = escapeHtml(text);
  return /^https?:\/\//i.test(url) ? `<a href="${escapeHtml(url)}">${label}</a>` : label;
}

function inlineContent(content: ChapterVerse["content"], verseNumber?: number): string {
  let label = verseNumber === undefined ? "" : `<sup class="scripture-verse-number">${verseNumber}</sup> `;
  return content.map((item) => {
    if (typeof item === "string" || "text" in item) {
      const prefix = label;
      label = "";
      if (typeof item === "string") return prefix + escapeHtml(item);
      const text = escapeHtml(item.text);
      const words = item.wordsOfJesus ? `<span class="scripture-jesus">${text}</span>` : text;
      // A block poetry line must carry its verse number, not push it onto a line above.
      return item.poem !== undefined ? `<span class="scripture-poetry" style="--indent:${item.poem}">${prefix}${words}</span>` : prefix + words;
    }
    if ("heading" in item) return `<span class="scripture-heading">${escapeHtml(item.heading)}</span>`;
    if ("lineBreak" in item) return "<br>";
    // Notes are not displayed, matching the YouVersion adapter.
    return " ";
  }).join("");
}

const api = new FreeUseBibleApi();

export const helloaoProvider: BibleProvider = {
  id: "helloao",
  defaultVersionId: "BSB",
  async listVersions() {
    const { translations } = await api.getAvailableTranslations();
    return translations.map((translation) => ({
      id: translation.id,
      abbreviation: translation.shortName || translation.id,
      title: translation.name,
      language: new Intl.Locale(translation.language).language,
      languageName: translation.languageEnglishName || translation.languageName || translation.language,
    }));
  },
  async getPassage(versionId, passageId) {
    const { start, end } = parsePassage(passageId);
    if (start.book !== end.book || start.chapter !== end.chapter) throw new Error("Passages cannot cross chapters.");
    const result = await api.getTranslationBookChapter(versionId, start.book, start.chapter);
    const chapterVerses = result.chapter.content.filter((item) => item.type === "verse");
    const finalVerse = Math.max(...chapterVerses.map((verse) => verse.number));
    const first = start.verse ?? 1;
    const last = end.verse ?? finalVerse;
    const verses = chapterVerses.filter((item) => item.number >= first && item.number <= last);
    if (!verses.length || last > finalVerse) throw new Error("Passage is not available in this version.");

    // Keep a section heading only when its following verse is selected. Never include
    // text or headings belonging to the next section after the requested range.
    let heading = "";
    let html = "";
    let selected = false;
    for (const item of result.chapter.content) {
      if (item.type === "heading") heading += `<h3 class="scripture-heading">${escapeHtml(item.content.join(" "))}</h3>`;
      else if (item.type === "verse") {
        selected = item.number >= first && item.number <= last;
        if (selected) html += `${heading}<span class="scripture-verse">${inlineContent(item.content, item.number)}</span> `;
        heading = "";
      } else if (item.type === "hebrew_subtitle" && first === 1) {
        html += `<p class="scripture-subtitle">${inlineContent(item.content)}</p>`;
      } else if (item.type === "line_break" && selected) html += "<br>";
    }
    const translation = result.translation;
    return {
      html,
      version: { id: translation.id, abbreviation: translation.shortName || translation.id, title: translation.name },
      attribution: `${translation.licenseNotice || `${translation.name}. ${translation.licenseUrl}`} · Source: HelloAO Free Use Bible API`,
      attributionHtml: `${translation.licenseNotice ? escapeHtml(translation.licenseNotice) : `${attributionLink(translation.name, translation.licenseUrl)}.`} · Source: ${attributionLink("HelloAO Free Use Bible API", "https://bible.helloao.org/docs/")}`,
      direction: translation.textDirection,
      containerAttributes: { class: "scripture-bible", lang: translation.language },
    };
  },
};

/** The SDK is loaded only when this provider is used. No YouVersion requests run by default. */
export function createYouVersionProvider({ yvpPublicAppKey, yvpApiHost }: Pick<ProviderOptions, "yvpPublicAppKey" | "yvpApiHost">): BibleProvider {
  return {
    id: "youversion",
    defaultVersionId: "3034",
    async listVersions() {
      if (!yvpPublicAppKey) throw new Error("The YouVersion provider needs a public app key.");
      const { ApiClient, getVersions } = await import("@youversion/platform-core");
      const client = new ApiClient({ appKey: yvpPublicAppKey, apiHost: yvpApiHost });
      const languages = new Intl.DisplayNames(["en"], { type: "language" });
      const versions: BibleVersion[] = [];
      let pageToken: string | null = null;
      do {
        const page = await getVersions(client, "*", undefined, {
          page_size: 99,
          page_token: pageToken || undefined,
          fields: ["id", "localized_abbreviation", "localized_title", "language_tag"],
        });
        versions.push(...page.data.map((version) => ({
          id: String(version.id), abbreviation: version.localized_abbreviation, title: version.localized_title,
          language: version.language_tag, languageName: languages.of(version.language_tag),
        })));
        pageToken = page.next_page_token;
      } while (pageToken);
      return versions;
    },
    async getPassage(versionId, passageId) {
      if (!yvpPublicAppKey) throw new Error("The YouVersion provider needs a public app key.");
      if (!/^[1-9]\d*$/.test(versionId) || !Number.isSafeInteger(Number(versionId))) throw new Error("Set a positive YouVersion Bible version ID.");
      const { ApiClient, getPassageDisplay } = await import("@youversion/platform-core");
      const display = await getPassageDisplay(new ApiClient({ appKey: yvpPublicAppKey, apiHost: yvpApiHost }), {
        versionId: Number(versionId), passageId, includeHeadings: true, includeNotes: false,
      });
      return {
        ...display,
        version: { id: String(display.version.id), abbreviation: display.version.localized_abbreviation, title: display.version.localized_title },
        attribution: `${display.attribution.text} · Source: YouVersion Platform`,
        attributionHtml: `${escapeHtml(display.attribution.text)} · Source: ${attributionLink("YouVersion Platform", "https://developers.youversion.com/")}`,
        yvpBibleVersion: display.version,
      };
    },
  };
}

const youversionProviders = new Map<string, BibleProvider>();

export function resolveProvider(options: ProviderOptions): BibleProvider {
  if (typeof options.provider === "object") return options.provider;
  if (!options.provider || options.provider === "helloao") return helloaoProvider;
  if (options.provider !== "youversion") throw new Error(`Unknown Bible provider: ${options.provider}`);
  const key = JSON.stringify([options.yvpPublicAppKey, options.yvpApiHost]);
  let provider = youversionProviders.get(key);
  if (!provider) {
    provider = createYouVersionProvider(options);
    youversionProviders.set(key, provider);
  }
  return provider;
}

const catalogs = new WeakMap<BibleProvider, Promise<BibleVersion[]>>();

/** Lists versions available from the configured provider, never a cross-provider guess. */
export function listBibleVersions(options: ProviderOptions = {}): Promise<BibleVersion[]> {
  const provider = resolveProvider({ ...providerDefaults, ...options });
  let request = catalogs.get(provider);
  if (!request) {
    if (!provider.listVersions) return Promise.reject(new Error("This Bible provider does not support listing versions."));
    request = provider.listVersions();
    request.catch(() => catalogs.delete(provider));
    catalogs.set(provider, request);
  }
  return request;
}

// Cache by provider identity as well as version and passage. Rejected requests can retry.
const displays = new WeakMap<BibleProvider, Map<string, Promise<PassageDisplay>>>();
export function fetchDisplay(provider: BibleProvider, versionId: string, passageId: string): Promise<PassageDisplay> {
  let cache = displays.get(provider);
  if (!cache) displays.set(provider, cache = new Map());
  const key = JSON.stringify([versionId, passageId]);
  let request = cache.get(key);
  if (!request) {
    request = provider.getPassage(versionId, passageId);
    request.catch(() => cache.delete(key));
    cache.set(key, request);
  }
  return request;
}
