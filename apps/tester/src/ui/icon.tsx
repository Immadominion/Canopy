/**
 * Typed Ionicons wrapper.
 *
 * @expo/vector-icons (v14) ships types compiled against React 18's Component,
 * which React 19's JSX rejects ("cannot be used as a JSX component"). Runtime is
 * fine — this re-types the component so it's usable across the app. The name
 * union comes from the runtime glyphMap (the broken Component type is bypassed).
 */
import type React from "react";
import { Ionicons } from "@expo/vector-icons";

export type IconName = keyof typeof Ionicons.glyphMap;

export const Icon = Ionicons as unknown as React.FC<{
    name: IconName;
    size?: number;
    color?: string;
}>;
