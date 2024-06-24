import type { PackageFile } from "renovate/dist/modules/manager/types";

export interface PackageDataDump {
	repo: string;
	organisation: string;
	packageData: Record<string, Array<PackageFile<Record<string, any>>>>;
	metadata: Metadata;
}

export interface Metadata {
	renovate: RenovateMetadata;
}

export interface RenovateMetadata {
	platform: string;
	major: number;
	version: string;
}

export interface WritePackageDataCallbackOptions {
	key: {
		platform: string;
		organisation: string;
		repo: string;
	};
	outDir: string | undefined;
}

export type WritePackageDataCallback = (
	packageDataDump: PackageDataDump | undefined,
	opts: WritePackageDataCallbackOptions,
) => Promise<void>;
