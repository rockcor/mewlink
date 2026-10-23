/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "qa" in a MewLink QA build (scripts/build-qa.mjs). */
  readonly VITE_MEWLINK_FLAVOR?: string;
}
