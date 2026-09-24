import type { Metadata } from "next";
import { BasePage } from "@/app/base-page";
import { Separator } from "@/components/ui/separator";
import {
	type Release as ReleaseType,
	getSortedReleases,
} from "@/changelog/utils";
import {
	ReleaseArticle,
	ReleaseMeta,
	ReleaseTitle,
	ReleaseDescription,
	ReleaseChanges,
} from "@/changelog/components/release";

export const metadata: Metadata = {
	title: "Changelog - OpenCut",
	description: "Novedades de OpenCut",
	openGraph: {
		title: "Changelog - OpenCut",
		description: "Cada actualización, mejora y corrección de OpenCut, documentada.",
		type: "website",
		images: [
			{
				url: "/open-graph/changlog.jpg",
				width: 1200,
				height: 630,
				alt: "OpenCut Changelog",
			},
		],
	},
	twitter: {
		card: "summary_large_image",
		title: "Changelog - OpenCut",
		description: "Novedades de OpenCut",
		images: ["/open-graph/changlog.jpg"],
	},
};

export default function ChangelogPage() {
	const releases = getSortedReleases();

	return (
		<BasePage title="Novedades" description="Mira las novedades de OpenCut">
			<div className="mx-auto w-full max-w-3xl">
				<div className="relative">
					<div
						aria-hidden
						className="absolute top-2 bottom-0 left-[5px] w-px bg-border hidden sm:block"
					/>

					<div className="flex flex-col">
						{releases.map((release, releaseIndex) => (
							<div key={release.version} className="flex flex-col">
								<ReleaseEntry release={release} />
								{releaseIndex < releases.length - 1 && (
									<Separator className="my-10 sm:ml-1.5" />
								)}
							</div>
						))}
					</div>
				</div>
			</div>
		</BasePage>
	);
}

function ReleaseEntry({ release }: { release: ReleaseType }) {
	return (
		<ReleaseArticle variant="list" isLatest={release.isLatest}>
			<ReleaseMeta release={release} />
			<div className="flex flex-col gap-4">
				<ReleaseTitle as="h2" href={`/changelog/${release.version}`}>
					{release.title}
				</ReleaseTitle>
				{release.description && (
					<ReleaseDescription>{release.description}</ReleaseDescription>
				)}
			</div>
			<ReleaseChanges release={release} />
		</ReleaseArticle>
	);
}
