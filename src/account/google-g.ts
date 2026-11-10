/**
 * Google's standard "G" for the "Continue with Google" button, as Google's sign-in branding
 * guidelines require (https://developers.google.com/identity/branding-guidelines). The two files
 * are Google's own, unmodified, from signin-assets.zip:
 *   Android + Web/SVG/Light/Theme=Light, Show text=No, Shape=Square, Platform=Android+Web.svg
 *   Android + Web/SVG/Dark/Theme=Dark, Show text=No, Shape=Square, Platform=Android+Web.svg
 * Each is Google's 40x40 icon-only button; only its opening tag changes here, so that it shows
 * the 20x20 G alone. It goes inline (not as an <img>): the G's gradient uses a foreignObject.
 */
import dark from './google-g-dark.svg?raw';
import light from './google-g-light.svg?raw';

/** The sha256 of Google's files, so a test can tell they are unchanged. */
export const GOOGLE_G_SHA256 = {
  light: '6587b180203a99da15c0a041018e15c94ffd9556c4b9855bdc69806081a93791',
  dark: '2f7ecc307b1db0f1738456269ee2c4433b3a73c35060ced67a9afcfc6821e786',
} as const;

export const GOOGLE_G_FILES = { light, dark } as const;

const OPEN = '<svg width="40" height="40" viewBox="0 0 40 40"';
const G_ONLY =
  '<svg width="20" height="20" viewBox="10 10 20 20" focusable="false" aria-hidden="true"';

/** The G alone, for the given theme, as inline SVG markup. */
export function googleG(theme: 'light' | 'dark'): string {
  const file = GOOGLE_G_FILES[theme];
  if (!file.startsWith(OPEN)) throw new Error(`Google's ${theme} G changed its opening tag`);
  return G_ONLY + file.slice(OPEN.length);
}
