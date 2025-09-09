# @archerjessop/utilities

Comprehensive set of DOM manipulation, data extraction utilities, and various calculations (financial and otherwise) for our web applications.

## Updating the package

Make your changes then, depending on the changes:

For bug fixes (backward compatible):

```bash
npm run release:patch
```
→ bumps 1.0.0 → 1.0.1

For new features (still backward compatible):
```bash
npm run release:minor
```
→ bumps 1.0.0 → 1.1.0

For breaking changes:
```bash
npm run release:major
```
→ bumps 1.0.0 → 2.0.0

Each script will:
- Update package.json version
- Commit the version bump + create a git tag
- Push commit + tag to your repo
- Publish the new version to npm

## Installation

```bash
npm install @archerjessop/utilities
```

## Browser Support

Works in both Node.js and browser environments. In browser environments, functions can extract data directly from the DOM when no text parameter is provided.

## License

MIT