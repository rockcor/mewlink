/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "qa" in a MewLink QA build (scripts/build-qa.mjs). */
  readonly VITE_MEWLINK_FLAVOR?: string;
  /** QA only: a loopback analytics collector. Production ignores overrides. */
  readonly VITE_MEWLINK_ANALYTICS_ENDPOINT?: string;
}
