#!/usr/bin/env node
import * as fs from "node:fs";
import { logger } from "./logger";
import type { Metadata } from "./types";

import { version as renovateVersion } from "renovate/package.json";

import {
	buildRenovateMetadata,
	discoverAndProcessThroughGitHubApp,
	discoverAndProcessThroughRenovate,
	setupRenovate,
} from "./index";

export async function runDreamyAction(out_dir: string): Promise<void> {
	const outDir: string = out_dir;
	if (!fs.existsSync(outDir)) {
		fs.mkdirSync(outDir, { recursive: true });
	} else if (!fs.statSync(outDir).isDirectory()) {
		logger.error(`The expected OUT_DIR, \`${outDir}\` was not a directory`);
		process.exit(1);
	}

	const renovateMetadata = buildRenovateMetadata(renovateVersion);
	const metadata: Metadata = {
		renovate: renovateMetadata,
	};

	if ((process.env.RG_GITHUB_APP_ID ?? "") !== "") {
		await discoverAndProcessThroughGitHubApp(outDir, metadata);
	} else {
		const config = await setupRenovate();
		if (config.platform !== undefined) {
			metadata.renovate.platform = config.platform;
		}

		if (config.platform === "local") {
			const platform = process.env.RG_LOCAL_PLATFORM ?? "";

			if (platform === "") {
				logger.error(
					"Running as local platform, but platform has not been set - make sure you specify RG_LOCAL_PLATFORM",
				);
				process.exit(1);
			}
			metadata.renovate.platform = platform;

			const organisation = process.env.RG_LOCAL_ORGANISATION ?? "";
			const repository = process.env.RG_LOCAL_REPO ?? "";

			if (organisation === "" || repository === "") {
				logger.error(
					`Running as local platform, but the repository name is defined as ${organisation}/${repository} - have you set RG_LOCAL_ORGANISATION and RG_LOCAL_REPO as appropriate?`,
				);
				process.exit(1);
			}

			config.repository = `${organisation}/${repository}`;
		}

		await discoverAndProcessThroughRenovate(config, outDir, metadata);
	}
}
