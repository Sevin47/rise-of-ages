// Vite resolves CSS side-effect imports at build time; TypeScript just needs to
// know the specifier is legal.
declare module '*.css';

// Vite injects `import.meta.env` at build time. The project keeps `types: []`
// in tsconfig to avoid pulling in vite/client wholesale, so declare the single
// field it actually reads: the base path the assets are served from.
interface ImportMeta {
  readonly env: { readonly BASE_URL: string };
}
