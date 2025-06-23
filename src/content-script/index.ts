import type { Duplex } from "node:stream";
import { WindowPostMessageStream } from "@metamask/post-message-stream";
import log from "loglevel";
import { runtime } from "webextension-polyfill";
import { name } from "#/inpage/utils";
import { loadSettings } from "#/settings";

declare global {
  interface Document {
    prerendering: boolean;
  }
}

// init on load
(async () => init())();

async function init() {
  await loadSettings();

  initProviderForward();
  injectInPageScript();
}

/**
 * Sets up a stream to forward messages from the injected page script to the extension's background worker
 */
function initProviderForward() {
  // https://bugs.chromium.org/p/chromium/issues/detail?id=1457040
  // and related discussion: https://groups.google.com/a/chromium.org/g/chromium-extensions/c/gHAEKspcdRY?pli=1
  // Temporary workaround for chromium bug that breaks the content script <=> background connection
  // for prerendered pages. This delays connection setup until the page is in active state
  if (document.prerendering) {
    document.addEventListener("prerenderingchange", () => {
      if (!document.prerendering) {
        initProviderForward();
      }
    });
    return;
  }

  const inpageStream = new WindowPostMessageStream({
    name: `${name}:contentscript`,
    target: `${name}:inpage`,
  }) as unknown as Duplex;

  connectToBackground(name, inpageStream);
}

/**
 * Connects to the background script and forwards messages from the page script to it
 * Handles bg disconnections by recursing and reconnecting again, which can happen under Manifest v3, when browsers limit idle time for background scripts
 */
function connectToBackground(name: string, inpageStream: Duplex) {
  const bgPort = runtime.connect({ name: `${name}:contentscript` });

  window.onbeforeunload = () => {
    bgPort.disconnect();
  };

  const onPageData = (data: any) => {
    bgPort.postMessage(data);
  };
  const onBgData = (data: any) => {
    inpageStream.write(data);
  };

  const onBgDisconnect = () => {
    inpageStream.removeListener("data", onPageData);
    bgPort.onMessage.removeListener(onBgData);
    bgPort.onDisconnect.removeListener(onBgDisconnect);
    log.warn(`[${name} - contentscript] disconnected. reconnecting`);

    connectToBackground(name, inpageStream);
  };

  inpageStream.on("data", onPageData);
  bgPort.onMessage.addListener(onBgData);
  bgPort.onDisconnect.addListener(onBgDisconnect);
}

/**
 * Injects `inpage.js` into the page.
 *
 * The inpage script is responsible for providing the `window.ethereum` object,
 * which will connect to the stream being forward by this content script
 */
function injectInPageScript() {
  const url = runtime.getURL("inpage/inpage.js");

  try {
    const container = document.head || document.documentElement;
    const scriptTag = document.createElement("script");
    scriptTag.setAttribute("async", "false");
    scriptTag.setAttribute("src", url);
    container.insertBefore(scriptTag, container.children[0]);
    container.removeChild(scriptTag);
  } catch (error) {
    log.error(`${name}: Provider injection failed.`, error);
  }
}
