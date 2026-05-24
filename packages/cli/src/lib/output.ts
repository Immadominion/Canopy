import chalk from "chalk";

export function success(message: string): void {
    console.log(chalk.green("✓") + "  " + message);
}

export function error(message: string): void {
    console.error(chalk.red("✗") + "  " + message);
}

export function warn(message: string): void {
    console.warn(chalk.yellow("⚠") + "  " + message);
}

export function info(message: string): void {
    console.log(chalk.dim("·") + "  " + message);
}

export function header(title: string): void {
    console.log("\n" + chalk.bold(title.toUpperCase()));
    console.log(chalk.dim("─".repeat(Math.min(title.length + 4, 60))));
}

export function table(
    rows: Array<[string, string]>,
    labelWidth = 20,
): void {
    for (const [label, value] of rows) {
        const padded = (label + ":").padEnd(labelWidth);
        console.log("  " + chalk.dim(padded) + " " + value);
    }
}

export function die(message: string, code = 1): never {
    error(message);
    process.exit(code);
}
