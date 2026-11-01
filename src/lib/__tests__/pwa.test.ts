import { describe, expect, it } from "vitest";
import { detectManualInstall } from "../pwa";

const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1",
  iPadDesktopMode: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
  androidSamsung: "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36",
  androidFirefox: "Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0",
  windowsChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  windowsEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 Edg/126.0",
  windowsFirefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  macChrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
};

describe("detectManualInstall", () => {
  it.each([
    ["iPhone Safari", UA.iphoneSafari, false, "ios"],
    ["iPhone Chrome", UA.iphoneChrome, false, "ios"],
    ["iPad requesting the desktop site", UA.iPadDesktopMode, true, "ios"],
    ["Android Chrome", UA.androidChrome, false, "android"],
    ["Samsung Internet", UA.androidSamsung, false, "android"],
    ["Windows Chrome", UA.windowsChrome, false, "desktop-chromium"],
    ["Windows Edge", UA.windowsEdge, false, "desktop-chromium"],
    ["macOS Chrome", UA.macChrome, false, "desktop-chromium"],
    ["macOS Safari", UA.macSafari, false, "mac-safari"],
  ] as const)("gives %s its install steps", (_label, ua, iPadOs, expected) => {
    expect(detectManualInstall(ua, iPadOs)).toBe(expected);
  });

  it.each([
    ["Firefox on Windows", UA.windowsFirefox],
    ["Firefox on Android", UA.androidFirefox],
  ])("shows no steps for %s, which cannot install this way", (_label, ua) => {
    expect(detectManualInstall(ua, false)).toBeNull();
  });
});
