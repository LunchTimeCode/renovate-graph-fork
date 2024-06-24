import { GlobalConfig } from "renovate/dist/config/global";
import {
	applySecretsToConfig,
	validateConfigSecrets,
} from "renovate/dist/config/secrets";
/**
 * A set of functions that are vendored from Renovate's lib/workers/global/* and lib/workers/repository/* files.
 */
import type { AllConfig, RenovateConfig } from "renovate/dist/config/types";
import { mergeChildConfig } from "renovate/dist/config/utils";
import { parseConfigs } from "renovate/dist/workers/global/config/parse";
import {
	resolveGlobalExtends,
	validatePresets,
} from "renovate/dist/workers/global/index";
import { globalInitialize } from "renovate/dist/workers/global/initialize";
import { initRepo } from "renovate/dist/workers/repository/init/index";
import type { ExtractResult } from "renovate/dist/workers/repository/process/extract-update";
import { extractDependencies } from "renovate/dist/workers/repository/process/index";

// Adapted from https://github.com/renovatebot/renovate/blob/37.33.3/lib/workers/global/index.ts#L52-L54
export async function getGlobalConfig(): Promise<RenovateConfig> {
	return await parseConfigs(process.env, process.argv);
}

// Adapted from https://github.com/renovatebot/renovate/blob/37.33.3/lib/workers/global/index.ts#L114-L148
export async function prepareConfig(): Promise<AllConfig> {
	let config: AllConfig;
	// read global config from file, env and cli args
	config = await getGlobalConfig();
	if (config?.globalExtends != null) {
		// resolve global presets immediately
		config = mergeChildConfig(
			config,
			await resolveGlobalExtends(config.globalExtends),
		);
	}
	// initialize all submodules
	config = await globalInitialize(config);

	// Set platform and endpoint in case local presets are used
	GlobalConfig.set({
		platform: config.platform,
		endpoint: config.endpoint,
	});

	await validatePresets(config);

	// validate secrets. Will throw and abort if invalid
	validateConfigSecrets(config);

	return config;
}

// Adapted from https://github.com/renovatebot/renovate/blob/37.33.3/lib/workers/repository/index.ts#L51-L97
export async function renovateRepo(
	repoConfig: RenovateConfig,
): Promise<ExtractResult> {
	let config = GlobalConfig.set(
		applySecretsToConfig(repoConfig, undefined, false),
	);
	config = await initRepo(config);
	return await extractDependencies(config);
}
