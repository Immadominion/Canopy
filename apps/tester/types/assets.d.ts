/**
 * Ambient declarations for static asset imports.
 *
 * Metro represents a bundled image as an opaque numeric asset id, which is a
 * valid `ImageSourcePropType`. Declaring the modules lets us use typed ESM
 * imports (`import logo from "./logo.png"`) instead of untyped `require()`.
 */
declare module "*.png" {
    const asset: number;
    export default asset;
}

declare module "*.jpg" {
    const asset: number;
    export default asset;
}

declare module "*.svg" {
    const asset: number;
    export default asset;
}
