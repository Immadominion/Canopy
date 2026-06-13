// Polyfills must be imported before anything else.
//
// `react-native-get-random-values` patches `crypto.getRandomValues()`, required
// by @solana-mobile/mobile-wallet-adapter-protocol and Solana cryptography.
// `buffer` exposes the Node.js Buffer API, also required by Solana libraries.
import "react-native-get-random-values";
import { Buffer } from "buffer";
global.Buffer = Buffer;

// Register the Expo Router entry point (must be last).
import "expo-router/entry";
