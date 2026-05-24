import { Command } from "commander";

import { registerBetaCommand } from "./commands/beta.js";
import { registerCheckCommand } from "./commands/check.js";
import { registerConfigCommand } from "./commands/config.js";
import { registerReleaseCommand } from "./commands/release.js";

const program = new Command();

program
    .name("canopy")
    .description("Canopy — beta distribution and release ops for Solana Mobile")
    .version("0.1.0", "-v, --version");

registerConfigCommand(program);
registerBetaCommand(program);
registerCheckCommand(program);
registerReleaseCommand(program);

program.parseAsync(process.argv).catch((err: unknown) => {
    if (err instanceof Error) {
        console.error(err.message);
    } else {
        console.error("An unexpected error occurred.");
    }
    process.exit(1);
});
