"use client";

import { Fragment, type ReactNode } from "react";
import { useI18n } from "@/i18n/client";
import type { HuggingFaceFileMatch, HuggingFaceModelInformation } from "@/lib/model-information";
import { huggingFaceUrl, isRepositoryId } from "./benchmark-model-identity";
import { LocalTime } from "./local-time";
import { useJsonFetch } from "./ui";
import "./benchmark-model-information.css";

/** Construct links from validated identifiers, never a catalog-supplied URL/host. */
function sourceLinks(match: HuggingFaceFileMatch): { card: string | null; artifact: string | null } {
  if (!isRepositoryId(match.repository) || !/^[a-f0-9]{40}$/.test(match.revision)) return { card: null, artifact: null };
  const root = `https://huggingface.co/${match.repository}`;
  const parts = match.artifact.split("/");
  const safeArtifact = parts.every(part => part !== "" && part !== "." && part !== ".." && !/[\\\u0000-\u001f\u007f]/.test(part));
  return {
    card: match.model_card_url === `${root}/tree/${match.revision}` ? `${root}/tree/${match.revision}` : `${root}/blob/${match.revision}/README.md`,
    artifact: safeArtifact ? `${root}/blob/${match.revision}/${parts.map(encodeURIComponent).join("/")}` : null,
  };
}

function SourceLink({ href, children }: { href: string | null; children: ReactNode }): React.JSX.Element {
  return href ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>;
}

function CatalogMatch({ match, compact }: { match: HuggingFaceFileMatch; compact: boolean }): React.JSX.Element {
  const { t } = useI18n();
  const links = sourceLinks(match);
  const declarations = <>
    <dt>{t("benchmark.catalogBaseModels")}</dt>
    <dd>{match.base_models.length ? match.base_models.map((model, index) => <Fragment key={`${model}:${index}`}>{index ? ", " : null}<SourceLink href={huggingFaceUrl(model)}>{model}</SourceLink></Fragment>) : t("benchmark.catalogNotDeclared")}</dd>
    <dt>{t("benchmark.catalogLicense")}</dt>
    <dd>{match.licenses.length || match.license_name ? <SourceLink href={links.card}>{[...match.licenses, ...(match.license_name ? [match.license_name] : [])].join(", ")}</SourceLink> : t("benchmark.catalogNotDeclared")}</dd>
  </>;
  return <li className="benchmark-catalog-match">
    <p className="benchmark-catalog-repository"><SourceLink href={links.card}>{match.repository}</SourceLink></p>
    {!compact ? <>
      <p>{t("benchmark.catalogArtifact")}: <SourceLink href={links.artifact}>{match.artifact}</SourceLink></p>
      <dl className="benchmark-catalog-fields">{declarations}</dl>
    </> : null}
    <details className="benchmark-catalog-evidence">
      <summary>{t("benchmark.catalogSourceEvidence")}</summary>
      <dl className="benchmark-catalog-fields">
        {compact ? <><dt>{t("benchmark.catalogArtifact")}</dt><dd><SourceLink href={links.artifact}>{match.artifact}</SourceLink></dd>{declarations}</> : null}
        <dt>{t("benchmark.catalogRepositoryOwner")}</dt><dd>{match.repository_owner}</dd>
        <dt>{t("benchmark.catalogQuantizedBy")}</dt><dd>{match.quantized_by ?? t("benchmark.catalogNotDeclared")}</dd>
        <dt>{t("benchmark.catalogRevision")}</dt><dd><SourceLink href={links.card}>{match.revision}</SourceLink></dd>
        <dt>SHA256</dt><dd>{match.sha256}</dd>
        <dt>{t("benchmark.catalogFileSize")}</dt><dd>{match.size_bytes} B</dd>
      </dl>
      <p className="muted">{t("benchmark.catalogEvidenceLimits")}</p>
      <p className="muted">{t("benchmark.catalogDeclarationLimits")}</p>
    </details>
  </li>;
}

/** A later, independent lookup. Measurement content never waits for this request. */
export function BenchmarkModelInformation({ publicId, recordedName, compact = false }: {
  publicId: string;
  recordedName?: string | null;
  compact?: boolean;
}): React.JSX.Element {
  const { t } = useI18n();
  const { data, error, reload } = useJsonFetch<HuggingFaceModelInformation>(`/v1/benchmark-runs/${encodeURIComponent(publicId)}/model-information`);
  const matched = data?.status === "matched" && data.matches.length > 0;
  const status = error || data?.status === "unavailable" ? t("benchmark.catalogUnavailable")
    : !data ? t("benchmark.catalogLoading")
      : data.reason === "missing_checksum" ? t("benchmark.catalogMissingChecksum")
        : data.reason === "missing_size" ? t("benchmark.catalogMissingSize")
          : data.reason === "missing_hint" ? t("benchmark.catalogMissingHint")
            : data.status === "unidentified" ? t("benchmark.catalogUnidentified")
              : t("benchmark.catalogNotFound");
  const searchName = recordedName?.trim();
  return <div className={`benchmark-model-information${compact ? " benchmark-model-information-compact" : ""}`}>
    <p className="benchmark-catalog-label">{t("benchmark.catalogTitle")}</p>
    {matched ? <>
      <p className="muted">{t("benchmark.catalogMatched")}</p>
      <ul className="benchmark-catalog-matches">{data.matches.map(match => <CatalogMatch key={`${match.repository}:${match.revision}:${match.artifact}`} match={match} compact={compact} />)}</ul>
    </> : <>
      <p className="muted" role={!data && !error ? "status" : undefined}>{status}</p>
      {error || data?.status === "unavailable" ? <button type="button" className="alert-action" onClick={reload}>{t("benchmark.catalogRetry")}</button> : null}
      {data && data.status !== "matched" && searchName ? <p><a href={`https://huggingface.co/models?search=${encodeURIComponent(searchName)}`} target="_blank" rel="noopener noreferrer">{t("benchmark.catalogUnverifiedSearch")}</a></p> : null}
    </>}
    {data?.checked_at ? <p className="muted">{t("benchmark.catalogCheckedAt")} <LocalTime value={data.checked_at} /></p> : null}
  </div>;
}
