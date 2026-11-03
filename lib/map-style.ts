const OPENFREEMAP_LIGHT_STYLE = "https://tiles.openfreemap.org/styles/bright";
const OPENFREEMAP_DARK_STYLE = "https://tiles.openfreemap.org/styles/fiord";

export function mapStyleUrl(theme?: string) {
  if (theme === "dark")
    return process.env.NEXT_PUBLIC_MAP_STYLE_URL_DARK || OPENFREEMAP_DARK_STYLE;
  return process.env.NEXT_PUBLIC_MAP_STYLE_URL_LIGHT || OPENFREEMAP_LIGHT_STYLE;
}

export function currentMapStyleUrl() {
  return mapStyleUrl(document.documentElement.dataset.theme);
}
