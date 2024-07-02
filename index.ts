#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { App } from "@octokit/app";
import { createAppAuth } from "@octokit/auth-app";
import type { AllConfig, RenovateRepository } from "renovate/dist/config/types";
import type { PackageFile } from "renovate/dist/modules/manager/types";
import { privateCacheDir } from "renovate/dist/util/fs";
import { autodiscoverRepositories } from "renovate/dist/workers/global/autodiscover";
import { getRepositoryConfig } from "renovate/dist/workers/global/index";
import {
	isYarnLockFile,
	parseNPMLockfileEntry as parseNpmLockfileEntry,
	parsePNPMLockfileEntry,
	parseYarnLockfileEntry,
} from "./lockfile";
import { prepareConfig, renovateRepo } from "./renovate-workers-global";
import type {
	Metadata,
	PackageDataDump,
	RenovateMetadata,
	WritePackageDataCallback,
	WritePackageDataCallbackOptions,
} from "./types";

import core from "@actions/core";
import { getNpmLock } from "renovate/dist/modules/manager/npm/extract/npm";
import { getPnpmLock } from "renovate/dist/modules/manager/npm/extract/pnpm";
import { getYarnLock } from "renovate/dist/modules/manager/npm/extract/yarn";
import { runDreamyAction } from "./executable";
import { logger } from "./logger";

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run();

export async function run(): Promise<void> {
	try {
		const out = core.getInput("out-dir");
		await runDreamyAction(out);
	} catch (error) {
		// Fail the workflow run if an error occurs
		if (error instanceof Error) core.setFailed(error.message);
	}
}

function excludedRepositories(): string[] {
	if (process.env.RG_EXCLUDE_REPOS === undefined) {
		return [] as string[];
	}

	return process.env.RG_EXCLUDE_REPOS.split(",");
}

function isExcludedRepo(
	excludedRepos: string[],
	repository: RenovateRepository,
): boolean {
	if (typeof repository === "string") {
		return excludedRepos.includes(repository);
	}

	return excludedRepos.includes(repository.repository);
}

async function retrievePackageDataForRepo(
	config: AllConfig,
	repository: RenovateRepository,
	metadata: Metadata,
): Promise<PackageDataDump | undefined> {
	let packageData: Record<string, Array<PackageFile<Record<string, any>>>>;
	const repoConfig = await getRepositoryConfig(config, repository);

	if (isExcludedRepo(excludedRepositories(), repository)) {
		logger.warn(
			`Skipping repository ${JSON.stringify(repository)}, as it was excluded by the RG_EXCLUDE_REPOS setting`,
		);
		return;
	}

	try {
		const result = await renovateRepo(repoConfig);
		packageData = result.packageFiles;
	} catch (e) {
		if (e instanceof Error) {
			logger.error(
				{
					error: {
						name: e.name,
						message: e.message,
						stack: e.stack,
						cause: e.cause,
					},
				},
				`Failed to read repository information for ${JSON.stringify(repository)}: ${e.name}: ${e.message}`,
			);
		} else {
			logger.error(
				{
					error: e,
				},
				`Failed to read repository information for ${JSON.stringify(repository)}: ${JSON.stringify(e)}`,
			);
		}
		// skip the iteration, rather than halting the program
		return;
	} finally {
		try {
			fs.rmdirSync(privateCacheDir());
		} catch (err) {
			logger.warn({ err }, "privateCacheDir deletion error");
		}

		if (process.env.RG_DELETE_CLONED_REPOS === "true") {
			try {
				const baseDir = config.baseDir ?? "/tmp/renovate";
				const reposDir = path.join(baseDir, "repos");
				fs.rmSync(reposDir, { recursive: true });
				fs.mkdirSync(reposDir, { recursive: true });
			} catch (err) {
				logger.warn({ err }, "baseDir/repos deletion error");
			}
		}
	}

	if (repoConfig.repository === undefined) {
		logger.warn(
			`The repository name for ${JSON.stringify(repoConfig)} was not defined, skipping`,
		);
		// skip the iteration, rather than halting the program
		return;
	}
	let resolvedRepository = repoConfig.repository;
	if (config.platform === "local") {
		if (config.repository === undefined) {
			logger.warn(
				`The repository name for ${JSON.stringify(config)} was not defined, skipping`,
			);
			// skip the iteration, rather than halting the program
			return;
		}
		resolvedRepository = config.repository;
	}

	const parts = resolvedRepository.split("/");
	const organisationName = parts.slice(0, -1).join("/");
	const repoName = parts[parts.length - 1];

	const npmPackageData = packageData.npm;
	// parse the full lockfiles, as they don't get automagically populated by Renovate
	if (npmPackageData !== undefined) {
		for (const packageFile of npmPackageData) {
			for (const lockFile of packageFile.lockFiles ?? []) {
				const yarnLock = await getYarnLock(lockFile);
				if (isYarnLockFile(yarnLock)) {
					for (const k in yarnLock.lockedVersions) {
						const dep = await parseYarnLockfileEntry(
							yarnLock.isYarn1,
							yarnLock.lockfileVersion,
							k,
							yarnLock.lockedVersions[k],
						);
						packageFile.deps.push(dep);
					}
					continue;
				}

				const pnpmLock = await getPnpmLock(lockFile);
				if (pnpmLock.lockedVersionsWithPath != null) {
					for (const path in pnpmLock.lockedVersionsWithPath) {
						for (const depType in pnpmLock.lockedVersionsWithPath[path]) {
							const deps = pnpmLock.lockedVersionsWithPath[path][depType];
							for (const key in deps) {
								const value = deps[key];
								const dep = await parsePNPMLockfileEntry(
									pnpmLock.lockfileVersion,
									key,
									value,
									depType,
								);
								packageFile.deps.push(dep);
							}
						}
					}
					continue;
				}

				const npmLock = await getNpmLock(lockFile);
				for (const k in npmLock.lockedVersions) {
					const dep = await parseNpmLockfileEntry(
						npmLock.lockfileVersion,
						k,
						npmLock.lockedVersions[k],
					);
					packageFile.deps.push(dep);
				}
			}
		}
	}

	return {
		repo: repoName,
		organisation: organisationName,
		packageData,
		metadata,
	};
}

async function defaultWritePackageDataCallback(
	packageDataDump: PackageDataDump | undefined,
	opts: WritePackageDataCallbackOptions,
): Promise<void> {
	writePackageDataToFile(packageDataDump, opts);
}

export async function discoverAndProcessThroughGitHubApp(
	outDir: string,
	metadata: Metadata,
): Promise<void> {
	return await discoverAndProcessThroughGitHubAppWithCallback(
		outDir,
		metadata,
		defaultWritePackageDataCallback,
	);
}

export async function discoverAndProcessThroughGitHubAppWithCallback(
	outDir: string | undefined,
	metadata: Metadata,
	cb: WritePackageDataCallback,
): Promise<void> {
	const appId = process.env.RG_GITHUB_APP_ID ?? "";
	const privateKey = (process.env.RG_GITHUB_APP_KEY ?? "").replaceAll(
		/\\n/g,
		"\n",
	);

	const auth = createAppAuth({
		appId,
		privateKey,
	});

	const app = new App({
		appId,
		privateKey,
	});
	const { data } = await app.octokit.request("/app");
	logger.info(
		`Processing renovate-graph data as GitHub App ${JSON.stringify(data.name)}`,
	);

	for await (const { installation } of app.eachInstallation.iterator()) {
		for await (const { repository } of app.eachRepository.iterator({
			installationId: installation.id,
		})) {
			// skip archived repositories because they'll only fail to process anyway
			if (repository.archived) {
				continue;
			}

			const installationAuthentication = await auth({
				type: "installation",
				installationId: installation.id,
			});
			process.env.RENOVATE_TOKEN = installationAuthentication.token;

			const config = await setupRenovate();
			if (config.platform !== undefined) {
				metadata.renovate.platform = config.platform;
			}

			const packageDataDump = await retrievePackageDataForRepo(
				config,
				repository.full_name,
				metadata,
			);

			const opts = prepareCallbackOptions(
				metadata,
				repository.full_name,
				outDir,
			);

			await cb(packageDataDump, opts);
		}
	}
}

export async function processRepositoriesThroughGitHubAppWithCallback(
	repositories: string[],
	outDir: string,
	metadata: Metadata,
	cb: WritePackageDataCallback,
): Promise<void> {
	const appId = process.env.RG_GITHUB_APP_ID ?? "";
	const privateKey = (process.env.RG_GITHUB_APP_KEY ?? "").replaceAll(
		/\\n/g,
		"\n",
	);
	const installationId = process.env.RG_GITHUB_APP_INSTALLATION_ID ?? "";

	const auth = createAppAuth({
		appId,
		privateKey,
	});

	const installationAuthentication = await auth({
		type: "installation",
		installationId,
	});
	process.env.RENOVATE_TOKEN = installationAuthentication.token;

	const config = await setupRenovate();
	if (config.platform !== undefined) {
		metadata.renovate.platform = config.platform;
	}

	for (const repository of repositories) {
		const packageDataDump = await retrievePackageDataForRepo(
			config,
			repository,
			metadata,
		);

		const opts = prepareCallbackOptions(metadata, repository, outDir);

		await cb(packageDataDump, opts);
	}
}

export async function discoverAndProcessThroughRenovate(
	config: AllConfig,
	outDir: string,
	metadata: Metadata,
): Promise<void> {
	return await discoverAndProcessThroughRenovateWithCallback(
		config,
		outDir,
		metadata,
		defaultWritePackageDataCallback,
	);
}

export async function discoverAndProcessThroughRenovateWithCallback(
	allConfig: AllConfig,
	outDir: string | undefined,
	metadata: Metadata,
	cb: WritePackageDataCallback,
): Promise<void> {
	const config = await autodiscoverRepositories(allConfig);

	if (config.repositories == null) {
		throw new Error("No repositories could be discovered");
	}

	for (const repository of config.repositories) {
		const packageDataDump = await retrievePackageDataForRepo(
			config,
			repository,
			metadata,
		);

		const opts = prepareCallbackOptions(metadata, repository, outDir);

		await cb(packageDataDump, opts);
	}
}

function writePackageDataToFile(
	packageDataDump: PackageDataDump | undefined,
	opts: WritePackageDataCallbackOptions,
): void {
	logger.debug(
		{
			key: opts.key,
			outDir: opts.outDir,
		},
		`writePackageDataToFile called for ${opts.key.platform}/${opts.key.organisation}/${opts.key.repo}`,
	);

	if (packageDataDump === undefined) {
		logger.warn(
			{
				key: opts.key,
				outDir: opts.outDir,
			},
			`writePackageDataToFile called for ${opts.key.platform}/${opts.key.organisation}/${opts.key.repo}, but there was no \`packageDataDump\` provided, likely because the repository failed to scan. Check the logs`,
		);
		return;
	}

	if (opts.outDir === undefined) {
		logger.error(
			{
				key: opts.key,
				outDir: opts.outDir,
			},
			`writePackageDataToFile was called for ${opts.key.platform}/${opts.key.organisation}/${opts.key.repo}, but the \`outDir\` provided wasn't set. This is likely a bug in \`renovate-graph\`, please raise upstream`,
		);
		return;
	}

	const outPath = path.join(
		opts.outDir,
		`${packageDataDump.metadata.renovate.platform}-${packageDataDump.organisation.replaceAll("/", "-")}-${packageDataDump.repo}.json`,
	);
	fs.writeFileSync(outPath, `${JSON.stringify(packageDataDump)}\n`);
	logger.info(
		`Successfully retrieved dependency data for ${packageDataDump.organisation}/${packageDataDump.repo}`,
	);
}

export async function setupRenovate(): Promise<AllConfig> {
	const config = await prepareConfig();

	// override built-in defaults for the purpose of this extraction
	config.dryRun = "extract";
	config.onboarding = false;

	// By default, ignore any custom configuration as it may disable managers, but allow overriding with https://docs.renovatebot.com/self-hosted-configuration/#requireconfig
	if (config.requireConfig === "required") {
		config.requireConfig = "ignored";
	}

	if ((process.env.RG_INCLUDE_UPDATES ?? "") === "true") {
		config.dryRun = "full";
	}

	return config;
}

export function buildRenovateMetadata(
	renovateVersion: string,
): RenovateMetadata {
	const metadata = {
		major: -1, // to indicate it's not been parsed
		version: renovateVersion,
		platform: "unknown-platform",
	};

	const parts = renovateVersion.split(".");
	if (parts.length === 0) {
		logger.error(
			`Could not parse Renovate version \`${renovateVersion}\` as a Semver version`,
		);
		return metadata;
	}

	metadata.major = Number.parseInt(parts[0]);

	return metadata;
}

function prepareCallbackOptions(
	metadata: Metadata,
	repository: string | RenovateRepository,
	outDir: string | undefined,
): WritePackageDataCallbackOptions {
	// in the case we have a `RenovateRepository`, it may be an object that can be JSON'd back to a string
	const r = JSON.parse(JSON.stringify(repository));

	const parts = r.split("/");
	const organisationName = parts.slice(0, -1).join("/");
	const repoName = parts[parts.length - 1];

	const opts: WritePackageDataCallbackOptions = {
		key: {
			platform: metadata.renovate.platform,
			organisation: organisationName,
			repo: repoName,
		},
		outDir,
	};

	return opts;
}
