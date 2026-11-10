export default {
  fetch(request: Request, env: { ASSETS: { fetch(request: Request): Promise<Response> } }) {
    const url = new URL(request.url);
    if (url.hostname === "scripture-inline.cameronandrewpak.workers.dev" || url.hostname === "www.bible-sdk.com") {
      url.protocol = "https:";
      url.hostname = "bible-sdk.com";
      url.port = "";
      return Response.redirect(url.href, 308);
    }
    return env.ASSETS.fetch(request);
  },
};
