import Link from "next/link";
import { notFound } from "next/navigation";
import { getWrappedIntro } from "@/app/actions/wrapped";
import { proPhoto } from "@/lib/pros";
import { formatMonth } from "@/lib/standings";
import { buildWrapped } from "@/lib/wrapped";
import { loadWrappedInput } from "./data";
import WrappedCarousel from "./WrappedCarousel";

export const dynamic = "force-dynamic";

export default async function WrappedPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { id } = await params;
  const { period: periodParam } = await searchParams;

  const load = await loadWrappedInput(id, periodParam);
  if (!load) notFound();

  const intro = await getWrappedIntro(id, load.period);
  const wrapped = buildWrapped({ ...load.input, intro });
  const name = load.input.player.row.name;

  const periodHref = (p?: string) => (p ? `/wrapped/${id}?period=${p}` : `/wrapped/${id}`);

  return (
    <div>
      <Link href={`/players/${id}`} className="btn-secondary text-sm">
        ← {name}&apos;s profile
      </Link>

      <div className="mt-4 mb-6">
        <p className="mono-label mb-3">Padel Wrapped</p>
        <h1 className="font-display text-[48px] leading-none tracking-tight">{name}</h1>
        <p className="mono-label mt-3">{wrapped.periodLabel}</p>
      </div>

      {load.months.length > 0 && (
        <nav className="mb-6 flex flex-wrap gap-2 border-b border-hairline pb-4">
          <PeriodTab href={periodHref()} label="All time" active={load.period === "all"} />
          {load.months.map((m) => (
            <PeriodTab key={m} href={periodHref(m)} label={formatMonth(m)} active={load.period === m} />
          ))}
        </nav>
      )}

      <WrappedCarousel
        panels={wrapped.panels}
        spec={wrapped.card}
        caption={wrapped.caption}
        name={name}
        proTwinPhoto={wrapped.proTwinPhotoName ? proPhoto(wrapped.proTwinPhotoName) ?? null : null}
      />
    </div>
  );
}

function PeriodTab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1 text-sm ${
        active ? "bg-deep-green text-white" : "border border-hairline text-body-muted hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
}
