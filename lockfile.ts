import type { LockFile } from "renovate/dist/modules/manager/npm/extract/types";
import type { PackageDependency } from "renovate/dist/modules/manager/types";
import { logger } from "./logger";

const knownYarnLockfileVersions = [1, 2, 8];

export function isYarnLockFile(lockfile: LockFile): boolean {
	if (lockfile.lockedVersions == null) {
		return false;
	}

	const keys = Object.keys(lockfile.lockedVersions);

	/*
Passing the wrong type of lockfile (i.e. an NPM lockfile) will result in a `LockFile` of the form:
{
  yarnLock: {
    isYarn1: true,
    lockfileVersion: undefined,
    lockedVersions: {
      'name@unknown': undefined,
      'version@unknown': undefined,
      'lockfileVersion@unknown': undefined,
      'requires@unknown': undefined,
      'packages@unknown': undefined,
      'dependencies@unknown': undefined
    }
  }
}

PNPM also presents a similar option, so we can look for the presence of `packages@unknown` as it's common across both
  */

	return !keys.includes("packages@unknown");
}

export async function parseYarnLockfileEntry(
	isYarn1: boolean | undefined,
	lockfileVersion: number | undefined,
	key: string,
	value: string,
): Promise<PackageDependency<Record<string, any>>> {
	if (isYarn1 !== undefined && isYarn1) {
		const lockedVersion = value;
		const parts = key.split("@");

		let depName = parts[0];
		let version = parts[1];

		// if we've got a scoped package
		if (parts.length === 3) {
			depName += `@${parts[1]}`;
			version = parts[2];
		}

		// intermediate variable to allow adding `depTypes` which isn't explicitly defined in the type, but seems to be returned in several places
		const dep = {
			depName,
			packageName: depName,
			datasource: "npm",
			depTypes: [
				"lockfile",
				// in the case that we have multiple lockfile entries found for a given dependency, we need to add a separate `depType` metadata, which works around the way that dmd.tanna.dev deduplicates entries
				`lockfile-yarn-pinning-${version}`,
			],
			currentValue: version,
			lockedVersion,
			fixedVersion: lockedVersion,
			currentVersion: lockedVersion,
		};

		return dep;
	}

	if (
		lockfileVersion === undefined ||
		!knownYarnLockfileVersions.includes(lockfileVersion)
	) {
		logger.warn(
			`WARN: Using Yarn Lockfile version ${JSON.stringify(lockfileVersion)}, which renovate-graph may not be able to handle correctly`,
		);
	}

	const lockedVersion = value;
	const parts = key.split("@");

	let depName = parts[0];
	let version = parts[1];

	// if we've got a scoped package
	if (parts.length === 3) {
		depName += `@${parts[1]}`;
		version = parts[2];
	}

	// intermediate variable to allow adding `depTypes` which isn't explicitly defined in the type, but seems to be returned in several places
	const dep = {
		depName,
		packageName: depName,
		datasource: "npm",
		depTypes: [
			"lockfile",
			// in the case that we have multiple lockfile entries found for a given dependency, we need to add a separate `depType` metadata, which works around the way that dmd.tanna.dev deduplicates entries
			`lockfile-yarn-pinning-${version}`,
		],
		currentValue: version,
		lockedVersion,
		fixedVersion: lockedVersion,
		currentVersion: lockedVersion,
	};

	return dep;
}

export async function parseNPMLockfileEntry(
	lockfileVersion: number | undefined,
	key: string,
	value: string,
): Promise<PackageDependency<Record<string, any>>> {
	const depName = key;
	const version = value;

	// intermediate variable to allow adding `depTypes` which isn't explicitly defined in the type, but seems to be returned in several places
	const dep = {
		depName,
		packageName: depName,
		datasource: "npm",
		depTypes: ["lockfile"],
		currentValue: version,
		version,
		fixedVersion: version,
		currentVersion: version,
	};

	return dep;
}

export async function parsePNPMLockfileEntry(
	lockfileVersion: number | undefined,
	key: string,
	value: string,
	depType: string,
): Promise<PackageDependency<Record<string, any>>> {
	const depName = key;
	const version = value;

	// intermediate variable to allow adding `depTypes` which isn't explicitly defined in the type, but seems to be returned in several places
	const dep = {
		depName,
		packageName: depName,
		datasource: "npm",
		depTypes: [depType, "lockfile"],
		currentValue: version,
		version,
		fixedVersion: version,
		currentVersion: version,
	};

	return dep;
}
