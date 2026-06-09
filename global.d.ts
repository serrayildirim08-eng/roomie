// Type declarations for CSS imports used by the Expo web target
// (react-native-web). Native (iOS/Android) ignores these; this just keeps
// `tsc` happy for the `.web.tsx` variants and the global stylesheet.

declare module '*.css';

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
