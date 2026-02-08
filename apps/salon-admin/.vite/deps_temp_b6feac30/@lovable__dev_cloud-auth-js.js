import "./chunk-WOOG5QLI.js";

// ../../node_modules/.pnpm/@lovable.dev+cloud-auth-js@0.0.2/node_modules/@lovable.dev/cloud-auth-js/dist/index.js
var EXPECTED_MESSAGE_TYPE = "authorization_response";
var DEFAULT_OAUTH_BROKER_URL = "/~oauth/initiate";
var DEFAULT_SUPPORTED_OAUTH_ORIGINS = ["https://oauth.lovable.app"];
function startWebMessageListener(supportedOrigins) {
  let resolvePromise;
  const promise = new Promise((resolve) => {
    resolvePromise = resolve;
  });
  const callback = (e) => {
    const isValidOrigin = supportedOrigins.some((origin) => e.origin === origin);
    if (!isValidOrigin) {
      return;
    }
    const data = e.data;
    if (!data || typeof data !== "object") {
      return;
    }
    if (data.type !== EXPECTED_MESSAGE_TYPE) {
      return;
    }
    resolvePromise(data.response);
  };
  const cleanup = () => {
    window.removeEventListener("message", callback);
  };
  window.addEventListener("message", callback);
  return {
    cleanup,
    messagePromise: promise
  };
}
function getPopupDimensions(isInIframe) {
  const hasBrowserPosition = window.screenX !== 0 || window.screenY !== 0 || !isInIframe;
  const width = hasBrowserPosition ? window.outerWidth * 0.5 : window.screen.width * 0.5;
  const height = hasBrowserPosition ? window.outerHeight * 0.5 : window.screen.height * 0.5;
  const left = hasBrowserPosition ? window.screenX + (window.outerWidth - width) / 2 : (window.screen.width - width) / 2;
  const top = hasBrowserPosition ? window.screenY + (window.outerHeight - height) / 2 : (window.screen.height - height) / 2;
  return { width, height, left, top };
}
function generateState() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}
function createAuth(config = {}) {
  const oauthBrokerUrl = config.oauthBrokerUrl ?? DEFAULT_OAUTH_BROKER_URL;
  const supportedOAuthOrigins = config.supportedOAuthOrigins ?? DEFAULT_SUPPORTED_OAUTH_ORIGINS;
  async function signInWithOAuth(provider, opts = {}) {
    let isInIframe = false;
    try {
      isInIframe = window.self !== window.top;
    } catch {
      isInIframe = true;
    }
    const state = generateState();
    const redirectUri = opts.redirect_uri ?? window.location.origin;
    const params = new URLSearchParams({
      provider,
      redirect_uri: redirectUri,
      state,
      ...opts.extraParams
    });
    if (!isInIframe) {
      window.location.href = `${oauthBrokerUrl}?${params.toString()}`;
      return { error: null, redirected: true };
    }
    params.set("response_mode", "web_message");
    const url = `${oauthBrokerUrl}?${params.toString()}`;
    const { messagePromise, cleanup } = startWebMessageListener(supportedOAuthOrigins);
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    let popup;
    if (isMobile) {
      popup = window.open(url, "_blank");
    } else {
      const { width, height, left, top } = getPopupDimensions(isInIframe);
      popup = window.open(url, "oauth", `width=${width},height=${height},left=${left},top=${top}`);
    }
    if (!popup) {
      cleanup();
      return { error: new Error("Popup was blocked") };
    }
    let popupCheckInterval;
    const popupClosedPromise = new Promise((_, reject) => {
      popupCheckInterval = setInterval(() => {
        if (popup.closed) {
          clearInterval(popupCheckInterval);
          reject(new Error("Sign in was cancelled"));
        }
      }, 500);
    });
    try {
      const data = await Promise.race([messagePromise, popupClosedPromise]);
      if (data.error) {
        if (data.error === "legacy_flow") {
          return {
            error: new Error(
              "This flow is not supported in Preview mode. Please open the app in a new tab to sign in."
            )
          };
        }
        return {
          error: new Error(data.error_description ?? "Sign in failed")
        };
      }
      if (data.state !== state) {
        return { error: new Error("State is invalid") };
      }
      if (!data.access_token || !data.refresh_token) {
        return { error: new Error("No tokens received") };
      }
      return {
        tokens: {
          access_token: data.access_token,
          refresh_token: data.refresh_token
        },
        error: null
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error : new Error(String(error))
      };
    } finally {
      clearInterval(popupCheckInterval);
      cleanup();
      popup == null ? void 0 : popup.close();
    }
  }
  return {
    signInWithOAuth
  };
}
function createLovableAuth(config) {
  return createAuth(config);
}
export {
  createLovableAuth
};
//# sourceMappingURL=@lovable__dev_cloud-auth-js.js.map
